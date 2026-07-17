// Minimal GIF parser: extracts dimensions, frame count, and total animation
// length by summing per-frame delays. Used to populate the "Length" filter and
// show duration on cards. Pure byte-walking, no dependencies.

export interface GifMeta {
  width: number
  height: number
  frameCount: number
  durationMs: number
}

export function parseGifMeta(bytes: Uint8Array): GifMeta | null {
  // Header: "GIF87a" or "GIF89a"
  if (bytes.length < 10) return null
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2])
  if (sig !== 'GIF') return null

  const width = bytes[6] | (bytes[7] << 8)
  const height = bytes[8] | (bytes[9] << 8)

  let pos = 10
  const packed = bytes[10]
  const gctFlag = (packed & 0x80) !== 0
  const gctSize = packed & 0x07
  pos = 13 // after logical screen descriptor (7 bytes total: 6..12)
  if (gctFlag) pos += 3 * (1 << (gctSize + 1))

  let frameCount = 0
  let durationCs = 0 // centiseconds
  let pendingDelay = 0

  const skipSubBlocks = (p: number): number => {
    while (p < bytes.length) {
      const size = bytes[p++]
      if (size === 0) break
      p += size
    }
    return p
  }

  while (pos < bytes.length) {
    const block = bytes[pos++]
    if (block === 0x3b) break // trailer
    if (block === 0x21) {
      // extension
      const label = bytes[pos++]
      if (label === 0xf9) {
        // Graphic Control Extension: blockSize(1)=4, packed(1), delay(2 LE), transIdx(1), terminator(1)
        const blockSize = bytes[pos++]
        if (blockSize >= 4) {
          pendingDelay = bytes[pos + 1] | (bytes[pos + 2] << 8)
        }
        pos += blockSize
        pos = skipSubBlocks(pos) // terminator / any remaining sub-blocks
      } else {
        pos = skipSubBlocks(pos)
      }
    } else if (block === 0x2c) {
      // Image Descriptor
      frameCount++
      // Browsers clamp very small delays; GIFs with 0/1 cs typically render ~10cs.
      durationCs += pendingDelay <= 1 ? 10 : pendingDelay
      pendingDelay = 0
      // descriptor is 9 bytes (already consumed the 0x2c separator)
      const localPacked = bytes[pos + 8]
      pos += 9
      const lctFlag = (localPacked & 0x80) !== 0
      const lctSize = localPacked & 0x07
      if (lctFlag) pos += 3 * (1 << (lctSize + 1))
      pos++ // LZW minimum code size
      pos = skipSubBlocks(pos) // image data sub-blocks
    } else {
      // Unknown / corrupt — bail with what we have.
      break
    }
  }

  return {
    width,
    height,
    frameCount: Math.max(frameCount, 1),
    durationMs: durationCs * 10,
  }
}

/** Coarse length bucket used by the Length filter. */
export type LengthBucket = 'short' | 'medium' | 'long'

export function lengthBucket(durationMs?: number): LengthBucket | null {
  if (durationMs == null || durationMs <= 0) return null
  if (durationMs < 2000) return 'short'
  if (durationMs <= 5000) return 'medium'
  return 'long'
}

export function formatDuration(durationMs?: number): string {
  if (durationMs == null || durationMs <= 0) return ''
  return `${(durationMs / 1000).toFixed(1)}s`
}
