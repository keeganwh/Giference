# 🎞️ GIFerence

A bespoke, self-hosted GIF-curation library. Store your favourite GIFs, tag and
describe them, search across everything, and copy a Discord-ready link with one
click — all backed by a **free** GitHub repo, no paid hosting.

**Live:** https://keeganwh.github.io/Giference/

---

## Quick start

### First-time setup (once per repo)

1. The repo must be **public** — jsDelivr can only serve public repos, and the
   copy-links need to be publicly reachable for Discord to unfurl them.
2. **GitHub Pages** → Settings → Pages → Source = **GitHub Actions**. The
   workflow in `.github/workflows/deploy.yml` builds and deploys on every push
   that touches app code.

### Per-device setup (once per browser)

Browsing is **read-only and needs no login** — open the URL on any device and
your library is there.

To *add or edit* gifs from a device, that browser needs a token:

1. Create a **fine-grained PAT**: github.com/settings/personal-access-tokens
   - Repository access → **Only select repositories** → `Giference`
   - Permissions → **Contents: Read and write**
2. In the app → **Settings** → paste it → **Save & verify**.

The token is stored only in that browser's `localStorage`. It never leaves your
device except as an `Authorization` header to github.com.

---

## Using it

| Action | What happens |
| --- | --- |
| **＋ Add gif** | Upload a file or paste a URL. Saves a copy to the repo, generates a thumbnail, records name/description/tags. |
| **Copy** | Copies the gif's jsDelivr URL. Paste into Discord → it unfurls as an animated GIF. |
| **★ Favourite** | Pins the gif to the top of every list. |
| **Tags** | Become auto-generated **Collections** inside a library. |
| **Search** | Matches name, description, and tags. Filter by library, tag, and length. |

The header shows a **● Saving… / ✓ Saved** pill. When it reads *Saved*, your
change is committed to the repo — **no page refresh needed**. The ↻ button
force-re-reads from the repo if you want to pull in changes made elsewhere.

---

## How it works

GIFerence is a static web app (React + Vite) with **no backend**:

- **Storage** — GIF files live in this repo under `gifs/`, thumbnails under
  `thumbs/`, and all metadata in `data/index.json`. The repo *is* the database,
  and git *is* the cross-device sync.
- **Serving** — GIFs are served through the free [jsDelivr](https://www.jsdelivr.com/)
  CDN mirror of GitHub: fast loads, plus a public URL Discord will unfurl.
- **Copying** — the Copy button copies that URL. Browsers can't reliably put an
  *animated* GIF on the clipboard as image data (they flatten it to one frame),
  so copying a URL is how Giphy/Tenor do it too.
- **Writing** — the app commits straight to the repo via the GitHub REST API
  using your PAT. No server involved.

For internals — data model, consistency rules, and the invariants you must not
break — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.
For what's next, see **[ROADMAP.md](./ROADMAP.md)**.
For how work on this repo is run (branches, checks), see
**[CLAUDE.md](./CLAUDE.md)**.

### Hierarchy

```
Index  (all libraries + search across ALL gifs)
 └── Library  (a curated set; search scoped to it)
      └── Collection  (auto-derived: gifs in the library sharing a tag)
```

Collections are **not stored** — they're computed at runtime by grouping a
library's gifs by tag. Adding a tag creates a collection implicitly.

---

## Limits worth knowing

- **GIFs are stored, not linked.** Adding a gif commits a full binary copy into
  this repo. `sourceUrl` only records where it came from — nothing breaks if the
  original is deleted from GIPHY.
- **Repo size.** GitHub recommends staying under **1 GB** (5 GB hard limit).
  At ~1.75 MB/gif that's roughly **550 gifs**. A few hundred gifs at full
  quality is comfortably fine; only revisit if it heads toward four figures.
- **Git history is forever.** Deleting a gif removes it from the index but the
  blob stays in git history, so **space is not reclaimed**. Be deliberate about
  bulk imports.
- **CDN lag.** A brand-new gif can take a minute or two to appear on jsDelivr.
  The app falls back to GitHub's raw URL in the meantime, so it still displays —
  but a *copied link* may 404 for other people for a short window after adding.
- **jsDelivr** won't serve files over 20 MB.

---

## Local development

```bash
npm install
npm run dev      # http://localhost:5173/Giference/
npm run build    # type-check + production build into dist/
```

Pushes to `main` that touch app code auto-deploy. Commits that only touch
`data/`, `gifs/`, `thumbs/`, or the log are skipped — that content is fetched at
runtime, not bundled, so it doesn't need a rebuild.
