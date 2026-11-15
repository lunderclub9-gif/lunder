type TicketImageOptions = {
  kind: 'COMMANDE' | 'DEMANDE SUR MESURE'
  number: string
  phone: string
  barcodeSvg?: string
}

const LOGO_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 48 48">
  <path d="M24 3 43 14v20L24 45 5 34V14L24 3Z" fill="#fff" stroke="#dc2626" stroke-width="3"/>
  <path d="m24 3 0 21m19-10L24 24 5 14m19 10v21m0-21 19 10M24 24 5 34" fill="none" stroke="#dc2626" stroke-width="2"/>
  <path d="m24 3 19 11-19 10V3Z" fill="#dc2626" opacity=".12"/>
</svg>`

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر تحميل شعار المتجر.')) }
    image.src = url
  })
}

export async function downloadTicketImage({ kind, number, phone, barcodeSvg }: TicketImageOptions) {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1120
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Téléchargement d’image non pris en charge par ce navigateur.')

  ctx.fillStyle = '#f4f5f7'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(34, 34, 832, 1052, 34)
  ctx.fill()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 3
  ctx.stroke()

  const mark = await loadSvgImage(LOGO_MARK)
  ctx.drawImage(mark, 94, 86, 112, 112)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#111827'
  ctx.font = '900 54px Arial, sans-serif'
  ctx.fillText('LUNDER', 230, 139)
  ctx.fillStyle = '#dc2626'
  ctx.fillText('3D', 456, 139)
  ctx.fillStyle = '#6b7280'
  ctx.font = '600 20px Arial, sans-serif'
  ctx.fillText('DESIGN · PRINT · CREATE', 232, 177)

  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.roundRect(94, 242, 712, 72, 18)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 27px Arial, sans-serif'
  ctx.fillText(kind === 'COMMANDE' ? 'CONFIRMATION DE COMMANDE' : 'DEMANDE SUR MESURE', 450, 288)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#6b7280'
  ctx.font = '700 21px Arial, sans-serif'
  ctx.fillText(kind === 'COMMANDE' ? 'NUMÉRO DE COMMANDE' : 'NUMÉRO DE DEMANDE', 104, 405)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 43px Arial, sans-serif'
  const safeNumber = number.length > 24 ? number.slice(0, 24) : number
  ctx.fillText(safeNumber, 104, 468)

  ctx.fillStyle = '#6b7280'
  ctx.font = '700 21px Arial, sans-serif'
  ctx.fillText('NUMÉRO DE TÉLÉPHONE', 104, 565)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 39px Arial, sans-serif'
  ctx.fillText(phone.slice(0, 24), 104, 625)

  if (barcodeSvg) {
    const barcode = await loadSvgImage(barcodeSvg)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(104, 700, 692, 175)
    const ratio = Math.min(680 / barcode.width, 150 / barcode.height)
    const width = barcode.width * ratio
    const height = barcode.height * ratio
    ctx.drawImage(barcode, 450 - width / 2, 712 + (150 - height) / 2, width, height)
  }

  ctx.strokeStyle = '#e5e7eb'
  ctx.setLineDash([8, 8])
  ctx.beginPath()
  ctx.moveTo(104, 925)
  ctx.lineTo(796, 925)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.fillStyle = '#374151'
  ctx.font = '600 22px Arial, sans-serif'
  ctx.fillText('Merci pour votre confiance !', 450, 985)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText('LUNDER 3D STUDIO', 450, 1025)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Impossible de créer l’image du ticket.')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `LUNDER-${kind === 'COMMANDE' ? 'commande' : 'demande'}-${number}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
