import { useState } from 'react';

/**
 * Bootcamp identity: host logo, the bootcamp name, then the app's own mark.
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
 * The name WRAPS rather than truncating. At 360px - an ordinary Android width -
 * a single line clipped it to "معسكر تقدر للروبو...", and the bootcamp name is
 * the one thing this bar exists to say. Two lines on a narrow phone costs a few
 * pixels that scroll away anyway; an ellipsis costs the name.
 *
 * The تواصل mark is last in source order, which puts it at the far LEFT of the
 * row - this document is RTL, so the end edge is the left one. It is separated
 * from the name by `flex-1` on the heading rather than by a spacer, so the two
 * logos stay pinned to their own edges at every width.
 */

/**
 * `width`/`height` match the files so each slot reserves its space before the
 * image decodes - the same no-reflow rule the sign area follows.
 *
 * logo.png is the host mark, cropped from Ucan_logo.avif to its content box and
 * converted to PNG: AVIF has no decoder on iOS below 16, and the venue's
 * tablets are an unknown quantity. Replacing either file is the whole update
 * path.
 */
const HOST_MARK = { src: '/logo.png', width: 197, height: 70 };
const APP_MARK = { src: '/twasal-logo.png', width: 200, height: 193 };

/**
 * An image that degrades to its own name in text. Same rule as the sign clips:
 * a missing asset is a normal state, not an error, so the brand still reads.
 */
function Mark({ src, width, height, label, className }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="shrink-0 text-lg font-bold text-primary">{label}</span>;
  }

  return (
    <img
      src={src}
      alt={label}
      width={width}
      height={height}
      className={`w-auto shrink-0 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

export default function BrandHeader({
  bootcampName = 'معسكر تقدر للروبوتات',
  hostName = 'تقدر',
  appName = 'تواصل',
}) {
  return (
    <div className="flex items-center gap-2.5 border-b-2 border-border bg-white px-4 py-2.5">
      <Mark {...HOST_MARK} label={hostName} className="h-8" />

      <span className="h-8 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* min-w-0 so the text wraps inside its share of the row rather than
          pushing either logo off its edge. */}
      <h1 className="min-w-0 flex-1 text-lg font-bold leading-tight text-text">{bootcampName}</h1>

      <Mark {...APP_MARK} label={appName} className="h-9" />
    </div>
  );
}
