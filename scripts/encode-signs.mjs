#!/usr/bin/env node
/**
 * Sign clip encoder (SPEC section 9).
 *
 * Produces the three files a card can use, per phrase id:
 *
 *   public/signs/<id>.webp   animated, 240x240, 12fps   grid thumbnail (<img>)
 *   public/signs/<id>.mp4    720x720                    expanded SignPlayer
 *   public/signs/<id>.jpg    first frame, 240x240       "freeze motion" poster
 *
 * This is the Node replacement for the encode-signs.sh in the spec: that script
 * assumes a POSIX shell and a system ffmpeg, neither of which exists on the
 * Windows machine this is developed on. ffmpeg comes from the `ffmpeg-static`
 * devDependency, so there is nothing to install by hand.
 *
 * Idempotent: an id that already has a file is skipped unless --force.
 *
 *   node scripts/encode-signs.mjs
 *       Encode raw/<id>.(mov|mp4|webm) -> public/signs/<id>.*
 *
 *   node scripts/encode-signs.mjs --sample <file>
 *       TESTING ONLY. Encode one clip and fan it out to every id in
 *       phrases.json, so every card shows a sign while the real clips are still
 *       unfilmed. Records what it wrote so --clean-sample can undo it exactly.
 *
 *   node scripts/encode-signs.mjs --clean-sample
 *       Delete only the files --sample created. Real encoded clips are never
 *       touched, because they are not in the manifest.
 *
 *   --force        Re-encode / overwrite instead of skipping.
 *   --only <id>    Restrict to a single id.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

/**
 * ffmpeg-static is an OPTIONAL dependency, and the import is deliberately lazy.
 *
 * It ships an 80 MB binary that only this script ever uses - nothing at build
 * or run time touches it. Making it optional lets the Vercel build skip the
 * download entirely (see README), and the lazy import means a missing binary
 * produces an instruction instead of a module-resolution crash.
 */
async function ffmpegBinary() {
  try {
    const mod = await import('ffmpeg-static');
    const bin = mod.default || mod;
    if (bin) return bin;
  } catch {
    /* fall through to the message below */
  }
  throw new Error(
    'ffmpeg-static is not installed (it is an optional dependency).\n' +
      '  Install it when you need to encode sign clips:  npm install'
  );
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'raw');
const OUT_DIR = path.join(ROOT, 'public', 'signs');
const PHRASES = path.join(ROOT, 'src', 'data', 'phrases.json');

/**
 * id -> short content hash, imported by PhraseCard and appended as `?v=`.
 *
 * vercel.json serves /signs with `immutable, max-age=31536000`, which is only
 * safe for a URL whose content can never change. These filenames are stable and
 * their content is NOT: re-filming a sign rewrites have_question.webp in place.
 * Every browser that loaded the placeholder set therefore had it pinned for a
 * year, and `immutable` means it would not even revalidate - the new clips were
 * on the server and unreachable.
 *
 * Hashing the bytes into the query string makes the URL change whenever the
 * clip does, which is what `immutable` requires. Only re-encoded ids bust.
 */
const VERSIONS = path.join(ROOT, 'src', 'data', 'signs.json');

/**
 * Written by --sample, read by --clean-sample. Lives beside the output so it
 * cannot drift from what is actually on disk. Dotfile so Vite never serves it.
 */
const MANIFEST = path.join(OUT_DIR, '.sample-manifest.json');

const SOURCE_EXT = new Set(['.mov', '.mp4', '.webm', '.m4v', '.avi']);
const KINDS = ['webp', 'mp4', 'jpg'];

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  const args = { force: false, sample: null, cleanSample: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--clean-sample') args.cleanSample = true;
    else if (a === '--sample') args.sample = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.sample && !args.sample) throw new Error('--sample needs a file path');
  return args;
}

/* --------------------------------------------------------------- encoding */

/**
 * SPEC section 9 filter chains, verbatim.
 *
 * `force_original_aspect_ratio=increase` then `crop` centre-crops to square
 * without letterboxing - the card reserves a square, so anything else would
 * either distort the signer or pad them with bars.
 */
const RECIPES = {
  webp: [
    '-vf', 'fps=12,scale=240:240:force_original_aspect_ratio=increase,crop=240:240',
    '-c:v', 'libwebp', '-quality', '72', '-loop', '0', '-an',
  ],
  mp4: [
    '-vf', 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720',
    '-c:v', 'libx264', '-crf', '26', '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  ],
  jpg: [
    '-vf', 'select=eq(n\\,0),scale=240:240:force_original_aspect_ratio=increase,crop=240:240',
    '-vframes', '1',
  ],
};

async function encode(source, dest, kind) {
  const ffmpegPath = await ffmpegBinary();
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, ...RECIPES[kind], dest]);
}

/** Encode all three outputs for one id. Returns the kinds actually written. */
async function encodeAll(source, id, { force, into = OUT_DIR }) {
  const written = [];
  for (const kind of KINDS) {
    const dest = path.join(into, `${id}.${kind}`);
    if (!force && existsSync(dest)) continue;
    await encode(source, dest, kind);
    written.push(kind);
  }
  return written;
}

/* -------------------------------------------------------------- versions */

/**
 * Rebuild src/data/signs.json from whatever is on disk right now.
 *
 * Derived from the files rather than accumulated as we go, so it cannot drift:
 * every mode below just calls this last, including --clean-sample, and the
 * answer is always "what is actually there".
 */
async function writeVersions() {
  let files = [];
  try {
    files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.webp'));
  } catch {
    /* no output directory yet */
  }

  const versions = {};
  for (const file of files.sort()) {
    const bytes = await readFile(path.join(OUT_DIR, file));
    versions[path.basename(file, '.webp')] = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  }

  await writeFile(VERSIONS, `${JSON.stringify(versions, null, 2)}\n`);
  return Object.keys(versions).length;
}

/* -------------------------------------------------------------- manifest */

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST, 'utf8'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

/* ----------------------------------------------------------------- modes */

/** TESTING. One clip, encoded once, copied to every id. */
async function sampleMode(sampleFile, { force, only }) {
  const source = path.resolve(sampleFile);
  if (!existsSync(source)) throw new Error(`sample not found: ${source}`);

  const phrases = JSON.parse(await readFile(PHRASES, 'utf8'));
  const ids = phrases.map((p) => p.id).filter((id) => !only || id === only);
  if (ids.length === 0) throw new Error(only ? `no phrase with id "${only}"` : 'phrases.json is empty');

  await mkdir(OUT_DIR, { recursive: true });

  // Encode once under a reserved id, then copy. Thirty ffmpeg runs of the same
  // input would produce thirty identical files for thirty times the wait.
  const stem = '_sample';
  console.log(`encoding ${path.basename(source)} ...`);
  await encodeAll(source, stem, { force: true });

  const previous = new Set(await readManifest());
  const written = [];
  let skipped = 0;

  for (const id of ids) {
    for (const kind of KINDS) {
      const rel = `${id}.${kind}`;
      const dest = path.join(OUT_DIR, rel);
      // Never overwrite a real encoded clip. Only files this mode wrote before
      // are fair game, so a half-filmed set can be topped up with placeholders.
      if (existsSync(dest) && !force && !previous.has(rel)) {
        skipped += 1;
        continue;
      }
      await copyFile(path.join(OUT_DIR, `${stem}.${kind}`), dest);
      written.push(rel);
    }
  }

  for (const kind of KINDS) await rm(path.join(OUT_DIR, `${stem}.${kind}`), { force: true });

  const files = [...new Set([...previous, ...written])].sort();
  await writeFile(MANIFEST, `${JSON.stringify({ source: path.basename(source), files }, null, 2)}\n`);

  console.log(`${await writeVersions()} sign version(s) recorded`);
  console.log(`\nplaceholder signs written for ${ids.length} phrase(s): ${written.length} file(s)`);
  if (skipped) console.log(`${skipped} real file(s) left untouched (use --force to overwrite)`);
  console.log(`\nundo with:  node scripts/encode-signs.mjs --clean-sample`);
}

async function cleanSampleMode() {
  const files = await readManifest();
  if (files.length === 0) return console.log('no sample manifest - nothing to clean');

  for (const rel of files) await rm(path.join(OUT_DIR, rel), { force: true });
  await rm(MANIFEST, { force: true });
  await writeVersions();
  console.log(`removed ${files.length} placeholder file(s)`);
}

/** The real pipeline: raw/<id>.mov -> public/signs/<id>.* */
async function rawMode({ force, only }) {
  if (!existsSync(RAW_DIR)) {
    console.log(`no raw/ directory.\n\nPut recordings in raw/<id>.mov (filename = the phrase id), then re-run.`);
    console.log(`To fill every card with one placeholder clip instead:`);
    console.log(`  node scripts/encode-signs.mjs --sample path/to/clip.mp4`);
    return;
  }

  const sources = (await readdir(RAW_DIR))
    .filter((f) => SOURCE_EXT.has(path.extname(f).toLowerCase()))
    .filter((f) => !only || path.basename(f, path.extname(f)) === only);

  if (sources.length === 0) return console.log('no source clips found in raw/');

  await mkdir(OUT_DIR, { recursive: true });

  let encoded = 0;
  for (const file of sources) {
    const id = path.basename(file, path.extname(file));
    const written = await encodeAll(path.join(RAW_DIR, file), id, { force });
    if (written.length) {
      encoded += 1;
      console.log(`  ${id}  ->  ${written.join(', ')}`);
    }
  }
  console.log(encoded ? `\nencoded ${encoded} clip(s)` : '\nnothing to do - all outputs already exist (--force to redo)');
  console.log(`${await writeVersions()} sign version(s) recorded`);
}

/* ------------------------------------------------------------------ main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(await readFile(fileURLToPath(import.meta.url), 'utf8').then((s) => s.split('*/')[0]));
    return;
  }
  if (args.cleanSample) return cleanSampleMode();
  if (args.sample) return sampleMode(args.sample, args);
  return rawMode(args);
}

main().catch((err) => {
  console.error(`\nencode-signs failed: ${err.message}`);
  process.exit(1);
});
