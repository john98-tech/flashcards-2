import { CANVAS_HEIGHT, CANVAS_WIDTH, type DrawingPage } from './useDrawingEngine'

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('تعذر تصدير صورة إحدى صفحات الإجابة.'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function findContentBounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < left || bottom < top ? null : { left, top, right: right + 1, bottom: bottom + 1 }
}

export async function exportPages(
  pages: DrawingPage[],
  activePage: number,
  activeCanvas: HTMLCanvasElement | null,
): Promise<Blob[]> {
  if (!activeCanvas) throw new Error('مساحة الكتابة غير جاهزة للتصدير.')
  const scratch = document.createElement('canvas')
  const result: Blob[] = []

  try {
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      if (!page.hasContent) continue
      let bitmap: ImageBitmap | null = null
      let source: CanvasImageSource
      if (index === activePage) {
        source = activeCanvas
      } else if (page.blob) {
        bitmap = await createImageBitmap(page.blob)
        source = bitmap
      } else {
        continue
      }

      try {
        scratch.width = CANVAS_WIDTH
        scratch.height = CANVAS_HEIGHT
        const context = scratch.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('تعذر تجهيز صورة صفحة الإجابة.')
        context.clearRect(0, 0, scratch.width, scratch.height)
        context.drawImage(source, 0, 0, scratch.width, scratch.height)
        const image = context.getImageData(0, 0, scratch.width, scratch.height)
        const bounds = findContentBounds(image.data, image.width, image.height)
        if (!bounds) continue

        const padding = 32
        const left = Math.max(0, bounds.left - padding)
        const top = Math.max(0, bounds.top - padding)
        const right = Math.min(CANVAS_WIDTH, bounds.right + padding)
        const bottom = Math.min(CANVAS_HEIGHT, bounds.bottom + padding)
        const cropWidth = right - left
        const cropHeight = bottom - top
        const scale = Math.min(1, 1024 / Math.max(cropWidth, cropHeight))
        const outputWidth = Math.max(1, Math.round(cropWidth * scale))
        const outputHeight = Math.max(1, Math.round(cropHeight * scale))

        scratch.width = outputWidth
        scratch.height = outputHeight
        const outputContext = scratch.getContext('2d')
        if (!outputContext) throw new Error('تعذر تجهيز صورة صفحة الإجابة.')
        outputContext.fillStyle = '#ffffff'
        outputContext.fillRect(0, 0, outputWidth, outputHeight)
        outputContext.drawImage(
          source,
          left,
          top,
          cropWidth,
          cropHeight,
          0,
          0,
          outputWidth,
          outputHeight,
        )
        result.push(await canvasToBlob(scratch, 'image/jpeg', 0.85))
      } finally {
        bitmap?.close()
        scratch.width = 0
        scratch.height = 0
      }
    }
    return result
  } catch (error) {
    result.length = 0
    throw error
  } finally {
    scratch.width = 0
    scratch.height = 0
  }
}
