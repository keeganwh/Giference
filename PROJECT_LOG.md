# GIFerence — Project Log

A running log of decisions and changes.

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
