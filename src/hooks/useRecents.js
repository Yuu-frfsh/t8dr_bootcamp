import { useCallback, useMemo } from 'react';
import { useLocalStorage, asStringArray } from './useLocalStorage.js';

export const MAX_RECENTS = 6;
const RECENTS_KEY = 't8dr.recents';
const FAVORITES_KEY = 't8dr.favorites';

/**
 * Recents and favorites - the row that carries most real-world usage, because
 * people reuse the same handful of phrases all day.
 *
 * Stores ids only, never phrase text, so rewriting phrases.json between
 * bootcamp days does not resurrect stale wording. Ids that no longer exist are
 * dropped at lookup time.
 */
export function useRecents() {
  const [recents, setRecents] = useLocalStorage(RECENTS_KEY, [], asStringArray);
  const [favorites, setFavorites] = useLocalStorage(FAVORITES_KEY, [], asStringArray);

  const pushRecent = useCallback(
    (id) => {
      if (!id) return;
      setRecents((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
        const unchanged = next.length === prev.length && next.every((v, i) => v === prev[i]);
        return unchanged ? prev : next;
      });
    },
    [setRecents]
  );

  const toggleFavorite = useCallback(
    (id) => {
      if (!id) return;
      setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [setFavorites]
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const isFavorite = useCallback((id) => favoriteSet.has(id), [favoriteSet]);

  const reset = useCallback(() => {
    setRecents([]);
    setFavorites([]);
  }, [setRecents, setFavorites]);

  return { recents, favorites, pushRecent, toggleFavorite, isFavorite, reset };
}

/** Resolve stored ids to live phrase objects, dropping any that were deleted. */
export function resolveIds(ids, byId) {
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
