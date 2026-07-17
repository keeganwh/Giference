# 🎞️ GIFerence

A bespoke, self-hosted GIF-curation library. Store your favourite GIFs, tag and
describe them, search across everything, and copy a Discord-ready link with one
click — all backed by a **free** GitHub repo, no paid hosting.

## How it works

GIFerence is a static web app (React + Vite) with **no backend**:

- **Storage** — GIF files live in this repo under `gifs/`, thumbnails under
  `thumbs/`, and all metadata (names, tags, descriptions, favourites) in
  `data/index.json`. The repo *is* your database, and it syncs across devices
  for free (it's just git).
- **Serving** — GIFs are served through the free [jsDelivr](https://www.jsdelivr.com/)
  CDN mirror of GitHub. That gives fast loads **and** a public URL that Discord
  unfurls into an animated preview.
- **Copying** — the "Copy" button copies that jsDelivr URL. Pasting it into
  Discord (or anywhere that unfurls links) shows the animated GIF. This is how
  Giphy/Tenor "copy" works too — browsers can't reliably put an *animated* GIF
  on the clipboard as image data.
- **Adding GIFs** — the app writes new files straight to the repo via the GitHub
  REST API, authenticated with a fine-grained Personal Access Token you paste
  once (stored only in your browser).

### Hierarchy

```
Index  (all libraries + search across ALL gifs)
 └── Library  (a curated collection; search scoped to it)
      └── Collection  (auto-generated: gifs in the library grouped by a tag)
```

## Setup

1. **Make this repo public** (required so GIFs load & copy-links work).
2. Enable **GitHub Pages**: Settings → Pages → Source = *GitHub Actions*. The
   included workflow (`.github/workflows/deploy.yml`) builds and deploys on every
   push to `main`. The app will be at `https://<you>.github.io/Giference/`.
3. Create a **fine-grained PAT**: github.com/settings/personal-access-tokens →
   only this repo → **Contents: Read and write**.
4. Open the app → **Settings** → confirm owner/repo/branch and paste the token.
5. Click **＋ Add gif** to create your first library and start curating.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173/Giference/
npm run build    # type-check + production build into dist/
```

## Status & roadmap

See [`PROJECT_LOG.md`](./PROJECT_LOG.md) for the running log and the
prioritised feature list.
