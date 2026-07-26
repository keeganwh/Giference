# Changelog

Notable changes to GIFerence, newest first. Add a dated entry here whenever you
ship something worth remembering. (Earlier decision detail lives in
`PROJECT_LOG.md`.)

## 2026-07-26 — Project docs setup

- Added `CLAUDE.md` (lean per-session guidance), `ROADMAP.md` (phased outstanding
  work), this `CHANGELOG.md`, `TECH_STACK.md` (stack tags + prose), and
  `USER_PROTOCOLS.md` (operating habits). No app-code changes.

## 2026-07-18 — Faster refresh + save feedback

- **Refresh delay (~1 min) fixed:** reads now go via the immutable head commit
  sha (strongly consistent) instead of the eventually-consistent branch ref, so
  changes appear on refresh almost instantly.
- **Instant paint:** the last-seen index is cached in `localStorage` and shown
  immediately on load while the fresh read reconciles in the background.
- **Save feedback:** a "● Saving… / ✓ Saved" pill plus a manual ↻ refresh button.
- **Image freshness:** cards fall back from jsDelivr to the raw URL if a
  just-added file isn't mirrored on the CDN yet.

## 2026-07-17 — Bugfix: new library lost when adding a gif

- Creating a library while adding a gif saved the gif but not the library.
- Cause: `addLibrary()` then `importGif()` both read `index` from the same stale
  React closure, so the second write overwrote the first.
- Fix: the store now mirrors `index` in a ref updated synchronously, and
  `importGif` creates the new library + gif in a single atomic index write.

## 2026-07-17 — Project kickoff & v1 scaffold

- Initial scaffold: React + Vite + TypeScript, GitHub Pages deploy workflow.
- Data model (`GifRecord` / `Library` / derived `Collection`) + `data/index.json`.
- GitHub storage layer (PAT/config in `localStorage`, contents-API reads/writes,
  jsDelivr + raw URL builders).
- Dependency-free GIF parser, canvas WebP thumbnail generator.
- UI: Index → Library → Collection navigation, hover-to-play grid, search +
  filters (library, tags, length), add by upload or URL, edit/remove, favourite,
  copy jsDelivr URL, link out to the totakit GIF tools.
