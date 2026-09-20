import { useId, useState } from 'react';

export function CardNote({ notes }: { notes: string }) {
  const [hovered, setHovered] = useState(false);
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const expanded = opened || (hovered && !dismissed);
  return (
    <div
      className="card-note"
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
        <span className="card-note-text" id={id} role="region" aria-label="Текст заметки">
          {notes}
        </span>
      </button>
    </div>
  );
}
