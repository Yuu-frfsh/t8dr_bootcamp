import { SpeakContext, useSpeakEngine } from '../hooks/useSpeak.js';

/**
 * One engine for the whole app.
 *
 * Playback never overlaps (SPEC section 7: interrupt, never queue), so a single
 * global { activeId, status } is enough state for every card - each one derives
 * its own appearance with `activeId === phrase.id ? status : 'idle'`.
 *
 * This module exports ONLY a component, so React Fast Refresh can hot-swap it.
 * The `useSpeak` consumer hook lives in hooks/useSpeak.js for that reason -
 * do not move it back here.
 */
export function SpeakProvider({ children }) {
  const engine = useSpeakEngine();
  return <SpeakContext.Provider value={engine}>{children}</SpeakContext.Provider>;
}
