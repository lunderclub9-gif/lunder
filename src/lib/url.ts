/**
 * Valide une URL externe avant de la placer dans un `href`.
 *
 * Les réglages de la boutique sont saisis par la propriétaire ; une valeur
 * malformée ou un schéma dangereux (`javascript:`, `data:`) ne doit jamais
 * devenir un lien cliquable. Seuls http(s) sont acceptés, et la valeur est
 * renvoyée normalisée pour que le navigateur ne puisse pas la réinterpréter.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}
