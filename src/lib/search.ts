// Client-side search + filtering. Search matches the gif NAME and the
// TEXT/DESCRIPTION (and tags, as a bonus). Filters narrow by library, tag(s),
// and length bucket. Results are sorted with favourites pinned to the top.

import type { GifRecord } from '../types'
import { lengthBucket, type LengthBucket } from './gifmeta'

export interface Filters {
  query: string
  library: string | null
  tags: string[]
  length: LengthBucket | null
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  library: null,
  tags: [],
  length: null,
}

function matchesQuery(gif: GifRecord, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    gif.name.toLowerCase().includes(needle) ||
    gif.description.toLowerCase().includes(needle) ||
    gif.tags.some((t) => t.toLowerCase().includes(needle))
  )
}

export function applyFilters(gifs: GifRecord[], f: Filters): GifRecord[] {
  const filtered = gifs.filter((gif) => {
    if (f.library && gif.library !== f.library) return false
    if (f.tags.length && !f.tags.every((t) => gif.tags.includes(t))) return false
    if (f.length && lengthBucket(gif.durationMs) !== f.length) return false
    if (!matchesQuery(gif, f.query)) return false
    return true
  })
  return sortGifs(filtered)
}

/** Favourites first, then most-recently-added. */
export function sortGifs(gifs: GifRecord[]): GifRecord[] {
  return [...gifs].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return b.addedAt.localeCompare(a.addedAt)
  })
}

/** All distinct tags present in a set of gifs, sorted by frequency then name. */
export function tagCounts(gifs: GifRecord[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const gif of gifs) {
    for (const tag of gif.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
