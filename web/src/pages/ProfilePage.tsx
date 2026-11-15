import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { usersApi } from '../api/endpoints';
import { describeError, isApiError } from '../api/errors';
import { useAuth, useCurrentUser } from '../auth/context';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { validateEmail, validateName } from './validation';

export function ProfilePage() {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [errors, setErrors] = useState<{
    name?: string | undefined;
    email?: string | undefined;
  }>({});
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: (updated) => {
      setUser(updated);
      setSaved(true);
    },
    onError: (error) => {
      if (isApiError(error, 'EMAIL_ALREADY_EXISTS'))
        setErrors({ email: describeError(error) });
    },
  });

  const patch = {
    ...(name.trim() !== user.name ? { name: name.trim() } : {}),
    ...(email.trim().toLowerCase() !== user.email ? { email: email.trim() } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setSaved(false);
    const next = { name: validateName(name), email: validateEmail(email) };
    setErrors(next);
    if (next.name ?? next.email) return;
    mutation.mutate(patch);
  }

  const showFormError =
    mutation.isError && !isApiError(mutation.error, 'EMAIL_ALREADY_EXISTS');

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="flex items-center gap-4">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-fg-muted truncate text-sm">{user.email}</p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        noValidate
        className="border-line bg-ink-900 space-y-5 rounded-[var(--radius-panel)] border p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold">Dados da conta</h2>
        {showFormError ? <Alert>{describeError(mutation.error)}</Alert> : null}
        {saved && !dirty ? (
          <p role="status" className="text-st-done flex items-center gap-2 text-sm">
            <CircleCheck className="size-4" aria-hidden /> Alterações salvas.
          </p>
        ) : null}
        <TextField
          label="Nome"
          name="name"
          autoComplete="name"
          value={name}
          error={errors.name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />
        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSaved(false);
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
