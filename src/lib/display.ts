// Resolve the URLs used to show and to copy a gif. Freshly-added gifs use an
// in-memory object URL until the CDN catches up; everything else uses jsDelivr.

import type { GifRecord } from '../types'
import { getConfig } from './github'
import { jsdelivrUrl, rawUrl } from './urls'

export function gifUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  return localPreviews[gif.id] ?? jsdelivrUrl(getConfig(), gif.path)
}

export function thumbUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  if (localPreviews[gif.id]) return localPreviews[gif.id]
  if (gif.thumbPath) return jsdelivrUrl(getConfig(), gif.thumbPath)
  return jsdelivrUrl(getConfig(), gif.path)
}

// raw.githubusercontent variants: slower + rate-limited, but immediately fresh
// for a just-committed file that jsDelivr hasn't mirrored yet. Used as an
// on-error fallback for the <img> src.
export function rawGifUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  return localPreviews[gif.id] ?? rawUrl(getConfig(), gif.path)
}

export function rawThumbUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  if (localPreviews[gif.id]) return localPreviews[gif.id]
  return rawUrl(getConfig(), gif.thumbPath ?? gif.path)
}

/** The URL that gets copied for pasting into Discord etc. */
export function copyUrl(gif: GifRecord): string {
  return jsdelivrUrl(getConfig(), gif.path)
}
