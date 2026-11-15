type TicketPdfOptions = {
  kind: 'COMMANDE' | 'DEMANDE SUR MESURE'
  number: string
  phone: string
  status?: string
  barcodeSvg?: string
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Impossible de créer le ticket PDF.')), 'image/jpeg', 0.94)
  })
}

export async function downloadTicketPdf({ kind, number, phone, status, barcodeSvg }: TicketPdfOptions) {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 1000
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Création PDF non prise en charge par ce navigateur.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 800, 1000)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 3
  ctx.strokeRect(28, 28, 744, 944)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#111827'
  ctx.font = '900 48px Arial'
  ctx.fillText('LUNDER 3D', 400, 112)
  ctx.fillStyle = '#6b7280'
  ctx.font = '600 22px Arial'
  ctx.fillText(`TICKET ${kind}`, 400, 158)
  ctx.strokeStyle = '#d1d5db'
  ctx.setLineDash([10, 9])
  ctx.beginPath()
  ctx.moveTo(76, 205)
  ctx.lineTo(724, 205)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.textAlign = 'left'
  ctx.fillStyle = '#6b7280'
  ctx.font = '600 20px Arial'
  ctx.fillText(kind === 'COMMANDE' ? 'NUMÉRO DE COMMANDE' : 'NUMÉRO DE DEMANDE', 82, 278)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 43px monospace'
  ctx.fillText(number.slice(0, 26), 82, 342)
  ctx.fillStyle = '#6b7280'
  ctx.font = '600 20px Arial'
  ctx.fillText('TÉLÉPHONE', 82, 425)
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 34px Arial'
  ctx.fillText(phone, 82, 478)

  if (status) {
    ctx.fillStyle = '#6b7280'
    ctx.font = '600 20px Arial'
    ctx.fillText('STATUT', 82, 555)
    ctx.fillStyle = '#166534'
    ctx.font = 'bold 26px Arial'
    ctx.fillText(status.slice(0, 38), 82, 600)
  }

  if (barcodeSvg) {
    const svgUrl = URL.createObjectURL(new Blob([barcodeSvg], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const barcode = new Image()
      await new Promise<void>((resolve, reject) => {
        barcode.onload = () => resolve()
        barcode.onerror = () => reject(new Error('تعذر تجهيز الباركود.'))
        barcode.src = svgUrl
      })
      ctx.fillStyle = '#fff'
      ctx.fillRect(100, 650, 600, 150)
      ctx.drawImage(barcode, 105, 660, 590, 125)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#6b7280'
  ctx.font = '20px Arial'
  ctx.fillText('Conservez ce ticket pour votre suivi.', 400, 875)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '16px Arial'
  ctx.fillText('LUNDER 3D  -  Merci pour votre confiance', 400, 920)

  const jpeg = new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer())
  const width = 226.77
  const height = 283.46
  const stream = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let position = 0
  const push = (part: Uint8Array) => { chunks.push(part); position += part.length }
  const ascii = (value: string) => encoder.encode(value)

  push(ascii('%PDF-1.4\n%LUNDER\n'))
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  ]
  for (const object of objects) { offsets.push(position); push(ascii(object)) }
  offsets.push(position)
  push(ascii(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width 800 /Height 1000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`))
  push(jpeg)
  push(ascii('\nendstream\nendobj\n'))
  offsets.push(position)
  push(ascii(`5 0 obj\n<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`))
  const xref = position
  push(ascii(`xref\n0 6\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`))

  const url = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `LUNDER-${kind === 'COMMANDE' ? 'commande' : 'demande'}-${number}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
