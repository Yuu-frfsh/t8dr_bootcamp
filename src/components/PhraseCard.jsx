import { useState } from 'react';
import { Star, AlertTriangle } from 'lucide-react';
import { useSpeak } from '../hooks/useSpeak.js';
import { iconFor } from '../utils/icons.js';
import { hexToRgba, readableTextOn } from '../utils/color.js';
import WaveEffect from './WaveEffect.jsx';

/**
 * The core component. One tap speaks - no confirmation, no menu, no long-press.
 *
 * The sign clip is the label and sits on top at ~65% of the card; the Arabic
 * text is the caption below it. Written Arabic is a second language for many
 * Deaf signers, so the ordering is deliberate.
 *
 * The favorite button is a SIBLING of the card button rather than a child:
 * nested <button> elements are invalid HTML, and siblings give the same
 * "tapping the star does not speak" behaviour with no event plumbing.
 *
 * It sits over the sign area, not over the caption. Anchored to the bottom it
 * collided with the English line on every phrase long enough to wrap, and the
 * fix cannot be "shrink it until it fits" - the collision comes back the moment
 * someone adds a longer phrase. The sign area is the one region of the card
 * whose height never depends on the text.
 */
/**
 * Length-based sizing, deterministic like the overlay's - no measure-and-reflow.
 * Real bootcamp phrases run to ~37 characters ("هل فيه طريقة أسهل نسوي فيها هالشي؟"),
 * which at a fixed text-2xl wraps to six lines in a half-width card. The scale
 * emphasis shrinks with the text for the same reason: the card is
 * `overflow-hidden`, so scaling a tall block would clip the phrase.
 */
function textStyleFor(text, isCompact) {
  const len = Array.from(String(text || '')).length;
  if (len <= 12) return { cls: isCompact ? 'text-lg' : 'text-2xl', scale: 1.15 };
  if (len <= 24) return { cls: isCompact ? 'text-base' : 'text-xl', scale: 1.1 };
  return { cls: isCompact ? 'text-sm' : 'text-lg', scale: 1.06 };
}

export default function PhraseCard({
  phrase,
  category,
  size = 'md',
  isFavorite = false,
  onToggleFavorite,
}) {
  const { speak, preload, activeId, status } = useSpeak();
  const [signFailed, setSignFailed] = useState(false);

  const state = activeId === phrase.id ? status : 'idle';
  const color = (category && category.color) || '#71717A';
  const Icon = iconFor(category && category.icon);
  const isCompact = size === 'sm';
  const showFavorite = !isCompact && typeof onToggleFavorite === 'function';

  const borderColor = state === 'failed' ? '#DC2626' : state === 'playing' ? color : '#D4D4D8';
  const textStyle = textStyleFor(phrase.text_ar, isCompact);

  return (
    <div className={`relative ${isCompact ? 'w-40 shrink-0' : 'w-full'}`}>
      <button
        type="button"
        onPointerDown={() => preload(phrase.id)}
        onClick={() => speak(phrase, category)}
        aria-label={`${phrase.text_ar}${phrase.text_en ? ` - ${phrase.text_en}` : ''}`}
        aria-pressed={state === 'playing'}
        className={[
          'relative flex w-full flex-col overflow-hidden rounded-2xl text-start',
          'transition-transform duration-100 active:scale-[0.97]',
          'min-h-touch bg-white',
          state === 'failed' ? 'border-4' : 'border-2',
        ].join(' ')}
        style={{
          borderColor,
          backgroundColor: state === 'playing' ? hexToRgba(color, 0.14) : '#FFFFFF',
        }}
      >
        {/* Fixed aspect ratio reserves the space, so the grid never reflows
            when a sign clip finishes loading (acceptance check 9). */}
        <div className="relative w-full shrink-0 overflow-hidden bg-surface aspect-square">
          {!signFailed ? (
            <img
              src={`/signs/${phrase.id}.webp`}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setSignFailed(true)}
            />
          ) : (
            // Missing assets are normal. A solid category block reads as a
            // deliberate design, never as a broken image.
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <Icon
                size={isCompact ? 44 : 64}
                strokeWidth={1.5}
                color={readableTextOn(color)}
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-center px-3 py-3">
          {/* items-start keeps the badge on the first line of a phrase that
              wraps to three; shrink-0 stops it collapsing when the text is long. */}
          <div className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex shrink-0 items-center justify-center rounded-md ${
                isCompact ? 'h-5 w-5' : 'h-6 w-6'
              }`}
              style={{ backgroundColor: color }}
              role="img"
              aria-label={category ? `الفئة: ${category.label_ar}` : undefined}
            >
              <Icon
                size={isCompact ? 13 : 16}
                strokeWidth={2.4}
                color={readableTextOn(color)}
                aria-hidden="true"
              />
            </span>
            <span
              className={`min-w-0 font-bold leading-tight ${textStyle.cls}`}
              style={{
                display: 'block',
                transform: state === 'playing' ? `scale(${textStyle.scale})` : 'scale(1)',
                transformOrigin: 'right center',
                transition: 'transform 120ms ease-out',
              }}
            >
              {phrase.text_ar}
            </span>
          </div>
          {phrase.text_en ? (
            <span className={`mt-1 text-muted ${isCompact ? 'text-xs' : 'text-sm'}`} dir="ltr">
              {phrase.text_en}
            </span>
          ) : null}

          {state === 'failed' ? (
            <span className="mt-2 flex items-center gap-1.5 text-sm font-bold text-danger">
              <AlertTriangle size={18} aria-hidden="true" />
              لم يصدر صوت — اعرض النص
            </span>
          ) : null}
        </div>

        {state === 'playing' ? <WaveEffect color={color} /> : null}
      </button>

      {showFavorite ? (
        <button
          type="button"
          onClick={() => onToggleFavorite(phrase.id)}
          aria-label={isFavorite ? `إزالة ${phrase.text_ar} من المفضلة` : `إضافة ${phrase.text_ar} إلى المفضلة`}
          aria-pressed={isFavorite}
          className="absolute top-2 end-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-border backdrop-blur-sm active:scale-90"
        >
          <Star
            size={20}
            strokeWidth={2}
            className={isFavorite ? 'text-amber-500' : 'text-muted'}
            fill={isFavorite ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
