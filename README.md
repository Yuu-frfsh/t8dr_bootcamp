# تواصل — Bootcamp Communication App

One-way communication webapp for Deaf/hard-of-hearing participants in an Arabic
robotics bootcamp. A participant taps a card; the device speaks the phrase aloud
in Arabic so the hearing instructor can hear it, and displays it in huge text as
a guaranteed fallback.

**Direction: participant → instructor only.** See [SPEC.md](./SPEC.md) for the
full contract — it is the source of truth, this file is just how to run it.

---

## Status

Phases 1–3 of SPEC section 12 are built:

| Phase | | |
|---|---|---|
| 1 | Core — cards, `useSpeak`, `BigTextOverlay`, `WaveEffect` | ✅ |
| 2 | Navigation — chips, search, recents, favorites | ✅ |
| 3 | Free text + raise hand + `api/speak.js` | ✅ |
| 4 | Assets — `scripts/encode-signs.mjs` ✅, `scripts/tts.js` ✅, sign filming ⬜, `SignPlayer` ⬜ | 🟨 |
| 5 | Polish — PWA, `SettingsSheet`, Vercel deploy | ⬜ not started |

Audio is real: 30 Azure-generated MP3s ship in `public/audio`. Signs are not —
the clips currently in `public/signs` are one sample repeated, so **every card
shows the same sign**. Film them, or run `--clean-sample`, before this goes in
front of a participant.

The app is **fully usable with zero sign clips and zero audio files.** That is a
designed state, not a placeholder — see principle 5 in the spec.

---

## Run it

```bash
npm install     # also copies the font into public/fonts (postinstall)
npm run dev     # http://localhost:5173
```

`npm run dev` binds to all interfaces, so you can open it on a phone or tablet
on the same wifi via `http://<your-ip>:5173` — worth doing early, since that is
the device it will actually be used on.

```bash
npm run test    # vitest: Arabic normalization + search filtering
npm run build   # production build to dist/
npm run preview # serve the production build
```

```bash
npm run tts            # generate any missing /public/audio/<id>.mp3 via Azure
npm run tts -- --force # regenerate everything, after editing phrase wording
npm run tts -- --dry   # list what would be generated, call nothing
```

### Expected console noise in dev

Missing `/signs/<id>.webp` requests 404 until sign clips are filmed. That is not
a bug — the card falls back to a solid category block.

`vite dev` has no serverless runtime, so `scripts/dev-api.js` mounts the real
`api/speak.js` as middleware. On boot it prints either `Azure TTS configured` or
`no AZURE_KEY - free text will use the device voice`. Without a key the free text
bar logs a failed `POST /api/speak` and degrades to `window.speechSynthesis`,
which is a supported state.

---

## Sign clips

`scripts/encode-signs.mjs` produces the three files a card can use, per phrase id:

| File | Size | Used by |
|---|---|---|
| `public/signs/<id>.webp` | 240×240, 12fps, animated | the grid card — rendered as `<img>` |
| `public/signs/<id>.mp4` | 720×720 | `SignPlayer` (phase 4) |
| `public/signs/<id>.jpg` | first frame | the "freeze motion" setting (phase 5) |

ffmpeg comes from the `ffmpeg-static` devDependency — there is nothing to install
by hand. This script replaces the `encode-signs.sh` in SPEC section 9, which
assumes a POSIX shell and a system ffmpeg; neither exists on Windows.

```bash
npm run signs                              # raw/<id>.mov  ->  public/signs/<id>.*
npm run signs -- --only need_help          # just one id
npm run signs -- --force                   # re-encode instead of skipping
```

Filename in `raw/` **is** the phrase id. Encoding is idempotent, so re-running
after filming three more signs only encodes those three.

### Filling every card with one placeholder clip

Before the real signs are filmed, one sample clip can stand in everywhere, so the
grid can be tested at full density:

```bash
npm run signs -- --sample path/to/clip.mp4   # every id in phrases.json
npm run signs -- --clean-sample              # remove exactly those files again
```

`--sample` encodes once and copies, and it will **not** overwrite a real encoded
clip — so a partly-filmed set can be topped up with placeholders. What it wrote is
recorded in `public/signs/.sample-manifest.json`, and `--clean-sample` deletes
exactly that list and nothing else.

These placeholders are ~6 MB of the same clip repeated. Run `--clean-sample`
before committing.

---

## How the audio works

Everything routes through `src/hooks/useSpeak.js`. One engine, one thing
speaking at a time, three tiers:

```
1. /audio/<id>.mp3         →  pre-generated, best quality
2. window.speechSynthesis  →  whatever voice the device has
3. text only               →  status 'failed', red card, overlay stays up
```

Two rules matter more than the rest, and both exist because **the user cannot
hear the output**:

- **Status comes from real media events only** (`playing`, `ended`, `error`,
  `stalled`, `onstart`, `onend`, `onerror`). Never from a timer. A card that
  animated "playing" on a `setTimeout` would be lying to someone who has no way
  to check.
- **Failure is loud.** Red border on the card, and the full-screen text overlay
  does not auto-dismiss — with no sound, the text is the only channel left.

### Browser quirks the engine works around — do not "simplify" these

**`playing`, never `play`.** Measured in Chrome against a missing MP3:

| event | fires at |
|---|---|
| `play` | **1 ms** — only means `paused` became false |
| `waiting` | 1 ms |
| `stalled` | ~3300 ms |
| `error` | **never** — `audio.error` stays `null` |

So `play` says nothing about whether sound is happening, and `error` — the
obvious thing to hang a fallback on — never arrives for a 404 at all. Binding
the card's `playing` state to `play` made cards light up and run the wave
animation while the user heard silence. `playing` only fires once real data is
being rendered, which is the honest signal.

Because `error` never comes, there is a 700 ms `SOURCE_DEADLINE_MS` after which
the engine gives up on the file and uses `speechSynthesis`. It is a
source-selection deadline, not a state timer: it can only ever *downgrade*, and
never claims audio happened. Ids that prove absent are remembered in
`knownMissing` so only the first tap pays that cost.

**A generation token** on every speak, so a cancelled utterance's
`interrupted` error cannot paint the *next* card red.

**A held reference** to the in-flight `SpeechSynthesisUtterance`, because Chrome
garbage-collects it mid-sentence otherwise.

---

## Editing content

All phrase content is in `src/data/phrases.json` and `src/data/categories.json`.
**No phrase text is hardcoded in any component.** Adding an object to
`phrases.json` makes a new card appear with zero code changes; the `id` is also
the filename for `/signs/<id>.webp`, `/signs/<id>.mp4` and `/audio/<id>.mp3`.

Category colors live in `categories.json` (not in `tailwind.config.js`) so they
can be changed without touching code, and the order of that file sets the order
categories appear in the chips and in the "all" grid.

Current content is **30 real bootcamp phrases**. Colloquial spellings are on the
cards (`الحين`, `وش`, `هالنقطة`) with MSA equivalents in `keywords`, so search
finds a card either way.

After editing wording, re-run `npm run tts -- --force` — otherwise the card still
plays the MP3 of the old sentence.

When you extend the list: transliterate technical terms into Arabic script
(`الأردوينو`, not `Arduino`), and do not add harakat by default — generate the
audio plain, listen once, and add harakat only to the few that come out wrong.

---

## Layout of the code

```
src/
├── data/         phrases.json, categories.json   ← all content, edit these
├── hooks/        useSpeak (the engine), useRecents, useLocalStorage
├── context/      SpeakContext — one engine for the whole app
├── utils/        normalizeArabic, searchIndex, chime, color, icons, detectScript
└── components/   PhraseCard, BigTextOverlay, WaveEffect, TopBar, CategoryChips,
                  SearchBar, RecentRow, RaiseHandButton, EmptyState
api/speak.js      Vercel serverless TTS proxy (free-text bar only)
scripts/          copy-fonts.mjs
```

---

## Azure

Two consumers, one voice table (`lib/tts.js`) so they cannot drift apart:

| | what | when |
|---|---|---|
| `scripts/tts.js` | writes `/public/audio/<id>.mp3` | once, at your desk |
| `api/speak.js` | synthesises typed free text on demand | at tap time |

The MP3s **are committed**. The deploy has no Azure key, the venue wifi is
expected to die, and re-synthesising per build would let the audio drift from
what was tested. 30 phrases ≈ 570kB.

Cards therefore never touch the network: measured, a card reaches the `playing`
event ~80ms after the tap, versus ~700ms when it has to fall through the
missing-file deadline to the device voice. That gap matters beyond latency —
audio that starts inside the tap keeps the user-gesture context, which is what
Safari requires.

`AZURE_KEY` / `AZURE_REGION` live in `.env` locally (gitignored) and in the
Vercel project settings for the deploy. **Never prefix them with `VITE_`** —
that would inline the key into the client bundle. Absent them, `api/speak.js`
returns `503` and the client falls through to `speechSynthesis`.

---

## Colour

Camp host brand, in `tailwind.config.js`:

| token | hex | used for |
|---|---|---|
| `primary` | `#7D63AB` | speak button, active chip, free-text overlay, waves |
| `primary-dark` | `#573D85` | pressed states, raise-hand, focus ring |
| `primary-light` | `#A389D1` | — |
| `primary-reverse` | `#FFFFFF` | text on any of the above |

**`danger` (`#DC2626`) is reserved for "the audio did not work" and nothing
else.** Not urgency, not emphasis, not a category. A user who cannot hear the
output reads a red screen as failure, so a second meaning on that colour is one
too many. `searchIndex.test.js` fails the build if a category is painted with it;
the raise-hand button is brand purple for the same reason.

Category colours in `categories.json` stay five distinguishable hues rather than
five purples — telling categories apart at a glance is a function, not a
decoration — but they are tuned to sit in the brand's tonal family.

---

## Deploying

Static build plus one serverless function; `vercel.json` sets immutable
cache headers for `/signs`, `/audio` and `/fonts`.

There is deliberately **no SPA catch-all rewrite**. A catch-all would serve
`index.html` for a missing `/audio/x.mp3`, and the whole fallback chain depends
on that request producing an honest 404.

---

## Next (phase 4)

1. ~~`scripts/tts.js`~~ — done; 30 files in `public/audio`.
2. Film the signs to the standard in SPEC section 9 — **never crop the face**;
   eyebrows, mouth shape and head tilt are grammar, not expression.
3. `scripts/encode-signs.sh` → `.webp` + `.mp4` + `.jpg` per id. Requires
   ffmpeg, which is not currently installed on this machine.
4. `SignPlayer` modal with 0.5× / 0.75× / 1× speed control.

Cards pick assets up automatically as files land. No code changes needed.
