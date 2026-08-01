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
| 4 | Assets — `scripts/tts.js`, sign filming, `SignPlayer` | ⬜ not started |
| 5 | Polish — PWA, `SettingsSheet`, Vercel deploy | ⬜ not started |

The app is **fully usable right now with zero sign clips and zero audio files.**
That is a designed state, not a placeholder — see principle 5 in the spec.

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

### Expected console noise in dev

Tapping the free-text speak button logs a failed `POST /api/speak`. That is
correct: `vite dev` has no serverless runtime and there is no `AZURE_KEY` yet, so
the request fails and the app degrades to `window.speechSynthesis`. Missing
`/signs/<id>.webp` requests 404 for the same reason. Neither is a bug.

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

- **Status comes from real media events only** (`play`, `ended`, `error`,
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

Current content is a **~16 entry stub**. The real phrase list is written with the
participants — build against the schema, not against these samples.

When you write the real list: transliterate technical terms into Arabic script
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

## Azure (not yet configured)

`api/speak.js` gives typed free text the same Saudi voice as the cards. Until
`AZURE_KEY` / `AZURE_REGION` exist it returns `503` and the client falls through
to `speechSynthesis` — a supported state, not an outage.

To enable: copy `.env.example` to `.env` locally, and set the same two variables
in the Vercel project settings. **Never prefix them with `VITE_`** — that would
inline the key into the client bundle.

---

## Deploying

Static build plus one serverless function; `vercel.json` sets immutable
cache headers for `/signs`, `/audio` and `/fonts`.

There is deliberately **no SPA catch-all rewrite**. A catch-all would serve
`index.html` for a missing `/audio/x.mp3`, and the whole fallback chain depends
on that request producing an honest 404.

---

## Next (phase 4)

1. `scripts/tts.js` — generate `/public/audio/<id>.mp3` from `phrases.json`,
   idempotent, post-processed with ffmpeg for a noisy lab.
2. Film the signs to the standard in SPEC section 9 — **never crop the face**;
   eyebrows, mouth shape and head tilt are grammar, not expression.
3. `scripts/encode-signs.sh` → `.webp` + `.mp4` + `.jpg` per id. Requires
   ffmpeg, which is not currently installed on this machine.
4. `SignPlayer` modal with 0.5× / 0.75× / 1× speed control.

Cards pick assets up automatically as files land. No code changes needed.
