/**
 * Serverless TTS proxy - used ONLY by the free text bar.
 *
 * Preset cards play pre-generated files from /audio. This endpoint exists so
 * that typed text comes out in the same Saudi voice as the cards instead of
 * whatever voice the device happens to have installed.
 *
 * AZURE_KEY is read from the environment and never leaves this function. Do not
 * prefix it with VITE_ - that would inline it into the client bundle.
 *
 * Every failure mode here is survivable: the client falls through to
 * window.speechSynthesis and then to text-only, exactly like the card path.
 */

const MAX_TEXT = 300; // must match MAX_FREE_TEXT in src/hooks/useSpeak.js
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

const VOICES = {
  'ar-SA': 'ar-SA-HamedNeural',
  'en-US': 'en-US-AndrewNeural',
};

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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

  const lang = String((body && body.lang) || 'ar-SA').startsWith('ar') ? 'ar-SA' : 'en-US';
  const voice = VOICES[lang];

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">` +
    `<voice name="${voice}">${escapeXml(text)}</voice>` +
    `</speak>`;

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
      }
    );

    if (!upstream.ok) {
      return res.status(502).json({ error: `tts upstream failed (${upstream.status})` });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch {
    return res.status(502).json({ error: 'tts request failed' });
  }
}
