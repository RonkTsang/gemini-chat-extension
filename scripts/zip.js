// scripts/zip.js
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const RELEASE_DIR = 'releases';

// Ensure the releases directory exists
if (!fs.existsSync(RELEASE_DIR)){
    fs.mkdirSync(RELEASE_DIR);
}

// Get version from manifest.json
const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
const version = manifest.version;

const zipFileName = path.join(RELEASE_DIR, `gemini-toc-extension-v${version}.zip`);
const output = fs.createWriteStream(zipFileName);
const archive = archiver('zip', {
  zlib: { level: 9 } // Set compression level to maximum
});

output.on('close', () => {
  console.log(`✅ Successfully created ${zipFileName}`);
  console.log(`Total size: ${Math.round(archive.pointer() / 1024)} KB`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add all files from the 'dist' directory to the zip
archive.directory('dist/', false);

archive.finalize();
