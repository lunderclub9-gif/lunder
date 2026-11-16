/**
 * Lightweight, dependency-free geometry inspection for customer uploads.
 * Measurements are reported in millimetres only after an explicit unit
 * assumption: STL/OBJ are unitless and default to mm; glTF uses metres.
 */

export type ModelAnalysis = {
  format: 'stl' | 'obj' | 'glb' | 'gltf'
  dimensionsMm: { length: number; width: number; height: number }
  boundingBoxVolumeCm3: number
  meshVolumeCm3: number | null
  triangleCount: number
  vertexCount: number
  componentCount: number | null
  unit: 'mm' | 'm'
  warnings: string[]
}

type Bounds = { min: [number, number, number]; max: [number, number, number] }

type GltfAccessor = { bufferView?: number; byteOffset?: number; componentType?: number; count?: number; type?: string }
type GltfBufferView = { buffer?: number; byteOffset?: number; byteLength?: number; byteStride?: number }

const MAX_GLTF_VERTICES = 250_000
const MAX_GLTF_INDICES = 750_000

function checkedBufferView(document: GltfDocument, buffers: Uint8Array[], viewIndex: number, accessorOffset: number, count: number, elementBytes: number, stride: number) {
  const view = document.bufferViews?.[viewIndex]
  const data = buffers[view?.buffer ?? 0]
  const viewOffset = view?.byteOffset ?? 0
  const viewLength = view?.byteLength
  if (!view || !data || !Number.isInteger(viewOffset) || viewOffset < 0 ||
      !Number.isInteger(viewLength) || (viewLength as number) <= 0 ||
      viewOffset + (viewLength as number) > data.byteLength ||
      !Number.isInteger(accessorOffset) || accessorOffset < 0 ||
      !Number.isInteger(count) || count < 1 ||
      !Number.isInteger(stride) || stride < elementBytes ||
      accessorOffset + (count - 1) * stride + elementBytes > (viewLength as number)) {
    throw new Error('Le fichier glTF contient des plages mémoire invalides ou tronquées.')
  }
  return { data, offset: viewOffset + accessorOffset }
}

function signedTetraVolumeFlat(points: Float64Array, a: number, b: number, c: number) {
  const ax = points[a * 3], ay = points[a * 3 + 1], az = points[a * 3 + 2]
  const bx = points[b * 3], by = points[b * 3 + 1], bz = points[b * 3 + 2]
  const cx = points[c * 3], cy = points[c * 3 + 1], cz = points[c * 3 + 2]
  return (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
}
type GltfPrimitive = { attributes?: Record<string, number>; indices?: number; mode?: number }
type GltfNode = {
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}
type GltfDocument = {
  nodes?: GltfNode[]
  buffers?: { uri?: string; byteLength?: number }[]
  bufferViews?: GltfBufferView[]
  accessors?: GltfAccessor[]
  meshes?: { primitives?: GltfPrimitive[] }[]
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

function emptyBounds(): Bounds {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
}

function addVertex(bounds: Bounds, x: number, y: number, z: number) {
  const values = [x, y, z]
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], values[axis])
    bounds.max[axis] = Math.max(bounds.max[axis], values[axis])
  }
}

function finish(
  format: ModelAnalysis['format'],
  bounds: Bounds,
  triangles: number,
  vertices: number,
  signedVolume: number | null,
  unit: ModelAnalysis['unit'],
  warnings: string[],
  componentCount: number | null = 1
): ModelAnalysis {
  if (!Number.isFinite(bounds.min[0]) || !Number.isFinite(bounds.max[0])) {
    throw new Error('Aucun sommet 3D exploitable n’a été trouvé dans ce fichier.')
  }
  const scale = unit === 'm' ? 1000 : 1
  const dimensions = bounds.max.map((value, axis) => Math.max(0, value - bounds.min[axis]) * scale)
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0 || value > 100000)) {
    throw new Error('Les dimensions du modèle sont nulles ou anormalement grandes.')
  }
  const boxMm3 = dimensions[0] * dimensions[1] * dimensions[2]
  let meshCm3 = signedVolume === null ? null : Math.abs(signedVolume) * scale ** 3 / 1000
  if (meshCm3 === null || !Number.isFinite(meshCm3) || meshCm3 <= 0) {
    meshCm3 = null
    warnings.push('Le volume réel du maillage n’a pas pu être calculé ; seule la boîte englobante est disponible.')
  } else {
    warnings.push('Le volume suppose un maillage fermé et correctement orienté. Les surfaces ouvertes ou les normales incohérentes peuvent fausser cette mesure.')
    if (meshCm3 > boxMm3 / 1000 * 1.05) {
      warnings.push('Le volume du maillage dépasse sa boîte englobante ; vérifiez les unités ou l’intégrité du fichier.')
      meshCm3 = null
    } else if (meshCm3 < boxMm3 / 1000 * 0.001) {
      warnings.push('Le volume calculé est très faible par rapport aux dimensions ; le maillage peut être ouvert, très fin ou mal orienté. La boîte englobante sera utilisée pour éviter une sous-estimation.')
      meshCm3 = null
    }
  }
  return {
    format, dimensionsMm: { length: round(dimensions[0]), width: round(dimensions[1]), height: round(dimensions[2]) },
    boundingBoxVolumeCm3: round(boxMm3 / 1000, 3),
    meshVolumeCm3: meshCm3 === null ? null : round(meshCm3, 3),
    triangleCount: triangles, vertexCount: vertices, componentCount, unit, warnings,
  }
}

function signedTetraVolume(a: number[], b: number[], c: number[]) {
  return (a[0] * (b[1] * c[2] - b[2] * c[1]) +
    a[1] * (b[2] * c[0] - b[0] * c[2]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
}

async function analyzeStl(file: File): Promise<ModelAnalysis> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const bounds = emptyBounds()
  let triangles = 0
  let vertices = 0
  let volume = 0
  const warnings: string[] = ['STL ne stocke pas d’unité : les mesures sont supposées en millimètres.']
  let componentCount: number | null = null
  const view = new DataView(buffer)
  const binaryCount = buffer.byteLength >= 84 ? view.getUint32(80, true) : -1
  const isBinary = binaryCount >= 0 && 84 + binaryCount * 50 === buffer.byteLength

  if (isBinary) {
    triangles = binaryCount
    for (let i = 0; i < binaryCount; i += 1) {
      const offset = 84 + i * 50 + 12
      const points: number[][] = []
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const base = offset + vertex * 12
        const point = [view.getFloat32(base, true), view.getFloat32(base + 4, true), view.getFloat32(base + 8, true)]
        points.push(point)
        addVertex(bounds, point[0], point[1], point[2])
        vertices += 1
      }
      volume += signedTetraVolume(points[0], points[1], points[2])
    }
  } else {
    const source = new TextDecoder().decode(bytes)
    const solids = [...source.matchAll(/^\s*solid(?:\s|$)/gim)].length
    componentCount = solids > 0 ? solids : null
    const values: number[][] = []
    for (const match of source.matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gi)) {
      const point = [Number(match[1]), Number(match[2]), Number(match[3])]
      if (point.every(Number.isFinite)) {
        values.push(point)
        addVertex(bounds, point[0], point[1], point[2])
      }
    }
    if (values.length < 3 || values.length % 3 !== 0) throw new Error('Le fichier STL ASCII ne contient pas une liste de triangles valide.')
    triangles = values.length / 3
    vertices = values.length
    for (let i = 0; i < values.length; i += 3) volume += signedTetraVolume(values[i], values[i + 1], values[i + 2])
  }
  if (triangles === 0) throw new Error('Le fichier STL ne contient aucun triangle.')
  return finish('stl', bounds, triangles, vertices, volume, 'mm', warnings, componentCount)
}

async function analyzeObj(file: File): Promise<ModelAnalysis> {
  const source = await file.text()
  const bounds = emptyBounds()
  const vertices: number[][] = []
  let triangles = 0
  let volume = 0
  let componentCount = 0
  const warnings = ['OBJ ne stocke pas toujours son unité : les mesures sont supposées en millimètres.']
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (/^o(?:\s|$)/.test(line)) {
      componentCount += 1
    } else if (/^v\s+/.test(line)) {
      const values = line.replace(/^v\s+/, '').trim().split(/\s+/).slice(0, 3).map(Number)
      if (values.length === 3 && values.every(Number.isFinite)) {
        vertices.push(values)
        addVertex(bounds, values[0], values[1], values[2])
      }
    } else if (/^f\s+/.test(line)) {
      const indices = line.replace(/^f\s+/, '').trim().split(/\s+/).map((part) => Number(part.split('/')[0]))
      if (indices.length < 3 || indices.some((index) => !Number.isInteger(index) || index === 0)) continue
      const resolved = indices.map((index) => index > 0 ? index - 1 : vertices.length + index)
      const first = vertices[resolved[0]]
      for (let i = 1; i < resolved.length - 1; i += 1) {
        const b = vertices[resolved[i]], c = vertices[resolved[i + 1]]
        if (!first || !b || !c) continue
        triangles += 1
        volume += signedTetraVolume(first, b, c)
      }
    }
  }
  if (!vertices.length) throw new Error('Le fichier OBJ ne contient aucun sommet 3D valide.')
  if (!triangles) warnings.push('Aucune face triangulable : le volume de matière ne peut pas être calculé.')
  return finish('obj', bounds, triangles, vertices.length, triangles ? volume : null, 'mm', warnings, componentCount || null)
}

function decodeDataUri(uri: string): Uint8Array {
  const comma = uri.indexOf(',')
  if (comma < 0) throw new Error('Ressource glTF intégrée invalide.')
  const metadata = uri.slice(0, comma)
  const data = uri.slice(comma + 1)
  if (metadata.includes(';base64')) {
    const binary = atob(data)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }
  return new TextEncoder().encode(decodeURIComponent(data))
}

async function analyzeGltfDocument(document: GltfDocument, buffers: Uint8Array[], format: 'glb' | 'gltf') {
  const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const nodes = document.nodes ?? []
  const meshUses = new Map<number, number>()
  for (const node of nodes) {
    const identity = (values: number[] | undefined, expected: number[]) =>
      values === undefined || (values.length === expected.length && values.every((value, index) => Math.abs(value - expected[index]) < 1e-8))
    if (node.children?.length || !identity(node.matrix, identityMatrix) ||
        !identity(node.translation, [0, 0, 0]) || !identity(node.rotation, [0, 0, 0, 1]) ||
        !identity(node.scale, [1, 1, 1])) {
      throw new Error('Ce modèle glTF utilise des transformations ou une hiérarchie de scène que l’analyse simplifiée ne peut pas mesurer correctement. Exportez-le en STL ou appliquez les transformations avant de réessayer.')
    }
    if (typeof node.mesh === 'number') meshUses.set(node.mesh, (meshUses.get(node.mesh) ?? 0) + 1)
  }
  if ([...meshUses.values()].some((count) => count > 1) ||
      (nodes.length > 0 && (document.meshes ?? []).some((_, index) => !meshUses.has(index)))) {
    throw new Error('Ce modèle glTF contient des instances ou des maillages non reliés à la scène principale. Exportez une version aplatie en GLB ou STL pour obtenir des dimensions fiables.')
  }
  const bounds = emptyBounds()
  let vertexCount = 0
  let triangleCount = 0
  let volume = 0
  const warnings = ['La géométrie glTF est mesurée dans les coordonnées locales des maillages ; les transformations de scène peuvent modifier les dimensions finales.']
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.attributes?.POSITION
      if (typeof accessorIndex !== 'number') continue
      const accessor = document.accessors?.[accessorIndex]
      if (!accessor || accessor.type !== 'VEC3' || typeof accessor.bufferView !== 'number') {
        warnings.push('Un attribut POSITION glTF est incomplet et a été ignoré.')
        continue
      }
      if (accessor.componentType !== 5126) {
        warnings.push('Les positions glTF quantifiées ne sont pas prises en charge ; exportez les positions en FLOAT.')
        continue
      }
      const count = accessor.count ?? 0
      if (!Number.isInteger(count) || count < 1 || count > MAX_GLTF_VERTICES || vertexCount + count > MAX_GLTF_VERTICES) {
        throw new Error('Ce modèle glTF contient trop de sommets pour une analyse sûre dans le navigateur. Exportez une version simplifiée.')
      }
      const bufferView = document.bufferViews?.[accessor.bufferView]
      const stride = bufferView?.byteStride ?? 12
      const positionBuffer = checkedBufferView(document, buffers, accessor.bufferView, accessor.byteOffset ?? 0, count, 12, stride)
      const dataView = new DataView(positionBuffer.data.buffer, positionBuffer.data.byteOffset, positionBuffer.data.byteLength)
      const positions = new Float64Array(count * 3)
      for (let i = 0; i < count; i += 1) {
        const base = positionBuffer.offset + i * stride
        const x = dataView.getFloat32(base, true)
        const y = dataView.getFloat32(base + 4, true)
        const z = dataView.getFloat32(base + 8, true)
        if (![x, y, z].every(Number.isFinite)) throw new Error('Le modèle glTF contient des coordonnées non finies.')
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
        addVertex(bounds, x, y, z)
        vertexCount += 1
      }

      // glTF primitive mode 4 is TRIANGLES (the default). Other modes are bounded,
      // but are not converted into a volume estimate here.
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        warnings.push('Certaines primitives ne sont pas des triangles simples ; leur volume géométrique est exclu du calcul.')
        continue
      }

      const indexAccessor = primitive.indices === undefined ? null : document.accessors?.[primitive.indices]
      const indexCount = indexAccessor ? (indexAccessor.count ?? 0) : count
      if (!Number.isInteger(indexCount) || indexCount < 3 || indexCount > MAX_GLTF_INDICES) {
        warnings.push('Une primitive glTF contient un nombre d’indices non pris en charge ; son volume est exclu.')
        continue
      }
      if (indexAccessor && (indexAccessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indexAccessor.componentType ?? 0) || typeof indexAccessor.bufferView !== 'number')) {
        warnings.push('Une liste d’indices glTF utilise un format non pris en charge ; son volume est exclu.')
        continue
      }
      const indexBytes = indexAccessor ? ({ 5121: 1, 5123: 2, 5125: 4 } as Record<number, number>)[indexAccessor.componentType as number] : 0
      const indexView = indexAccessor ? document.bufferViews?.[indexAccessor.bufferView as number] : null
      const indexStride = indexAccessor ? (indexView?.byteStride ?? indexBytes) : 0
      const indexBuffer = indexAccessor
        ? checkedBufferView(document, buffers, indexAccessor.bufferView as number, indexAccessor.byteOffset ?? 0, indexCount, indexBytes, indexStride)
        : null
      const indexDataView = indexBuffer ? new DataView(indexBuffer.data.buffer, indexBuffer.data.byteOffset, indexBuffer.data.byteLength) : null
      const readIndex = (position: number) => {
        if (!indexAccessor || !indexBuffer || !indexDataView) return position
        const offset = indexBuffer.offset + position * indexStride
        if (indexAccessor.componentType === 5125) return indexDataView.getUint32(offset, true)
        if (indexAccessor.componentType === 5123) return indexDataView.getUint16(offset, true)
        return indexDataView.getUint8(offset)
      }
      if (indexCount % 3 !== 0) warnings.push('Le nombre d’indices glTF n’est pas divisible par trois ; les derniers indices sont ignorés.')
      for (let index = 0; index + 2 < indexCount; index += 3) {
        const a = readIndex(index)
        const b = readIndex(index + 1)
        const c = readIndex(index + 2)
        if (a >= count || b >= count || c >= count) throw new Error('Le modèle glTF contient un indice de sommet hors limites.')
        triangleCount += 1
        volume += signedTetraVolumeFlat(positions, a, b, c)
      }
    }
  }
  if (!vertexCount) throw new Error('Aucun attribut POSITION exploitable trouvé dans le fichier glTF.')
  if (!triangleCount) warnings.push('Aucun triangle exploitable : le volume du maillage ne peut pas être calculé.')
  return finish(format, bounds, triangleCount, vertexCount, triangleCount ? volume : null, 'm', warnings, (document.meshes ?? []).length)
}

async function analyzeGlb(file: File): Promise<ModelAnalysis> {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== view.byteLength) throw new Error('En-tête GLB invalide ou longueur déclarée incorrecte.')
  let offset = 12
  let document: GltfDocument | null = null
  let binary: Uint8Array | null = null
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > view.byteLength) throw new Error('Chunk GLB tronqué.')
    if (type === 0x4e4f534a) document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)).replace(/\0+$/g, '').trim()) as GltfDocument
    if (type === 0x004e4942) binary = new Uint8Array(buffer, start, length)
    offset = start + length
  }
  if (!document) throw new Error('Le fichier GLB ne contient pas de document JSON.')
  const buffers = (document.buffers ?? []).map((entry, index: number) => {
    if (typeof entry.uri === 'string') throw new Error('Le GLB référence une ressource externe non intégrée.')
    if (index === 0 && binary) {
      if (typeof entry.byteLength !== 'number' || entry.byteLength > binary.byteLength) throw new Error('La ressource binaire GLB est tronquée.')
      return binary
    }
    if ((entry.byteLength ?? 0) > 0) throw new Error('Une ressource binaire GLB est manquante.')
    return new Uint8Array()
  })
  return analyzeGltfDocument(document, buffers, 'glb')
}

async function analyzeGltf(file: File): Promise<ModelAnalysis> {
  const document = JSON.parse(await file.text()) as GltfDocument
  const buffers = (document.buffers ?? []).map((entry) => {
    if (typeof entry.uri !== 'string' || !entry.uri.startsWith('data:')) throw new Error('Ce glTF utilise des fichiers externes. Exportez-le en GLB autonome.')
    return decodeDataUri(entry.uri)
  })
  return analyzeGltfDocument(document, buffers, 'gltf')
}

export async function analyze3DModel(file: File): Promise<ModelAnalysis> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'stl') return analyzeStl(file)
  if (extension === 'obj') return analyzeObj(file)
  if (extension === 'glb') return analyzeGlb(file)
  if (extension === 'gltf') return analyzeGltf(file)
  throw new Error('Format non pris en charge pour l’analyse géométrique.')
}
