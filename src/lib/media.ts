/**
 * Validation des médias produits.
 *
 * Ces contrôles s'exécutent dans le navigateur : ils servent à donner un retour
 * immédiat et à empêcher l'envoi de fichiers inutilisables. La barrière réelle
 * est côté serveur (limites de taille et types MIME autorisés sur les buckets
 * Storage, migration 003) — les deux doivent rester cohérents.
 *
 * Le type MIME transmis à l'upload est celui déduit des octets du fichier, jamais
 * celui déclaré par le nom de fichier ou par le système d'exploitation.
 */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const MODEL_MAX_BYTES = 25 * 1024 * 1024

export type MediaCheck =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; message: string }

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

export function formatMo(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} Mo`
}

async function readHead(file: File, bytes: number): Promise<Uint8Array> {
  const buffer = await file.slice(0, bytes).arrayBuffer()
  return new Uint8Array(buffer)
}

/** Détecte le format d'image à partir de ses octets d'en-tête. */
function sniffImage(head: Uint8Array): { contentType: string; extension: string } | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', extension: 'png' }
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }
  if (readAscii(head, 0, 4) === 'RIFF' && readAscii(head, 8, 4) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' }
  }
  if (readAscii(head, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(readAscii(head, 8, 4))) {
    return { contentType: 'image/avif', extension: 'avif' }
  }
  return null
}

export async function validateImage(file: File): Promise<MediaCheck> {
  if (file.size === 0) {
    return { ok: false, message: `« ${file.name} » est vide.` }
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: `« ${file.name} » dépasse ${formatMo(IMAGE_MAX_BYTES)}. Compressez la photo avant de l'envoyer.`,
    }
  }

  const head = await readHead(file, 16)
  const detected = sniffImage(head)
  if (!detected) {
    return {
      ok: false,
      message: `« ${file.name} » n'est pas une image acceptée. Formats autorisés : JPEG, PNG, WebP, AVIF.`,
    }
  }
  return { ok: true, ...detected }
}

/**
 * Valide un modèle 3D.
 * - `.glb` : conteneur binaire autonome, signature « glTF ».
 * - `.gltf` : JSON accepté seulement si toutes ses ressources sont intégrées
 *   (URI `data:`), sinon le fichier seul ne peut pas s'afficher.
 */
export async function validateModel(file: File): Promise<MediaCheck> {
  if (file.size === 0) {
    return { ok: false, message: `« ${file.name} » est vide.` }
  }
  if (file.size > MODEL_MAX_BYTES) {
    return { ok: false, message: `« ${file.name} » dépasse ${formatMo(MODEL_MAX_BYTES)}.` }
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (extension === 'glb') {
    const head = await readHead(file, 4)
    if (readAscii(head, 0, 4) !== 'glTF') {
      return { ok: false, message: `« ${file.name} » n'est pas un fichier GLB valide.` }
    }
    return { ok: true, contentType: 'model/gltf-binary', extension: 'glb' }
  }

  if (extension === 'gltf') {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return { ok: false, message: `« ${file.name} » n'est pas un fichier glTF valide (JSON illisible).` }
    }

    const external = findExternalUris(parsed)
    if (external.length > 0) {
      return {
        ok: false,
        message: `« ${file.name} » référence des fichiers externes (${external.slice(0, 3).join(', ')}). Exportez votre modèle en GLB, ou en glTF avec les ressources intégrées.`,
      }
    }
    return { ok: true, contentType: 'model/gltf+json', extension: 'gltf' }
  }

  return {
    ok: false,
    message: `« ${file.name} » n'est pas un format accepté. Utilisez un fichier .glb ou .gltf.`,
  }
}

/**
 * Valide un fichier joint à une demande sur mesure : photo, GLB/GLTF, STL ou OBJ.
 * STL et OBJ ne peuvent pas être prévisualisés dans le navigateur ; seul le
 * GLB/GLTF l'est, ce que l'interface indique explicitement au client.
 */
export async function validateCustomFile(file: File): Promise<MediaCheck> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension)) {
    return validateImage(file)
  }

  if (extension === 'glb' || extension === 'gltf') {
    return validateModel(file)
  }

  if (file.size === 0) {
    return { ok: false, message: `« ${file.name} » est vide.` }
  }
  if (file.size > MODEL_MAX_BYTES) {
    return { ok: false, message: `« ${file.name} » dépasse ${formatMo(MODEL_MAX_BYTES)}.` }
  }

  if (extension === 'stl') {
    const head = await readHead(file, 84)
    const ascii = readAscii(head, 0, 5).toLowerCase() === 'solid'
    if (ascii) {
      return { ok: true, contentType: 'model/stl', extension: 'stl' }
    }
    if (head.length >= 84) {
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
      const triangles = view.getUint32(80, true)
      if (triangles > 0 && file.size === 84 + triangles * 50) {
        return { ok: true, contentType: 'model/stl', extension: 'stl' }
      }
    }
    return { ok: false, message: `« ${file.name} » n'est pas un fichier STL valide.` }
  }

  if (extension === 'obj') {
    const text = (await file.slice(0, 65536).text()).split('\n')
    const looksLikeObj = text.some((line) => /^\s*f\s+[-\d]/.test(line)) &&
      text.some((line) => /^\s*v\s+[-\d.]/.test(line))
    if (!looksLikeObj) {
      return { ok: false, message: `« ${file.name} » n'est pas un fichier OBJ valide.` }
    }
    return { ok: true, contentType: 'model/obj', extension: 'obj' }
  }

  return {
    ok: false,
    message: `« ${file.name} » : format non accepté. Utilisez JPG, PNG, WebP, AVIF, GLB, GLTF, STL ou OBJ.`,
  }
}

/** Liste les URI non intégrées d'un document glTF (fichiers .bin, textures…). */
function findExternalUris(document: unknown): string[] {
  const found: string[] = []

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'uri' && typeof value === 'string' && !value.startsWith('data:')) {
        found.push(value)
      } else {
        visit(value)
      }
    }
  }

  visit(document)
  return found
}
