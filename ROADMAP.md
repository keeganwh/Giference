# GIFerence — Roadmap

Outstanding work only, grouped in phases. Each item has a **Done when…** so the
next session can pick one up and run. Completed v1 features live in the CHANGELOG,
not here.

## Phase 1 — Verify with real data

- [ ] End-to-end smoke test against the live repo.
      **Done when:** with Pages enabled and a PAT set, you can add a gif and
      confirm it (1) commits to the repo, (2) serves via jsDelivr, (3) copies into
      Discord as an animated unfurl, and (4) survives a reload on a second device.

## Phase 2 — Reliability & data integrity

- [ ] Batch gif + thumbnail + index into a single atomic commit (git Data API)
      instead of sequential contents-API PUTs.
      **Done when:** adding a gif produces one commit, and an interrupted add can
      never leave a committed file with no index entry (or vice versa).
- [ ] Prune / garbage-collect orphaned files.
      **Done when:** deleting a gif can optionally remove its `gifs/` and `thumbs/`
      files (deletes currently only drop the index entry), and there's a way to
      sweep files with no index entry.

## Phase 3 — Feature depth

- [ ] Deeper integration of the totakit in-browser GIF tools.
      **Done when:** the tools are usable inside GIFerence (not just an external
      link) — at minimum, editing/optimising a gif before it's added.
- [ ] Optional off-repo backup sync.
      **Done when:** the library index (and optionally binaries) can be exported /
      backed up somewhere off the primary repo, and restored. Revisit whether this
      is still wanted given repo-as-store.

## Phase 4 — Polish (nice-to-have)

- [ ] Bulk operations (multi-select delete, re-tag, move between libraries).
      **Done when:** a user can select several gifs and act on them in one write.
- [ ] Keyboard-first browsing / quick-copy.
      **Done when:** the grid is navigable and a gif's link is copyable without a
      mouse.
