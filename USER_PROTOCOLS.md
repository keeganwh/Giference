# USER_PROTOCOLS.md

My operating habits for working on GIFerence with Claude. This is *my* routine —
the setup, the hand-off, and how I keep sessions productive. Not app docs (see
`CLAUDE.md` for that).

## One-time services setup

1. **Repo is public.** Required for jsDelivr + raw serving. Never flip it private.
2. **GitHub Pages on.** Settings → Pages → Source = *GitHub Actions*. The
   `deploy.yml` workflow builds and deploys on every push to `main`.
3. **Fine-grained PAT.** github.com/settings/personal-access-tokens → this repo
   only → **Contents: Read and write**. Paste it once into the app's Settings
   (Settings → owner/repo/branch + token). It lives in the browser only — never
   commit it, never paste it into a chat or a file.

## What I hand Claude, and how

- **Point at `CLAUDE.md` first.** It has the stack, architecture, and hard rules
  so I don't re-explain the basics each session.
- **One task per session where possible.** Pick a single item from `ROADMAP.md`
  and give Claude the "Done when…" as the acceptance bar.
- **Give real context, not vibes.** Link the exact file(s), paste the actual
  error, name the library/gif involved. If it's a bug, describe the repro.
- **Name the branch.** Development happens on a feature branch, not `main`
  directly — say which one.

## Keeping sessions lean / when to branch

- **Start a fresh session when the topic changes.** A long thread that pivots from
  "fix the refresh bug" to "add bulk delete" is two sessions.
- **Branch per unit of work.** One feature or fix per branch → one PR. Don't stack
  unrelated changes.
- **Let the build be the gate.** `npm run build` clean (strict TS) before I ask
  for a commit. No separate test suite to run.
- **Don't hand-edit `data/index.json` / `gifs/` / `thumbs/`.** The app owns them;
  editing by hand risks the exact stale-state class of bug we already hit once.

## Writing good next-steps

- End each session by updating `ROADMAP.md` (check off done, add what surfaced)
  and `CHANGELOG.md` (dated entry, newest first) for anything notable.
- Write the *next* task as a concrete checkbox with a "Done when…", not a vague
  note — so the next session can start cold and run without asking me questions.
- If something's half-done, say exactly where it stops and what's left, in the
  roadmap item — don't leave it in my head.
