/**
 * Normalize Arabic text for search comparison.
 *
 * Must be applied to BOTH the query and the searchable fields before comparing.
 * Without it, a user typing `احتاج` would not match a phrase written `أحتاج`,
 * and search would appear broken.
 */
export function normalizeArabic(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[ً-ٰٟ]/g, '') // strip harakat/tashkeel
    .replace(/ـ/g, '') // strip tatweel ـ
    .replace(/[أإآٱ]/g, 'ا') // unify alef forms
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/[ىی]/g, 'ي') // alef maqsura -> ya
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
