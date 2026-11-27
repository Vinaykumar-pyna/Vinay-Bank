import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { z } from 'zod';
import { env } from '@/config/env';
import { toApiError, type ApiError } from '@/lib/apiError';
import { emailSchema } from '@/lib/validation';
import { useLoginMutation } from './authApi';
import { AuthLayout } from './AuthLayout';
import { DemoAccounts } from './DemoAccounts';
import { LoginOwl } from './LoginOwl';
import { MfaChallenge } from './MfaChallenge';

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
type LoginValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [login, { isLoading }] = useLoginMutation();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    try {
      const result = await login(values).unwrap();
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
      } else {
        // GuestOnly redirects to the user's home page once the session is stored.
        toast.success(`Welcome back, ${result.user.firstName}`);
      }
    } catch (err) {
      setError(toApiError(err));
      setFailedAttempts((count) => count + 1);
    }
  };

  if (mfaToken) {
    return (
      <AuthLayout>
        <MfaChallenge mfaToken={mfaToken} onBack={() => setMfaToken(null)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="d-flex align-items-end justify-content-between gap-3 mb-3">
        <div className="pb-2">
          <h1 className="h3 mb-1">Sign in</h1>
          <p className="text-body-secondary mb-0">Welcome back. Sign in to manage your money.</p>
        </div>
        <LoginOwl
          formRef={formRef}
          passwordVisible={showPassword}
          failedAttempts={failedAttempts}
        />
      </div>

      {error && (
        <Alert variant={error.code === 'ACCOUNT_LOCKED' ? 'warning' : 'danger'} className="py-2">
          <i
            className={`bi ${error.code === 'ACCOUNT_LOCKED' ? 'bi-lock' : 'bi-exclamation-circle'} me-2`}
            aria-hidden="true"
          />
          {error.message}
        </Alert>
      )}

      <Form ref={formRef} onSubmit={handleSubmit(onSubmit)} noValidate>
        <Form.Group className="mb-3" controlId="login-email" data-owl="email">
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            isInvalid={!!errors.email}
            {...register('email')}
          />
          <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
        </Form.Group>

        <Form.Group className="mb-4" controlId="login-password" data-owl="password">
          <Form.Label>Password</Form.Label>
          <InputGroup hasValidation>
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              isInvalid={!!errors.password}
              {...register('password')}
            />
            <Button
              variant="outline-secondary"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
            </Button>
            <Form.Control.Feedback type="invalid">{errors.password?.message}</Form.Control.Feedback>
          </InputGroup>
        </Form.Group>

        <Button type="submit" size="lg" className="w-100" disabled={isLoading}>
          {isLoading ? <Spinner size="sm" animation="border" /> : 'Sign in'}
        </Button>
      </Form>

      <p className="text-center text-body-secondary mt-4 mb-0">
        New to Vinay Bank? <Link to="/register">Open an account</Link>
      </p>

      {env.showDemoAccounts && (
        <DemoAccounts
          onPick={(email, password) => {
            setValue('email', email, { shouldValidate: true });
            setValue('password', password, { shouldValidate: true });
          }}
        />
      )}
    </AuthLayout>
  );
}
