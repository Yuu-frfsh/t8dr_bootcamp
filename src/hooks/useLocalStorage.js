import { useEffect, useState } from 'react';

/**
 * JSON-backed localStorage state.
 * Every read is guarded: private-browsing modes, full quotas and hand-edited
 * values must degrade to the default rather than blank the app.
 */
export function useLocalStorage(key, initial, sanitize) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      return sanitize ? sanitize(parsed, initial) : parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable - the app still works, it just forgets */
    }
  }, [key, value]);

  return [value, setValue];
}

export function asStringArray(parsed, fallback) {
  if (!Array.isArray(parsed)) return fallback;
  return parsed.filter((x) => typeof x === 'string');
}
