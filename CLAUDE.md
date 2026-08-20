# CLAUDE.md — working agreement for GIFerence

Guidance for Claude sessions on this repo. Read this first.

## What this project is

A static React + Vite SPA (GitHub Pages) that curates GIFs. The **GitHub repo
itself is the database**: gif binaries in `gifs/`, thumbnails in `thumbs/`,
metadata in `data/index.json`. There is no backend. Writes go browser → GitHub
REST API with a fine-grained PAT held in `localStorage`.

Docs map:
- `README.md` — setup and usage (user-facing)
- `ARCHITECTURE.md` — internals **and three invariants you must not break**
- `ROADMAP.md` — what's next, plus handoff state
- `PROJECT_LOG.md` — running log of decisions

## Branch workflow (important — this changed)

**Work on a dedicated branch, not `main`.** Earlier in this project work went
straight to `main`; that is no longer how we operate.

- One branch per meaningful chunk of work (a feature, a fix, a phase).
- Name it for the work: `giphy-bulk-import`, `mobile-pwa`, `ui-tweaks`.
- Ideally one session per branch, so a session's context maps to one chunk.
- Commit as you go with clear messages; push the branch.
- Open a PR for review and merge from there. **Do not push directly to `main`**
  unless explicitly asked.
- Deploys run on merge to `main`, so merging is what ships.

If a session starts on the wrong branch, create/switch to the right one before
committing.

## Before you push

```bash
npm run build     # tsc type-check + vite build; must pass
```

There is no test suite yet. `npm run build` is the gate.

## Rules of the road

1. **Read the three invariants in ARCHITECTURE.md before touching
   `src/store.tsx` or `src/lib/github.ts`.** Every production bug so far came
   from breaking one, and they all failed silently or with a misleading error.
2. **Git history is permanent.** Committed gif blobs are never reclaimed by a
   later delete. Anything that writes files in bulk must dry-run first.
3. **Never commit a PAT**, or any token, into the repo.
4. The repo must stay **public** — jsDelivr only serves public repos, and the
   copy-for-Discord links depend on it.
5. Content commits (`data/`, `gifs/`, `thumbs/`) are made by the running app.
   Expect the remote to move under you; fetch/rebase before pushing.
6. Keep `PROJECT_LOG.md` updated with notable decisions and fixes.

## Style

Match the surrounding code: TypeScript strict, function components with hooks,
comments that explain *why* rather than narrating *what*. Keep the dependency
list minimal — the app currently ships React and nothing else.
