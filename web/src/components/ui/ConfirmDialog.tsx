import { type ReactNode } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Mensagem de erro da última tentativa (mantém o diálogo aberto). */
  error?: string | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação de ação destrutiva: o botão repete o verbo da ação ("Excluir projeto"). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  error,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-fg-muted space-y-4 text-sm">{description}</div>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
