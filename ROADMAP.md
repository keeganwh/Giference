# GIFerence — Roadmap & Handoff

Running plan for what's next. History lives in [PROJECT_LOG.md](./PROJECT_LOG.md);
internals in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Start here (handoff)

**State:** v1 is live, deployed, and in real use at
https://keeganwh.github.io/Giference/ with one library ("Robin Hopper Reacts")
and 5 gifs. Everything in the original brief's High/Medium priorities is built
and working: hierarchy, search/filter, tags, descriptions, copy-for-Discord,
favourites, add-by-upload-or-URL, thumbnails.

**Before changing anything, read the three invariants in ARCHITECTURE.md.**
Both production bugs so far came from violating them, and both were subtle
(silent data loss; a blanket `Failed to fetch`).

**Working agreement:** develop on `main`, commit and push directly. Verify with
`npm run build` (type-check + build) before pushing. Pushes touching app code
auto-deploy via Actions; content-only commits are skipped by `paths-ignore`.

**Known debt carried in:**
- Orphaned files at `gifs/robin-hopper-rvaa/` + matching thumbs (~3 MB), left by
  the index-clobbering bug. Not referenced by `index.json`.
- No UI to rename or delete a **library** — only create.
- No conflict handling if two devices write at once (single-writer assumption).

---

## Priority 1 — Bulk import from GIPHY

The headline ask: get an existing GIPHY favourites collection into GIFerence
without adding hundreds of gifs by hand.

### The constraint that shapes everything

**Git history is permanent.** Every blob ever committed stays in the pack
forever; deleting a gif later reclaims nothing. Combined with GitHub's ~1 GB
recommended repo size, a sloppy import is an unfixable mess (short of a history
rewrite). Current average is **~1.75 MB/gif** because the app fetches GIPHY's
*original* rendition — about **550 gifs** to the soft ceiling.

Switching to a smaller rendition is the single highest-leverage decision here:

| Rendition | Typical size | Gifs before ~1 GB |
| --- | --- | --- |
| `original` (today) | ~1.75 MB | ~550 |
| `downsized_medium` | ≤ 5 MB cap, usually far less | ~1,500–3,000 |
| `fixed_width` (200px) | ~200–500 KB | ~2,000–5,000 |

For Discord reactions, `fixed_width`/`downsized` is almost always visually
sufficient — Discord scales previews down anyway.

### Proposed design: a local Node script, not the browser

Run as `npm run import -- <args>` from a clone, **not** through the web app:

- The browser path base64-encodes each file and makes one API call per file,
  producing **3 commits per gif** (gif, thumb, index). 300 gifs = 900 commits.
- A local script writes files to disk, generates thumbnails, updates
  `index.json`, and makes **one commit** for the whole batch. Far faster, far
  cleaner history, no API rate-limit exposure.

Pipeline:

1. **Input** — a list of GIPHY ids or URLs (see "getting your favourites" below).
2. **Metadata** — `GET /v1/gifs?ids=…` (batches of 100) with a free API key from
   developers.giphy.com. Returns an `images` object with explicit URLs per
   rendition — use those rather than guessing `media.giphy.com` URL patterns.
3. **Dry run (default)** — print count, chosen rendition, and **total download
   size**, then stop. Because history is forever, committing must be opt-in
   (`--commit`).
4. **Download** the chosen rendition; skip anything already imported (dedupe on
   GIPHY id — see schema note).
5. **Thumbnail** — first frame → WebP, matching the app's existing convention
   (`sharp` or `ffmpeg`; the browser's canvas approach isn't available in Node).
6. **Index** — append records with `durationMs`/`width`/`height` reusing the
   existing `parseGifMeta()` logic, then write `index.json` once.
7. **Commit + push** one batch commit.

### Getting your favourites out of GIPHY

The public GIPHY API exposes search / trending / lookup-by-id, but **as far as I
know there is no public endpoint for a logged-in user's favourites** — that's an
account feature on giphy.com, not an API surface. This needs verifying, and it's
the main unknown in this plan.

Fallback that definitely works: a small **browser console snippet / bookmarklet**
run on your favourites page while logged in, which scrapes the gif ids off the
page (scrolling to load them all) and dumps a JSON array to copy. That array is
the script's input. Unglamorous but robust, and a one-time cost.

### Schema note

`GifRecord` has `sourceUrl` but no stable source id. Add an optional
`sourceId` (the GIPHY id) so re-runs can dedupe reliably — `sourceUrl` varies
with tracking query params (`?cid=…&ep=v1_user_favorites…`), so it's unsafe to
match on.

### Tagging after import

Bulk-imported gifs will land with thin or no tags, and tags are what make
Collections and search useful. Import is only half the job — pair it with a
**bulk-tagging pass** in the UI (multi-select → add tag), or the library
degrades into one flat pile. See Priority 3.

**Open decisions:** rendition/quality; whether to bring GIPHY's `title` in as
the name; whether to auto-derive tags from GIPHY's slug or leave them empty.

---

## Priority 2 — Multi-device access

Mostly already true, with one rough edge.

**Works today:** browsing is read-only and token-free, so the URL just works on
a phone, tablet, or another computer. Git is the sync — no manual step.

**The friction:** adding/editing needs a PAT in *that browser's* localStorage,
and typing a `github_pat_…` string on a phone is miserable. Options:

- Just paste from a password manager (zero code, probably fine).
- Generate a QR code from the desktop Settings screen that the phone scans to
  transfer the token. Cute, but it puts a live credential in a QR — only worth
  it if the paste route genuinely annoys you.

**Worth doing regardless — make it a PWA.** A `manifest.webmanifest` + icons +
`display: standalone` gets "Add to Home Screen", an app icon, and a chrome-less
launch. Low effort, and it makes the thing *feel* like an app on mobile. Skip a
service worker for now — offline caching adds real staleness complexity for
little gain here.

**Needs testing on a real phone:** the Copy button (clipboard writes need HTTPS
plus a user gesture; iOS Safari is the fussy one), hover-to-play (there is no
hover on touch — a tap-to-play affordance may be needed), and modal/grid layout
at narrow widths.

---

## Priority 3 — Housekeeping & the tweaks list

- **Prune orphans.** A script to find files under `gifs/`/`thumbs/` not
  referenced by `index.json` and remove them (recovers working-tree space and
  stops confusion; git history keeps the blobs regardless). Immediate target:
  `gifs/robin-hopper-rvaa/`.
- **Library management.** Rename and delete libraries; reassign or adopt gifs
  whose library id no longer exists.
- **Bulk tagging / multi-select.** Increasingly necessary as the library grows;
  effectively a prerequisite for the GIPHY import being *useful*.
- **Batch writes.** Use the git Data API to commit gif + thumb + index as one
  atomic commit instead of three, halving write latency and tidying history.
- *(Placeholder for the tweaks list — to be filled in.)*

---

## Backlog

- Deeper integration of the totakit in-browser GIF tools (currently a link out).
- Off-repo backup of `index.json` (the original "gist sync" idea; largely
  superseded by the repo itself being the store, but a metadata-only backup is
  cheap insurance against another clobbering bug).
- Conflict handling: retry-on-409 against a moved head, if this ever becomes
  genuinely multi-writer.
- Keyboard-first quick search (`/` to focus, arrow keys, Enter to copy) — the
  fastest possible path to "find gif, paste in Discord".
- Split gifs into a separate data repo if the main repo approaches the size
  ceiling.
