# Bootcamp Communication App — Build Spec

A one-way communication webapp for Deaf/hard-of-hearing participants in an Arabic robotics bootcamp. Participants tap a card; the device speaks the phrase aloud in Arabic so the hearing instructor can hear it, and displays it in large text as a guaranteed fallback.

**Direction:** participant → instructor only. No reverse direction in v1.

---

## 1. Non-negotiable principles

These override any other consideration. If a design decision conflicts with one of these, the principle wins.

1. **One tap = speak.** Tapping a card speaks it immediately. No confirmation, no menu, no long-press. Every other interaction must be reachable without breaking this.
2. **The user cannot hear the output.** Every audio action must have loud visual confirmation, and must visibly fail when audio fails. Never animate "success" on a timer — animation state comes from real audio events only.
3. **Text is the guaranteed path.** Every spoken phrase is simultaneously displayed in huge text on screen. If the speaker is muted, broken, or drowned out by a drill, the message still lands.
4. **The sign is the label, the Arabic text is the caption.** Written Arabic is a second language for many Deaf signers. Sign clip goes on top, larger; text goes below, smaller.
5. **Missing assets are normal.** The app must be fully functional with zero sign clips and zero audio files present. Assets improve it; they are never required for it to run.
6. **Offline-first.** Assume the venue wifi dies mid-session. Everything must work from cache.

---

## 2. Tech stack

- **Vite + React 18 + JavaScript** (not TypeScript — keep it fast to edit during the bootcamp)
- **Tailwind CSS**
- **`vite-plugin-pwa`** for offline caching
- **No backend, no database, no accounts.** `localStorage` only.
- **Hosting: Vercel** (static build + one serverless function)

Root element must be `<html lang="ar" dir="rtl">`.

Font: **IBM Plex Sans Arabic** (self-host in `/public/fonts/`, do not use a CDN — it must work offline). Weights 400 and 700 only.

---

## 3. File structure

```
/
├── public/
│   ├── signs/            # <id>.webp (grid) + <id>.mp4 (expanded)
│   ├── audio/            # <id>.mp3
│   ├── fonts/
│   └── icons/            # PWA icons
├── src/
│   ├── data/
│   │   ├── phrases.json
│   │   └── categories.json
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
├── api/
│   └── speak.js          # Vercel serverless TTS proxy
├── scripts/
│   ├── tts.js            # generate audio from phrases.json
│   └── encode-signs.sh   # convert raw recordings to webp + mp4
├── vercel.json
└── SPEC.md
```

---

## 4. Data model

### `src/data/phrases.json`

All content lives here. **No phrase text may be hardcoded in any component.** This file will be rewritten heavily after the first day of the bootcamp; nothing else should need to change when it is.

```json
[
  {
    "id": "need_help",
    "text_ar": "أحتاج مساعدة",
    "text_en": "I need help",
    "category": "help",
    "keywords": ["مساعدة", "ساعدني", "help", "stuck"],
    "priority": 1
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | `snake_case`, unique. Also the filename for `/signs/<id>.webp`, `/signs/<id>.mp4`, `/audio/<id>.mp3`. |
| `text_ar` | string | Displayed and spoken. May include harakat for pronunciation fixes. |
| `text_en` | string | **Search only — never displayed.** Lets a Latin keyboard find a card. |
| `category` | string | Must match an `id` in `categories.json`. |
| `keywords` | string[] | Extra search terms, Arabic and English. Optional. |
| `priority` | number | Lower sorts first within a category. Optional, defaults to 99. |

### `src/data/categories.json`

```json
[
  { "id": "help", "label_ar": "مساعدة", "label_en": "Help", "color": "#DC2626", "icon": "hand" }
]
```

**Content status:** `phrases.json` and `categories.json` ship as a working stub of ~15 placeholder entries so the app runs. The real phrase list is written separately with the participants. Build against the schema, not against the sample content.

---

## 5. Screen layout

Single screen. No routing, no navigation, no tabs.

Top to bottom, RTL throughout:

```
┌──────────────────────────────────────────────┐
│  [ اكتب هنا...              ] [ 🔊 نطق ]     │  ← free text bar
├──────────────────────────────────────────────┤
│  [ الكل ] [ مساعدة ] [ فهم ] [ قطع ] [ ... ] │  ← category chips (h-scroll)
│  [ 🔍 بحث                                  ] │  ← search
├──────────────────────────────────────────────┤
│  آخر الاستخدامات                             │  ← recents (h-scroll, 6 max)
│  [card] [card] [card] [card]                 │
├──────────────────────────────────────────────┤
│  [card]  [card]                              │  ← main grid
│  [card]  [card]                              │
│  [card]  [card]                              │
└──────────────────────────────────────────────┘
                                    ( ✋ )        ← raise hand, fixed, always visible
```

Grid: 2 columns below 640px, 3 at 640–1024px, 4 above.

---

## 6. Components

### `PhraseCard`

The core component. Whole card is one button.

**Structure:**
- Top ~65%: sign clip — `<img src="/signs/{id}.webp" loading="lazy">`. **Animated WebP, rendered as an image.** Do not use `<video>` here. No play/pause logic, no `IntersectionObserver` for playback.
- Bottom ~35%: `text_ar` (large, bold), preceded by a small category badge. **Arabic only — no English gloss.** An English line under the Arabic serves a reader who is not the user, and it costs caption height on a phone. `text_en` remains in the data for search.
- Top-left corner (RTL): small expand icon button, `stopPropagation`, opens `SignPlayer`.
- Bottom-left corner: small star icon for favorite, `stopPropagation`.

**Missing asset handling:** if `/signs/{id}.webp` fails to load (`onError`), replace with a solid block in the category color plus the category icon. Never show a broken image, never leave a gap that shifts layout. Reserve the space with a fixed aspect ratio (`aspect-square`) so the grid never reflows.

**Visual states** — driven entirely by the speak state machine:

| State | Appearance |
|---|---|
| `idle` | Normal. White bg, subtle border. |
| `playing` | Card fills with category color at low opacity. `text_ar` scales to ~1.15×. Radio-wave animation runs behind the bottom edge. |
| `failed` | Red border, red warning icon, small text "لم يصدر صوت — اعرض النص". |

Minimum touch target 88px. Generous gaps (16px). Do not cram more cards in by shrinking them.

### `WaveEffect`

Concentric arcs emanating upward from the bottom edge of the card, like a radio signal. Pure CSS keyframes (3 arcs, staggered delays, scale + fade).

**Runs only while state is `playing`.** It must be mounted/unmounted by the audio event handlers, never by a `setTimeout` or a fixed-duration animation. This is what makes it truthful.

### `BigTextOverlay`

Fires on every speak action, presets and free text alike.

- Full-screen overlay, category color background, `text_ar` in the largest type that fits (auto-shrink for long phrases), white text, centered.
- Dismisses on tap, or automatically ~1.5s after audio ends.
- On `failed` state, it does **not** auto-dismiss — it stays until tapped, and shows a small "الصوت لم يعمل" note. If sound failed, the text is now the only channel, so it must persist.

### `TopBar` (free text)

- One `<input>`, RTL, large.
- Auto-detect script: if the string contains Arabic Unicode range characters → Arabic voice; else English voice.
- One large speak button.
- Speaking also triggers `BigTextOverlay`.
- **The text persists after speaking.** It is cleared only by an explicit X inside the field, never automatically — same reasoning as the raise-hand waiting state below. The user cannot hear whether the sentence landed, so repeating it must cost one tap, not a retype.
- **No save, no history, no persistence.** Nothing survives a reload.

### `RaiseHandButton`

Fixed position, bottom-left (RTL), always visible above all content, high contrast red circle with a hand icon.

Behavior on tap:
1. Play attention chime (`/audio/_attention.mp3` — a distinct 2-second tone, not one of the phrase files).
2. Full-screen color flash, 3 pulses.
3. Enter `waiting` state: button stays highlighted/pulsing.
4. **3-second cooldown** — disabled and visibly dimmed, so a user who can't hear the chime doesn't spam it.
5. `waiting` state is cleared **manually by the user tapping it again**, never automatically. The user needs to be able to tell whether they already called for attention.

### `SignPlayer` (modal)

Opens from the card's expand icon.

- `<video src="/signs/{id}.mp4" autoplay loop muted playsinline controls>` at large size.
- Speed buttons: 0.5× / 0.75× / 1×.
- `text_ar` below at large size.
- A speak button, so the user can still speak from inside the modal.
- Close button, large, top corner.

### `CategoryChips` / `SearchBar`

- Chips: horizontal scroll, RTL, single-select, "الكل" (All) first and default. Active chip filled with its category color.
- Search: filters live across `text_ar`, `text_en`, and `keywords`. Must use the Arabic normalizer (section 8).
- Chips and search combine (AND).
- Empty result state: a message plus a button to clear filters.

### `RecentRow`

- Last 6 distinct phrases used, most recent first, from `localStorage`.
- Horizontal scroll, same `PhraseCard` component at smaller size.
- Hidden when empty, hidden while searching.
- Favorites, if any, pin above recents.

This row carries most of the real-world usage — people reuse the same handful of phrases all day. Make sure it is prominent.

### `SettingsSheet`

Small gear icon, top corner. Contains only:
- **إيقاف حركة الإشارات** — freeze all sign clips to a static poster frame (swap `<img>` src to a `.jpg` poster, or apply a CSS pause). For users who find a wall of motion overwhelming, and to save battery.
- Voice selection: male / female (if both audio sets are generated).
- Reset recents and favorites.

Do **not** bind the freeze toggle to `prefers-reduced-motion`. In this app motion is the content, not decoration.

---

## 7. Audio: `useSpeak` hook

The single most important piece of logic. Everything routes through it.

### Playback chain (graceful degradation)

```
1. Try  /audio/<id>.mp3          (pre-generated Azure, best quality)
      ↓ on error
2. Try  window.speechSynthesis   (ar-SA voice if installed)
      ↓ unavailable or errors
3. BigTextOverlay only, state = 'failed'
```

Step 3 is not a failure of the app. It is the app working correctly in a degraded environment.

### State machine

State must be derived from real audio element events, never from timers:

```js
const audio = new Audio(`/audio/${id}.mp3`);
audio.onplay    = () => setState('playing');
audio.onended   = () => setState('idle');
audio.onerror   = () => fallbackToSpeechSynthesis();
audio.onstalled = () => setState('failed');
```

For the `speechSynthesis` path, use `utterance.onstart`, `onend`, `onerror` identically.

> **Implementation note (measured, deviates from the sketch above).** In Chrome,
> `play` fires ~1ms after `play()` is called even for a file that does not exist,
> and `error` **never fires at all** for a 404 (`stalled` arrives at ~3.3s,
> `audio.error` stays `null`). Binding `playing` to `play` therefore animates
> success while the user hears nothing, which violates principle 2.
>
> The implementation binds `playing` to the **`playing`** event, treats
> `error`/`stalled` as source failures, and adds a 700ms source-selection
> deadline before degrading to `speechSynthesis`. That deadline can only ever
> downgrade a tier — it never reports that audio happened — so status is still
> derived exclusively from real events.

### Rules

- Playing a new phrase **interrupts** any currently playing one. Never queue, never overlap.
- Preload the audio element for a card on `pointerdown`, so playback starts on `pointerup` with no perceptible delay.
- Every successful speak writes to the recents list in `localStorage`.
- Every speak — success or failure — triggers `BigTextOverlay`.

---

## 8. Arabic search normalization

`src/utils/normalizeArabic.js`. Apply to **both** the search query and the searchable fields before comparing. Without this, search will appear broken to users.

```js
export function normalizeArabic(str) {
  return str
    .replace(/[ً-ٰٟ]/g, '')  // strip harakat/tashkeel
    .replace(/ـ/g, '')                 // strip tatweel ـ
    .replace(/[أإآٱ]/g, 'ا')                 // unify alef forms
    .replace(/ة/g, 'ه')                     // ta marbuta → ha
    .replace(/[ىی]/g, 'ي')                   // alef maqsura → ya
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

Precompute a normalized search blob per phrase once at app load, not on every keystroke.

---

## 9. Asset pipeline

### `scripts/encode-signs.sh`

Takes raw phone recordings from `raw/<id>.mov` and produces both output files. Skips any that already exist.

```bash
#!/bin/bash
mkdir -p public/signs
for f in raw/*.mov; do
  id=$(basename "$f" .mov)

  # Grid thumbnail — animated WebP, behaves as an image
  [ -f "public/signs/$id.webp" ] || ffmpeg -i "$f" \
    -vf "fps=12,scale=240:240:force_original_aspect_ratio=increase,crop=240:240" \
    -c:v libwebp -quality 72 -loop 0 -an "public/signs/$id.webp"

  # Expanded view — MP4
  [ -f "public/signs/$id.mp4" ] || ffmpeg -i "$f" \
    -vf "scale=720:720:force_original_aspect_ratio=increase,crop=720:720" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart -an "public/signs/$id.mp4"

  # Poster frame for the "freeze motion" setting
  [ -f "public/signs/$id.jpg" ] || ffmpeg -i "$f" -vf "select=eq(n\,0),scale=240:240" \
    -vframes 1 "public/signs/$id.jpg"
done
```

**Filming standard** (lock before shooting anything — consistency matters more than production value):
- Frame from waist to above the head. Signing space extends past the shoulders and above the head.
- **Never crop the face.** Eyebrows, mouth shape, and head tilt are grammar in sign languages, not expression.
- Mid-tone background (deep blue or teal) that contrasts with the signer's skin tone. Not white, not black.
- Signer in a solid contrasting color, long sleeves, no patterns, no watch, no rings.
- Two soft lights at 45° so hands don't shadow the face.
- Same signer, same clothes, same framing, one session.
- Trim ~200ms before movement starts, ~300ms after it settles, and **hold the final frame ~500ms before the loop repeats** — that pause is what makes a looping sign readable rather than a blur.
- Target 2–3 seconds per clip.

### `scripts/tts.js`

Generates `/public/audio/<id>.mp3` from `phrases.json` via Azure Speech.

- Voice: `ar-SA-HamedNeural` (male) or `ar-SA-ZariyahNeural` (female).
- Output format: `audio-24khz-48kbitrate-mono-mp3`.
- **Idempotent** — skips any file that already exists. Add `--force <id>` to regenerate one, and `--all` to regenerate everything.
- Reads `AZURE_KEY` and `AZURE_REGION` from `.env` (gitignored).
- Post-process each file with ffmpeg: trim leading silence, normalize loudness, light compression — a robotics lab is noisy and uneven levels lose phrases under machine noise.

```bash
ffmpeg -i raw.mp3 -af "silenceremove=start_periods=1:start_threshold=-50dB,\
loudnorm=I=-14:TP=-1.5:LRA=7,acompressor=threshold=-18dB:ratio=3" \
  -ac 1 -b:a 64k public/audio/<id>.mp3
```

**Pronunciation notes for whoever writes the phrases:**
- Do not add harakat by default. Generate plain, listen once, add harakat only to the handful that come out wrong.
- Write English technical terms **transliterated into Arabic script**, not in Latin script: `الأردوينو` not `Arduino`, `السيرفو` not `servo`. Latin script inside an Arabic voice gets mangled.

---

## 10. Vercel

### `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(signs|audio|fonts)/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

Do **not** add a SPA catch-all rewrite. It would serve `index.html` for a missing
`/audio/<id>.mp3`, and the whole degradation chain depends on that request
producing an honest 404.

### `api/speak.js` — serverless TTS proxy

Used **only** by the free-text bar, so typed text uses the same Saudi voice as the cards instead of whatever voice the device happens to have installed.

- Accepts `POST { text, lang }`.
- Calls Azure with `ar-SA-HamedNeural` or an `en-US` voice depending on `lang`.
- Returns `audio/mpeg`.
- Reads `AZURE_KEY` from Vercel environment variables. **The key must never appear in client code.**
- Rate-limit crudely (reject bodies over ~300 chars) so an open endpoint can't be abused.
- If this endpoint fails or is offline, the free-text bar falls back to `window.speechSynthesis`, then to text-only. Same degradation chain as section 7.

### PWA

`vite-plugin-pwa`, `registerType: 'autoUpdate'`. Precache: app shell, fonts, all of `/audio/`, all of `/signs/*.webp`. Leave `/signs/*.mp4` on runtime `CacheFirst` — they're larger and only used in the expanded view.

Include an install prompt hint. Installing to the home screen on bootcamp devices gives full screen, no browser chrome, and survives the wifi dying.

---

## 11. Design tokens

High contrast, large type, generous space. A workshop has bad lighting, glare, and busy hands.

```js
// tailwind.config.js — theme.extend
colors: {
  bg:        '#FFFFFF',
  surface:   '#F4F4F5',
  text:      '#18181B',
  muted:     '#71717A',
  border:    '#D4D4D8',
  danger:    '#DC2626',
  success:   '#16A34A',
},
fontFamily: {
  sans: ['"IBM Plex Sans Arabic"', 'sans-serif'],
},
```

- Category colors come from `categories.json`, not from Tailwind config, so they can be edited without a rebuild.
- Base font size 18px, phrase text on cards 24px+, `BigTextOverlay` 64px+.
- Minimum touch target 88px. Minimum gap between tappable elements 16px.
- No thin fonts, no low-contrast gray-on-gray, no hover-only affordances (touch devices have no hover).

---

## 12. Build order

Build and verify each phase before starting the next. Phase 1 alone is a usable product.

**Phase 1 — Core (build this first, then stop and test it with a real participant)**
- Vite + Tailwind + RTL + font
- `phrases.json` stub + `categories.json` stub
- `PhraseCard` grid with placeholder blocks (no assets yet)
- `useSpeak` with the full degradation chain
- `BigTextOverlay`
- `WaveEffect` bound to real audio events

**Phase 2 — Navigation**
- Category chips
- Search + Arabic normalizer
- Recents + favorites in `localStorage`

**Phase 3 — Free text + attention**
- `TopBar` with script auto-detection
- `RaiseHandButton` with chime, flash, cooldown, manual-clear waiting state
- `api/speak.js` serverless proxy

**Phase 4 — Assets**
- `scripts/tts.js`, generate all audio
- Film signs, `scripts/encode-signs.sh`, drop into `/public/signs/`
- `SignPlayer` modal with speed control
- Cards pick assets up automatically as files land — no code changes

**Phase 5 — Polish**
- PWA + offline precache
- `SettingsSheet`
- Vercel deploy + cache headers

---

## 13. Explicit non-goals for v1

Do not build these. They add surface area without serving the core need.

- Instructor → participant direction (an interpreter is present)
- User accounts, login, cloud sync
- Editing phrases from inside the UI — `phrases.json` is edited in the repo
- Analytics or usage tracking
- Multi-language UI switching
- Any animation not driven by a real audio event

---

## 14. Acceptance checks

Before considering the build done, verify each of these by hand:

- [ ] App loads and is fully usable with `/public/signs/` and `/public/audio/` completely empty
- [ ] Deleting one MP3 causes that card to fall back to `speechSynthesis`, not to break
- [ ] Turning the device volume to zero → card still shows `BigTextOverlay`; wave animation behavior is honest
- [ ] Renaming an MP3 to something invalid → card enters `failed` state with red border, overlay does not auto-dismiss
- [ ] Searching `احتاج` (no hamza) matches the phrase written `أحتاج`
- [ ] Tapping a card while another is playing interrupts it — never two voices at once
- [ ] Raise-hand cannot be fired twice within 3 seconds; waiting state persists until manually cleared
- [ ] Airplane mode after first load → everything still works
- [ ] Layout does not reflow or shift when sign clips finish loading
- [ ] Every interactive element is at least 88px and reachable one-handed
- [ ] Adding a new object to `phrases.json` makes a new card appear with zero code changes
