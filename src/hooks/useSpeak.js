import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { detectLang } from '../utils/detectScript.js';

/**
 * The speak engine. Everything that makes sound routes through here.
 *
 * Degradation chain (SPEC section 7):
 *   1. /audio/<id>.mp3          pre-generated, best quality
 *   2. window.speechSynthesis   whatever voice the device has
 *   3. text only, status='failed'
 *
 * Step 3 is not a bug. It is the app working correctly in a degraded venue.
 *
 * Status is derived from real media events only - never from a timer - because
 * the user cannot hear whether audio actually happened. A `playing` card that
 * was animated by a setTimeout would be a lie.
 */

export const FREE_TEXT_ID = '__free__';
export const OVERLAY_LINGER_MS = 1500;
export const MAX_FREE_TEXT = 300; // must match the limit in api/speak.js

const PRELOAD_MAX = 12;

/**
 * How long to wait for an audio file to actually start before giving up on it
 * and using speechSynthesis instead.
 *
 * This is a SOURCE-SELECTION deadline, not a state timer: it can only ever
 * downgrade to a lesser tier, never claim that audio happened. Status still
 * comes exclusively from real media events.
 *
 * It is necessary because Chrome does not report a missing audio file as an
 * error at all - measured behaviour for a 404 is `play` and `waiting` at 1ms,
 * `stalled` at ~3.3s, and `error` never. Waiting 3.3s for the fallback would be
 * three seconds of dead air on the app's default zero-assets configuration.
 *
 * It answers exactly one question - "is there a file here at all?" - and is
 * cancelled the moment the file announces a duration. It must never be the
 * thing that gives up on a file that demonstrably exists; see
 * BUFFER_DEADLINE_MS.
 */
const SOURCE_DEADLINE_MS = 700;

/**
 * The budget AFTER the file has proven it exists, for it to actually start.
 *
 * These are two different questions and they had been sharing one timer. A file
 * that exists but is slow - a longer phrase, a cold cache, venue wifi - looked
 * exactly like a 404 to the 700ms deadline, so the longest phrases fell to the
 * device voice while the shorter ones played their Azure MP3. Worse, that
 * counted as proof of absence and blacklisted the id for the rest of the
 * session, so those cards NEVER recovered.
 *
 * Once `duration` is known, absence is ruled out, so waiting longer is free -
 * the only cost of a slow file is latency, and the alternative was the wrong
 * voice permanently.
 */
const BUFFER_DEADLINE_MS = 2500;

/**
 * Ids whose audio file has already proven absent this session. Lets the second
 * and later taps of a phrase skip straight to speechSynthesis instead of
 * re-waiting the deadline, and stops the app re-requesting known 404s.
 * In-memory only: a reload re-probes, which is the right behaviour after a
 * deploy that adds the files.
 *
 * Only ever written on evidence of ABSENCE - never because a real file was
 * slow. A wrong entry here is permanent for the session.
 */
const knownMissing = new Set();

export function audioUrl(id) {
  return `/audio/${encodeURIComponent(id)}.mp3`;
}

/* ------------------------------------------------------------------ voices */

let voicesPromise = null;

function voicesNow() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth || typeof synth.getVoices !== 'function') return [];
  try {
    return synth.getVoices() || [];
  } catch {
    return [];
  }
}

/**
 * Voices load asynchronously. Calling speak() before they exist silently does
 * nothing on several browsers, so warm them once and cache the promise.
 * The timeout is a resource-loading guard, not an animation timer - some
 * browsers never fire `voiceschanged` at all.
 */
export function ensureVoices() {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return resolve([]);

    const immediate = voicesNow();
    if (immediate.length) return resolve(immediate);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        synth.removeEventListener('voiceschanged', finish);
      } catch {
        /* no-op */
      }
      resolve(voicesNow());
    };
    try {
      synth.addEventListener('voiceschanged', finish, { once: true });
    } catch {
      /* no-op */
    }
    setTimeout(finish, 1200);
  });
  return voicesPromise;
}

/**
 * Prefer an exact lang match, then any voice sharing the base language.
 * Returning null means "use the device default" - per the product decision we
 * still speak, because noise that draws the instructor over is worth more than
 * silence, and the big text carries the actual message either way.
 */
export function pickVoice(voices, lang) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const want = String(lang || '').toLowerCase().replace('_', '-');
  const base = want.slice(0, 2);
  const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');

  return (
    voices.find((v) => norm(v) === want) ||
    voices.find((v) => norm(v).startsWith(base)) ||
    null
  );
}

/* ----------------------------------------------------------------- preload */

// Primed on pointerdown so playback starts on pointerup with no audible delay.
const preloadCache = new Map();

export function preloadAudio(id) {
  if (!id || id === FREE_TEXT_ID || preloadCache.has(id)) return;
  if (typeof Audio === 'undefined') return;
  try {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = audioUrl(id);
    audio.load();
    preloadCache.set(id, audio);
    if (preloadCache.size > PRELOAD_MAX) {
      const oldest = preloadCache.keys().next().value;
      preloadCache.delete(oldest);
    }
  } catch {
    /* preloading is an optimization; never let it break a tap */
  }
}

/* ------------------------------------------------------------------ engine */

export function useSpeakEngine() {
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [overlay, setOverlay] = useState(null);

  const genRef = useRef(0);
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const utterRef = useRef(null);
  const abortRef = useRef(null);
  const dismissRef = useRef(null);
  const deadlineRef = useRef(null);

  useEffect(() => {
    ensureVoices();
  }, []);

  const clearDismiss = useCallback(() => {
    if (dismissRef.current) {
      clearTimeout(dismissRef.current);
      dismissRef.current = null;
    }
  }, []);

  const clearDeadline = useCallback(() => {
    if (deadlineRef.current) {
      clearTimeout(deadlineRef.current);
      deadlineRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    clearDeadline();
    const audio = audioRef.current;
    if (audio) {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* no-op */
      }
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        /* no-op */
      }
      objectUrlRef.current = null;
    }
  }, [clearDeadline]);

  const stopAll = useCallback(() => {
    releaseAudio();
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        /* no-op */
      }
      abortRef.current = null;
    }
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (synth) {
      try {
        synth.cancel();
      } catch {
        /* no-op */
      }
    }
    utterRef.current = null;
  }, [releaseAudio]);

  useEffect(
    () => () => {
      clearDismiss();
      stopAll();
    },
    [clearDismiss, stopAll]
  );

  const run = useCallback(
    (target) => {
      // Every speak invalidates the one before it. Handlers from the previous
      // attempt check this token before touching state - without it,
      // speechSynthesis.cancel() fires onerror('interrupted') on the OLD
      // utterance and paints the NEW card red.
      const gen = ++genRef.current;
      const alive = () => genRef.current === gen;

      clearDismiss();
      stopAll();

      const overlayFor = (status) => ({
        id: target.id,
        text_ar: target.text_ar,
        text_en: target.text_en || '',
        color: target.color || '#7D63AB',
        status,
      });

      /**
       * Free text raises the overlay on every speak; a card only raises it when
       * something goes wrong.
       *
       * The overlay exists because the user cannot hear the output, so a speak
       * needs visual confirmation (principle 2) and the text has to survive a
       * silent failure (principle 3). A card already satisfies the first half
       * by itself - it lights up, scales its text and runs the wave - so the
       * full-screen takeover was only carrying the failure case, at the cost of
       * hiding the grid on every successful tap. Free text has no card to
       * animate, so for it the overlay IS the confirmation.
       *
       * Failure still takes over the screen from either path. See markFailed.
       */
      const overlayOnSpeak = target.id === FREE_TEXT_ID;

      // Text first, synchronously, before any audio is attempted.
      // It is the guaranteed channel; it must never wait on the speaker.
      //
      // The else-branch matters: a card tap used to REPLACE the overlay every
      // time, so a failed one could never outlive the next speak. Now that a
      // card raises none on success, it has to clear the old one explicitly or
      // a stale red overlay from a previous failure would sit over the grid.
      if (overlayOnSpeak) setOverlay(overlayFor('idle'));
      else setOverlay(null);
      setActiveId(target.id);
      setStatus('idle');

      const markPlaying = () => {
        if (!alive()) return;
        setStatus('playing');
        setOverlay((o) => (o ? { ...o, status: 'playing' } : o));
      };

      const markDone = () => {
        if (!alive()) return;
        setStatus('idle');
        setActiveId(null);
        setOverlay((o) => (o ? { ...o, status: 'idle' } : o));
        clearDismiss();
        // Anchored to a real `ended` event, not a guess at how long audio lasts.
        dismissRef.current = setTimeout(() => {
          if (alive()) setOverlay(null);
        }, OVERLAY_LINGER_MS);
      };

      const markFailed = () => {
        if (!alive()) return;
        setStatus('failed');
        // No dismiss timer: with no sound, the text is the only channel left,
        // so it stays until the user taps it away. The card also stays red
        // until the next speak, so the user can see WHICH phrase failed.
        //
        // RAISES the overlay rather than only updating it. A card tap does not
        // open one on success, so on failure there is nothing here to update -
        // and this is the exact case the overlay was built for: the sound did
        // not happen and the user has no way to hear that.
        setOverlay((o) => (o ? { ...o, status: 'failed' } : overlayFor('failed')));
      };

      /* ---- step 2: speechSynthesis ---- */

      const speakWith = (voices) => {
        if (!alive()) return;
        const synth = window.speechSynthesis;
        // `speech`, not `text_ar`: the voiced (harakat) variant when a phrase
        // has one. What is spoken and what is displayed are different strings
        // on purpose - see `speech_ar` in phrases.json.
        const text = String(target.speech || target.text_ar || '').trim();
        if (!synth || !text) return markFailed();

        let utterance;
        try {
          utterance = new window.SpeechSynthesisUtterance(text);
        } catch {
          return markFailed();
        }

        utterance.lang = target.lang || 'ar-SA';
        const voice = pickVoice(voices, utterance.lang);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Chrome garbage-collects unreferenced utterances mid-speech, which
        // truncates the phrase. Hold the reference until we're done with it.
        utterRef.current = utterance;

        let phase = 'pending';
        utterance.onstart = () => {
          if (!alive()) return;
          phase = 'started';
          markPlaying();
        };
        utterance.onend = () => {
          if (!alive()) return;
          // `end` without `start` means nothing was ever heard.
          if (phase === 'started') markDone();
          else markFailed();
        };
        utterance.onerror = (event) => {
          if (!alive()) return;
          const reason = event && event.error;
          // These are our own interrupts, not failures.
          if (reason === 'interrupted' || reason === 'canceled') return;
          markFailed();
        };

        try {
          // Chrome can get wedged in a paused state after repeated cancels.
          if (synth.paused) synth.resume();
          synth.speak(utterance);
        } catch {
          markFailed();
        }
      };

      const trySynthesis = () => {
        if (!alive()) return;
        const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
        const hasUtterance = typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
        if (!synth || !hasUtterance) return markFailed();

        const cached = voicesNow();
        if (cached.length) return speakWith(cached);
        ensureVoices().then((voices) => {
          if (alive()) speakWith(voices);
        });
      };

      /* ---- step 1: an audio file ---- */

      const attachAndPlay = (audio, onFallback, missingKey) => {
        if (!alive()) return;
        audioRef.current = audio;

        let phase = 'pending';
        // Set once the file reports a duration, which only a file that exists
        // can do. Separates "there is nothing here" from "this is taking a
        // while", which the single deadline used to conflate.
        let sourceConfirmed = false;

        const fallback = () => {
          if (!alive() || phase !== 'pending') return;
          phase = 'fell-back';
          // Blacklist on absence only. A file that announced a duration is
          // there; it was slow, and it gets a clean chance on the next tap
          // rather than being condemned to the device voice for the session.
          if (missingKey && !sourceConfirmed) knownMissing.add(missingKey);
          releaseAudio();
          onFallback();
        };

        // `loadedmetadata` is the proof-of-existence signal. `durationchange`
        // is a second chance at it, because a preloaded element may already
        // have fired `loadedmetadata` before these handlers were attached.
        const confirmSource = () => {
          if (!alive() || phase !== 'pending' || sourceConfirmed) return;
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          sourceConfirmed = true;
          clearDeadline();
          deadlineRef.current = setTimeout(fallback, BUFFER_DEADLINE_MS);
        };
        audio.onloadedmetadata = confirmSource;
        audio.ondurationchange = confirmSource;

        // `playing`, NOT `play`. Chrome fires `play` the instant play() is
        // called - measured at 1ms even for a file that does not exist - so it
        // means "not paused", not "audio is happening". `playing` fires only
        // once real data is being rendered. Using `play` here would light up
        // the card and run the wave animation for a user who is hearing
        // nothing, which is the exact failure this app must never have.
        audio.onplaying = () => {
          if (!alive() || phase !== 'pending') return;
          phase = 'started';
          clearDeadline();
          markPlaying();
        };

        audio.onended = () => {
          if (!alive() || phase !== 'started') return;
          phase = 'ended';
          markDone();
        };

        const onBadSource = () => {
          if (!alive()) return;
          // Before playback: still recoverable, degrade to synthesis.
          // Mid-phrase: not recoverable - the instructor heard half a sentence,
          // so say so rather than pretend it completed.
          if (phase === 'pending') fallback();
          else if (phase === 'started') markFailed();
        };
        audio.onerror = onBadSource;
        audio.onstalled = onBadSource;

        // A preloaded element that already failed will not re-fire `error`.
        if (audio.error) return fallback();

        try {
          audio.currentTime = 0;
        } catch {
          /* no-op */
        }

        // Deliberately AFTER currentTime is reset: seeking a preloaded element
        // can itself fire `durationchange`, and confirming here means one
        // consistent path whether the metadata arrived before or after these
        // handlers were attached.
        confirmSource();

        let played;
        try {
          played = audio.play();
        } catch {
          return fallback();
        }
        // play() rejects (NotAllowedError / NotSupportedError) independently of
        // the error event. The `phase` guard makes sure only one of them wins.
        if (played && typeof played.catch === 'function') played.catch(fallback);

        // Chrome never reports a 404 as an error and only stalls after ~3.3s.
        // Stop waiting well before that; see SOURCE_DEADLINE_MS.
        //
        // Only arm this if existence is still an open question. If the file
        // already confirmed its duration it is on the longer BUFFER deadline,
        // and re-arming the short one here would drop it straight back into the
        // bug this pair of timers exists to fix.
        if (!sourceConfirmed) {
          clearDeadline();
          deadlineRef.current = setTimeout(fallback, SOURCE_DEADLINE_MS);
        }
      };

      const tryFile = () => {
        // Already proven absent this session - do not pay the deadline again.
        if (typeof Audio === 'undefined' || knownMissing.has(target.id)) return trySynthesis();
        let audio;
        try {
          audio = preloadCache.get(target.id) || new Audio(audioUrl(target.id));
        } catch {
          return trySynthesis();
        }
        attachAndPlay(audio, trySynthesis, target.id);
      };

      /* ---- step 0 (free text only): the Azure proxy ---- */

      const tryProxy = () => {
        if (typeof fetch !== 'function' || typeof Audio === 'undefined') return trySynthesis();

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        abortRef.current = controller;

        fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: target.text_ar, lang: target.lang || 'ar-SA' }),
          signal: controller ? controller.signal : undefined,
        })
          .then((res) => {
            const type = res.headers.get('content-type') || '';
            // Offline, no AZURE_KEY, or running `vite dev` with no serverless
            // runtime all land here. All of them are supported states.
            if (!res.ok || !type.includes('audio')) throw new Error(`speak proxy unavailable (${res.status})`);
            return res.blob();
          })
          .then((blob) => {
            if (!alive()) return;
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            attachAndPlay(new Audio(url), trySynthesis);
          })
          .catch(() => {
            if (alive()) trySynthesis();
          });
      };

      if (target.id === FREE_TEXT_ID) tryProxy();
      else tryFile();
    },
    [clearDismiss, clearDeadline, stopAll, releaseAudio]
  );

  /* ------------------------------------------------------------ public API */

  const speak = useCallback(
    (phrase, category) => {
      if (!phrase || !phrase.text_ar) return;
      run({
        id: phrase.id,
        text_ar: phrase.text_ar,
        // Spoken, never displayed. Falls back to the display text, so a phrase
        // without a pronunciation problem needs no extra field.
        speech: phrase.speech_ar || phrase.text_ar,
        text_en: phrase.text_en,
        color: category && category.color,
        lang: 'ar-SA',
      });
    },
    [run]
  );

  const speakText = useCallback(
    (text) => {
      const trimmed = String(text || '').trim().slice(0, MAX_FREE_TEXT);
      if (!trimmed) return;
      run({
        id: FREE_TEXT_ID,
        text_ar: trimmed,
        speech: trimmed,
        text_en: '',
        // Free text has no category, so it wears the brand colour.
        color: '#7D63AB',
        lang: detectLang(trimmed),
      });
    },
    [run]
  );

  const dismissOverlay = useCallback(() => {
    clearDismiss();
    setOverlay(null);
  }, [clearDismiss]);

  return {
    activeId,
    status,
    overlay,
    speak,
    speakText,
    dismissOverlay,
    preload: preloadAudio,
  };
}

/* ----------------------------------------------------------------- context */

/**
 * The context object and its consumer hook live here rather than next to
 * <SpeakProvider>. React Fast Refresh only works on modules that export
 * components exclusively, so mixing this hook in with the provider would
 * force a full page reload - and lose all state - on every edit.
 */
export const SpeakContext = createContext(null);

export function useSpeak() {
  const ctx = useContext(SpeakContext);
  if (!ctx) throw new Error('useSpeak must be used inside <SpeakProvider>');
  return ctx;
}
