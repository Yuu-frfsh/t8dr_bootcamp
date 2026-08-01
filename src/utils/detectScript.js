// Arabic block + supplement + extended-A + presentation forms.
const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * Pick a speech language tag for free text.
 * If the string contains any Arabic-script character, treat the whole thing as
 * Arabic - mixed strings in this bootcamp are Arabic sentences with a stray
 * Latin technical term, not English sentences.
 */
export function detectLang(text) {
  return ARABIC_RANGE.test(String(text || '')) ? 'ar-SA' : 'en-US';
}

export function isArabic(text) {
  return ARABIC_RANGE.test(String(text || ''));
}
