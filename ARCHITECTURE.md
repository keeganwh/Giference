# GIFerence — Architecture

Internals, invariants, and the traps that have already bitten us once.
User-facing setup lives in [README.md](./README.md).

---

## Shape of the thing

A static React + Vite SPA on GitHub Pages. No backend, no database, no server
code. Three stores, all of them the GitHub repo:

| What | Where | Read via | Written via |
| --- | --- | --- | --- |
| Metadata | `data/index.json` | GitHub API / raw | GitHub contents API |
| GIF files | `gifs/<libraryId>/<name>.gif` | jsDelivr CDN | GitHub contents API |
| Thumbnails | `thumbs/<libraryId>/<name>.webp` | jsDelivr CDN | GitHub contents API |

`src/lib/github.ts` is the only module that talks to the GitHub API.
`src/store.tsx` owns all state and every mutation. Components never write
directly.

## Data model (`src/types.ts`)

```ts
LibraryIndex { version, libraries: Library[], gifs: GifRecord[] }
```

The whole library is **one JSON document**. Every mutation rewrites the entire
file. That's fine at this scale and keeps things dead simple, but it's the
source of the concurrency constraints below.

**Collections are derived, never stored.** `tagCounts()` / filtering in
`src/lib/search.ts` group a library's gifs by tag at runtime. There is no
collection entity to keep in sync — deliberately.

---

## ⚠️ Invariant 1: mutations must read from `indexRef`, never from `index`

`store.tsx` keeps two copies of the index:

- `index` — React state, drives rendering, updates **asynchronously**
- `indexRef` — a ref mirroring it, updated **synchronously** via `applyIndex()`

**Every mutation must build its next state from `indexRef.current`.**

Why: two operations chained in one event handler (`addLibrary()` then
`importGif()`) both close over the *same* render's `index`. The second one
rebuilds `index.json` from a snapshot that predates the first, and silently
overwrites it.

This is not hypothetical — it shipped. It wiped a newly created library, and
then, across several add/favourite/delete operations, progressively emptied
`index.json` to `{libraries: [], gifs: []}` while the gif *files* stayed in the
repo. That's where the orphaned `gifs/robin-hopper-rvaa/` directory came from.

Corollary: prefer making a multi-part change **one atomic write**.
`importGif()` takes `newLibraryName` and creates the library + the gif in a
single index write rather than two chained calls.

## ⚠️ Invariant 2: no non-safelisted request headers on GitHub API calls

Adding `Cache-Control: no-cache` to a `fetch()` triggers a CORS preflight that
GitHub rejects, and every read dies with a useless `Failed to fetch`. Also
shipped once. Only send `Authorization`, `Accept`, and
`X-GitHub-Api-Version`.

## ⚠️ Invariant 3: read at a commit sha, not the branch ref

`GET /contents/{path}?ref=main` is served from an eventually-consistent cache —
a just-committed change can take ~a minute to show up. Reading
`?ref=<head-commit-sha>` is strongly consistent and immediate.

So `reload()` does: `getHeadSha()` → `getFile(path, headSha)`. Don't "simplify"
this back into a single branch-ref read.

---

## Read path

1. Paint instantly from the `localStorage` snapshot (`giference.cache`), keyed
   by `owner/repo@branch`.
2. In the background, read fresh at the head commit sha (or, with no token, the
   raw URL with a cache-buster) and reconcile.
3. A failed refresh **must not** clear a good cached view — hence the
   `if (!cached) setError(...)` guard.

## Write path (`importGif`)

1. Resolve the target library against `indexRef.current`, creating one inline if
   `newLibraryName` is set.
2. `PUT` the gif → `gifs/<libraryId>/<slug>.gif`.
3. Render a first-frame WebP thumbnail on a canvas, `PUT` → `thumbs/…`.
4. **One** index write containing the new library (if any) + the new record.
5. Stash an object URL in `localPreviews[id]` so the card renders immediately,
   before jsDelivr has mirrored the file.

Each `PUT` is a separate commit, so adding one gif produces 3 commits. Noisy but
harmless — and `paths-ignore` in the deploy workflow stops them triggering
rebuilds.

### Deletes are soft

`deleteGif()` removes the record from `index.json` but **leaves the files in the
repo**. Deliberate: it avoids extra API round-trips, and git history would
retain the blobs anyway so there's no space to reclaim. The cost is orphaned
files accumulating — see the prune item in ROADMAP.

---

## Image URL resolution (`src/lib/display.ts`)

- **Grid (idle)** → `thumbs/…webp` via jsDelivr — small, static, fast.
- **Hover / fresh upload** → the full animated gif.
- **On `onError`** → retry via `raw.githubusercontent.com`, which is
  immediately fresh for a file jsDelivr hasn't mirrored yet.
- **Copy button** → always the canonical jsDelivr URL (never raw, never blob).

## GIF metadata (`src/lib/gifmeta.ts`)

A small hand-rolled GIF parser walks the block structure to get dimensions,
frame count, and duration (sum of Graphic Control Extension frame delays).
Delays of 0–1 centiseconds are clamped to 10 to match how browsers actually
render them. Duration drives the Length filter and the badge on each card.

---

## Consistency model, honestly stated

Single-writer optimistic. The app reads the current sha, writes, and moves on.
There is **no conflict resolution**. Two devices editing at the same time will
have one silently lose (or hit a 409 from the contents API).

This is acceptable for a single-user tool and should stay a conscious choice,
not an accident. If it ever becomes multi-writer, the fix is the git Data API:
build a tree and commit all files atomically against a known parent, retrying on
a moved head.
