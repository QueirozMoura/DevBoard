import { cn } from '../../lib/cn';
import { initials } from '../../lib/meta';

const TONES = [
  'bg-cobalt-500/25 text-cobalt-300',
  'bg-st-done/20 text-st-done',
  'bg-st-review/20 text-st-review',
  'bg-danger/20 text-danger',
  'bg-ink-700 text-fg',
];

function toneFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % TONES.length;
  return TONES[hash] ?? TONES[0] ?? '';
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-12 text-base',
        toneFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
