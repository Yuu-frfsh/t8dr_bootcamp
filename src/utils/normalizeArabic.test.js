import { describe, it, expect } from 'vitest';
import { normalizeArabic } from './normalizeArabic.js';

describe('normalizeArabic', () => {
  it('strips harakat/tashkeel', () => {
    expect(normalizeArabic('مَدْرَسَة')).toBe(normalizeArabic('مدرسة'));
  });

  it('strips tatweel', () => {
    expect(normalizeArabic('مســـاعدة')).toBe('مساعده');
  });

  it('unifies every alef form', () => {
    const forms = ['أحتاج', 'إحتاج', 'آحتاج', 'ٱحتاج', 'احتاج'];
    const normalized = forms.map(normalizeArabic);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('احتاج');
  });

  it('maps ta marbuta to ha', () => {
    expect(normalizeArabic('مساعدة')).toBe('مساعده');
  });

  it('maps alef maqsura to ya', () => {
    expect(normalizeArabic('على')).toBe('علي');
    expect(normalizeArabic('علی')).toBe('علي');
  });

  it('maps hamza carriers', () => {
    expect(normalizeArabic('مؤ')).toBe('مو');
    expect(normalizeArabic('مئ')).toBe('مي');
  });

  it('collapses whitespace and lowercases latin', () => {
    expect(normalizeArabic('  I   Need   HELP  ')).toBe('i need help');
  });

  it('is safe on non-strings', () => {
    expect(normalizeArabic(undefined)).toBe('');
    expect(normalizeArabic(null)).toBe('');
    expect(normalizeArabic(42)).toBe('');
  });
});
