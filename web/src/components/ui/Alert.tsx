import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Mensagem de erro de formulário; `role="alert"` anuncia a falha a leitores de tela. */
export function Alert({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-control bg-danger/10 text-danger flex items-start gap-2.5 p-3 text-sm',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
