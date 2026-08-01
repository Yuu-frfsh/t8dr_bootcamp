import { VolumeX } from 'lucide-react';
import { readableTextOn } from '../utils/color.js';

/**
 * Fires on every speak action - presets and free text, success and failure.
 *
 * Text is the guaranteed path. If the speaker is muted, broken, or drowned out
 * by a drill, this is what actually lands, so it opens synchronously and never
 * waits on audio.
 *
 * Dismissal is handled by the engine: ~1.5s after a real `ended` event on
 * success, never on failure. A failed speak leaves this on screen until the
 * user taps it, because the text is then the only channel left.
 */

// Length-based auto-shrink. Deterministic, no measure-and-reflow loop, and it
// cannot leave a phrase clipped off the edge of the screen.
function fontSizeFor(text) {
  const len = Array.from(String(text || '')).length;
  if (len <= 8) return 'clamp(3.5rem, 18vw, 11rem)';
  if (len <= 16) return 'clamp(3rem, 13vw, 8rem)';
  if (len <= 28) return 'clamp(2.5rem, 10vw, 6rem)';
  if (len <= 50) return 'clamp(2rem, 7.5vw, 4.5rem)';
  return 'clamp(1.75rem, 5.5vw, 3.5rem)';
}

export default function BigTextOverlay({ overlay, onDismiss }) {
  if (!overlay) return null;

  const failed = overlay.status === 'failed';
  const background = failed ? '#DC2626' : overlay.color || '#18181B';
  const foreground = readableTextOn(background);

  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-live="assertive"
      aria-label="إغلاق"
      className="overlay-in fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ backgroundColor: background, color: foreground }}
    >
      <span className="font-bold leading-[1.15]" style={{ fontSize: fontSizeFor(overlay.text_ar) }}>
        {overlay.text_ar}
      </span>

      {overlay.text_en ? (
        <span className="text-xl opacity-80 sm:text-2xl" dir="ltr">
          {overlay.text_en}
        </span>
      ) : null}

      {failed ? (
        <span className="mt-2 flex items-center gap-2 rounded-full bg-black/25 px-5 py-3 text-lg font-bold">
          <VolumeX size={24} aria-hidden="true" />
          الصوت لم يعمل
        </span>
      ) : null}

      <span className="absolute bottom-8 text-base opacity-70">اضغط للإغلاق</span>
    </button>
  );
}
