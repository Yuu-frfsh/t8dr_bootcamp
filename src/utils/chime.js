const ATTENTION_SRC = '/audio/_attention.mp3';

let audioContext = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    if (!audioContext) audioContext = new AC();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * A four-beep, ~2 second attention tone generated in the browser.
 *
 * /audio/_attention.mp3 does not exist until the phase-4 asset pass, but the
 * raise-hand button has to make noise on day one - "missing assets are normal"
 * (principle 5). This is that guarantee.
 */
export function synthChime() {
  const ctx = getContext();
  if (!ctx) return false;
  try {
    const start = ctx.currentTime + 0.02;
    const notes = [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.5 },
      { freq: 880, at: 1.0 },
      { freq: 1174.66, at: 1.5 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note.freq;

      const t0 = start + note.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Try the recorded chime, fall back to the synthesized one.
 * Resolves true if *something* played. The caller shows its visual flash either
 * way - the user cannot hear the difference, so the screen has to carry it.
 */
export function playAttention() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    if (typeof Audio === 'undefined') return done(synthChime());

    let audio;
    try {
      audio = new Audio(ATTENTION_SRC);
    } catch {
      return done(synthChime());
    }

    audio.onplay = () => done(true);
    audio.onerror = () => done(synthChime());

    let played;
    try {
      played = audio.play();
    } catch {
      return done(synthChime());
    }
    if (played && typeof played.catch === 'function') played.catch(() => done(synthChime()));
  });
}
