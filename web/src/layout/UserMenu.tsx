import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCurrentUser, useAuth } from '../auth/context';
import { Avatar } from '../components/ui/Avatar';

export function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="hover:bg-ink-800 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
      >
        <Avatar name={user.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="text-fg-muted block truncate text-xs">{user.email}</span>
        </span>
        <ChevronsUpDown className="text-fg-faint size-4 shrink-0" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu da conta"
          className="border-ink-700 bg-ink-850 absolute right-0 bottom-full left-0 z-30 mb-2 rounded-lg border p-1 shadow-xl shadow-black/40"
        >
          <Link
            role="menuitem"
            to="/profile"
            onClick={() => {
              setOpen(false);
            }}
            className="hover:bg-ink-800 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          >
            <UserRound className="size-4" aria-hidden /> Meu perfil
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => void logout()}
            className="hover:bg-ink-800 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          >
            <LogOut className="size-4" aria-hidden /> Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
