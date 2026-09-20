import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  value: string | number;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  'aria-label': string;
};
const empty = '__empty__';
export function Select({
  value,
  onChange,
  children,
  disabled,
  compact,
  className,
  'aria-label': label,
}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string | number; children: ReactNode }>,
  );
  return (
    <Primitive.Root
      value={String(value) || empty}
      onValueChange={(v) => onChange({ target: { value: v === empty ? '' : v } })}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      <Primitive.Trigger
        ref={trigger}
        aria-label={label}
        className={`select-trigger ${compact ? 'select-trigger-compact' : ''} ${className || ''}`}
      >
        <Primitive.Value />
        <Primitive.Icon className="select-chevron">
          <ChevronDown size={17} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal container={trigger.current?.closest('dialog') ?? undefined}>
        <Primitive.Content
          className={`select-menu ${compact ? 'select-menu-compact' : ''}`}
          position="popper"
          sideOffset={7}
          collisionPadding={12}
        >
          <Primitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={15} />
          </Primitive.ScrollUpButton>
          <Primitive.Viewport className="select-options">
            {options.map((option) => (
              <Primitive.Item
                className="select-option"
                key={String(option.props.value)}
                value={String(option.props.value) || empty}
              >
                <Primitive.ItemText>{option.props.children}</Primitive.ItemText>
                <Primitive.ItemIndicator className="select-check">
                  <Check size={16} strokeWidth={2.5} />
                </Primitive.ItemIndicator>
              </Primitive.Item>
            ))}
          </Primitive.Viewport>
          <Primitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={15} />
          </Primitive.ScrollDownButton>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
