import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ text, size = 240 }: { text: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let ignore = false
    QRCode.toString(text, { type: 'svg', margin: 1 })
      .then(svg => { if (!ignore) setSrc('data:image/svg+xml;utf8,' + encodeURIComponent(svg)) })
      .catch(() => { if (!ignore) setSrc(null) })
    return () => { ignore = true }
  }, [text, size])
  if (!src) return <div style={{ width: size, height: size }} className="rounded-lg bg-muted" aria-hidden />
  return <img src={src} width={size} height={size} alt="QR code" className="rounded-lg bg-white p-3" />
}
