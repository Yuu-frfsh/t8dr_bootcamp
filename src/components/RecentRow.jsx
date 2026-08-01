import PhraseCard from './PhraseCard.jsx';

/**
 * The row that carries most real-world usage - people reuse the same handful of
 * phrases all day. Favorites pin above recents.
 *
 * Hidden entirely while searching: the results ARE the answer at that point,
 * and a second row of cards above them just costs a scroll.
 */
export default function RecentRow({ favorites, recents, categoriesById }) {
  const hasFavorites = favorites.length > 0;
  const hasRecents = recents.length > 0;
  if (!hasFavorites && !hasRecents) return null;

  const row = (title, items) => (
    <section className="pb-2">
      <h2 className="px-4 pb-2 text-lg font-bold text-muted">{title}</h2>
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-2">
        {items.map((phrase) => (
          <PhraseCard
            key={phrase.id}
            phrase={phrase}
            category={categoriesById.get(phrase.category)}
            size="sm"
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="border-b-2 border-border pt-3">
      {hasFavorites ? row('المفضلة', favorites) : null}
      {hasRecents ? row('آخر الاستخدامات', recents) : null}
    </div>
  );
}
