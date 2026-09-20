import { useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
export function RoomSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    if (open) {
      panel.current?.hidePopover();
      return;
    }
    const box = trigger.current!.getBoundingClientRect();
    const menu = panel.current!;
    menu.style.left = Math.max(12, Math.min(box.left, innerWidth - 212)) + 'px';
    menu.style.top = box.bottom + 7 + 'px';
    menu.style.maxHeight = Math.max(100, innerHeight - box.bottom - 19) + 'px';
    menu.showPopover();
    menu.querySelector<HTMLButtonElement>('[aria-selected="true"], button')?.focus();
  };
  return (
    <div className="compact-rooms">
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label="Количество комнат"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        data-state={open ? 'open' : 'closed'}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>
          {value.length
            ? [...value]
                .sort()
                .map((n) => n || 'Ст')
                .join(', ') + ' комн.'
            : 'Комнат'}
        </span>
        <span className="select-chevron">
          <ChevronDown size={17} />
        </span>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="listbox"
        aria-label="Количество комнат"
        aria-multiselectable="true"
        className="select-menu room-select-menu"
        onToggle={(e) => setOpen((e.nativeEvent as ToggleEvent).newState === 'open')}
        onKeyDown={(e) => {
          const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>('button')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            e.key === 'ArrowDown'
              ? (index + 1) % buttons.length
              : e.key === 'ArrowUp'
                ? (index - 1 + buttons.length) % buttons.length
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? buttons.length - 1
                    : null;
          if (next !== null) {
            e.preventDefault();
            buttons[next].focus();
          }
        }}
      >
        <div className="select-options">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              role="option"
              aria-selected={value.includes(n)}
              data-state={value.includes(n) ? 'checked' : 'unchecked'}
              className="select-option"
              onClick={() =>
                onChange(value.includes(n) ? value.filter((r) => r !== n) : [...value, n])
              }
            >
              {n === 0 ? 'Студия' : n + ' комн.'}
              {value.includes(n) && (
                <span className="select-check">
                  <Check size={16} strokeWidth={2.5} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
