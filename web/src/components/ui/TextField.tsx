import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextField({ label, error, hint, className, ...rest }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? hint;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-fg block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'rounded-control bg-ink-900 text-fg placeholder:text-fg-faint h-10 w-full border px-3 text-sm transition-colors outline-none',
          error
            ? 'border-danger focus:border-danger'
            : 'border-ink-700 hover:border-fg-faint/60 focus:border-cobalt-400',
          className,
        )}
        {...rest}
      />
      {message ? (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
