import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cn } from '../../lib/cn';

const control =
  'rounded-control bg-ink-900 text-fg placeholder:text-fg-faint w-full border px-3 text-sm transition-colors outline-none disabled:opacity-60';
const border = (error?: string) =>
  error
    ? 'border-danger focus:border-danger'
    : 'border-ink-700 hover:border-fg-faint/60 focus:border-cobalt-400';

interface Common {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

function Wrapper({
  id,
  label,
  error,
  hint,
  children,
}: Common & { id: string; children: ReactNode }) {
  const message = error ?? hint;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-fg block text-sm font-medium">
        {label}
      </label>
      {children}
      {message ? (
        <p
          id={`${id}-msg`}
          className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...rest
}: Common & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-msg` : undefined}
        className={cn(control, 'h-10', border(error), className)}
        {...rest}
      >
        {children}
      </select>
    </Wrapper>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  className,
  ...rest
}: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-msg` : undefined}
        className={cn(
          control,
          'min-h-24 resize-y py-2 leading-relaxed',
          border(error),
          className,
        )}
        {...rest}
      />
    </Wrapper>
  );
}

export function DateField({
  label,
  error,
  hint,
  className,
  ...rest
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        type="date"
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-msg` : undefined}
        className={cn(control, 'h-10', border(error), className)}
        {...rest}
      />
    </Wrapper>
  );
}
