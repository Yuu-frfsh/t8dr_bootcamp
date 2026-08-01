import { useState } from 'react';

/**
 * Bootcamp identity: host logo, then the bootcamp name.
 *
 * Deliberately NOT sticky. The stack below this (free text, chips, search)
 * already owns ~270px on a phone, which is most of the fold; branding is
 * identity, not function, so it scrolls away and gives that height back to the
 * cards. It is the first thing on screen at load, which is when anyone actually
 * looks at it.
 *
 * White, not brand purple: this sits directly above a white sticky bar, and a
 * coloured slab there competed with the cards for attention. The colour belongs
 * on the things that DO something.
 *
 * `width`/`height` match the file so the row reserves its space before the
 * image decodes - the same no-reflow rule the sign area follows. If the logo is
 * ever missing the host name renders as text instead; a missing asset is a
 * normal state here, not an error.
 *
 * The name WRAPS rather than truncating. At 360px - an ordinary Android width -
 * a single line clipped it to "معسكر تقدر للروبو...", and the bootcamp name is
 * the one thing this bar exists to say. Two lines on a narrow phone costs a few
 * pixels that scroll away anyway; an ellipsis costs the name.
 */
const LOGO_SRC = '/logo.png';
const LOGO_W = 197;
const LOGO_H = 70;

export default function BrandHeader({
  bootcampName = 'معسكر تقدر للروبوتات',
  hostName = 'تقدر',
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="flex items-center gap-2.5 border-b-2 border-border bg-white px-4 py-2.5">
      {!logoFailed ? (
        <img
          src={LOGO_SRC}
          alt={hostName}
          width={LOGO_W}
          height={LOGO_H}
          className="h-8 w-auto shrink-0"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="shrink-0 text-xl font-bold text-primary">{hostName}</span>
      )}

      <span className="h-8 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* min-w-0 so the text wraps inside its share of the row rather than
          pushing the logo off the start edge. */}
      <h1 className="min-w-0 flex-1 text-lg font-bold leading-tight text-text">{bootcampName}</h1>
    </div>
  );
}
