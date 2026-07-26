# CLAUDE.md

Lean guidance for working on GIFerence. Read this first each session.

## What this is

GIFerence is a bespoke, self-hosted GIF-curation library + resource portal. A
static web app with **no backend**: the GitHub repo itself is the database. GIF
binaries live in `gifs/`, thumbnails in `thumbs/`, and all metadata in
`data/index.json`. The app commits changes straight to the repo from the browser
via the GitHub REST API (fine-grained PAT stored in `localStorage`). GIFs are
served through the free jsDelivr CDN mirror and copied as a Discord-unfurlable
URL.

## Stack

- **React 18** + **TypeScript 5** (strict), built with **Vite 5**.
- Hand-written CSS (`src/styles.css`) — no CSS framework or component library.
- Only runtime deps are `react` / `react-dom`. Keep it that way unless there's a
  strong reason.
- Hosted on **GitHub Pages** (base path `/Giference/`); deploy via
  `.github/workflows/deploy.yml` on push to `main`.

## Architecture (the short version)

- `src/types.ts` — the data model. `LibraryIndex` (`{ version, libraries, gifs }`)
  is the whole database, persisted as `data/index.json`. **Collections are not
  stored** — they're derived at runtime by grouping a library's gifs by tag.
- `src/store.tsx` — the single source of truth. Loads the index, exposes it via
  React context (`useStore`), and persists every mutation back to GitHub. Owns
  the import pipeline (parse metadata → make thumbnail → commit files → write
  index).
- `src/lib/github.ts` — the storage layer (contents API reads/writes, config +
  token in `localStorage`).
- `src/lib/urls.ts` / `display.ts` — jsDelivr (display/copy) and raw (fresh
  fallback) URL builders.
- `src/lib/gifmeta.ts`, `thumbnail.ts`, `search.ts`, `bytes.ts` — dependency-free
  GIF parsing, canvas thumbnails, client-side search/filter, binary helpers.
- `src/App.tsx` + `src/components/` — Index → Library → Collection navigation,
  grid, filter bar, add/edit and settings modals.

## Hard rules

- **Never commit a token or secret.** The PAT lives only in the user's browser
  `localStorage`; it must never touch the repo, code, or a commit.
- **`indexRef` is the freshness source, not the `index` state.** Mutations chained
  in one handler (e.g. create-library-then-add-gif) must read `indexRef.current`,
  not the closed-over render snapshot — a stale read here caused a real data-loss
  bug (see CHANGELOG). Index writes that create + reference new data must be a
  single atomic write.
- **The repo must stay public** — jsDelivr and raw serving both require it.
- **Don't add a build/test step that assumes a server.** This is a pure static
  site; keep it that way.
- **Don't reorder or renumber `data/index.json` by hand.** The app owns it; edit
  through the app, not the file.

## Run / build

```bash
npm install
npm run dev      # http://localhost:5173/Giference/
npm run build    # tsc -b type-check + vite production build → dist/
npm run preview  # serve the built dist/
```

There is **no test suite** and no linter beyond `tsc` strict mode. "Passing"
means `npm run build` is clean (strict TS, `noUnusedLocals`/`noUnusedParameters`
are on). Verify changes there before committing.

## Don't touch without reason

- `data/**`, `gifs/**`, `thumbs/**` — user content the app manages at runtime.
- `vite.config.ts` base path — breaks GitHub Pages if changed carelessly.
