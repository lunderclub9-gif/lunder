/**
 * Règles de commande partagées par la boutique et le suivi.
 * Aucune de ces fonctions ne remplace la validation serveur : les prix, les
 * frais de livraison et les totaux sont recalculés par `create_guest_order`.
 */

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de confirmation',
  confirmed: 'Confirmée',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  domicile: 'Livraison à domicile',
  stopdesk: 'Point relais / Stop Desk',
}

/** Normalise un numéro algérien vers 0X XX XX XX XX. */
export function normalizeAlgerianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('213')) digits = `0${digits.slice(3)}`
  if (digits.length === 9 && /^[5-7]/.test(digits)) digits = `0${digits}`
  return /^0[5-7]\d{8}$/.test(digits) ? digits : null
}

const RPC_MESSAGES: Record<string, string> = {
  LIVRAISON_INDISPONIBLE:
    "La livraison n'est pas disponible pour cette destination. Choisissez une autre commune ou contactez-nous.",
  COMMUNE_INVALIDE: "La commune sélectionnée n'appartient pas à cette wilaya.",
  WILAYA_INVALIDE: 'Wilaya inconnue ou désactivée.',
  WILAYA_REQUISE: 'Sélectionnez une wilaya.',
  COMMUNE_REQUISE: 'Sélectionnez une commune.',
  METHODE_LIVRAISON_INVALIDE: 'Mode de livraison invalide.',
  POINT_RELAIS_REQUIS: 'Sélectionnez un point relais.',
  POINT_RELAIS_INVALIDE: "Ce point relais n'est pas disponible pour cette wilaya.",
  ADRESSE_REQUISE: "L'adresse de livraison est requise.",
  TELEPHONE_INVALIDE: 'Numéro de téléphone algérien invalide (ex. 0550 12 34 56).',
  NOM_REQUIS: 'Le nom du destinataire est requis.',
  PANIER_VIDE: 'Votre panier est vide.',
  PANIER_TROP_GRAND: 'Trop d’articles différents dans une même commande.',
  QUANTITE_INVALIDE: 'Quantité invalide.',
  STOCK_INSUFFISANT: "Stock insuffisant pour l'un des articles. Réduisez la quantité.",
  PRODUIT_INDISPONIBLE: "Un article de votre panier n'est plus disponible.",
  VARIANTE_INDISPONIBLE: "La variante choisie n'est plus disponible.",
  COMMANDE_INTROUVABLE: 'Aucune commande ne correspond à ces informations.',
  TROP_DE_TENTATIVES: 'Trop de tentatives. Réessayez dans quelques minutes.',
  TRANSITION_INVALIDE: 'Cette modification de statut est impossible.',
  ACCES_REFUSE: 'Accès refusé.',
  CLE_IDEMPOTENCE_MANQUANTE: 'Erreur technique. Rechargez la page et réessayez.',
  COMMANDE_NON_SUPPRIMABLE: 'Cette commande ne peut pas être supprimée (expédiée ou livrée).',
  DEMANDE_CLOTUREE: 'Cette demande est déjà clôturée ou acceptée.',
  MATIERE_INDISPONIBLE: 'Matière indisponible.',
  POIDS_INVALIDE: 'Poids de matière invalide.',
  TEMPS_INVALIDE: 'Temps d\'impression invalide.',
}

/** Traduit un code d'erreur remonté par une fonction Postgres en message français. */
export function orderErrorMessage(rawMessage: string | undefined | null, fallback: string): string {
  if (!rawMessage) return fallback
  const code = Object.keys(RPC_MESSAGES).find((key) => rawMessage.includes(key))
  return code ? RPC_MESSAGES[code] : fallback
}

export type DeliveryQuote = {
  price_dzd: number
  estimated_days_min: number | null
  estimated_days_max: number | null
  carrier: string | null
}

export type CreatedOrder = {
  order_number: string
  tracking_token: string
  total_dzd: number
  already_exists: boolean
}

export type OrderDetail = {
  order_number: string
  status: string
  created_at: string
  payment_method: string
  customer_name: string
  phone: string
  wilaya: string
  commune: string
  delivery_method: string
  delivery_carrier: string | null
  delivery_eta_min: number | null
  delivery_eta_max: number | null
  address: string | null
  pickup_point: string | null
  note: string | null
  subtotal_dzd: number
  delivery_dzd: number
  total_dzd: number
  items: {
    product_name: string
    variant_label: string | null
    sku: string | null
    unit_price_dzd: number
    quantity: number
    line_total_dzd: number
  }[]
}

export type TrackedOrder = {
  order_number: string
  status: string
  created_at: string
  total_dzd: number
  wilaya: string
  commune: string
  delivery_method: string
  items_count: number
}
