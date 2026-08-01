/**
 * Category colors live in categories.json (editable without a rebuild), so they
 * arrive as hex strings and are applied as inline styles rather than Tailwind
 * classes. These helpers turn one hex into the variants a card needs.
 */
export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(113, 113, 122, ${alpha})`; // muted fallback

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pick black or white text for a given background, using perceived luminance.
 * Keeps contrast readable whatever colors end up in categories.json.
 */
export function readableTextOn(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#FFFFFF';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#18181B' : '#FFFFFF';
}
