# GIFerence — Project Log

A running log of decisions and changes.

## 2026-07-26 — Workflow change: branches, and import decisions settled

**Workflow:** development moves from committing straight to `main` to **one
branch per chunk of work, merged via PR**. Captured in the new `CLAUDE.md`,
which is now the entry point for any session on this repo.

**Decisions settled for the GIPHY bulk import:**
- Clarified that gifs are stored as **full binaries committed to the repo**, not
  links — `sourceUrl` is provenance only.
- **Keep `original` renditions.** At <200 gifs (~350 MB) the repo is well inside
  GitHub's 1 GB guidance, so quality wins; the earlier push toward downsized
  renditions was scaled for thousands of gifs and doesn't apply.
- Import targets GIPHY **collections** (not favourites separately), suggesting a
  natural *one collection → one library* mapping.
- Guardrails retained: dry-run by default, and flag >10 MB outliers (jsDelivr
  refuses >20 MB).

UI tweaks are expected to be small, iterative visual/layout changes — batched
into short branches rather than planned up front.

## 2026-07-26 — Documentation pass & roadmap

v1 is in real use (1 library, 5 gifs). Documented the project properly before
opening the next phase of work:

- **README.md** rewritten — setup split into per-repo vs per-device, usage
  table, and an explicit "limits worth knowing" section.
- **ARCHITECTURE.md** (new) — data model, read/write paths, and the three
  invariants that caused the shipped bugs (`indexRef` vs stale `index`; no
  non-safelisted request headers; read at a commit sha, not the branch ref).
- **ROADMAP.md** (new) — handoff notes plus the plan for bulk GIPHY import,
  multi-device/PWA, and housekeeping.

Key finding while measuring: gifs average **~1.75 MB** because the app pulls
GIPHY's *original* rendition, and **git history is permanent** — deleting a gif
reclaims nothing. That caps the repo at ~550 gifs and makes rendition choice the
central decision for any bulk import.

Also noted as debt: orphaned `gifs/robin-hopper-rvaa/` files left by the
index-clobbering bug, and no UI to rename/delete a library.

## 2026-07-18 — Faster refresh + save feedback

- **Refresh delay (~1 min):** a fresh page load re-read `index.json` via the
  branch ref, which GitHub serves from an eventually-consistent cache. Now we
  read the **head commit sha** first and read the file at that immutable sha
  (+ `Cache-Control: no-cache`), so changes appear on refresh almost instantly.
- **Instant paint:** the last-seen index is cached in `localStorage` and shown
  immediately on load while the fresh read reconciles in the background.
- **In-session is already immediate:** adds/deletes update the on-screen list
  from memory — no refresh needed. (Refreshing was what surfaced the delay.)
- **Save feedback:** a "● Saving… / ✓ Saved" pill in the header plus a manual
  ↻ refresh button, so it's clear when a change has actually committed.
- **Image freshness:** cards fall back from jsDelivr to the always-fresh raw
  URL if a just-added file isn't mirrored on the CDN yet.

## 2026-07-17 — Bugfix: new library lost when adding a gif

- **Symptom:** creating a new library while adding a gif saved the gif but not
  the library; it never appeared in the library list or the edit dropdown.
- **Cause:** the add flow called `addLibrary()` then `importGif()` as two steps,
  and both read `index` from the same stale React closure. `importGif` rebuilt
  `index.json` from the pre-library snapshot and overwrote the library.
- **Fix:** the store now mirrors `index` in a ref updated synchronously, so
  chained operations see fresh state; and `importGif` creates the new library +
  gif in a single atomic index write. The edit modal can now also pick/create a
  library (handles gifs orphaned by the earlier bug).

## 2026-07-17 — Project kickoff & v1 scaffold

### Decisions

- **Platform:** static web app (React + Vite + TypeScript), hosted on **GitHub
  Pages**. Accessible by URL on any device, nothing to install.
- **Storage / sync:** the GitHub repo itself is the backing store — GIF binaries
  in `gifs/`, thumbnails in `thumbs/`, metadata in `data/index.json`. Git *is*
  the cross-device sync, and it's free. (Chosen over Gist, which handles binaries
  poorly and has tight size limits.)
- **Serving:** GIFs served via the free **jsDelivr** CDN mirror of GitHub — fast
  loads plus a public URL Discord unfurls.
- **Copy-to-Discord:** copies the jsDelivr **URL** (not clipboard image bytes,
  which browsers sanitise to a static frame). This is how Giphy/Tenor do it and
  it keeps everything free. Supersedes the original "copy the file locally" idea,
  which can't satisfy cross-device + web at the same time.
- **Writes / auth:** app commits new gifs to the repo via the GitHub REST API,
  authenticated by a fine-grained PAT stored in the browser (`localStorage`).
  Pure static site, no serverless needed.
- **Load times:** static WebP thumbnails generated at add-time; grids show the
  thumbnail and only animate the full GIF on hover / open.
- **Known constraint:** repo must be **public** (so jsDelivr can serve). GitHub
  repos should stay under a few GB — thousands of small GIFs is fine, not
  unlimited multi-GB. If we outgrow it, split GIFs into a separate data repo.

### Built in this pass (v1 foundation)

- Project scaffold, TS config, GitHub Pages deploy workflow (base `/Giference/`).
- Data model (`GifRecord` / `Library` / derived `Collection`) + `data/index.json`.
- GitHub storage layer: PAT/config in `localStorage`, contents-API reads/writes,
  jsDelivr + raw URL builders.
- Minimal GIF parser (dimensions, frame count, duration by summing frame delays)
  → powers the Length filter and duration badges.
- Canvas thumbnail generator (first frame → WebP).
- UI: Index → Library → Collection navigation, gif grid with hover-to-play.
- Search (name + description + tags) & filters (library, tags, length).
- Add GIF by upload **or** URL (URL saves a copy to the repo), with name
  (optional → filename), description, tags, and library (create-on-the-fly).
- Copy button (jsDelivr URL) and Favourite (pins to top), both persisted.
- Edit/remove gif; local preview so fresh uploads show before CDN propagation.

### Feature checklist (from the brief)

- [x] [High] Hierarchy: Index → Libraries → Collections (auto by tag)
- [x] [High] Search (name + text/description) + filter (library, tags, length)
- [x] [High] Tags on add → drive collections + search
- [x] [High] Text/description on add
- [x] [High] Copy gif to use in Discord (jsDelivr URL)
- [x] [Med] Favourite → pin to top
- [x] [Med] Add by URL or upload (URL saves a copy)
- [x] [Med] Name on add (optional → filename)
- [x] [Med] Reduce load times (thumbnails; hover-to-play)
- [x] [Low] Saved file named from the gif's name (kebab-case)
- [x] [Low] Link out to the totakit GIF tools
- [ ] [Low] Deeper integration of the totakit in-browser tools (currently a link)
- [ ] [Low] Gist backup sync (superseded in practice by repo-as-store; revisit if
      a separate off-repo backup is still wanted)

### Next steps / to verify with real data

- Enable Pages + add a PAT, then end-to-end test: add a gif, confirm it commits,
  serves via jsDelivr, copies into Discord, and survives a reload on another
  device.
- Consider batching the gif + thumb + index writes into a single atomic commit
  (git Data API) instead of sequential contents-API PUTs.

---

## GIPHY bulk import (branch: giphy-bulk-import)

**Verified first: GIPHY's public API cannot list a user's collections.** The
documented surface is content discovery only (search / trending / translate /
random / categories / lookup-by-id), with no account-scoped endpoint and no
auth beyond an API key; GIPHY's own generated clients expose nothing for
channels, collections, users or favourites, and the 2018 favourites request
(GiphyAPI #174) closed without one. `search?q=@username` covers a channel's
*uploads*, which is a different set from saved collections. So the roadmap's
fallback became the design: harvest ids in the browser where the session
already exists, then use the public API for metadata.

**Decisions:**

- Ids come from `scripts/giphy-collect.js`, a console snippet that scrolls the
  collection page and scrapes gif ids out of the DOM. Deliberately not calling
  giphy.com's internal `/api/vN` routes: markup changes are visible and easy to
  re-fix, an undocumented endpoint changes shape silently.
- The importer is a local Node script, not a browser feature. The browser path
  would make 3 commits per gif through the contents API (600 commits for 200
  gifs); writing to disk makes it one commit per batch.
- Dry run is the default, and the guard is real rather than cosmetic: committed
  gif blobs stay in git history forever, so a bad import can't be undone by
  deleting files.
- Added `sourceId` to `GifRecord`. Dedupe on re-run needs a stable key and
  `sourceUrl` carries per-request tracking params (`?cid=…&ep=…`), so matching
  on it is unsafe. Older records fall back to extracting the id from the URL.
- `sharp` as a **dev** dependency for first-frame WebP thumbnails (the browser's
  canvas path doesn't exist in Node). The app's runtime deps are still React
  and nothing else.
- The script refuses to commit with a dirty tree — a dirty `data/index.json`
  usually means the app has pending writes, which would otherwise get folded
  into the import commit.

**Tested** end-to-end against a local stub API (dry run, commit, re-run dedupe,
oversize handling, `--no-thumbs`, dirty-tree guard). Not yet run against the
real GIPHY API — the first real run should be a dry run.

**Follow-up:** imported gifs arrive untagged, and tags drive Collections and
search. The bulk-tagging pass in Priority 3 is what makes the import useful.

**First live run against the real GIPHY API** turned up three things the stub
couldn't:

- `title` comes back **empty** for most gifs, and `slug` is `"<words>-<id>"`, so
  the naive `title || slug || id` fallback produced names like
  `dancing-alisonbrie-7dkevrstq4fxidhk5s` or a bare id. Now: title, else the
  slug with its id tail stripped and title-cased, else `<Library> <n>` — a
  numbered name beats naming a card after a raw GIPHY id.
- Collection pages have an SEO `<h1>` ("Dancing GIFs on GIPHY - Be Animated"),
  so the snippet was naming collections after that. It now prefers the URL's
  last path segment, which is the actual collection slug.
- When a gif is swapped to `downsized_large`, the dry run printed the
  replacement's size next to an "oversize" flag, which read as a bug. It now
  prints both sizes.

Also measured: **3.4 MB average per gif** at `original`, roughly double the
1.75 MB the sizing estimate assumed. See ROADMAP.

**Overlapping collections.** The same gif is often in several GIPHY
collections. First pass simply skipped an already-imported id, which silently
lost the fact that it belonged to the second collection at all. Considered
adding a second record pointing at the same file (one gif, two libraries) —
rejected: the ask was one entry per gif, and it fits the data model worse, since
`GifRecord.library` is singular by design. Settled on: import once, and add the
run's `--tag` values to the existing record. One file, one record, a tag per
collection — which is exactly how ARCHITECTURE says cross-cutting grouping is
meant to work, given collections are derived from tags and never stored.
