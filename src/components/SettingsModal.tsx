import { useState } from 'react'
import { getConfig, getToken, setConfig, setToken, verifyToken } from '../lib/github'
import { useStore } from '../store'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const { reload } = useStore()
  const cfg = getConfig()
  const [owner, setOwner] = useState(cfg.owner)
  const [repo, setRepo] = useState(cfg.repo)
  const [branch, setBranch] = useState(cfg.branch)
  const [token, setTokenValue] = useState(getToken() ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      setConfig({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || 'main' })
      if (token.trim()) setToken(token)
      const login = await verifyToken()
      setStatus(`✓ Connected to ${login}`)
      await reload()
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="muted">
          GIFerence stores gifs in a GitHub repo and serves them via jsDelivr. Point it at your repo
          and paste a fine-grained token with <strong>Contents: Read and write</strong> on that repo.
        </p>

        <label>
          Owner
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your-username" />
        </label>
        <div className="two-col">
          <label>
            Repo
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Giference" />
          </label>
          <label>
            Branch
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
          </label>
        </div>
        <label>
          GitHub token
          <input
            type="password"
            value={token}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </label>
        <p className="hint">
          Create one at <code>github.com/settings/personal-access-tokens</code>. It's stored only in
          this browser. The repo must be <strong>public</strong> for gifs to load &amp; copy.
        </p>

        {status && <p className={status.startsWith('✓') ? 'ok' : 'err'}>{status}</p>}

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Verifying…' : 'Save & verify'}
          </button>
        </div>
      </div>
    </div>
  )
}
