// GitHub storage layer.
//
// GIFerence is a static site with no backend, so writes go straight from the
// browser to the GitHub REST API using a fine-grained Personal Access Token the
// user pastes once (stored in localStorage). The GitHub API is CORS-enabled for
// token-authenticated requests, so this works from Pages with no server.
//
// The token needs "Contents: Read and write" permission on the data repo only.

export interface RepoConfig {
  owner: string
  repo: string
  branch: string
}

const CONFIG_KEY = 'giference.repo'
const TOKEN_KEY = 'giference.token'

// Sensible default: this project's own repo. Editable in Settings.
const DEFAULT_CONFIG: RepoConfig = {
  owner: 'keeganwh',
  repo: 'Giference',
  branch: 'main',
}

export function getConfig(): RepoConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    /* ignore malformed config */
  }
  return { ...DEFAULT_CONFIG }
}

export function setConfig(cfg: RepoConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim())
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function hasToken(): boolean {
  return !!getToken()
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) throw new Error('No GitHub token set. Open Settings to add one.')
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

interface ContentsFile {
  sha: string
  content: string // base64, may contain newlines
}

/**
 * Fetch a file's base64 content + sha, or null if it doesn't exist yet.
 * Pass an explicit `ref` (e.g. a commit sha) to read at an immutable point —
 * reading at the head commit sha avoids the branch-level cache staleness that
 * makes a just-committed change take up to a minute to appear.
 */
export async function getFile(path: string, ref?: string): Promise<ContentsFile | null> {
  const cfg = getConfig()
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    path,
  ).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref ?? cfg.branch)}`
  // Reading at an immutable commit sha (see reload) is already fresh; we avoid a
  // Cache-Control request header because it's not CORS-safelisted and would
  // trigger a preflight GitHub rejects ("Failed to fetch").
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub getFile ${path} failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return { sha: json.sha, content: json.content }
}

/** The head commit sha of the configured branch. Strongly consistent. */
export async function getHeadSha(): Promise<string | null> {
  const cfg = getConfig()
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(
    cfg.branch,
  )}`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) return null
  const json = await res.json()
  return json.object?.sha ?? null
}

/** Get just the current sha for a path (needed to update an existing file). */
export async function getSha(path: string): Promise<string | null> {
  const file = await getFile(path)
  return file?.sha ?? null
}

/**
 * Create or update a file. `base64Content` must be raw base64 (no data: prefix).
 * Pass the current `sha` when overwriting an existing file.
 */
export async function putFile(
  path: string,
  base64Content: string,
  message: string,
  sha?: string | null,
): Promise<void> {
  const cfg = getConfig()
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(
    path,
  ).replace(/%2F/g, '/')}`
  const body: Record<string, unknown> = {
    message,
    content: base64Content,
    branch: cfg.branch,
  }
  if (sha) body.sha = sha
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GitHub putFile ${path} failed: ${res.status} ${await res.text()}`)
}

/** Verify the token can reach the repo. Returns the login on success. */
export async function verifyToken(): Promise<string> {
  const cfg = getConfig()
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Cannot access ${cfg.owner}/${cfg.repo}: ${res.status}`)
  const json = await res.json()
  return json.full_name as string
}
