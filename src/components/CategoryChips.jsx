import { iconFor } from '../utils/icons.js';
import { readableTextOn } from '../utils/color.js';
import { ALL_CATEGORY, FAVORITES_CATEGORY } from '../utils/searchIndex.js';
import { LayoutGrid, Star } from 'lucide-react';

/**
 * Single-select category filter. "الكل" is first and is the default.
 * Combines with the search query using AND.
 *
 * The favorites pill rides on the same axis as the categories and is rendered
 * only when something is starred. A chip that can only ever produce an empty
 * result is a trap, and there is no way to discover favorites except by
 * starring a card, which is exactly what makes the pill appear.
 */
export default function CategoryChips({ categories, active, onChange, hasFavorites = false }) {
  const chips = [
    { id: ALL_CATEGORY, label_ar: 'الكل', color: '#7D63AB', Icon: LayoutGrid },
    ...(hasFavorites
      ? [{ id: FAVORITES_CATEGORY, label_ar: 'المفضلة', color: '#B4820E', Icon: Star }]
      : []),
    ...categories.map((c) => ({ ...c, Icon: iconFor(c.icon) })),
  ];

  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2"
      role="group"
      aria-label="تصفية حسب الفئة"
    >
      {chips.map((chip) => {
        const selected = active === chip.id;
        const { Icon } = chip;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            aria-pressed={selected}
            className="flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 text-base font-bold transition-transform active:scale-95"
            style={{
              /**
               * 48px, and no lower.
               *
               * SPEC section 11 asks for 88px touch targets, which these chips
               * already did not meet - that rule is written for the cards, and
               * a row of 88px pills would eat the fold this change exists to
               * give back. But 48 is a floor, not a preference: WCAG 2.5.5 puts
               * the minimum target at 44x44, and a filter you keep missing is
               * worse than one that takes an extra line.
               */
              minHeight: '48px',
              borderColor: chip.color,
              backgroundColor: selected ? chip.color : '#FFFFFF',
              color: selected ? readableTextOn(chip.color) : chip.color,
            }}
          >
            {/* Sized in CSS, not via lucide's `size` prop, so it can respond to
                the breakpoint - the prop only writes width/height attributes,
                which these classes override. Smaller on phones so more chips
                fit before the row has to be scrolled; the label is what is
                being read, the icon only has to be recognisable. */}
            <Icon
              className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
              strokeWidth={2.2}
              fill={chip.id === FAVORITES_CATEGORY ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            {chip.label_ar}
          </button>
        );
      })}
    </div>
  );
}
