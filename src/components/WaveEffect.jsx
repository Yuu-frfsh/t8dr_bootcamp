/**
 * Concentric arcs rising from the bottom edge of a card, like a radio signal.
 *
 * This component is mounted only while status === 'playing', and that status
 * comes from a real `play` event. It is never mounted on a timer - that is what
 * makes it truthful for a user who cannot hear the output.
 */
export default function WaveEffect({ color = '#7D63AB' }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="wave-arc"
          style={{ borderColor: color, animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </div>
  );
}
