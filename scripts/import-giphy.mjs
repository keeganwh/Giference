#!/usr/bin/env node
// Bulk-import a GIPHY collection into a GIFerence library.
//
// Runs locally against a clone, NOT through the web app: the browser path
// base64-encodes every file through the contents API and makes three commits
// per gif (gif, thumb, index). This writes straight to disk and makes ONE
// commit for the whole batch.
//
// GIFs are downloaded as real files — `sourceUrl` only records where they came
// from — so nothing here depends on GIPHY staying online afterwards.
//
// Input comes from `scripts/giphy-collect.js` (see that file for why): GIPHY's
// public API has no collections endpoint, so the id list is harvested from the
// collection page in the browser.
//
//   node scripts/import-giphy.mjs --input reactions.json            # dry run
//   node scripts/import-giphy.mjs --input reactions.json --commit
//
// Dry run is the default and prints what *would* happen. Committed gif blobs
// stay in git history forever, so a bad import can't be undone by deleting the
// files — check the dry run before passing --commit.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGifMeta } from '../src/lib/gifmeta.ts'
import { slugify } from '../src/lib/bytes.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_PATH = 'data/index.json'
// Overridable so the pipeline can be exercised against a local stub.
const GIPHY_API = `${process.env.GIPHY_API_BASE ?? 'https://api.giphy.com'}/v1/gifs`
const THUMB_MAX_DIM = 320 // matches src/lib/thumbnail.ts
const BATCH = 100 // GIPHY's cap for the ids lookup

// ---------------------------------------------------------------- args

const USAGE = `
Usage: node scripts/import-giphy.mjs --input <collection.json> [options]

Input (one of):
  --input <file>       JSON produced by scripts/giphy-collect.js
  --ids <a,b,c>        comma-separated GIPHY ids

Options:
  --collection <name>  collection name (overrides the one in --input)
  --library <name|id>  target GIFerence library; defaults to the collection
                       name. Created if it doesn't exist.
  --tag <tag>          tag applied to every imported gif (repeatable)
  --api-key <key>      GIPHY API key (or set GIPHY_API_KEY)
  --commit             actually download, write files, and commit
  --push               push the commit (implies --commit)
  --max-mb <n>         outlier threshold, default 10
  --oversize <mode>    what to do past --max-mb: downsized (default) | skip | allow
  --concurrency <n>    parallel downloads, default 4
  --no-thumbs          skip thumbnail generation (needs the optional 'sharp' dep)
  -h, --help
`.trim()

function parseArgs(argv) {
  const opts = {
    tags: [],
    commit: false,
    push: false,
    maxMb: 10,
    oversize: 'downsized',
    concurrency: 4,
    thumbs: true,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) fail(`${a} needs a value`)
      return v
    }
    switch (a) {
      case '--input': opts.input = next(); break
      case '--ids': opts.ids = next().split(',').map((s) => s.trim()).filter(Boolean); break
      case '--collection': opts.collection = next(); break
      case '--library': opts.library = next(); break
      case '--tag': opts.tags.push(next()); break
      case '--api-key': opts.apiKey = next(); break
      case '--commit': opts.commit = true; break
      case '--push': opts.push = true; opts.commit = true; break
      case '--max-mb': opts.maxMb = Number(next()); break
      case '--oversize': opts.oversize = next(); break
      case '--concurrency': opts.concurrency = Number(next()); break
      case '--no-thumbs': opts.thumbs = false; break
      case '-h': case '--help': console.log(USAGE); process.exit(0)
      default: fail(`unknown argument: ${a}`)
    }
  }
  if (!['downsized', 'skip', 'allow'].includes(opts.oversize)) fail(`--oversize must be downsized|skip|allow`)
  if (!Number.isFinite(opts.maxMb) || opts.maxMb <= 0) fail('--max-mb must be a positive number')
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) fail('--concurrency must be >= 1')
  return opts
}

/** Bad invocation — show how to invoke it properly. */
function fail(msg) {
  console.error(`error: ${msg}\n\n${USAGE}`)
  process.exit(1)
}

/** Something went wrong at run time; usage wouldn't help. */
function abort(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------- helpers

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/** Same id shape the app generates in store.tsx, so records look uniform. */
function shortId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)
}

function makeLibrary(name) {
  return {
    id: `${slugify(name)}-${shortId().slice(0, 4)}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  }
}

/** GIPHY urls carry per-request tracking params; keep only the stable path. */
function cleanUrl(url) {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url
  }
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * A human-readable name for a gif. GIPHY's `title` is often empty, and the
 * `slug` is "<words>-<id>" — using it raw gives names like
 * "dancing-alisonbrie-7dkevrstq4fxidhk5s". Drop the id tail and title-case
 * what's left. Returns null when there's nothing to work with, so the caller
 * can number it rather than name a card after a raw GIPHY id.
 */
function deriveName(gif) {
  const title = gif.title?.replace(/\s+GIF$/i, '').trim()
  if (title) return title

  const slug = gif.slug?.trim()
  if (slug) {
    const words = slug
      .replace(new RegExp(`-?${gif.id}$`, 'i'), '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (words) return words.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return null
}

/**
 * Read whatever ended up in the input file. The happy path is the JSON the
 * console snippet prints, but these files get made by hand — copied out of
 * DevTools, pasted into Notepad, saved with a BOM, sometimes with the snippet's
 * own log lines still attached. Recover from those rather than making someone
 * hand-edit JSON.
 */
function readIdList(text) {
  const clean = text.replace(/^\uFEFF/, '') // Notepad writes a UTF-8 BOM

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate)
    } catch {
      return undefined
    }
  }

  let raw = tryParse(clean)
  let howFound = 'json'

  // Surrounding console noise (the snippet's own log lines, say). Try the
  // widest {...} and the widest [...] separately — taking the outermost of
  // either would span the noise when a log line starts with a bracket.
  if (raw === undefined) {
    for (const [open, close] of [['{', '}'], ['[', ']']]) {
      const first = clean.indexOf(open)
      const last = clean.lastIndexOf(close)
      if (first === -1 || last <= first) continue
      const parsed = tryParse(clean.slice(first, last + 1))
      if (parsed !== undefined && extractIds(parsed).length) {
        raw = parsed
        howFound = 'ignored some non-JSON text around the data'
        break
      }
    }
  }

  if (raw !== undefined) {
    const found = extractIds(raw)
    if (found.length) return { raw, fromFile: found, howFound }
  }

  // Last resort: treat it as a plain list and pick out id-shaped tokens. GIPHY
  // ids are long alphanumeric strings, so a 10-char minimum keeps ordinary
  // words out of the results.
  const scraped = [...new Set(clean.split(/[^A-Za-z0-9]+/).filter((t) => /^[A-Za-z0-9]{10,}$/.test(t)))]
  if (scraped.length) {
    return {
      raw,
      fromFile: scraped,
      howFound: `couldn't parse this as JSON, so read ${scraped.length} id-like values out of the text — check the list below`,
    }
  }

  return { raw, fromFile: [], howFound }
}

/**
 * Pull GIPHY ids out of whatever shape the input file happens to be. The ids
 * usually come from `scripts/giphy-collect.js`, but hand-assembled files and
 * raw GIPHY API responses turn up too, so accept the obvious variants rather
 * than making people reformat by hand:
 *   ["abc", "def"]                  a bare list
 *   [{ id: "abc" }, …]              a list of gif objects
 *   { ids: [...] } / { data: [...] } / { gifs: [...] } / { items } / { results }
 */
function extractIds(raw) {
  const fromArray = (arr) =>
    arr
      .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
      .filter((id) => typeof id === 'string' && id.trim())

  if (Array.isArray(raw)) return fromArray(raw)
  if (raw && typeof raw === 'object') {
    for (const key of ['ids', 'data', 'gifs', 'items', 'results']) {
      if (Array.isArray(raw[key])) {
        const found = fromArray(raw[key])
        if (found.length) return found
      }
    }
  }
  return []
}

function collectionName(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return undefined
  for (const key of ['collection', 'name', 'title']) {
    if (typeof raw[key] === 'string' && raw[key].trim()) return raw[key].trim()
  }
  return undefined
}

/** Describe an unusable input file well enough to see what's wrong with it. */
function describeShape(raw) {
  if (Array.isArray(raw)) return `an array of ${raw.length} items`
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw)
    return keys.length ? `an object with keys: ${keys.join(', ')}` : 'an empty object'
  }
  return typeof raw
}

// ---------------------------------------------------------------- giphy

async function fetchMetadata(ids, apiKey) {
  const out = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const url = `${GIPHY_API}?api_key=${encodeURIComponent(apiKey)}&ids=${chunk.join(',')}`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`GIPHY metadata request failed: ${res.status} ${res.statusText}`)
    }
    const body = await res.json()
    // A bad id yields an empty/partial entry rather than an error; drop those.
    for (const g of body.data ?? []) if (g?.id) out.push(g)
    console.log(`fetched metadata ${Math.min(i + BATCH, ids.length)}/${ids.length}`)
  }
  return out
}

/**
 * Pick the rendition to download. `original` is the point of the exercise —
 * quality matters and the volume is small — but jsDelivr refuses to serve
 * files over 20 MB, so an oversized original would be broken in the app
 * anyway. Anything past --max-mb is flagged and, by default, fetched at
 * `downsized_large` instead.
 */
function pickRendition(gif, maxBytes, mode) {
  const original = gif.images?.original
  if (!original?.url) return { error: 'no original rendition' }
  const size = Number(original.size ?? 0)
  if (size <= maxBytes || mode === 'allow') {
    return { url: original.url, size, rendition: 'original', oversize: size > maxBytes }
  }
  if (mode === 'skip') return { error: `original is ${mb(size)} (over ${mb(maxBytes)})`, size }
  const alt = gif.images?.downsized_large ?? gif.images?.downsized
  if (!alt?.url) return { error: `original is ${mb(size)} and no downsized rendition exists`, size }
  return {
    url: alt.url,
    size: Number(alt.size ?? 0),
    rendition: 'downsized_large',
    originalSize: size,
    oversize: true,
  }
}

// ---------------------------------------------------------------- thumbnails

async function loadSharp() {
  try {
    return (await import('sharp')).default
  } catch {
    return null
  }
}

/** First frame -> WebP, matching the browser path in src/lib/thumbnail.ts. */
async function makeThumbnail(sharp, bytes) {
  return sharp(Buffer.from(bytes)) // no `animated: true` — decodes frame 1 only
    .resize({ width: THUMB_MAX_DIM, height: THUMB_MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  // --- resolve input
  let ids = opts.ids ?? []
  let collection = opts.collection
  if (opts.input) {
    const file = path.resolve(opts.input)
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch (e) {
      abort(
        `couldn't open ${opts.input}: ${e.message}\n` +
          `Check the path — quote it if it contains spaces:  --input "giphy-input/My Collection.json"\n` +
          `On Windows, also check File Explorer isn't hiding a second ".txt" extension.`,
      )
    }
    const { raw, fromFile, howFound } = readIdList(text)
    if (fromFile.length === 0) {
      abort(
        `found no GIPHY ids in ${opts.input}.\n` +
          `Expected a list of ids, or an object with an "ids" (or "data"/"gifs") array.\n` +
          `The file ${raw === undefined ? "isn't valid JSON" : `contains ${describeShape(raw)}`}.\n` +
          `It starts with: ${JSON.stringify(text.slice(0, 120))}`,
      )
    }
    if (howFound !== 'json') console.log(`note: ${howFound}`)
    ids = [...ids, ...fromFile]
    collection ??= collectionName(raw) ?? path.basename(file).replace(/\.json$/i, '')
  }
  ids = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))]
  if (ids.length === 0) fail('no ids — pass --input or --ids')

  const libraryName = opts.library ?? collection
  if (!libraryName) fail('no library name — pass --library (or --collection)')

  const apiKey = opts.apiKey ?? process.env.GIPHY_API_KEY
  if (!apiKey) fail('no GIPHY API key — pass --api-key or set GIPHY_API_KEY')

  // --- load the index fresh off disk (the app writes it too)
  const indexFile = path.join(ROOT, INDEX_PATH)
  const index = JSON.parse(await readFile(indexFile, 'utf8'))

  // --- resolve the target library
  const wanted = String(libraryName).trim()
  let library = index.libraries.find(
    (l) => l.id === wanted || l.name.toLowerCase() === wanted.toLowerCase(),
  )
  const newLibrary = !library
  library ??= makeLibrary(wanted)

  // --- what's already here. `sourceId` is authoritative; fall back to matching
  // the id inside `sourceUrl` for records added before that field existed.
  const existing = new Map() // giphy id -> the record already in the index
  for (const g of index.gifs) {
    const key = g.sourceId ?? g.sourceUrl?.match(/\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]{6,})\//)?.[1]
    if (key && !existing.has(key)) existing.set(key, g)
  }

  // Collections overlap: the same gif legitimately sits in several. A gif is
  // imported once and once only — a second copy would be a second permanent
  // blob in git history, and a record belongs to exactly one library anyway.
  // The other collections are recorded the way this app records everything
  // cross-cutting: as tags. So an already-imported gif picks up this run's
  // --tag values on its existing record instead of being downloaded again.
  const fresh = []
  const retag = []
  for (const id of ids) {
    const record = existing.get(id)
    if (!record) {
      fresh.push(id)
      continue
    }
    const missing = opts.tags.filter((t) => !record.tags.includes(t))
    if (missing.length) retag.push({ record, missing })
  }
  const alreadyDone = ids.length - fresh.length - retag.length

  console.log(`collection: ${collection ?? '(unnamed)'}`)
  console.log(`library:    ${library.name} (${library.id})${newLibrary ? ' — will be created' : ''}`)
  console.log(`ids:        ${ids.length} given`)
  console.log(`            ${fresh.length} to download`)
  if (retag.length) console.log(`            ${retag.length} already imported — will be tagged, not re-downloaded`)
  if (alreadyDone) console.log(`            ${alreadyDone} already imported, nothing to change`)
  console.log('')

  if (retag.length) {
    for (const r of retag) {
      const lib = index.libraries.find((l) => l.id === r.record.library)?.name ?? r.record.library
      console.log(`  tag    ${r.record.filename}  (in ${lib})  += ${r.missing.join(', ')}`)
    }
    console.log('')
  }
  if (ids.length > fresh.length && opts.tags.length === 0) {
    console.log('note: some of these are already imported. Pass --tag <name> to mark them as')
    console.log('      belonging to this collection too — otherwise they are left untouched.\n')
  }

  if (fresh.length === 0 && retag.length === 0) {
    console.log('nothing to do.')
    return
  }

  // --- metadata + plan
  const meta = fresh.length ? await fetchMetadata(fresh, apiKey) : []
  const missing = fresh.filter((id) => !meta.some((g) => g.id === id))
  const maxBytes = opts.maxMb * 1024 * 1024

  const usedPaths = new Set(index.gifs.map((g) => g.path))
  let unnamed = 0
  const plan = []
  const problems = []
  for (const gif of meta) {
    const pick = pickRendition(gif, maxBytes, opts.oversize)
    if (pick.error) {
      problems.push({ id: gif.id, title: gif.title, reason: pick.error })
      continue
    }
    const name = deriveName(gif) ?? `${library.name} ${++unnamed}`
    const slug = slugify(name)
    const recordId = shortId()
    let filename = `${slug}.gif`
    if (usedPaths.has(`gifs/${library.id}/${filename}`)) filename = `${slug}-${recordId}.gif`
    usedPaths.add(`gifs/${library.id}/${filename}`)
    plan.push({ gif, pick, name, filename, recordId })
  }

  // --- dry run report
  const known = plan.reduce((n, p) => n + (p.pick.size || 0), 0)
  const unknown = plan.filter((p) => !p.pick.size).length
  console.log(`\nplanned: ${plan.length} gifs, ~${mb(known)}${unknown ? ` (+${unknown} of unknown size)` : ''}`)
  for (const p of plan) {
    // When we swapped rendition, show both sizes — otherwise the printed size
    // is the replacement's and the "oversize" flag looks wrong next to it.
    const flag = p.pick.oversize
      ? `  [original ${mb(p.pick.originalSize ?? p.pick.size)} -> ${p.pick.rendition}]`
      : ''
    console.log(`  ${p.gif.id}  ${mb(p.pick.size || 0).padStart(8)}  ${p.filename}${flag}`)
  }
  if (missing.length) console.log(`\nnot found on GIPHY (${missing.length}): ${missing.join(', ')}`)
  for (const p of problems) console.log(`skipping ${p.id}: ${p.reason}`)

  if (!opts.commit) {
    console.log('\nDRY RUN — nothing downloaded or written.')
    console.log('Committed gif blobs live in git history permanently; check the list above first.')
    // Spell out the next command rather than leaving it as an exercise, with
    // the key redacted so it doesn't get echoed into a terminal log.
    const echoed = process.argv.slice(2).map((a, i, all) => (all[i - 1] === '--api-key' ? '<key>' : a))
    console.log(`\nTo import for real:\n  npm run import -- ${echoed.join(' ')} --commit`)
    return
  }
  if (plan.length === 0 && retag.length === 0) {
    console.log('\nnothing importable.')
    return
  }

  // --- commit mode. A dirty tree usually means the app has pending writes to
  // data/index.json; committing on top would fold them into this batch.
  if (git('status', '--porcelain')) {
    abort('working tree is not clean — commit or stash first (the app may have pending writes)')
  }

  const sharp = opts.thumbs ? await loadSharp() : null
  if (opts.thumbs && !sharp) {
    abort("thumbnails need the optional 'sharp' dependency (npm i -D sharp), or pass --no-thumbs")
  }

  if (plan.length) {
    await mkdir(path.join(ROOT, 'gifs', library.id), { recursive: true })
    if (sharp) await mkdir(path.join(ROOT, 'thumbs', library.id), { recursive: true })
  }

  const digests = new Map() // content hash -> filename, to catch same-gif-twice
  const records = []
  await mapLimit(plan, opts.concurrency, async (p) => {
    const res = await fetch(p.pick.url)
    if (!res.ok) {
      problems.push({ id: p.gif.id, reason: `download failed: ${res.status}` })
      return
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'GIF') {
      problems.push({ id: p.gif.id, reason: 'downloaded file is not a GIF' })
      return
    }

    const digest = createHash('sha1').update(bytes).digest('hex')
    if (digests.has(digest)) {
      problems.push({ id: p.gif.id, reason: `identical to ${digests.get(digest)}` })
      return
    }
    digests.set(digest, p.filename)

    const relPath = `gifs/${library.id}/${p.filename}`
    await writeFile(path.join(ROOT, relPath), bytes)

    let thumbPath
    if (sharp) {
      try {
        const webp = await makeThumbnail(sharp, bytes)
        thumbPath = `thumbs/${library.id}/${p.filename.replace(/\.gif$/i, '')}.webp`
        await writeFile(path.join(ROOT, thumbPath), webp)
      } catch (e) {
        // Non-fatal: the app falls back to the full gif when thumbPath is unset.
        thumbPath = undefined
        console.warn(`  thumbnail failed for ${p.filename}: ${e.message}`)
      }
    }

    const gifMeta = parseGifMeta(bytes)
    records.push({
      id: p.recordId,
      name: p.name,
      filename: p.filename,
      path: relPath,
      thumbPath,
      library: library.id,
      tags: [...opts.tags],
      description: p.gif.title?.trim() ?? '',
      favorite: false,
      durationMs: gifMeta?.durationMs,
      frameCount: gifMeta?.frameCount,
      width: gifMeta?.width,
      height: gifMeta?.height,
      bytes: bytes.length,
      sourceUrl: cleanUrl(p.pick.url),
      sourceId: p.gif.id,
      addedAt: new Date().toISOString(),
    })
    console.log(`  ${records.length}/${plan.length} ${p.filename}`)
  })

  if (records.length === 0 && plan.length > 0) {
    console.log('\nnothing downloaded successfully — leaving the index alone.')
    for (const p of problems) console.log(`  ${p.id}: ${p.reason}`)
    process.exit(1)
  }

  // Keep the collection's order rather than whatever download finished first.
  const order = new Map(plan.map((p, i) => [p.recordId, i]))
  records.sort((a, b) => order.get(a.id) - order.get(b.id))

  // Gifs that were already imported: add this run's tags to the record that
  // exists, leaving it in the library it was first imported into.
  const extraTags = new Map(retag.map((r) => [r.record.id, r.missing]))

  // One index write for the whole batch: the new library (if any), the new
  // records, and the re-tagged ones — built from the copy we read off disk a
  // moment ago.
  const next = {
    ...index,
    libraries: newLibrary ? [...index.libraries, library] : index.libraries,
    gifs: [
      ...records,
      ...index.gifs.map((g) =>
        extraTags.has(g.id) ? { ...g, tags: [...g.tags, ...extraTags.get(g.id)] } : g,
      ),
    ],
  }
  await writeFile(indexFile, `${JSON.stringify(next, null, 2)}\n`)

  // A retag-only run writes no files, so those directories may not exist.
  const paths = [INDEX_PATH]
  for (const dir of [`gifs/${library.id}`, ...(sharp ? [`thumbs/${library.id}`] : [])]) {
    if (existsSync(path.join(ROOT, dir))) paths.push(dir)
  }
  git('add', ...paths)

  const parts = []
  if (records.length) parts.push(`Import ${records.length} gifs from GIPHY into ${library.name}`)
  if (retag.length) parts.push(`tag ${retag.length} already-imported gifs`)
  const subject = parts.join(', ')
  git('commit', '-m', subject, '-m', `Collection: ${collection ?? library.name}`)
  console.log(`\ncommitted: ${subject}`)
  for (const p of problems) console.log(`  not imported — ${p.id}: ${p.reason}`)

  if (opts.push) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
    // The app commits to this repo too, so the remote may have moved.
    git('pull', '--rebase', 'origin', branch)
    git('push', '-u', 'origin', branch)
    console.log(`pushed to origin/${branch}`)
  } else {
    console.log('not pushed — review the commit, then `git push`.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
