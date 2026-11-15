import { cn } from '../lib/cn';

/** Marca: três colunas de alturas decrescentes, a leitura de um quadro que avança. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-ink-800" />
      <rect x="6" y="8" width="5" height="16" rx="2" className="fill-cobalt-500" />
      <rect
        x="13.5"
        y="8"
        width="5"
        height="10"
        rx="2"
        className="fill-cobalt-500"
        opacity=".75"
      />
      <rect
        x="21"
        y="8"
        width="5"
        height="6"
        rx="2"
        className="fill-cobalt-500"
        opacity=".5"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">DevBoard</span>
    </span>
  );
}
