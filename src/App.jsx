import { useEffect, useMemo, useState } from 'react';
import phrases from './data/phrases.json';
import categories from './data/categories.json';
import { SpeakProvider } from './context/SpeakContext.jsx';
import { useSpeak, FREE_TEXT_ID } from './hooks/useSpeak.js';
import { useRecents, resolveIds } from './hooks/useRecents.js';
import { filterPhrases, ALL_CATEGORY } from './utils/searchIndex.js';
import TopBar from './components/TopBar.jsx';
import CategoryChips from './components/CategoryChips.jsx';
import SearchBar from './components/SearchBar.jsx';
import RecentRow from './components/RecentRow.jsx';
import PhraseCard from './components/PhraseCard.jsx';
import EmptyState from './components/EmptyState.jsx';
import RaiseHandButton from './components/RaiseHandButton.jsx';
import BigTextOverlay from './components/BigTextOverlay.jsx';

// Built once - phrases.json is static for the lifetime of the page.
const byId = new Map(phrases.map((p) => [p.id, p]));
const categoriesById = new Map(categories.map((c) => [c.id, c]));

function Screen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);

  const { recents, favorites, pushRecent, toggleFavorite, isFavorite } = useRecents();
  const { activeId, status, overlay, dismissOverlay } = useSpeak();

  // Recents are written from real playback state, not from the click handler:
  // a phrase that never made a sound and never showed as playing did not get
  // "used". This keeps the row honest with the rest of the app.
  useEffect(() => {
    if (status === 'playing' && activeId && activeId !== FREE_TEXT_ID) {
      pushRecent(activeId);
    }
  }, [status, activeId, pushRecent]);

  const visible = useMemo(() => filterPhrases(phrases, query, category), [query, category]);

  const searching = query.trim().length > 0;
  const recentPhrases = useMemo(() => resolveIds(recents, byId), [recents]);
  const favoritePhrases = useMemo(() => resolveIds(favorites, byId), [favorites]);

  const clearFilters = () => {
    setQuery('');
    setCategory(ALL_CATEGORY);
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 bg-bg shadow-sm">
        <TopBar />
        <CategoryChips categories={categories} active={category} onChange={setCategory} />
        <SearchBar value={query} onChange={setQuery} />
      </header>

      {!searching ? (
        <RecentRow
          favorites={favoritePhrases}
          recents={recentPhrases}
          categoriesById={categoriesById}
        />
      ) : null}

      <main className="px-4 pt-4">
        {visible.length === 0 ? (
          <EmptyState onClear={clearFilters} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((phrase) => (
              <PhraseCard
                key={phrase.id}
                phrase={phrase}
                category={categoriesById.get(phrase.category)}
                isFavorite={isFavorite(phrase.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
        {/* Clears the fixed raise-hand button so the last row stays tappable. */}
        <div className="h-32" aria-hidden="true" />
      </main>

      <RaiseHandButton />
      <BigTextOverlay overlay={overlay} onDismiss={dismissOverlay} />
    </div>
  );
}

export default function App() {
  return (
    <SpeakProvider>
      <Screen />
    </SpeakProvider>
  );
}
