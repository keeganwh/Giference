// Small binary helpers shared by the storage + import code.

/** Convert bytes to raw base64 (no data: prefix), safe for large buffers. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Convert a Blob to raw base64. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  return toBase64(buf)
}

/** Turn a filename-ish string into a safe kebab-case slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\.[a-z0-9]+$/i, '') // drop extension
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'gif'
}
