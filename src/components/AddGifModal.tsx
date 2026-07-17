import { useState } from 'react'
import type { GifRecord } from '../types'
import { useStore } from '../store'

interface Props {
  onClose: () => void
  editing?: GifRecord
  defaultLibrary?: string
}

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

const NEW_LIB = '__new__'

export function AddGifModal({ onClose, editing, defaultLibrary }: Props) {
  const { index, importGif, updateGif, addLibrary } = useStore()

  // When editing a gif whose library no longer exists (e.g. an orphan), fall
  // back to the first existing library, or to "new" if there are none.
  const editLibExists = editing ? index.libraries.some((l) => l.id === editing.library) : false
  const initialLibrary = editing
    ? editLibExists
      ? editing.library
      : index.libraries[0]?.id ?? NEW_LIB
    : defaultLibrary ?? index.libraries[0]?.id ?? NEW_LIB

  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [tagsRaw, setTagsRaw] = useState(editing?.tags.join(', ') ?? '')
  const [library, setLibrary] = useState(initialLibrary)
  const [newLibName, setNewLibName] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')

  const isEdit = !!editing

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const wantNewLib = library === NEW_LIB
      if (wantNewLib && !newLibName.trim()) throw new Error('Name the new library.')

      if (isEdit) {
        // Two-step here is safe: the store tracks the latest index in a ref, so
        // updateGif sees the library addLibrary just created.
        let targetLib = library
        if (wantNewLib) {
          setProgress('Creating library…')
          targetLib = (await addLibrary(newLibName)).id
        }
        await updateGif(editing!.id, {
          name: name.trim() || editing!.name,
          description,
          tags: parseTags(tagsRaw),
          library: targetLib,
        })
        onClose()
        return
      }

      // Obtain the gif bytes from an upload or a URL.
      let blob: Blob
      let sourceUrl: string | undefined
      if (file) {
        blob = file
      } else if (url.trim()) {
        setProgress('Downloading gif…')
        sourceUrl = url.trim()
        const res = await fetch(sourceUrl)
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
        blob = await res.blob()
      } else {
        throw new Error('Choose a file or paste a URL.')
      }

      setProgress('Uploading & indexing…')
      await importGif({
        blob,
        name: name.trim() || undefined,
        description,
        tags: parseTags(tagsRaw),
        library: wantNewLib ? '' : library,
        newLibraryName: wantNewLib ? newLibName : undefined,
        sourceUrl,
      })
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // A failed cross-origin fetch is the common URL case.
      setError(
        url && /fetch|Failed|CORS|Load/i.test(msg)
          ? `${msg} — this host may block downloads. Try saving the gif and uploading the file instead.`
          : msg,
      )
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit gif' : 'Add a gif'}</h2>

        {!isEdit && (
          <>
            <label>
              Upload a .gif
              <input
                type="file"
                accept="image/gif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="or">or</div>
            <label>
              Import by URL <span className="muted">(a copy is saved to your repo)</span>
              <input
                type="url"
                placeholder="https://…/something.gif"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!!file}
              />
            </label>
          </>
        )}

        <label>
          Name <span className="muted">(optional — defaults to the filename)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Robin Hopper Laughing" />
        </label>

        <label>
          Text / description <span className="muted">(what it says / what's in it — searchable)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>

        <label>
          Tags <span className="muted">(comma-separated — these become Collections)</span>
          <input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="laugh, reaction, robin" />
        </label>

        <label>
          Library
          <select value={library} onChange={(e) => setLibrary(e.target.value)}>
            {index.libraries.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={NEW_LIB}>＋ New library…</option>
          </select>
        </label>
        {library === NEW_LIB && (
          <label>
            New library name
            <input value={newLibName} onChange={(e) => setNewLibName(e.target.value)} placeholder="Reactions" />
          </label>
        )}

        {error && <p className="err">{error}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? progress || 'Working…' : isEdit ? 'Save changes' : 'Add gif'}
          </button>
        </div>
      </div>
    </div>
  )
}
