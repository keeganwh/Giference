// URL builders for reading GIF/thumbnail/index files back out of the repo.
//
// We display GIFs through jsDelivr's free CDN (fast, cached, and — importantly —
// a public URL that Discord will unfurl into an animated preview). raw URLs are
// used as an immediate-freshness fallback for the index JSON, since jsDelivr
// caches for up to 12h and a just-committed file may lag.

import type { RepoConfig } from './github'

export function jsdelivrUrl(cfg: RepoConfig, path: string): string {
  const p = path.replace(/^\/+/, '')
  return `https://cdn.jsdelivr.net/gh/${cfg.owner}/${cfg.repo}@${cfg.branch}/${p}`
}

export function rawUrl(cfg: RepoConfig, path: string): string {
  const p = path.replace(/^\/+/, '')
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${p}`
}
