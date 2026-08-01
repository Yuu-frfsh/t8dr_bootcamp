import { describe, it, expect } from 'vitest';
import { filterPhrases, sortPhrases, ALL_CATEGORY } from './searchIndex.js';
import phrases from '../data/phrases.json';
import categories from '../data/categories.json';

const ids = (list) => list.map((p) => p.id);

// Mechanics are tested against a fixture, not against phrases.json. The phrase
// list is expected to change during the bootcamp - a content edit must never
// turn the search suite red.
const fixture = [
  {
    id: 'alpha',
    text_ar: 'أحتاج مساعدة',
    text_en: 'I need help',
    category: 'help',
    keywords: ['ساعدني', 'stuck'],
    priority: 1,
  },
  {
    id: 'beta',
    text_ar: 'تعال من فضلك',
    text_en: 'Please come here',
    category: 'help',
    keywords: ['هنا'],
    priority: 2,
  },
  {
    id: 'gamma',
    text_ar: 'البطارية فارغة',
    text_en: 'The battery is empty',
    category: 'tech',
    keywords: ['شحن', 'servo'],
    priority: 1,
  },
  {
    id: 'delta',
    text_ar: 'أحتاج استراحة',
    text_en: 'I need a break',
    category: 'needs',
    keywords: ['راحة'],
    priority: 1,
  },
];

describe('filterPhrases', () => {
  it('returns everything for an empty query on "all"', () => {
    expect(filterPhrases(fixture, '', ALL_CATEGORY)).toHaveLength(fixture.length);
  });

  it('matches on English text', () => {
    expect(ids(filterPhrases(fixture, 'battery'))).toContain('gamma');
  });

  it('matches on keywords that appear in neither display string', () => {
    expect(ids(filterPhrases(fixture, 'servo'))).toContain('gamma');
  });

  it('ANDs multiple query tokens', () => {
    expect(ids(filterPhrases(fixture, 'need help'))).toContain('alpha');
    expect(ids(filterPhrases(fixture, 'need battery'))).toHaveLength(0);
  });

  it('ANDs the category chip with the query', () => {
    expect(ids(filterPhrases(fixture, 'احتاج', 'needs'))).toContain('delta');
    expect(ids(filterPhrases(fixture, 'احتاج', 'needs'))).not.toContain('alpha');
  });

  it('returns empty for a query that matches nothing', () => {
    expect(filterPhrases(fixture, 'zzzzqqq')).toHaveLength(0);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(ids(filterPhrases(fixture, '  BATTERY  '))).toContain('gamma');
  });
});

// Acceptance check 5, against the phrases that ship. A participant typing on a
// keyboard without hamza or with the wrong ta must still find the card, so these
// are pinned to the real content rather than the fixture.
describe('filterPhrases on the shipped phrase list', () => {
  it('matches أستاذ when the user types استاذ (bare alef)', () => {
    expect(ids(filterPhrases(phrases, 'استاذ'))).toContain('didnt_understand');
  });

  it('matches مساعدة when the user types مساعده (ta marbuta)', () => {
    expect(ids(filterPhrases(phrases, 'مساعده'))).toContain('help_find_mistake');
  });

  it('matches a colloquial phrase from its MSA keyword', () => {
    // The card reads "الحين"; the keyword carries "الآن" so either spelling finds it.
    expect(ids(filterPhrases(phrases, 'الان'))).toContain('can_we_try_now');
  });

  it('finds a card by a word in neither display string', () => {
    expect(ids(filterPhrases(phrases, 'سلايد'))).toContain('previous_slide');
  });

  it('matches on the English caption', () => {
    expect(ids(filterPhrases(phrases, 'workshop'))).toContain('benefited_from_workshop');
  });
});

// phrases.json is edited by hand between sessions. These guard the invariants a
// typo would break: a duplicate id silently collides in recents, favorites and
// the /audio/<id>.mp3 lookup; an unknown category makes a card fall to the end
// of the grid with a grey block.
describe('phrases.json integrity', () => {
  const categoryIds = new Set(categories.map((c) => c.id));

  it('has unique ids', () => {
    expect(new Set(phrases.map((p) => p.id)).size).toBe(phrases.length);
  });

  it('gives every phrase a filename-safe id and Arabic text', () => {
    for (const p of phrases) {
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(String(p.text_ar).trim().length).toBeGreaterThan(0);
    }
  });

  it('only uses categories declared in categories.json', () => {
    for (const p of phrases) {
      expect(categoryIds.has(p.category)).toBe(true);
    }
  });

  // Red is reserved for "the audio did not work". A category painted #DC2626
  // would make a SUCCESSFUL speak fill the screen with the failure colour - the
  // user cannot hear the difference, so the colour is most of the signal.
  it('never paints a category the danger red', () => {
    for (const c of categories) {
      expect(c.color.toUpperCase()).not.toBe('#DC2626');
    }
  });

  it('does not repeat a priority within a category', () => {
    const seen = new Map();
    for (const p of phrases) {
      const key = `${p.category}/${p.priority}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, p.id);
    }
  });
});

describe('sortPhrases', () => {
  it('orders by category (per categories.json) then priority', () => {
    const sorted = ids(sortPhrases(fixture));
    expect(sorted).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('defaults a missing priority to last within its category', () => {
    const sorted = ids(
      sortPhrases([
        { id: 'b', category: 'help' },
        { id: 'a', category: 'help', priority: 1 },
      ])
    );
    expect(sorted).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [...phrases];
    sortPhrases(input);
    expect(input).toEqual(phrases);
  });
});
