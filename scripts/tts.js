/**
 * Pre-generate one MP3 per preset phrase into public/audio/<id>.mp3.
 *
 *   npm run tts            generate anything missing
 *   npm run tts -- --force regenerate everything (after editing phrase wording)
 *   npm run tts -- --dry   list what would be generated, call nothing
 *
 * Why files rather than calling Azure at tap time:
 *   - Offline. The venue wifi is expected to die mid-session, and a card that
 *     needs the network is a card that fails when it matters.
 *   - Instant. A preloaded file starts inside the tap; a network round trip
 *     does not, and on Safari a deferred start can lose the user gesture.
 *   - Free. 30 phrases are synthesised once, not once per tap per participant.
 *
 * The MP3s are committed to the repo on purpose: the deploy has no Azure key,
 * and re-synthesising on every build would make the audio drift.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesize } from '../lib/tts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const PHRASES = path.join(ROOT, 'src', 'data', 'phrases.json');

/**
 * id -> the exact string that produced the MP3 on disk.
 *
 * Without this, "regenerate after editing wording" is a thing you have to
 * REMEMBER, and adding harakat is the case where forgetting is silent: it
 * changes what is spoken without changing `text_ar`, so nothing looks stale.
 * Dotfile so Vite never serves it.
 */
const MANIFEST = path.join(AUDIO_DIR, '.tts-manifest.json');

/** Harakat, superscript alef, and tatweel - everything the voiced variant adds. */
const HARAKAT = /[ً-ٰٟـ]/g;
const stripHarakat = (s) => String(s || '').replace(HARAKAT, '').replace(/\s+/g, ' ').trim();

/** What Azure is asked to say. Falls back to the display text. */
const speechFor = (p) => (p.speech_ar || p.text_ar || '').trim();

/**
 * `speech_ar` must be `text_ar` plus harakat - unless `speech_note` says why not.
 *
 * It is the one field nobody proofreads, because it never appears on screen: a
 * typo there is a card that displays one sentence and says another, to a user
 * who cannot hear the difference. So an undeclared word change is a hard
 * failure, not a warning.
 *
 * But some real pronunciation fixes ARE word changes - a colloquial
 * contraction the voice mangles (`هالشي`) read as its full form
 * (`هذا الشيء`) is the same words, just spelled out. Refusing those would
 * push people to give up on the guard entirely. `speech_note` is the escape
 * hatch: it costs one deliberate sentence, and every declared rewrite is
 * printed on every run so none of them quietly become permanent.
 */
function checkVoiced(phrases) {
  const undeclared = [];
  const declared = [];
  for (const p of phrases) {
    if (!p.speech_ar) continue;
    const stripped = stripHarakat(p.speech_ar);
    const plain = stripHarakat(p.text_ar);
    if (stripped === plain) continue;
    (p.speech_note ? declared : undeclared).push({ id: p.id, plain, stripped, note: p.speech_note });
  }

  if (undeclared.length) {
    console.error('speech_ar differs from text_ar by more than harakat:\n');
    for (const b of undeclared) {
      console.error(`  ${b.id}`);
      console.error(`    text_ar             ${b.plain}`);
      console.error(`    speech_ar stripped  ${b.stripped}`);
    }
    console.error(
      '\nEither fix the wording, or add a "speech_note" saying why the card should' +
        '\nsay something it does not show. Nothing generated.'
    );
    process.exit(1);
  }

  if (declared.length) {
    console.log(`${declared.length} phrase(s) deliberately speak different words than they show:`);
    for (const d of declared) console.log(`  ${d.id}: ${d.note}`);
    console.log('');
  }
}

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry');

/**
 * Minimal .env reader. Deliberately not a dependency, and deliberately not
 * `--env-file` so that `npm run tts` behaves the same on every Node version the
 * bootcamp laptops might have.
 */
async function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  const text = await readFile(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await loadEnv();

  const key = process.env.AZURE_KEY;
  const region = process.env.AZURE_REGION;
  if (!DRY && (!key || !region)) {
    console.error('AZURE_KEY and AZURE_REGION must be set in .env - nothing generated.');
    console.error('The app still works without them; cards fall back to the device voice.');
    process.exit(1);
  }

  const phrases = JSON.parse(await readFile(PHRASES, 'utf8'));
  checkVoiced(phrases);
  await mkdir(AUDIO_DIR, { recursive: true });

  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    /* first run, or hand-deleted - everything simply looks stale */
  }

  const pending = [];
  for (const p of phrases) {
    const out = path.join(AUDIO_DIR, `${p.id}.mp3`);
    const text = speechFor(p);
    let reason = null;
    // An id absent from the manifest predates it, and before `speech_ar`
    // existed this script only ever synthesized `text_ar` - so that is what
    // the file on disk says. Assuming it is history, not a guess, and it is
    // what makes adding harakat to an existing phrase regenerate by itself.
    const onDisk = manifest[p.id] !== undefined ? manifest[p.id] : (p.text_ar || '').trim();
    if (FORCE) reason = 'forced';
    else if (!existsSync(out)) reason = 'missing';
    else if (onDisk !== text) reason = 'text changed';
    if (reason) pending.push({ ...p, out, text, reason });
  }

  const voiced = phrases.filter((p) => p.speech_ar).length;
  console.log(
    `${phrases.length} phrases (${voiced} with speech_ar), ${pending.length} to generate` +
      (FORCE ? ' (forced)' : '')
  );

  if (DRY) {
    for (const p of pending) {
      console.log(`  would generate ${p.id}.mp3  [${p.reason}]  ${p.text}`);
    }
    return;
  }
  if (pending.length === 0) {
    console.log('Nothing to do. Use --force to regenerate after editing wording.');
    return;
  }

  let ok = 0;
  const failed = [];

  for (const p of pending) {
    // Serial, with a small gap. The free tier throttles hard on bursts, and a
    // 30-item job has no reason to race.
    const result = await synthesize({ key, region, text: p.text, lang: 'ar-SA' });

    if (!result.ok) {
      failed.push({ id: p.id, status: result.status, error: result.error });
      console.error(`  FAIL ${p.id}  (${result.status}) ${result.error}`);
    } else if (result.buffer.length < 512) {
      // A 200 with a near-empty body is Azure accepting the request and
      // returning nothing useful. Writing it would produce a silent card.
      failed.push({ id: p.id, status: 200, error: `suspiciously small (${result.buffer.length}B)` });
      console.error(`  FAIL ${p.id}  200 but only ${result.buffer.length} bytes - not written`);
    } else {
      await writeFile(p.out, result.buffer);
      manifest[p.id] = p.text;
      ok += 1;
      console.log(`  ok   ${p.id}.mp3  ${(result.buffer.length / 1024).toFixed(1)}kB  ${p.text}`);
    }

    await sleep(120);
  }

  // Written even on partial failure: the ids that DID succeed are recorded, so
  // a re-run retries only what is still stale.
  for (const id of Object.keys(manifest)) {
    if (!phrases.some((p) => p.id === id)) delete manifest[id];
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // Report orphans so deleting a phrase does not silently leave its audio behind.
  const onDisk = (await readdir(AUDIO_DIR)).filter((f) => f.endsWith('.mp3') && !f.startsWith('_'));
  const known = new Set(phrases.map((p) => `${p.id}.mp3`));
  const orphans = onDisk.filter((f) => !known.has(f));

  let bytes = 0;
  for (const f of onDisk) bytes += (await stat(path.join(AUDIO_DIR, f))).size;

  console.log(`\n${ok} generated, ${failed.length} failed.`);
  console.log(`public/audio now holds ${onDisk.length} files, ${(bytes / 1024).toFixed(0)}kB total.`);
  if (orphans.length) {
    console.log(`Orphaned (no matching phrase, safe to delete): ${orphans.join(', ')}`);
  }
  if (failed.length) {
    console.log('\nFailed ids keep falling back to the device voice, so the app still works.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
