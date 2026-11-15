import { type SyntheticEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { describeError, isApiError } from '../api/errors';
import { useAuth } from '../auth/context';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { AuthLayout } from './AuthLayout';
import { validateEmail, validateName, validatePassword } from './validation';

interface Errors {
  name?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const next: Errors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    setFormError(null);
    if (next.name ?? next.email ?? next.password) return;
    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      void navigate('/', { replace: true });
    } catch (error) {
      if (isApiError(error, 'EMAIL_ALREADY_EXISTS')) {
        setErrors({ email: describeError(error) });
      } else {
        setFormError(describeError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="text-cobalt-300 font-medium hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        {formError ? <Alert>{formError}</Alert> : null}
        <TextField
          label="Nome"
          name="name"
          autoComplete="name"
          value={name}
          error={errors.name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <TextField
          label="Senha"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="De 8 a 128 caracteres."
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
