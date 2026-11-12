export function formatDzd(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' DA'
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateSku(categoryName: string, count: number): string {
  const prefix = categoryName
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3)
  return `${prefix}-${String(count).padStart(4, '0')}`
}
