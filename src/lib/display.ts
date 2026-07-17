// Resolve the URLs used to show and to copy a gif. Freshly-added gifs use an
// in-memory object URL until the CDN catches up; everything else uses jsDelivr.

import type { GifRecord } from '../types'
import { getConfig } from './github'
import { jsdelivrUrl } from './urls'

export function gifUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  return localPreviews[gif.id] ?? jsdelivrUrl(getConfig(), gif.path)
}

export function thumbUrl(gif: GifRecord, localPreviews: Record<string, string>): string {
  if (localPreviews[gif.id]) return localPreviews[gif.id]
  if (gif.thumbPath) return jsdelivrUrl(getConfig(), gif.thumbPath)
  return jsdelivrUrl(getConfig(), gif.path)
}

/** The URL that gets copied for pasting into Discord etc. */
export function copyUrl(gif: GifRecord): string {
  return jsdelivrUrl(getConfig(), gif.path)
}
