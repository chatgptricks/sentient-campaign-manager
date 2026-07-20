import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, KeyRound, Mail } from 'lucide-react';

import { useAuth } from './AuthProvider';
import { loginSchema, type LoginInput } from '../../lib/validation/schemas';
import { publicConfig } from '../../lib/supabase/config';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';

function logoPath() {
  const base = publicConfig.basePath.endsWith('/')
    ? publicConfig.basePath
    : `${publicConfig.basePath}/`;
  return `${base}sentient-logo.svg`;
}

export function LoginPage() {
  const { signIn, sendMagicLink, sendPasswordReset, error } = useAuth();
  const [mode, setMode] = useState<'password' | 'magic' | 'recovery'>('password');
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const [pending, setPending] = useState(false);

  const submit = form.handleSubmit(async (input) => {
    if (mode === 'password' && input.password.length < 8) {
      form.setError('password', { message: 'Password must be at least 8 characters.' });
      return;
    }
    setPending(true);
    try {
      if (mode === 'magic') {
        await sendMagicLink(input.email);
        setSubmitted(true);
      } else if (mode === 'recovery') {
        await sendPasswordReset(input.email);
        setSubmitted(true);
      } else {
        await signIn(input.email, input.password);
      }
    } finally {
      setPending(false);
    }
  });

  return (
    <main className="grid min-h-screen bg-[var(--background)] lg:grid-cols-[minmax(0,1fr)_minmax(28rem,.72fr)]">
      <section className="relative hidden overflow-hidden border-r border-[var(--border)] bg-[var(--ink)] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-32 -left-24 size-[34rem] rounded-full bg-[var(--acid)]/10 blur-[130px]" />
        <img className="relative h-8 w-auto self-start" src={logoPath()} alt="Sentient" />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--acid-ink)] uppercase">
            Promotion operations
          </p>
          <h1 className="mt-5 text-5xl leading-[1.02] font-semibold tracking-[-0.055em] text-[var(--paper)] xl:text-6xl">
            Every promotion.
            <br />
            One verified flow.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#a9ada5]">
            Move client work from sales intake through creative, approval, and posting to revenue
            follow-up—with a durable record of every decision.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-4 border-t border-white/10 pt-6 text-xs text-[#8f948b]">
          <span>Role-based access</span>
          <span>Immutable history</span>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <img className="h-7 w-auto" src={logoPath()} alt="Sentient" />
          </div>
          {submitted ? (
            <div className="rounded-xl border border-[var(--acid)]/25 bg-[var(--acid)]/5 p-7">
              <CheckCircle2 className="size-7 text-[var(--acid-ink)]" />
              <h1 className="mt-5 text-2xl font-semibold text-[var(--text)]">Check your inbox</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                We sent a secure {mode === 'recovery' ? 'password reset' : 'sign-in'} link to{' '}
                {form.getValues('email')}.
              </p>
              <Button className="mt-6" variant="secondary" onClick={() => setSubmitted(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold tracking-[0.15em] text-[var(--acid-ink)] uppercase">
                Internal access
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text)]">
                {mode === 'recovery' ? 'Reset your password' : 'Sign in to Promotion Manager'}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                {mode === 'recovery'
                  ? 'Enter your team email and we will send a single-use reset link.'
                  : 'Access is invitation-only. Use your Sentient team account.'}
              </p>
              {mode !== 'recovery' ? (
                <div className="mt-7 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    className={`min-h-10 rounded-md text-sm font-medium transition ${mode === 'password' ? 'bg-[var(--surface-raised)] text-[var(--text)] shadow' : 'text-[var(--text-dim)]'}`}
                    onClick={() => setMode('password')}
                  >
                    <KeyRound className="mr-2 inline size-3.5" />
                    Password
                  </button>
                  <button
                    type="button"
                    className={`min-h-10 rounded-md text-sm font-medium transition ${mode === 'magic' ? 'bg-[var(--surface-raised)] text-[var(--text)] shadow' : 'text-[var(--text-dim)]'}`}
                    onClick={() => setMode('magic')}
                  >
                    <Mail className="mr-2 inline size-3.5" />
                    Magic link
                  </button>
                </div>
              ) : (
                <Button className="mt-6" variant="ghost" onClick={() => setMode('password')}>
                  Back to sign in
                </Button>
              )}
              <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
                <Field
                  label="Email"
                  htmlFor="login-email"
                  error={form.formState.errors.email?.message}
                >
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    {...form.register('email')}
                  />
                </Field>
                {mode === 'password' ? (
                  <Field
                    label="Password"
                    htmlFor="login-password"
                    error={form.formState.errors.password?.message}
                  >
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      {...form.register('password')}
                    />
                    <button
                      type="button"
                      className="mt-2 text-left text-xs font-semibold text-[var(--acid-ink)] hover:underline"
                      onClick={() => setMode('recovery')}
                    >
                      Forgot password?
                    </button>
                  </Field>
                ) : null}
                {error ? (
                  <div
                    className="rounded-md border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}
                <Button className="mt-1 w-full" size="lg" type="submit" disabled={pending}>
                  {pending ? (
                    'Signing in…'
                  ) : mode === 'password' ? (
                    <>
                      Sign in <ArrowRight className="size-4" />
                    </>
                  ) : mode === 'magic' ? (
                    <>
                      Send secure link <ArrowRight className="size-4" />
                    </>
                  ) : (
                    <>
                      Send reset link <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
              <p className="mt-6 text-center text-xs leading-5 text-[var(--text-dim)]">
                Need access or your account is suspended? Contact an administrator.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
