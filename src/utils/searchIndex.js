import { normalizeArabic } from './normalizeArabic.js';
import categories from '../data/categories.json';

export const ALL_CATEGORY = 'all';
const DEFAULT_PRIORITY = 99;

// Category order comes from categories.json, so reordering that file reorders
// the "all" view with no code change.
const CATEGORY_ORDER = new Map(categories.map((c, i) => [c.id, i]));

/**
 * One normalized blob per phrase, computed once per phrases array rather than
 * on every keystroke. Keyed weakly so tests can pass their own arrays without
 * leaking or colliding.
 */
const blobCache = new WeakMap();

function buildBlobs(phrases) {
  const map = new Map();
  for (const p of phrases) {
    const parts = [p.text_ar, p.text_en, ...(Array.isArray(p.keywords) ? p.keywords : [])];
    map.set(p.id, normalizeArabic(parts.filter(Boolean).join(' ')));
  }
  return map;
}

export function getBlobs(phrases) {
  let blobs = blobCache.get(phrases);
  if (!blobs) {
    blobs = buildBlobs(phrases);
    blobCache.set(phrases, blobs);
  }
  return blobs;
}

export function sortPhrases(phrases) {
  return [...phrases].sort((a, b) => {
    const catA = CATEGORY_ORDER.has(a.category) ? CATEGORY_ORDER.get(a.category) : Number.MAX_SAFE_INTEGER;
    const catB = CATEGORY_ORDER.has(b.category) ? CATEGORY_ORDER.get(b.category) : Number.MAX_SAFE_INTEGER;
    if (catA !== catB) return catA - catB;

    const prioA = typeof a.priority === 'number' ? a.priority : DEFAULT_PRIORITY;
    const prioB = typeof b.priority === 'number' ? b.priority : DEFAULT_PRIORITY;
    if (prioA !== prioB) return prioA - prioB;

    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Category chip and search query combine with AND.
 * Every query token must appear somewhere in the phrase's normalized blob, so
 * multi-word queries narrow rather than widen.
 */
export function filterPhrases(phrases, query = '', categoryId = ALL_CATEGORY) {
  const list = Array.isArray(phrases) ? phrases : [];
  const blobs = getBlobs(list);

  const byCategory =
    !categoryId || categoryId === ALL_CATEGORY
      ? list
      : list.filter((p) => p.category === categoryId);

  const tokens = normalizeArabic(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return sortPhrases(byCategory);

  const matched = byCategory.filter((p) => {
    const blob = blobs.get(p.id) ?? '';
    return tokens.every((t) => blob.includes(t));
  });

  return sortPhrases(matched);
}
