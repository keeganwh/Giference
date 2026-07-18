// Central data store: loads the library index from the repo, exposes it to the
// app via React context, and persists mutations back to GitHub. Also owns the
// "import a gif" pipeline (thumbnail + metadata + committing files).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { EMPTY_INDEX, type GifRecord, type Library, type LibraryIndex } from './types'
import { getConfig, getFile, getHeadSha, getSha, hasToken, putFile } from './lib/github'
import { rawUrl } from './lib/urls'
import { blobToBase64, slugify, toBase64 } from './lib/bytes'
import { parseGifMeta } from './lib/gifmeta'
import { makeThumbnail } from './lib/thumbnail'

const INDEX_PATH = 'data/index.json'

export interface ImportInput {
  blob: Blob
  name?: string
  description: string
  tags: string[]
  /** Existing library id to add to. Ignored when `newLibraryName` is set. */
  library: string
  /** When set, a new library is created and the gif is added to it atomically. */
  newLibraryName?: string
  sourceUrl?: string
}

interface StoreValue {
  index: LibraryIndex
  loading: boolean
  /** True while a change is being committed to the repo. */
  saving: boolean
  error: string | null
  /** Object URLs for gifs added this session, so they preview before CDN sync. */
  localPreviews: Record<string, string>
  reload: () => Promise<void>
  importGif: (input: ImportInput) => Promise<GifRecord>
  toggleFavorite: (id: string) => Promise<void>
  updateGif: (id: string, patch: Partial<GifRecord>) => Promise<void>
  deleteGif: (id: string) => Promise<void>
  addLibrary: (name: string) => Promise<Library>
}

const StoreContext = createContext<StoreValue | null>(null)

function decodeBase64Json(content: string): LibraryIndex {
  const clean = content.replace(/\s/g, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return JSON.parse(new TextDecoder().decode(bytes))
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)
}

function makeLibrary(name: string): Library {
  return {
    id: slugify(name) + '-' + shortId().slice(0, 4),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  }
}

// A local snapshot of the last index we saw, for instant paint on refresh
// while the fresh server read is in flight. Keyed by repo so switching repos
// doesn't show stale data.
const CACHE_KEY = 'giference.cache'
function cacheId(): string {
  const c = getConfig()
  return `${c.owner}/${c.repo}@${c.branch}`
}
function loadCache(): LibraryIndex | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.id === cacheId() ? (parsed.index as LibraryIndex) : null
  } catch {
    return null
  }
}
function saveCache(index: LibraryIndex): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: cacheId(), index }))
  } catch {
    /* quota — non-fatal */
  }
}

function filenameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname
    return decodeURIComponent(p.split('/').pop() || 'gif')
  } catch {
    return 'gif'
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<LibraryIndex>(EMPTY_INDEX)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({})
  const shaRef = useRef<string | null>(null)

  // Mirror of `index` that updates synchronously. Mutations read from this
  // rather than the closed-over `index` state, so operations chained within a
  // single event handler (e.g. create-library-then-add-gif) always build on the
  // freshest data instead of a stale render snapshot.
  const indexRef = useRef<LibraryIndex>(EMPTY_INDEX)
  const applyIndex = useCallback((next: LibraryIndex) => {
    indexRef.current = next
    setIndex(next)
    saveCache(next)
  }, [])

  const reload = useCallback(async () => {
    setError(null)
    // Instant paint from the local snapshot (our own writes are the freshest
    // truth for this device); the fresh server read below reconciles it.
    const cached = loadCache()
    if (cached) {
      applyIndex(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    try {
      if (hasToken()) {
        // Read at the head commit sha, which is strongly consistent, instead of
        // the branch ref (cached/eventually-consistent) — this is what removes
        // the ~minute delay before a change shows up on refresh.
        const head = await getHeadSha()
        const file = await getFile(INDEX_PATH, head ?? undefined)
        if (!file) {
          applyIndex(EMPTY_INDEX)
          shaRef.current = null
        } else {
          applyIndex(decodeBase64Json(file.content))
          shaRef.current = file.sha
        }
      } else {
        // No token: read the public copy through raw (cache-busted).
        const cfg = getConfig()
        const res = await fetch(`${rawUrl(cfg, INDEX_PATH)}?t=${Date.now()}`)
        applyIndex(res.ok ? await res.json() : EMPTY_INDEX)
        shaRef.current = null
      }
    } catch (e) {
      // A transient read error shouldn't blow away a good cached view.
      if (!cached) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [applyIndex])

  useEffect(() => {
    void reload()
  }, [reload])

  // Persist the given index to the repo, refreshing the sha to avoid conflicts.
  const persist = useCallback(async (next: LibraryIndex, message: string) => {
    const sha = shaRef.current ?? (await getSha(INDEX_PATH))
    const base64 = toBase64(new TextEncoder().encode(JSON.stringify(next, null, 2)))
    await putFile(INDEX_PATH, base64, message, sha)
    // The put response sha isn't captured here; refresh lazily on next save.
    shaRef.current = null
  }, [])

  // Wrap a write so the UI can show a "Saving…/Saved" state.
  const withSaving = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaving(true)
    try {
      return await fn()
    } finally {
      setSaving(false)
    }
  }, [])

  const importGif = useCallback(
    (input: ImportInput): Promise<GifRecord> =>
      withSaving(async () => {
      const bytes = new Uint8Array(await input.blob.arrayBuffer())
      const meta = parseGifMeta(bytes)

      // Resolve the target library against the freshest index, creating a new
      // one in the same write when requested (atomic — no clobbering race).
      const current = indexRef.current
      let libraries = current.libraries
      let libraryId = input.library
      if (input.newLibraryName?.trim()) {
        const lib = makeLibrary(input.newLibraryName)
        libraries = [...libraries, lib]
        libraryId = lib.id
      }

      const desiredName =
        input.name?.trim() || (input.sourceUrl ? filenameFromUrl(input.sourceUrl) : 'gif')
      const slug = slugify(desiredName)
      const id = shortId()

      // Prefer a clean "name.gif" path; disambiguate with the id on collision.
      const existingPaths = new Set(current.gifs.map((g) => g.path))
      let filename = `${slug}.gif`
      let path = `gifs/${libraryId}/${filename}`
      if (existingPaths.has(path)) {
        filename = `${slug}-${id}.gif`
        path = `gifs/${libraryId}/${filename}`
      }

      // Commit the gif itself.
      await putFile(path, await blobToBase64(input.blob), `Add gif ${filename}`)

      // Best-effort thumbnail.
      let thumbPath: string | undefined
      const thumb = await makeThumbnail(input.blob)
      if (thumb) {
        thumbPath = `thumbs/${libraryId}/${filename.replace(/\.gif$/i, '')}.webp`
        await putFile(thumbPath, await blobToBase64(thumb.blob), `Add thumbnail for ${filename}`)
      }

      const record: GifRecord = {
        id,
        name: input.name?.trim() || slug,
        filename,
        path,
        thumbPath,
        library: libraryId,
        tags: input.tags,
        description: input.description,
        favorite: false,
        durationMs: meta?.durationMs,
        frameCount: meta?.frameCount,
        width: meta?.width,
        height: meta?.height,
        bytes: bytes.length,
        sourceUrl: input.sourceUrl,
        addedAt: new Date().toISOString(),
      }

      // Single atomic index write: new library (if any) + the new gif.
      const next: LibraryIndex = {
        ...current,
        libraries,
        gifs: [record, ...current.gifs],
      }
      applyIndex(next)
      await persist(next, `Add gif: ${record.name}`)

      // Keep a local preview so it shows immediately (before CDN propagation).
      const previewUrl = URL.createObjectURL(input.blob)
      setLocalPreviews((p) => ({ ...p, [id]: previewUrl }))
      return record
      }),
    [applyIndex, persist, withSaving],
  )

  const mutateGifs = useCallback(
    (map: (g: GifRecord) => GifRecord, message: string) =>
      withSaving(async () => {
        const next: LibraryIndex = { ...indexRef.current, gifs: indexRef.current.gifs.map(map) }
        applyIndex(next)
        await persist(next, message)
      }),
    [applyIndex, persist, withSaving],
  )

  const toggleFavorite = useCallback(
    async (id: string) => {
      const target = indexRef.current.gifs.find((g) => g.id === id)
      await mutateGifs(
        (g) => (g.id === id ? { ...g, favorite: !g.favorite } : g),
        `${target?.favorite ? 'Unfavourite' : 'Favourite'}: ${target?.name ?? id}`,
      )
    },
    [mutateGifs],
  )

  const updateGif = useCallback(
    async (id: string, patch: Partial<GifRecord>) => {
      await mutateGifs((g) => (g.id === id ? { ...g, ...patch } : g), `Edit gif: ${id}`)
    },
    [mutateGifs],
  )

  const deleteGif = useCallback(
    (id: string) =>
      withSaving(async () => {
        const target = indexRef.current.gifs.find((g) => g.id === id)
        const next: LibraryIndex = {
          ...indexRef.current,
          gifs: indexRef.current.gifs.filter((g) => g.id !== id),
        }
        applyIndex(next)
        // We remove it from the index but leave the file in the repo (cheap, and
        // avoids a second API round-trip). A future "prune" can garbage-collect.
        await persist(next, `Remove gif: ${target?.name ?? id}`)
      }),
    [applyIndex, persist, withSaving],
  )

  const addLibrary = useCallback(
    (name: string): Promise<Library> =>
      withSaving(async () => {
        const lib = makeLibrary(name)
        const next: LibraryIndex = {
          ...indexRef.current,
          libraries: [...indexRef.current.libraries, lib],
        }
        applyIndex(next)
        await persist(next, `Add library: ${lib.name}`)
        return lib
      }),
    [applyIndex, persist, withSaving],
  )

  const value = useMemo<StoreValue>(
    () => ({
      index,
      loading,
      saving,
      error,
      localPreviews,
      reload,
      importGif,
      toggleFavorite,
      updateGif,
      deleteGif,
      addLibrary,
    }),
    [index, loading, saving, error, localPreviews, reload, importGif, toggleFavorite, updateGif, deleteGif, addLibrary],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
