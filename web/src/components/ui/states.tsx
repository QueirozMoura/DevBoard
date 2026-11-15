import { RefreshCw } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { describeError } from '../../api/errors';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Spinner } from './Spinner';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('bg-ink-800/70 animate-pulse rounded-md', className)}
    />
  );
}

export function LoadingScreen({ label = 'Carregando' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-fg-muted flex items-center gap-3 text-sm">
        <Spinner className="text-cobalt-400 size-5" label={label} />
        {label}…
      </div>
    </div>
  );
}

interface EmptyProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Estado vazio: diz o que falta e oferece o próximo passo. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyProps) {
  return (
    <div className="border-ink-700 flex flex-col items-center rounded-[var(--radius-panel)] border border-dashed px-6 py-12 text-center">
      <span className="bg-cobalt-500/10 text-cobalt-300 mb-4 grid size-11 place-items-center rounded-full">
        <Icon className="size-5" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-fg-muted mt-1 max-w-sm text-sm text-pretty">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-danger/5 flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium">Não foi possível carregar</p>
        <p className="text-fg-muted text-sm">{describeError(error)}</p>
      </div>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw className="size-4" />}
          onClick={onRetry}
        >
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
