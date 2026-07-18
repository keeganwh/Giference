import { useMemo, useState } from 'react'
import { useStore } from './store'
import { applyFilters, EMPTY_FILTERS, tagCounts, type Filters } from './lib/search'
import { hasToken } from './lib/github'
import type { GifRecord } from './types'
import { GifGrid } from './components/GifGrid'
import { FilterBar } from './components/FilterBar'
import { AddGifModal } from './components/AddGifModal'
import { SettingsModal } from './components/SettingsModal'

type View =
  | { t: 'index' }
  | { t: 'library'; libraryId: string }
  | { t: 'collection'; libraryId: string; tag: string }

const TOOLS_URL = 'https://gif.totakit.com/tools'

export default function App() {
  const { index, loading, saving, error, localPreviews, reload } = useStore()
  const [view, setView] = useState<View>({ t: 'index' })
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<GifRecord | null>(null)

  const libraryOf = (id: string) => index.libraries.find((l) => l.id === id)

  // The base set of gifs before the FilterBar's own controls are applied.
  const baseGifs = useMemo(() => {
    if (view.t === 'library') return index.gifs.filter((g) => g.library === view.libraryId)
    if (view.t === 'collection')
      return index.gifs.filter((g) => g.library === view.libraryId && g.tags.includes(view.tag))
    return index.gifs
  }, [index.gifs, view])

  const results = useMemo(() => applyFilters(baseGifs, filters), [baseGifs, filters])
  const availableTags = useMemo(() => tagCounts(baseGifs), [baseGifs])

  const go = (v: View) => {
    setView(v)
    setFilters(EMPTY_FILTERS)
  }

  const tokenMissing = !hasToken()

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go({ t: 'index' })}>
          🎞️ GIFerence
        </button>
        <span className={`save-pill ${saving ? 'busy' : 'idle'}`}>
          {saving ? '● Saving…' : '✓ Saved'}
        </span>
        <div className="spacer" />
        <a className="ghost" href={TOOLS_URL} target="_blank" rel="noreferrer">
          GIF tools ↗
        </a>
        <button className="ghost" title="Refresh from repo" disabled={saving} onClick={() => void reload()}>
          ↻
        </button>
        <button className="ghost" onClick={() => setShowSettings(true)}>
          Settings
        </button>
        <button className="primary" onClick={() => setShowAdd(true)}>
          ＋ Add gif
        </button>
      </header>

      {tokenMissing && (
        <div className="banner">
          No GitHub token set — you can browse, but adding/editing gifs needs one.{' '}
          <button className="link" onClick={() => setShowSettings(true)}>
            Add token
          </button>
        </div>
      )}
      {error && <div className="banner err">Couldn’t load library: {error}</div>}

      {/* Breadcrumb */}
      <nav className="crumbs">
        <button className="link" onClick={() => go({ t: 'index' })}>
          Index
        </button>
        {view.t !== 'index' && libraryOf(view.libraryId) && (
          <>
            <span>›</span>
            <button className="link" onClick={() => go({ t: 'library', libraryId: view.libraryId })}>
              {libraryOf(view.libraryId)!.name}
            </button>
          </>
        )}
        {view.t === 'collection' && (
          <>
            <span>›</span>
            <span className="crumb-current">#{view.tag}</span>
          </>
        )}
      </nav>

      <main>
        {loading ? (
          <p className="muted">Loading library…</p>
        ) : (
          <>
            {/* Index: show library cards when not actively searching */}
            {view.t === 'index' && !filters.query && !filters.tags.length && !filters.length && !filters.library && (
              <section>
                <h2>Libraries</h2>
                {index.libraries.length === 0 ? (
                  <p className="muted">
                    No libraries yet. Click <strong>＋ Add gif</strong> to create your first one.
                  </p>
                ) : (
                  <div className="lib-grid">
                    {index.libraries.map((l) => {
                      const count = index.gifs.filter((g) => g.library === l.id).length
                      return (
                        <button
                          key={l.id}
                          className="lib-card"
                          onClick={() => go({ t: 'library', libraryId: l.id })}
                        >
                          <span className="lib-name">{l.name}</span>
                          <span className="muted">{count} gif{count === 1 ? '' : 's'}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Collections chips within a library */}
            {view.t === 'library' && availableTags.length > 0 && (
              <section>
                <h2>Collections</h2>
                <div className="collection-chips">
                  {availableTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      className="collection-chip"
                      onClick={() => go({ t: 'collection', libraryId: view.libraryId, tag })}
                    >
                      #{tag} <span className="count">{count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                availableTags={availableTags}
                libraries={view.t === 'index' ? index.libraries : undefined}
              />
              <div className="results-head">
                <h2>
                  {view.t === 'index' ? 'All gifs' : view.t === 'collection' ? `#${view.tag}` : 'Gifs'}
                </h2>
                <span className="muted">{results.length} shown</span>
              </div>
              <GifGrid
                gifs={results}
                onEdit={(g) => setEditing(g)}
                onTagClick={(tag) => setFilters((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags : [...f.tags, tag] }))}
                empty={
                  index.gifs.length === 0
                    ? 'Your library is empty — add your first gif!'
                    : 'No gifs match these filters.'
                }
              />
            </section>
          </>
        )}
      </main>

      {showAdd && (
        <AddGifModal
          onClose={() => setShowAdd(false)}
          defaultLibrary={view.t !== 'index' ? view.libraryId : undefined}
        />
      )}
      {editing && <AddGifModal editing={editing} onClose={() => setEditing(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <footer className="foot muted">
        GIFs stored in your GitHub repo · served via jsDelivr · {index.gifs.length} total ·{' '}
        {Object.keys(localPreviews).length > 0 && 'new uploads may take a minute to appear on the CDN'}
      </footer>
    </div>
  )
}
