# GIFerence — Tech Stack

```stack
fw:react
fw:vite
backend:none
data:github
style:css
lib:typescript
lib:react-dom
```

## Stack

- **Framework:** React 18 — small, well-understood, no need for anything heavier
  for a grid-and-modals UI.
- **Build tool:** Vite 5 — fast dev server and a simple static build; the base
  path is set for GitHub Pages (`/Giference/`) and overridable via
  `GIFERENCE_BASE`.
- **Language:** TypeScript 5 in `strict` mode (plus `noUnusedLocals` /
  `noUnusedParameters`) — the type-check *is* the test suite here.
- **Backend:** none. A pure static site; all writes go browser → GitHub REST API.
- **Data store:** the GitHub repo itself. GIFs in `gifs/`, thumbnails in
  `thumbs/`, metadata in `data/index.json`. Git is the free cross-device sync;
  chosen over a Gist (poor with binaries, tight size limits).
- **Styling:** hand-written CSS (`src/styles.css`) — no framework or component
  library, keeping the dependency surface and bundle tiny.
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.

## Features & the tools behind them

- **Serving GIFs / Discord-ready links** — the free **jsDelivr** CDN mirror of
  GitHub. Fast cached loads *and* a public URL that Discord unfurls into an
  animated preview. `raw.githubusercontent.com` is the immediate-freshness
  fallback while jsDelivr catches up.
- **Writing new GIFs** — the **GitHub REST contents API**, authenticated by a
  fine-grained PAT (`Contents: Read and write`) the user pastes once; stored only
  in browser `localStorage`.
- **Thumbnails** — the browser **Canvas API**: first frame rendered to a small
  WebP so grids stay fast and only animate the full GIF on hover/open.
- **GIF metadata** (dimensions, frame count, duration) — a dependency-free
  byte-walking parser in `src/lib/gifmeta.ts`, powering the Length filter and
  duration badges.
- **Search & filter** — client-side over name, description, and tags
  (`src/lib/search.ts`); favourites pinned to the top.
- **State** — React context in `src/store.tsx`, with an `indexRef` mirror for
  synchronous freshness across chained mutations, plus a `localStorage` snapshot
  for instant paint on reload.

## Still to decide

- Whether to batch the gif + thumbnail + index writes into a **single atomic
  commit** (git Data API) instead of sequential contents-API PUTs.
- Whether to **deepen the totakit GIF-tools integration** (in-browser) beyond the
  current external link.
- Whether a **separate off-repo backup** (the old Gist idea) is still wanted now
  that the repo *is* the store.
- **Scaling path:** if the repo outgrows a few GB, split GIFs into a separate data
  repo.
