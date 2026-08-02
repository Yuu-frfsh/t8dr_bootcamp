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

/* ------------------------------------------------------------------- chime */

/**
 * Everything shaping the sound, in one block, because this is the parameter
 * most likely to be retuned once someone hears it in an actual noisy room.
 *
 * A rising A major arpeggio played twice, not the flat alternating two-tone it
 * replaced. Three things drove the change:
 *
 * - **It has to be heard over a workshop.** Motors and chatter mask low
 *   frequencies hardest, and tablet speakers can barely produce anything below
 *   ~500 Hz anyway, so all the energy sits in the 880-1320 Hz band where
 *   hearing is most sensitive and small speakers are actually efficient.
 * - **It has to read as a person, not a fault.** Fast repetition of a fixed
 *   interval is the vocabulary of alarms - smoke detectors, microwaves,
 *   reversing trucks. A rising major figure reads as "someone is calling you",
 *   which is what this button means.
 * - **The instructor has to find WHO called.** Locating a sound leans on sharp
 *   onsets and repetition, so each note attacks in 6 ms and the whole figure
 *   plays twice, the second slightly louder.
 *
 * ~1.6 s end to end. This fires all day, so it stays short - the sustain that
 * makes it loud comes from notes overlapping, not from adding more of them.
 *
 * NOTE ON LOUDNESS: nothing here can exceed the device's own volume setting.
 * No browser exposes system volume to a page. Every knob below is about
 * getting the most out of whatever level the tablet is set to.
 */
const CHIME = {
  figure: [880, 1108.73, 1318.51], // A5, C#6, E6
  noteGap: 0.14,
  passGap: 0.18,
  passGains: [0.9, 1.0], // slight crescendo; two passes
  attack: 0.006,
  /**
   * Long relative to the note gap ON PURPOSE, so notes overlap and ring into
   * each other. Measured, this was the single biggest perceived-loudness win
   * available: +2.1 dB(A) for no extra peak level, because loudness integrates
   * over time and a sustained tone simply delivers more energy to the ear than
   * the same peaks with silence between them.
   */
  release: 0.42,
  /**
   * Partials over each note, as [ratio, level, waveform].
   *
   * The octave turns a plain electronic beep into something bell-like. The
   * twelfth is there for LOUDNESS specifically: a tablet speaker rolls off
   * steeply below ~500 Hz, so energy placed high is energy that actually
   * leaves the device. It costs almost nothing in headroom because the
   * limiter below is what sets the final level.
   */
  partials: [
    [1, 1, 'triangle'],
    [2, 0.34, 'sine'],
    [3, 0.2, 'sine'],
  ],
  /**
   * Master limiter. This, not the note gains, is what makes the chime loud.
   *
   * Nine oscillators can overlap during the crescendo, and simply turning the
   * gains up would sum past 1.0 and clip - which on a small speaker sounds
   * like a rattle, not like volume. Compressing hard and then applying makeup
   * gain raises the AVERAGE level while the peaks stay bounded, which is what
   * "louder" actually means to an ear across a noisy room.
   *
   * Compressing harder beat raising makeup gain: at threshold -14 the same
   * loudness cost 792 clipped samples.
   */
  limiter: { threshold: -24, knee: 0, ratio: 20, attack: 0.003, release: 0.15 },
  /**
   * tanh saturation, ahead of the limiter.
   *
   * This is the one that buys real loudness. Rounding the peaks off lets the
   * makeup gain come up ~20% before anything clips, and the harmonics it adds
   * land in the band the ear weights most heavily - so it wins twice.
   *
   * Do not raise it much. At `drive: 3.5` the measurement is another 1 dB(A)
   * better and the sound is a buzzer: fast saturation is the vocabulary of
   * faults and alarms, and this button means "a person is calling you". The
   * loudest setting and the right setting are not the same setting.
   */
  drive: 2.5,
  makeup: 2.5,
};

/** tanh transfer curve. Rounds peaks instead of chopping them, which is the
 *  difference between "saturated" and "broken". */
function driveCurve(k) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) curve[i] = Math.tanh(k * ((i * 2) / n - 1));
  return curve;
}

/** gain -> saturation -> limiter -> makeup -> speakers. Built per call; the
 *  button's 3s cooldown means two chimes never share a bus. */
function masterBus(ctx) {
  const input = ctx.createGain();
  input.gain.value = 1;

  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(CHIME.drive);
  // Without oversampling, tanh folds harmonics back down as aliasing - which
  // is audible here precisely because the partials already reach ~4 kHz.
  shaper.oversample = '4x';

  const limiter = ctx.createDynamicsCompressor();
  const { threshold, knee, ratio, attack, release } = CHIME.limiter;
  limiter.threshold.value = threshold;
  limiter.knee.value = knee;
  limiter.ratio.value = ratio;
  limiter.attack.value = attack;
  limiter.release.value = release;

  const makeup = ctx.createGain();
  makeup.gain.value = CHIME.makeup;

  input.connect(shaper).connect(limiter).connect(makeup).connect(ctx.destination);
  return input;
}

function strike(ctx, freq, t0, peak, out) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + CHIME.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + CHIME.release);
  gain.connect(out);

  for (const [ratio, level, type] of CHIME.partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(t0);
    osc.stop(t0 + CHIME.release + 0.04);
  }
}

/**
 * The ~1.3 second attention tone, generated in the browser.
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
    const passLength = CHIME.figure.length * CHIME.noteGap + CHIME.passGap;
    const out = masterBus(ctx);

    CHIME.passGains.forEach((peak, pass) => {
      CHIME.figure.forEach((freq, i) => {
        strike(ctx, freq, start + pass * passLength + i * CHIME.noteGap, peak, out);
      });
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * How long to wait for the recorded file before giving up and synthesizing.
 * A source-selection deadline, exactly like useSpeak's: it can only ever
 * downgrade to the synthesized tone, and never claims a sound happened.
 */
const SOURCE_DEADLINE_MS = 350;

/**
 * Try the recorded chime, fall back to the synthesized one.
 * Resolves true if *something* played. The caller shows its visual flash either
 * way - the user cannot hear the difference, so the screen has to carry it.
 *
 * Binds `playing`, NEVER `play` - the same rule useSpeak is built on, and for
 * the same measured reason. Against the absent _attention.mp3, Chrome fires
 * `play` at 2 ms and `error` only at 17 ms, so an `onplay` handler resolved
 * true first and the `synthChime()` fallback below became unreachable: the
 * raise-hand button flashed the screen and made no sound at all. `playing`
 * only fires once real audio data is being rendered.
 */
export function playAttention() {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };
    // Guard BEFORE synthesizing, not inside done(). A missing file fires both
    // `error` and a play() rejection, and `() => done(synthChime())` would
    // evaluate the chime on each - two overlapping copies phasing against each
    // other, at double the level the limiter was tuned for.
    const fallback = () => {
      if (settled) return;
      done(synthChime());
    };

    if (typeof Audio === 'undefined') return fallback();

    let audio;
    try {
      audio = new Audio(ATTENTION_SRC);
    } catch {
      return fallback();
    }

    audio.onplaying = () => done(true);
    audio.onerror = fallback;
    // Belt and braces: on a static host a missing file can 404 without ever
    // firing `error`, in which case nothing above would resolve.
    timer = setTimeout(fallback, SOURCE_DEADLINE_MS);

    let played;
    try {
      played = audio.play();
    } catch {
      return fallback();
    }
    if (played && typeof played.catch === 'function') played.catch(fallback);
  });
}
