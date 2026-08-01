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
  await mkdir(AUDIO_DIR, { recursive: true });

  const pending = [];
  for (const p of phrases) {
    const out = path.join(AUDIO_DIR, `${p.id}.mp3`);
    if (!FORCE && existsSync(out)) continue;
    pending.push({ ...p, out });
  }

  console.log(
    `${phrases.length} phrases, ${pending.length} to generate` +
      (FORCE ? ' (forced)' : existsSync(AUDIO_DIR) ? ' (existing files kept)' : '')
  );

  if (DRY) {
    for (const p of pending) console.log(`  would generate ${p.id}.mp3  ${p.text_ar}`);
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
    const result = await synthesize({ key, region, text: p.text_ar, lang: 'ar-SA' });

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
      ok += 1;
      console.log(`  ok   ${p.id}.mp3  ${(result.buffer.length / 1024).toFixed(1)}kB  ${p.text_ar}`);
    }

    await sleep(120);
  }

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
