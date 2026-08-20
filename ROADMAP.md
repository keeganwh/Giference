# GIFerence — Roadmap & Handoff

Running plan for what's next. History lives in [PROJECT_LOG.md](./PROJECT_LOG.md);
internals in [ARCHITECTURE.md](./ARCHITECTURE.md); working agreement in
[CLAUDE.md](./CLAUDE.md).

---

## Start here (handoff)

**State:** v1 is live and in real use at https://keeganwh.github.io/Giference/
with one library ("Robin Hopper Reacts") and 5 gifs. Everything in the original
brief's High/Medium priorities is built and working: hierarchy, search/filter,
tags, descriptions, copy-for-Discord, favourites, add-by-upload-or-URL,
thumbnails.

**Before changing anything, read the three invariants in ARCHITECTURE.md.**
Both production bugs so far came from violating them, and both were subtle
(silent data loss; a blanket `Failed to fetch`).

**Working agreement:** one branch per chunk of work, PR into `main` — see
CLAUDE.md. Verify with `npm run build` before pushing.

**Known debt carried in:**
- Orphaned files at `gifs/robin-hopper-rvaa/` + matching thumbs (~2.8 MB), left
  by the index-clobbering bug. Not referenced by `index.json`.
- No UI to rename or delete a **library** — only create.
- No conflict handling if two devices write at once (single-writer assumption).
- `.md` files aren't in the deploy workflow's `paths-ignore`, so doc-only
  commits trigger a pointless rebuild.

---

## Priority 1 — Bulk import from GIPHY

The headline ask: get existing GIPHY collections into GIFerence without adding
~200 gifs by hand.

### How storage actually works (settled)

GIFs are **full binary copies committed into this repo** — not links. Each gif
is a real file at `gifs/<libraryId>/<name>.gif`; `sourceUrl` only records its
origin. Nothing depends on GIPHY staying online, which is the point: the
library is self-contained and survives GIPHY deleting or rate-limiting things.

### Sizing (settled: keep originals)

At the current ~1.75 MB average, **~200 gifs ≈ 350 MB** — comfortably inside
GitHub's 1 GB recommended ceiling (5 GB hard limit). Quality wins; there is no
real tradeoff at this volume. **Import GIPHY's `original` rendition.**

Two guardrails that cost nothing:
- **Cap pathological outliers.** Anything over ~10 MB should be flagged (or
  fetched as `downsized_large`) — rare, and jsDelivr refuses to serve files over
  20 MB anyway, so an oversized original would be broken in the app regardless.
- **Dry-run before committing.** Git history is permanent: committed blobs are
  never reclaimed by a later delete, so a botched run can't be cleaned up
  without a history rewrite. Print the total download size and stop unless
  `--commit` is passed.

Revisit rendition choice only if the library heads toward four figures.

### Source: collections, not favourites

Import targets **GIPHY collections**. Favourites don't need separate handling —
the collections cover it.

This suggests a natural mapping: **one GIPHY collection → one GIFerence
library**, preserving the grouping already curated on GIPHY instead of dumping
everything into one pile.

Open question: GIPHY's public API covers search / trending / lookup-by-id, but
collections are a logged-in giphy.com account feature and **may not be exposed
via the API** — this needs verifying first, as it decides the whole input path.
Reliable fallback: a one-time browser console snippet / bookmarklet run on the
collection page while logged in, scrolling to load all items and dumping the gif
ids (plus collection name) as JSON.

### Proposed design: a local Node script, not the browser

Run as `npm run import -- <args>` from a clone, **not** through the web app:

- The browser path base64-encodes each file and makes one API call per file,
  producing **3 commits per gif** (gif, thumb, index). 200 gifs = 600 commits.
- A local script writes files to disk, generates thumbnails, updates
  `index.json`, and makes **one commit** for the whole batch. Far faster, far
  cleaner history, no API rate-limit exposure.

Pipeline:

1. **Input** — collection name + list of GIPHY ids (from the snippet above).
2. **Metadata** — `GET /v1/gifs?ids=…` (batches of 100) with a free API key from
   developers.giphy.com. Use the returned `images` object for rendition URLs
   rather than guessing `media.giphy.com` patterns.
3. **Dry run (default)** — print count, total download size, and any outliers;
   stop unless `--commit`.
4. **Download** originals; skip anything already imported (dedupe on GIPHY id).
5. **Thumbnail** — first frame → WebP, matching the app's convention (`sharp` or
   `ffmpeg`; the browser canvas path isn't available in Node).
6. **Index** — append records, reusing `parseGifMeta()` for
   `durationMs`/`width`/`height`, then write `index.json` once.
7. **Commit + push** one batch commit per collection.

### Schema note

`GifRecord` has `sourceUrl` but no stable source id. Add an optional `sourceId`
(the GIPHY id) so re-runs dedupe reliably — `sourceUrl` carries varying tracking
params (`?cid=…&ep=…`), so it's unsafe to match on.

### Tagging after import

Imported gifs will land with thin or no tags, and tags are what drive
Collections and search. **Import is only half the job** — pair it with a
bulk-tagging pass in the UI, or the library degrades into one flat pile. GIPHY's
`title`/`slug` can seed names; auto-deriving tags from slugs is worth a look but
tends to be noisy.

---

## Priority 2 — Multi-device access

Mostly already true, with one rough edge.

**Works today:** browsing is read-only and token-free, so the URL just works on
a phone, tablet, or another computer. Git is the sync — no manual step.

**The friction:** adding/editing needs a PAT in *that browser's* localStorage,
and typing a `github_pat_…` string on a phone is miserable. Options:

- Just paste from a password manager (zero code, probably fine).
- Generate a QR code from the desktop Settings screen for the phone to scan.
  Cute, but it puts a live credential in a QR — only worth it if pasting
  genuinely annoys.

**Worth doing regardless — make it a PWA.** A `manifest.webmanifest` + icons +
`display: standalone` gets "Add to Home Screen", an app icon, and a chrome-less
launch. Low effort, makes it *feel* like an app. Skip a service worker for now:
offline caching adds real staleness complexity for little gain.

**Needs testing on a real phone:** the Copy button (clipboard writes need HTTPS
plus a user gesture; iOS Safari is fussiest), hover-to-play (there is no hover on
touch — needs a tap-to-play affordance), and modal/grid layout at narrow widths.

---

## Priority 3 — UI tweaks & housekeeping

**UI tweaks** are expected to be small, visual/layout changes, discovered
iteratively by using the app — trial and error rather than a fixed list. Best
handled as short, self-contained branches, batching a few tweaks at a time.

Housekeeping:

- **Prune orphans.** A script to find files under `gifs/`/`thumbs/` not
  referenced by `index.json` and remove them. Immediate target:
  `gifs/robin-hopper-rvaa/`.
- **Library management.** Rename and delete libraries; reassign or adopt gifs
  whose library id no longer exists.
- **Bulk tagging / multi-select.** Increasingly necessary as the library grows;
  effectively a prerequisite for the GIPHY import being *useful*.
- **Batch writes.** Use the git Data API to commit gif + thumb + index as one
  atomic commit instead of three.
- **Add `*.md` to the workflow's `paths-ignore`** so doc commits don't redeploy.

---

## Backlog

- Deeper integration of the totakit in-browser GIF tools (currently a link out).
- Off-repo backup of `index.json` (the original "gist sync" idea) — cheap
  insurance against another clobbering bug.
- Conflict handling: retry-on-409 against a moved head, if this ever becomes
  genuinely multi-writer.
- Keyboard-first quick search (`/` to focus, arrows, Enter to copy) — the
  fastest path to "find gif, paste in Discord".
- Split gifs into a separate data repo if the main repo approaches the size
  ceiling (not a concern below ~500 gifs).
