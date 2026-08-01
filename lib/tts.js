/**
 * Azure Speech synthesis, shared by the serverless endpoint (api/speak.js) and
 * the batch generator (scripts/tts.js).
 *
 * Both paths must produce the SAME voice: a card and a typed sentence spoken
 * back to back should not switch speakers. Keeping the voice table and the SSML
 * builder in one module is the only way that stays true as either side changes.
 *
 * Nothing here reads process.env - callers pass the credential in. That keeps
 * the key handling visible at the call site instead of buried in a helper, and
 * it is what lets the generator run from a shell while the endpoint reads the
 * platform environment.
 */

export const MAX_TEXT = 300; // must match MAX_FREE_TEXT in src/hooks/useSpeak.js

// 24kHz/48kbps mono is the smallest format that still sounds like a person
// across a noisy workshop. These files ship in the repo, so size matters.
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

export const VOICES = {
  'ar-SA': 'ar-SA-HamedNeural',
  'en-US': 'en-US-AndrewNeural',
};

/** Anything not Arabic falls to the English voice. */
export function resolveLang(lang) {
  return String(lang || 'ar-SA').startsWith('ar') ? 'ar-SA' : 'en-US';
}

export function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSsml(text, lang) {
  const resolved = resolveLang(lang);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${resolved}">` +
    `<voice name="${VOICES[resolved]}">${escapeXml(text)}</voice>` +
    `</speak>`
  );
}

/**
 * Returns { ok, status, buffer } or { ok: false, status, error }.
 *
 * Never throws: every caller treats a failure as "fall back to something else",
 * so an exception here would only ever be converted back into a status.
 */
export async function synthesize({ key, region, text, lang, signal }) {
  const ssml = buildSsml(text, lang);
  try {
    const upstream = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 't8dr-bootcamp',
        },
        body: ssml,
        signal,
      }
    );

    if (!upstream.ok) {
      let detail = '';
      try {
        detail = (await upstream.text()).slice(0, 200);
      } catch {
        /* body already consumed or empty - the status is enough */
      }
      return { ok: false, status: upstream.status, error: detail || `upstream ${upstream.status}` };
    }

    return { ok: true, status: 200, buffer: Buffer.from(await upstream.arrayBuffer()) };
  } catch (err) {
    return { ok: false, status: 502, error: err && err.message ? err.message : 'request failed' };
  }
}
