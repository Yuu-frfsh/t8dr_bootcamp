/**
 * Copies IBM Plex Sans Arabic out of node_modules into public/fonts.
 *
 * The font must be self-hosted - a CDN link would break the moment the venue
 * wifi dies, which is the exact scenario this app is built for. Sourcing it
 * from the npm package instead of committing binaries keeps the repo clean and
 * the version pinned.
 *
 * Runs as postinstall. Never exits non-zero: a missing font degrades to the
 * system sans-serif, which is not worth failing an install over.
 */
import { mkdir, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files');
const outDir = join(root, 'public', 'fonts');

// Only 400 and 700, only the subsets this app renders.
const FILES = [
  'ibm-plex-sans-arabic-arabic-400-normal.woff2',
  'ibm-plex-sans-arabic-arabic-700-normal.woff2',
  'ibm-plex-sans-arabic-latin-400-normal.woff2',
  'ibm-plex-sans-arabic-latin-700-normal.woff2',
];

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(srcDir))) {
    console.warn('[fonts] @fontsource/ibm-plex-sans-arabic not installed - skipping.');
    return;
  }

  await mkdir(outDir, { recursive: true });

  let copied = 0;
  for (const file of FILES) {
    const from = join(srcDir, file);
    if (!(await exists(from))) {
      console.warn(`[fonts] missing ${file} in the package - skipping.`);
      continue;
    }
    await copyFile(from, join(outDir, file));
    copied += 1;
  }

  console.log(`[fonts] copied ${copied}/${FILES.length} font files to public/fonts.`);
}

main().catch((err) => {
  console.warn('[fonts] copy failed, falling back to system sans-serif:', err.message);
});
