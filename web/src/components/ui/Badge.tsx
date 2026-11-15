import type { Role, TaskPriority, TaskStatus } from '../../api/types';
import { cn } from '../../lib/cn';
import { PRIORITY_META, ROLE_LABEL, STATUS_META } from '../../lib/meta';

const base =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn(base, 'bg-ink-800', meta.text)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority];
  return <span className={cn(base, meta.className)}>{meta.label}</span>;
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        base,
        role === 'OWNER'
          ? 'bg-cobalt-500/15 text-cobalt-300'
          : 'bg-ink-800 text-fg-muted',
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
