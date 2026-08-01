import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useSpeak, MAX_FREE_TEXT } from '../hooks/useSpeak.js';

/**
 * Free text bar. Anything the preset cards do not cover.
 *
 * No save, no history, no persistence - it clears on speak. The script is
 * auto-detected so the user never has to pick a language.
 */
export default function TopBar() {
  const { speakText } = useSpeak();
  const [value, setValue] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    speakText(text);
    setValue('');
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-stretch gap-3 border-b-2 border-border bg-white px-4 py-3"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX_FREE_TEXT}
        placeholder="اكتب هنا..."
        aria-label="نص حر للنطق"
        enterKeyHint="send"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-2xl border-2 border-border bg-surface px-4 text-xl outline-none focus:border-primary"
        style={{ minHeight: '88px' }}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="نطق النص"
        className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-xl font-bold text-primary-reverse transition-opacity active:scale-95 active:bg-primary-dark disabled:opacity-30"
        style={{ minHeight: '88px', minWidth: '88px' }}
      >
        <Volume2 size={30} aria-hidden="true" />
        <span className="hidden sm:inline">نطق</span>
      </button>
    </form>
  );
}
