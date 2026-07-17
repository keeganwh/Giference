import type { Filters } from '../lib/search'
import type { LengthBucket } from '../lib/gifmeta'
import type { Library } from '../types'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  availableTags: { tag: string; count: number }[]
  // When provided, shows a library dropdown (used on the global Index).
  libraries?: Library[]
}

const LENGTHS: { value: LengthBucket; label: string }[] = [
  { value: 'short', label: 'Short (<2s)' },
  { value: 'medium', label: 'Medium (2–5s)' },
  { value: 'long', label: 'Long (>5s)' },
]

export function FilterBar({ filters, onChange, availableTags, libraries }: Props) {
  const toggleTag = (tag: string) => {
    const has = filters.tags.includes(tag)
    onChange({
      ...filters,
      tags: has ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag],
    })
  }

  const active = filters.query || filters.tags.length || filters.length || filters.library

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <input
          className="search"
          type="search"
          placeholder="Search name & description…"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />

        {libraries && (
          <select
            value={filters.library ?? ''}
            onChange={(e) => onChange({ ...filters, library: e.target.value || null })}
          >
            <option value="">All libraries</option>
            {libraries.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.length ?? ''}
          onChange={(e) =>
            onChange({ ...filters, length: (e.target.value || null) as LengthBucket | null })
          }
        >
          <option value="">Any length</option>
          {LENGTHS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>

        {active ? (
          <button
            className="link"
            onClick={() =>
              onChange({ query: '', library: null, tags: [], length: null })
            }
          >
            Clear
          </button>
        ) : null}
      </div>

      {availableTags.length > 0 && (
        <div className="tag-filter">
          {availableTags.map(({ tag, count }) => (
            <button
              key={tag}
              className={`tag ${filters.tags.includes(tag) ? 'on' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag} <span className="count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
