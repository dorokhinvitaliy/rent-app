import { Check, Plus, X, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

function SavedNote({ notes }: { notes: string }) {
  const [hovered, setHovered] = useState(false);
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ collapsed: 180, expanded: 180, height: 42 });
  const id = useId();
  useLayoutEffect(() => {
    const parent = root.current?.parentElement;
    const probe = measure.current;
    if (!parent || !probe) return;
    let disposed = false;
    const update = () => {
      if (disposed) return;
      const available = Math.max(80, parent.clientWidth - 48);
      probe.style.width = 'max-content';
      probe.style.whiteSpace = 'pre';
      const natural = probe.getBoundingClientRect().width + 28;
      const width = Math.min(available, natural);
      probe.style.width = `${width - 28}px`;
      probe.style.whiteSpace = 'pre-wrap';
      const height = Math.min(150, probe.getBoundingClientRect().height) + 24;
      const next = { collapsed: Math.min(width, 240), expanded: width, height };
      setSize((old) =>
        old.collapsed === next.collapsed &&
        old.expanded === next.expanded &&
        old.height === next.height
          ? old
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    void document.fonts.ready.then(update);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [notes]);
  const expanded = opened || (hovered && !dismissed);
  return (
    <div
      ref={root}
      className="card-note"
      style={{
        width: expanded ? size.expanded : size.collapsed,
        height: expanded ? size.height : 42,
      }}
      data-expanded={expanded}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setDismissed(false);
      }}
      onPointerMove={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpened(false);
      }}
      onKeyDown={(e) => {
        if (expanded && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          e.currentTarget
            .querySelector('.card-note-text')
            ?.scrollBy({ top: e.key === 'ArrowDown' ? 40 : -40 });
        }
        if (e.key === 'Escape') {
          setOpened(false);
          setDismissed(true);
        }
      }}
    >
      <button
        type="button"
        className="card-note-trigger"
        aria-label="Моя заметка"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => {
          setOpened(!opened);
          setDismissed(opened);
        }}
      >
        <span className="card-note-preview" aria-hidden="true">
          {notes}
        </span>
        <span
          className="card-note-text"
          style={{ width: size.expanded - 28, maxHeight: size.height - 24 }}
          id={id}
          role="region"
          aria-label="Текст заметки"
        >
          {notes}
        </span>
      </button>
      <span ref={measure} className="card-note-measure" aria-hidden="true">
        {notes}
      </span>
    </div>
  );
}

export function CardNote({
  notes,
  onSave,
}: {
  notes: string;
  onSave: (notes: string) => Promise<void>;
}) {
  return notes ? <SavedNote notes={notes} /> : <NoteComposer onSave={onSave} />;
}
function NoteComposer({ onSave }: { onSave: (notes: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  const close = () => {
    if (saving) return;
    setEditing(false);
    setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  };
  useEffect(() => {
    if (!editing) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [editing, saving]);
  const submit = async () => {
    if (saving || !draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave(draft.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="card-note note-composer"
      data-editing={editing}
      onPointerMove={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="note-add"
        aria-label="Добавить комментарий"
        title="Добавить комментарий"
        aria-expanded={editing}
        onClick={() => setEditing(true)}
      >
        <Plus size={17} />
      </button>
      {editing && (
        <form
          className="note-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            ref={field}
            aria-label="Быстрый комментарий"
            placeholder="Что думаете о квартире?"
            maxLength={5000}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
          />
          {error && <p role="alert">{error}</p>}
          <div className="note-editor-actions">
            <span>{draft.length}/5000</span>
            <button
              type="button"
              title="Закрыть"
              aria-label="Закрыть быстрый комментарий"
              disabled={saving}
              onClick={close}
            >
              <X size={15} />
            </button>
            <button
              type="submit"
              title="Сохранить · Ctrl/⌘ + Enter"
              aria-label="Сохранить комментарий"
              disabled={saving || !draft.trim()}
            >
              {saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
