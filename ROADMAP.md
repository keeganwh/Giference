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

**Latest:** the GIPHY bulk importer (Priority 1) is built and documented. It
has been exercised end-to-end against a local stub, but **not yet against the
real GIPHY API** — first real run should be a dry run.

**Known debt carried in:**
- Orphaned files at `gifs/robin-hopper-rvaa/` + matching thumbs (~2.8 MB), left
  by the index-clobbering bug. Not referenced by `index.json`.
- No UI to rename or delete a **library** — only create.
- No conflict handling if two devices write at once (single-writer assumption).
- `.md` files aren't in the deploy workflow's `paths-ignore`, so doc-only
  commits trigger a pointless rebuild.

---

## Priority 1 — Bulk import from GIPHY ✅ built

The headline ask: get existing GIPHY collections into GIFerence without adding
~200 gifs by hand. Shipped as `scripts/giphy-collect.js` (browser snippet) +
`scripts/import-giphy.mjs` (local Node importer) — see README for usage.

### Resolved: the API does not expose collections

The open question was whether GIPHY's public API can enumerate a logged-in
user's collections. **It can't.** The documented surface is search / trending /
translate / random / categories / lookup-by-id(s), plus the sticker and clip
equivalents — all content-discovery endpoints, none of them account-scoped.
There is no auth flow beyond an API key, so there is no "me" to scope to;
GIPHY's own generated clients expose nothing for channels, collections, users,
or favourites, and the 2018 request for favourites access (GiphyAPI issue #174)
was closed without an endpoint ever appearing.

`GET /v1/gifs/search?q=@username` can search a *channel's uploads*, which is not
the same thing: collections are saved gifs, mostly other people's uploads, so a
channel search misses them and picks up uploads that aren't in any collection.

So the fallback is the path: harvest ids in the browser, where the session
cookie already exists. `scripts/giphy-collect.js` scrolls the collection page to
load everything and scrapes gif ids from the DOM (permalinks and media URLs)
rather than calling an internal `/api/vN` route — markup changes are visible and
easy to fix; an undocumented endpoint can change shape silently.

From there everything else is public API: ids → `GET /v1/gifs?ids=…` in batches
of 100 with a free key, using the returned `images` object for rendition URLs.

### How storage actually works (settled)

GIFs are **full binary copies committed into this repo** — not links. Each gif
is a real file at `gifs/<libraryId>/<name>.gif`; `sourceUrl` only records its
origin. Nothing depends on GIPHY staying online, which is the point: the
library is self-contained and survives GIPHY deleting or rate-limiting things.

### What got built

- **`original` renditions**, per the sizing call (~200 gifs ≈ 350 MB, well
  inside GitHub's 1 GB recommendation). Anything past `--max-mb` (default 10) is
  flagged and fetched as `downsized_large` instead — jsDelivr won't serve files
  over 20 MB, so an oversized original would be broken in the app anyway.
- **Dry run by default.** Prints the plan, total download size and outliers;
  writes nothing without `--commit`. Git history is permanent, so a botched
  import can't be cleaned up without a history rewrite.
- **One collection → one library**, created if it doesn't exist.
- **One commit per batch**, not three per gif: the script writes to disk
  directly instead of going through the contents API.
- **`sourceId`** added to `GifRecord` (the GIPHY id), so re-runs dedupe
  reliably — `sourceUrl` carries varying tracking params and can't be matched on.
  Pre-existing records fall back to matching the id inside `sourceUrl`.
- Thumbnails via `sharp` (first frame → WebP at 320px, matching the browser
  path), a dev dependency only; `--no-thumbs` skips it.
- Guards: clean-tree check before committing, GIF magic-byte check on every
  download, and content-hash dedupe within a batch.
- **Overlapping collections resolve to tags, not copies.** A gif in several
  GIPHY collections is imported once; later runs add their `--tag` values to
  the existing record rather than downloading a second permanent copy. This
  follows the model in ARCHITECTURE: a record belongs to exactly one library,
  and anything cross-cutting is a tag.

### Sizing, measured

First real dry run (a 14-gif collection) averaged **3.4 MB per gif** at
`original`, not the 1.75 MB the estimate assumed. At that rate ~200 gifs is
**~670 MB** — still under GitHub's 1 GB recommendation, but with far less head
room than planned. Worth re-checking the running total every few collections;
if it looks like crossing ~800 MB, either drop the biggest outliers to
`downsized_large` (lower `--max-mb`) or split gifs into a separate data repo
(see Backlog).

### Still open — tagging after import

Imported gifs land with a name and description from GIPHY's `title` but **no
tags** unless `--tag` is passed, and tags are what drive Collections and search.
**Import is only half the job** — pair it with the bulk-tagging pass in
Priority 3, or the library degrades into one flat pile. Auto-deriving tags from
GIPHY slugs is worth a look but tends to be noisy.

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
