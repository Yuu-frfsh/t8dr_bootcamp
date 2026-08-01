import { useRef, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { useSpeak, MAX_FREE_TEXT } from '../hooks/useSpeak.js';

/**
 * Free text bar. Anything the preset cards do not cover.
 *
 * The text SURVIVES speaking, and is only ever cleared by the explicit X.
 * A user who cannot hear the output has no way to know the instructor caught
 * it; wiping the field on submit meant retyping the whole sentence to repeat
 * it. Now repeating is one tap on the same button.
 *
 * Still no save and no history - nothing survives a reload. The script is
 * auto-detected so the user never has to pick a language.
 */
export default function TopBar() {
  const { speakText } = useSpeak();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const submit = (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    speakText(text);
  };

  // Focus goes back to the field so the on-screen keyboard does not collapse
  // the moment the text is cleared - clearing is almost always "start over".
  const clear = () => {
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-stretch gap-3 border-b-2 border-border bg-white px-4 py-3"
    >
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_FREE_TEXT}
          placeholder="اكتب هنا..."
          aria-label="نص حر للنطق"
          enterKeyHint="send"
          autoComplete="off"
          className="h-full w-full rounded-2xl border-2 border-border bg-surface text-xl outline-none focus:border-primary"
          style={{ minHeight: '88px', paddingInlineStart: '1rem', paddingInlineEnd: '4.25rem' }}
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="مسح النص"
            className="absolute inset-y-0 my-auto flex h-14 w-14 items-center justify-center rounded-full text-muted active:scale-90"
            style={{ insetInlineEnd: '0.5rem' }}
          >
            <X size={28} aria-hidden="true" />
          </button>
        ) : null}
      </div>
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
