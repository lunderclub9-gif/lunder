/** Garde-fous d’affichage uniquement : la base reste l’autorité finale. */
const terminalRequestStatuses = new Set(['approved', 'rejected', 'closed'])

export function canOwnerApproveCustomQuote(input: {
  requestStatus: string
  quoteStatus: string
  validUntil: string
  orderId: string | null
  today: string
}): boolean {
  return (
    input.orderId === null &&
    !terminalRequestStatuses.has(input.requestStatus) &&
    (input.quoteStatus === 'sent' || input.quoteStatus === 'accepted') &&
    input.validUntil >= input.today
  )
}

export function canCustomerDecideCustomQuote(input: {
  quoteStatus: string
  validUntil: string
  today: string
}): boolean {
  return input.quoteStatus === 'sent' && input.validUntil >= input.today
}
