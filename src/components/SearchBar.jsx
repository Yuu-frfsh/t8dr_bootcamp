import { Search, X } from 'lucide-react';

/**
 * Live search across text_ar, text_en and keywords.
 * Normalization happens in searchIndex.js - both the query and the phrase blob
 * go through normalizeArabic, so `احتاج` finds `أحتاج`.
 */
export default function SearchBar({ value, onChange }) {
  return (
    <div className="relative px-4 pb-3">
      <Search
        size={26}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 my-auto text-muted"
        style={{ insetInlineStart: '2rem' }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="بحث"
        aria-label="بحث في العبارات"
        autoComplete="off"
        className="w-full rounded-2xl border-2 border-border bg-surface text-xl outline-none focus:border-text"
        style={{ minHeight: '72px', paddingInlineStart: '3.75rem', paddingInlineEnd: '3.75rem' }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="مسح البحث"
          className="absolute inset-y-0 my-auto flex h-14 w-14 items-center justify-center rounded-full text-muted active:scale-90"
          style={{ insetInlineEnd: '1.75rem' }}
        >
          <X size={28} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
