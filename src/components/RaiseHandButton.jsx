import { useEffect, useRef, useState } from 'react';
import { Hand } from 'lucide-react';
import { playAttention } from '../utils/chime.js';

const COOLDOWN_MS = 3000;

/**
 * Call the instructor over.
 *
 * The `waiting` state is cleared ONLY by the user tapping again - never on a
 * timer. Someone who cannot hear the chime needs to be able to look at the
 * screen and tell whether they already called for attention.
 *
 * The 3 second cooldown exists for the same reason: with no audible feedback,
 * an uncertain user will otherwise tap it ten times.
 *
 * Brand purple, not red: red means "the audio did not work" everywhere else in
 * this app, and the raise-hand flash is a full-screen transient exactly like a
 * failure overlay. Two different meanings on the same colour is one too many
 * for a user who cannot hear which one happened.
 */
export default function RaiseHandButton() {
  const [waiting, setWaiting] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const cooldownRef = useRef(null);

  useEffect(() => () => clearTimeout(cooldownRef.current), []);

  const handleTap = () => {
    if (cooling) return;

    if (waiting) {
      setWaiting(false); // manual clear
      return;
    }

    playAttention();
    setFlashing(true);
    setWaiting(true);
    setCooling(true);
    clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
  };

  const label = waiting ? 'تم طلب الانتباه — اضغط للإلغاء' : 'اطلب الانتباه';

  return (
    <>
      {flashing ? (
        <div
          className="flash-screen pointer-events-none fixed inset-0 z-[70] bg-primary"
          onAnimationEnd={() => setFlashing(false)}
          aria-hidden="true"
        />
      ) : null}

      <button
        type="button"
        onClick={handleTap}
        disabled={cooling}
        aria-label={label}
        aria-pressed={waiting}
        className={[
          'fixed bottom-6 end-6 z-[65] flex items-center justify-center rounded-full',
          'bg-primary-dark text-primary-reverse shadow-2xl ring-4 ring-white transition-opacity',
          'active:scale-95 disabled:opacity-40',
          waiting && !cooling ? 'hand-waiting' : '',
        ].join(' ')}
        style={{ height: '88px', width: '88px' }}
      >
        <Hand size={44} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {waiting ? (
        <span
          className="pointer-events-none fixed bottom-2 end-2 z-[66] rounded-full bg-primary-dark px-3 py-1 text-sm font-bold text-primary-reverse shadow-lg"
          role="status"
        >
          بانتظار المدرب
        </span>
      ) : null}
    </>
  );
}
