import type { GifRecord } from '../types'
import { GifCard } from './GifCard'

interface Props {
  gifs: GifRecord[]
  onEdit?: (gif: GifRecord) => void
  onTagClick?: (tag: string) => void
  empty?: string
}

export function GifGrid({ gifs, onEdit, onTagClick, empty }: Props) {
  if (gifs.length === 0) {
    return <p className="muted empty">{empty ?? 'No gifs here yet.'}</p>
  }
  return (
    <div className="gif-grid">
      {gifs.map((g) => (
        <GifCard key={g.id} gif={g} onEdit={onEdit} onTagClick={onTagClick} />
      ))}
    </div>
  )
}
