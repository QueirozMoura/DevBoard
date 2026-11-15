import { CircleAlert, CircleCheck, X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return value;
}

/** Feedback não bloqueante; a região é `aria-live`, então leitores de tela anunciam. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(
        () => {
          dismiss(id);
        },
        tone === 'error' ? 8000 : 4500,
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        push('success', message);
      },
      error: (message) => {
        push('error', message);
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'border-ink-700 bg-ink-850 pointer-events-auto flex w-full max-w-sm animate-settle items-start gap-3 rounded-lg border p-3 text-sm shadow-xl shadow-black/40',
            )}
          >
            {item.tone === 'success' ? (
              <CircleCheck className="text-st-done mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <p className="flex-1">{item.message}</p>
            <button
              type="button"
              aria-label="Dispensar aviso"
              onClick={() => {
                dismiss(item.id);
              }}
              className="text-fg-faint hover:text-fg -m-1 rounded p-1"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
