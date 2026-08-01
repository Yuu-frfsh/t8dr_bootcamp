import { MAX_TEXT, resolveLang, synthesize } from '../lib/tts.js';

/**
 * Serverless TTS proxy - used ONLY by the free text bar.
 *
 * Preset cards play pre-generated files from /audio (see scripts/tts.js). This
 * endpoint exists so that typed text comes out in the same Saudi voice as the
 * cards instead of whatever voice the device happens to have installed.
 *
 * AZURE_KEY is read from the environment and never leaves this function. Do not
 * prefix it with VITE_ - that would inline it into the client bundle.
 *
 * Every failure mode here is survivable: the client falls through to
 * window.speechSynthesis and then to text-only, exactly like the card path.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const key = process.env.AZURE_KEY;
  const region = process.env.AZURE_REGION;
  if (!key || !region) {
    // Not an error state for the app - the client degrades cleanly.
    return res.status(503).json({ error: 'tts not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  // Crude rate limiting: an open endpoint should not be able to bill unbounded
  // characters to the Azure account.
  if (text.length > MAX_TEXT) return res.status(413).json({ error: 'text too long' });

  const result = await synthesize({
    key,
    region,
    text,
    lang: resolveLang(body && body.lang),
  });

  if (!result.ok) {
    // The upstream detail stays in the server log; the client only needs to know
    // it should fall back.
    console.error('[api/speak] azure failed', result.status, result.error);
    return res.status(502).json({ error: 'tts upstream failed' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(result.buffer);
}
