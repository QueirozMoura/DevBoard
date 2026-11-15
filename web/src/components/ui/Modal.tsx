import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** `panel` = painel lateral (detalhes); `md`/`lg` = diálogo centralizado. */
  variant?: 'md' | 'lg' | 'panel';
  children: ReactNode;
}

/**
 * Diálogo modal sobre o <dialog> nativo: foco preso, Esc fecha e o foco volta ao elemento
 * que o abriu. O conteúdo só é montado enquanto aberto, então formulários sempre reiniciam.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  variant = 'md',
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'bg-ink-900 text-fg border-ink-700 m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto border shadow-2xl shadow-black/60 backdrop:bg-black/65 backdrop:backdrop-blur-[2px]',
        variant === 'md' && 'max-w-md rounded-[var(--radius-panel)]',
        variant === 'lg' && 'max-w-2xl rounded-[var(--radius-panel)]',
        variant === 'panel' &&
          'mr-0 ml-auto h-dvh max-h-none w-full max-w-xl rounded-none border-y-0 border-r-0 sm:rounded-l-[var(--radius-panel)]',
      )}
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg leading-snug font-semibold text-balance"
              >
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-fg-muted mt-1 text-sm">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="text-fg-muted hover:bg-ink-800 hover:text-fg -mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-lg"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
