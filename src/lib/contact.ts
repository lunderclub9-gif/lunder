import { normalizeAlgerianPhone } from './checkout'

/**
 * Construit les liens de contact à partir des réglages de la boutique.
 *
 * Sans ces fonctions, le pied de page affichait le téléphone en texte simple :
 * sur mobile, un client ne pouvait ni appeler ni écrire. Les numéros sont
 * normalisés (0550…, +213…, 00213…) et convertis au format international, et
 * une valeur invalide ne produit aucun lien plutôt qu'un `href` cassé.
 */

export function toTelHref(value: string | null | undefined): string | null {
  const phone = normalizeAlgerianPhone(value ?? '')
  return phone ? `tel:+213${phone.slice(1)}` : null
}

export function toWhatsAppHref(value: string | null | undefined, message?: string): string | null {
  const phone = normalizeAlgerianPhone(value ?? '')
  if (!phone) return null
  const base = `https://wa.me/213${phone.slice(1)}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function toMailtoHref(value: string | null | undefined): string | null {
  const email = (value ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return null
  return `mailto:${email}`
}
