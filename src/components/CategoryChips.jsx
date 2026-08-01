import { iconFor } from '../utils/icons.js';
import { readableTextOn } from '../utils/color.js';
import { ALL_CATEGORY } from '../utils/searchIndex.js';
import { LayoutGrid } from 'lucide-react';

/**
 * Single-select category filter. "الكل" is first and is the default.
 * Combines with the search query using AND.
 */
export default function CategoryChips({ categories, active, onChange }) {
  const chips = [
    { id: ALL_CATEGORY, label_ar: 'الكل', color: '#18181B', Icon: LayoutGrid },
    ...categories.map((c) => ({ ...c, Icon: iconFor(c.icon) })),
  ];

  return (
    <div
      className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-3"
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
            className="flex shrink-0 items-center gap-2 rounded-full border-2 px-5 text-lg font-bold transition-transform active:scale-95"
            style={{
              minHeight: '56px',
              borderColor: chip.color,
              backgroundColor: selected ? chip.color : '#FFFFFF',
              color: selected ? readableTextOn(chip.color) : chip.color,
            }}
          >
            <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
            {chip.label_ar}
          </button>
        );
      })}
    </div>
  );
}
