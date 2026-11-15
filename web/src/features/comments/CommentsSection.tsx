import { Pencil, Trash2 } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { describeError } from '../../api/errors';
import type { Comment, Role } from '../../api/types';
import { useCurrentUser } from '../../auth/context';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextareaField } from '../../components/ui/Field';
import { ErrorState, Skeleton } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { timeAgo } from '../../lib/activity';
import { can } from '../../lib/permissions';
import { useCreateComment, useDeleteComment, useUpdateComment } from '../../mutations';
import { useComments } from '../../queries';

const MAX = 5000;

export function CommentsSection({
  projectId,
  taskId,
  role,
}: {
  projectId: string;
  taskId: string;
  role: Role;
}) {
  const me = useCurrentUser();
  const toast = useToast();
  const query = useComments(taskId);
  const remove = useDeleteComment(projectId, taskId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);

  return (
    <section aria-labelledby="comments-title">
      <h3 id="comments-title" className="mb-3 text-base font-semibold">
        Comentários
        {query.data ? (
          <span className="text-fg-muted ml-2 text-sm font-normal tabular-nums">
            {query.data.items.length}
          </span>
        ) : null}
      </h3>

      {query.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando comentários">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.items.length === 0 ? (
            <p className="text-fg-muted mb-4 text-sm">
              Nenhum comentário ainda. Use este espaço para alinhar detalhes com o time.
            </p>
          ) : (
            <ul className="mb-5 space-y-4">
              {query.data.items.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <Avatar
                    name={comment.author?.name ?? '?'}
                    size="sm"
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">
                        {comment.author?.name ?? 'Usuário removido'}
                      </span>
                      <time
                        dateTime={comment.createdAt}
                        className="text-fg-faint text-xs"
                      >
                        {timeAgo(comment.createdAt)}
                      </time>
                      {comment.updatedAt !== comment.createdAt ? (
                        <span className="text-fg-faint text-xs">(editado)</span>
                      ) : null}
                    </div>
                    {editingId === comment.id ? (
                      <EditComment
                        comment={comment}
                        taskId={taskId}
                        onDone={() => {
                          setEditingId(null);
                        }}
                      />
                    ) : (
                      <>
                        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                          {comment.body}
                        </p>
                        <div className="mt-1 flex gap-1">
                          {can.editComment(comment, me.id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-2 h-7"
                              icon={<Pencil className="size-3.5" aria-hidden />}
                              aria-label="Editar comentário"
                              onClick={() => {
                                setEditingId(comment.id);
                              }}
                            >
                              Editar
                            </Button>
                          ) : null}
                          {can.deleteComment(role, comment, me.id) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              icon={<Trash2 className="size-3.5" aria-hidden />}
                              aria-label="Excluir comentário"
                              onClick={() => {
                                remove.reset();
                                setDeleting(comment);
                              }}
                            >
                              Excluir
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {query.data.nextCursor ? (
            <p className="text-fg-muted mb-4 text-xs">
              Mostrando os {query.data.items.length} primeiros comentários.
            </p>
          ) : null}
        </>
      )}

      <NewComment projectId={projectId} taskId={taskId} />

      <ConfirmDialog
        open={deleting !== null}
        title="Excluir este comentário?"
        description={<p>O comentário some da conversa. Não é possível desfazer.</p>}
        confirmLabel="Excluir comentário"
        loading={remove.isPending}
        error={remove.isError ? describeError(remove.error) : null}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.success('Comentário excluído.');
            },
          });
        }}
      />
    </section>
  );
}

function NewComment({ projectId, taskId }: { projectId: string; taskId: string }) {
  const toast = useToast();
  const create = useCreateComment(projectId, taskId);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      setError('Escreva algo antes de comentar.');
      return;
    }
    if (text.length > MAX) {
      setError(`Use no máximo ${MAX} caracteres.`);
      return;
    }
    setError(undefined);
    create.mutate(text, {
      onSuccess: () => {
        setBody('');
        toast.success('Comentário publicado.');
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {create.isError ? <Alert>{describeError(create.error)}</Alert> : null}
      <TextareaField
        label="Novo comentário"
        name="comment"
        value={body}
        error={error}
        onChange={(event) => {
          setBody(event.target.value);
          setError(undefined);
        }}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={create.isPending}>
          Comentar
        </Button>
      </div>
    </form>
  );
}

function EditComment({
  comment,
  taskId,
  onDone,
}: {
  comment: Comment;
  taskId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const update = useUpdateComment(taskId);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      setError('O comentário não pode ficar vazio.');
      return;
    }
    update.mutate(
      { commentId: comment.id, body: text },
      {
        onSuccess: () => {
          toast.success('Comentário atualizado.');
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-1 space-y-2">
      {update.isError ? <Alert>{describeError(update.error)}</Alert> : null}
      <TextareaField
        label="Editar comentário"
        name="edit-comment"
        value={body}
        error={error}
        autoFocus
        onChange={(event) => {
          setBody(event.target.value);
          setError(undefined);
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={update.isPending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
