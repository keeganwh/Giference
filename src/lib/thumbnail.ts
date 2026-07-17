// Generate a small static thumbnail (first frame) for a GIF so grids stay fast:
// we render tiny WebP thumbnails in lists and only load the full animation on
// hover / open. Runs entirely in the browser via canvas.

const MAX_DIM = 320

export interface Thumbnail {
  blob: Blob
  width: number
  height: number
}

export async function makeThumbnail(gifBlob: Blob): Promise<Thumbnail | null> {
  const url = URL.createObjectURL(gifBlob)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h) // draws first frame of the gif
    const blob = await canvasToBlob(canvas)
    if (!blob) return null
    return { blob, width: w, height: h }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    // WebP keeps thumbnails tiny; browsers that lack it fall back to PNG.
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.8)
  })
}
