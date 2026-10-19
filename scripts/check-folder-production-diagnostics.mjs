import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const roots = process.argv.slice(2)
if (!roots.length) throw new Error('Pass production build directories, for example .output/chrome-mv3')
const markers = ['folder-access-scopes', 'folder-view-', 'folder-projection-', 'folder-data-',
  'membership-add-', '"[Folders][projection]"', '"[Folders][data-access]"', '"responseBytes"',
  'recovery.trimmed', 'recovery.storage-status', 'recovery.snapshot-saved', 'payloadBytesWritten',
  'browser-sync.publication.reused', 'browser-sync.publication.prepared', 'browser-sync.capture.stale']
async function scripts(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await scripts(path))
    else if (entry.name.endsWith('.js')) files.push(path)
  }
  return files
}
for (const root of roots) {
  const files = await scripts(root)
  if (!files.length) throw new Error(`No production scripts found in ${root}`)
  for (const path of files) {
    const source = await readFile(path, 'utf8')
    for (const marker of markers) {
      if (source.includes(marker)) throw new Error(`Development-only Folder diagnostic survived: ${marker} in ${path}`)
    }
  }
  console.log(`${root}: checked ${files.length} scripts; Folder diagnostic markers absent`)
}
