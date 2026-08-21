// Harvest the GIPHY ids in a collection, from the browser console.
//
// Why this exists: GIPHY's public API has no endpoint for a logged-in user's
// collections (see ROADMAP "Priority 1"). Collections are a giphy.com account
// feature, and the only reliable way to enumerate one is from the page itself
// while logged in. This is the input step for `npm run import`.
//
// Usage:
//   1. Open the collection on giphy.com (logged in) — the page that lists the
//      gifs, e.g. https://giphy.com/channel/<you>/<collection>
//   2. Open DevTools -> Console, paste this whole file, press Enter.
//   3. It scrolls to the bottom (lazy-loading everything), then downloads the
//      ids as <collection>.json.
//   4. Move that file into giphy-input/ and run:
//      npm run import -- --input "giphy-input/<collection>.json"
//
// Ids are scraped from the DOM rather than an internal endpoint on purpose:
// markup changes are visible and easy to re-fix, whereas an undocumented
// /api/vN route can change shape silently.

(async () => {
  const SCROLL_PAUSE_MS = 700
  // Stop after this many consecutive scrolls that turn up nothing new — GIPHY
  // keeps the scroll height growing briefly after the last batch loads.
  const IDLE_ROUNDS = 4
  const MAX_ROUNDS = 400

  const ids = new Set()

  const harvest = () => {
    // Permalinks: /gifs/<slug>-<id> or /gifs/<id>
    for (const a of document.querySelectorAll('a[href*="/gifs/"]')) {
      const m = a.getAttribute('href').match(/\/gifs\/(?:[^/?#]*-)?([A-Za-z0-9]{6,})(?:[/?#]|$)/)
      if (m) ids.add(m[1])
    }
    // Media URLs: /media/<id>/… or /media/v1.<cid>/<id>/…
    for (const el of document.querySelectorAll('img[src], img[srcset], video source[src]')) {
      const urls = [el.getAttribute('src'), el.getAttribute('srcset')].filter(Boolean).join(' ')
      for (const m of urls.matchAll(/\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]{6,})\//g)) ids.add(m[1])
    }
  }

  let idle = 0
  for (let round = 0; round < MAX_ROUNDS && idle < IDLE_ROUNDS; round++) {
    const before = ids.size
    harvest()
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS))
    idle = ids.size === before ? idle + 1 : 0
    console.log(`[giphy-collect] round ${round + 1}: ${ids.size} ids`)
  }
  harvest()

  const heading = document.querySelector('h1')?.textContent?.trim()
  const payload = {
    collection: heading || document.title.replace(/\s*[|—-]\s*GIPHY.*$/i, '').trim(),
    url: location.href,
    count: ids.size,
    ids: [...ids],
  }

  const json = JSON.stringify(payload, null, 2)
  console.log(json)

  // Save it as a file rather than relying on the clipboard: hand-copying out of
  // the console is where this goes wrong (truncated output, log lines pasted in
  // with the data, Notepad adding a BOM). The importer copes with all of that,
  // but a real file avoids it.
  try {
    const name = `${(payload.collection || 'giphy-collection')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'giphy-collection'}.json`
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    console.log(`[giphy-collect] downloaded ${name} (${payload.count} ids) — move it into giphy-input/`)
  } catch (e) {
    console.log(`[giphy-collect] download failed (${e.message}) — copy the JSON above by hand`)
    try {
      copy(payload) // DevTools-only helper; absent outside the console
      console.log('[giphy-collect] also copied to the clipboard')
    } catch {}
  }

  return payload
})()
