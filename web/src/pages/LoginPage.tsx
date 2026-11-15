import { type SyntheticEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/context';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { AuthLayout } from './AuthLayout';
import { validateEmail, validatePassword } from './validation';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    setFormError(null);
    if (next.email ?? next.password) return;
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from?.startsWith('/') ? from : '/', { replace: true });
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Continue de onde parou."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/register" className="text-cobalt-300 font-medium hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
        {formError ? <Alert>{formError}</Alert> : null}
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
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
