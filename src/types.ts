// Core data model for GIFerence.
//
// The entire library is described by a single `LibraryIndex` object which is
// persisted to the repo as `data/index.json`. GIF binaries live under `gifs/`
// and generated thumbnails under `thumbs/`. Collections are NOT stored — they
// are derived at runtime by grouping a library's GIFs by tag.

export interface GifRecord {
  id: string
  /** Display name. Falls back to the filename when not set by the user. */
  name: string
  /** Stored file name, e.g. "robin-hopper-laughing.gif". */
  filename: string
  /** Repo-relative path to the GIF, e.g. "gifs/reactions/robin-hopper-laughing.gif". */
  path: string
  /** Repo-relative path to the static thumbnail, if one was generated. */
  thumbPath?: string
  /** Owning library id. */
  library: string
  /** Tags drive both Collections and search/filtering. */
  tags: string[]
  /** Free text describing what's in the gif / what it says — searchable. */
  description: string
  favorite: boolean
  /** Total animation length in milliseconds (sum of frame delays). */
  durationMs?: number
  frameCount?: number
  width?: number
  height?: number
  bytes?: number
  /** Original URL, when the gif was imported by URL. */
  sourceUrl?: string
  addedAt: string
}

export interface Library {
  id: string
  name: string
  createdAt: string
}

export interface LibraryIndex {
  version: number
  libraries: Library[]
  gifs: GifRecord[]
}

export const EMPTY_INDEX: LibraryIndex = {
  version: 1,
  libraries: [],
  gifs: [],
}

/** A runtime-derived grouping of a library's gifs that share a tag. */
export interface Collection {
  tag: string
  gifs: GifRecord[]
}
