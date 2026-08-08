import { useEffect, useRef, useState } from 'react';

/**
 * True while the user is scrolling DOWN, false again the moment they scroll up.
 *
 * Used to collapse the free-text bar so the sticky header keeps only what you
 * scroll *for* - the filters and the search. Reveal-on-scroll-up rather than
 * reveal-only-at-the-top matters here: this is a one-handed tablet app, and
 * making someone flick to the very top of 30 cards to type a sentence is worse
 * than the header they were trying to get rid of.
 *
 * `threshold` swallows the jitter of a finger resting on a touch screen. The
 * accumulated delta is deliberately NOT reset below it, so a slow deliberate
 * drag still crosses eventually instead of being ignored forever.
 *
 * `revealAbove` keeps the bar open near the top of the page, where there is
 * nothing to gain by hiding it, and covers iOS rubber-band negative scrollY.
 */
export function useHideOnScroll({ threshold = 12, revealAbove = 96, settleMs = 350 } = {}) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastY = useRef(0);
  const settledAt = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    lastY.current = window.scrollY;
    let frame = 0;

    const apply = (next) => {
      if (next === hiddenRef.current) return;
      hiddenRef.current = next;
      // Collapsing changes layout ABOVE the viewport, so the browser's scroll
      // anchoring shifts scrollY to keep the view steady. That shift is
      // indistinguishable from a real scroll of the same size, so without this
      // window the bar re-collapsed the instant it opened: reveal -> anchor
      // pushes scrollY down -> reads as scrolling down -> hide -> repeat.
      settledAt.current = performance.now() + settleMs;
      setHidden(next);
    };

    // Read in a rAF rather than in the listener: scroll fires far more often
    // than the screen repaints, and window.scrollY forces layout.
    const measure = () => {
      frame = 0;
      const y = window.scrollY;

      // Keep the baseline current while ignoring the anchoring correction, so
      // the first real gesture after the animation measures from where the
      // page actually ended up.
      if (performance.now() < settledAt.current) {
        lastY.current = y;
        return;
      }

      if (y <= revealAbove) {
        lastY.current = y;
        apply(false);
        return;
      }

      const dy = y - lastY.current;
      if (Math.abs(dy) < threshold) return;

      lastY.current = y;
      apply(dy > 0);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold, revealAbove, settleMs]);

  return hidden;
}
