import { SearchX } from 'lucide-react';

export default function EmptyState({ onClear }) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
      <SearchX size={64} strokeWidth={1.5} className="text-muted" aria-hidden="true" />
      <p className="text-2xl font-bold">لا توجد نتائج</p>
      <p className="text-lg text-muted">جرّب كلمة أخرى أو امسح التصفية</p>
      <button
        type="button"
        onClick={onClear}
        className="rounded-2xl bg-text px-8 text-xl font-bold text-white active:scale-95"
        style={{ minHeight: '88px' }}
      >
        مسح التصفية
      </button>
    </div>
  );
}
