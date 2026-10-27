/** Reads an image file and returns a downscaled JPEG data URL. */
export function fileToCompressedDataUrl(file: File, maxSide = 1800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('bad image'))
    }
    img.src = url
  })
}

export function dataUrlToInline(dataUrl: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  return m ? { mimeType: m[1], data: m[2] } : null
}
