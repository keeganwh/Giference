import { useState } from 'react'
import type { GifRecord } from '../types'
import { useStore } from '../store'
import { copyUrl, gifUrl, thumbUrl } from '../lib/display'
import { formatDuration } from '../lib/gifmeta'

interface Props {
  gif: GifRecord
  onEdit?: (gif: GifRecord) => void
  onTagClick?: (tag: string) => void
}

export function GifCard({ gif, onEdit, onTagClick }: Props) {
  const { localPreviews, toggleFavorite, deleteGif } = useStore()
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)

  // Show the animated gif on hover; a static thumbnail otherwise (keeps grids
  // light). Fresh uploads only have a local preview, so always animate those.
  const src = hover || localPreviews[gif.id] ? gifUrl(gif, localPreviews) : thumbUrl(gif, localPreviews)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyUrl(gif))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      window.prompt('Copy this URL:', copyUrl(gif))
    }
  }

  return (
    <figure
      className="gif-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="gif-thumb">
        <img src={src} alt={gif.name} loading="lazy" />
        <button
          className={`fav-btn ${gif.favorite ? 'on' : ''}`}
          title={gif.favorite ? 'Unfavourite' : 'Favourite'}
          onClick={() => void toggleFavorite(gif.id)}
        >
          {gif.favorite ? '★' : '☆'}
        </button>
        {gif.durationMs ? <span className="badge">{formatDuration(gif.durationMs)}</span> : null}
      </div>

      <figcaption>
        <div className="gif-name" title={gif.name}>
          {gif.name}
        </div>
        {gif.tags.length > 0 && (
          <div className="tag-row">
            {gif.tags.map((t) => (
              <button key={t} className="tag" onClick={() => onTagClick?.(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="card-actions">
          <button className="primary" onClick={() => void onCopy()}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {onEdit && (
            <button onClick={() => onEdit(gif)} title="Edit">
              ✎
            </button>
          )}
          <button
            className="danger"
            title="Remove"
            onClick={() => {
              if (confirm(`Remove "${gif.name}" from the library?`)) void deleteGif(gif.id)
            }}
          >
            🗑
          </button>
        </div>
      </figcaption>
    </figure>
  )
}
