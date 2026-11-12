export function formatDzd(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' DA'
}

/**
 * Slug ASCII stable pour les URL produits.
 * Les accents sont décomposés puis retirés (É → E), les ligatures développées
 * (œ → oe) et tout ce qui n'est pas lettre/chiffre devient un tiret. Un nom
 * entièrement accentué ne peut donc plus produire un slug vide ou tronqué.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')

  return slug || 'produit'
}

/**
 * Nettoie une saisie de recherche avant de la placer dans un filtre PostgREST.
 * Les caractères qui structurent la syntaxe du filtre (virgule, parenthèses,
 * guillemets, antislash) et les jokers SQL (% et _) sont remplacés par un espace,
 * afin qu'une saisie ne puisse pas injecter d'opérateur ni élargir la recherche.
 */
export function sanitizeSearchTerm(input: string, maxLength = 60): string {
  // Les caractères de contrôle sont retirés par code, pas par expression
  // régulière, pour rester lisible et sûr côté outillage.
  const withoutControls = Array.from(input.normalize('NFC'))
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')

  return withoutControls
    .replace(/[(),.*:"\\%_$#=<>[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim()
}

export function generateSku(categoryName: string, count: number): string {
  const prefix = categoryName
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3)
  return `${prefix}-${String(count).padStart(4, '0')}`
}
