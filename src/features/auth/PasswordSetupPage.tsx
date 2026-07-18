import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, KeyRound } from 'lucide-react';

import { passwordSetupSchema, type PasswordSetupInput } from '../../lib/validation/schemas';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from './AuthProvider';

export function PasswordSetupPage() {
  const { credentialSetup, error, signOut, updatePassword } = useAuth();
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const form = useForm<PasswordSetupInput>({
    resolver: zodResolver(passwordSetupSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit(async ({ password }) => {
    setPending(true);
    try {
      await updatePassword(password);
      setComplete(true);
    } finally {
      setPending(false);
    }
  });

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-12">
      <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-7 shadow-2xl">
        {complete ? (
          <div>
            <CheckCircle2 className="size-7 text-[var(--acid)]" />
            <h1 className="mt-5 text-2xl font-semibold text-[var(--text)]">Password saved</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Your account is ready. Continue to Campaign Manager.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Continue
            </Button>
          </div>
        ) : (
          <>
            <KeyRound className="size-7 text-[var(--acid)]" />
            <h1 className="mt-5 text-2xl font-semibold text-[var(--text)]">
              {credentialSetup === 'invite' ? 'Create your password' : 'Reset your password'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Use at least 10 characters with a letter and a number.
            </p>
            <form className="mt-6 grid gap-5" onSubmit={submit}>
              <Field
                label="New password"
                htmlFor="new-password"
                error={form.formState.errors.password?.message}
              >
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register('password')}
                />
              </Field>
              <Field
                label="Confirm password"
                htmlFor="confirm-password"
                error={form.formState.errors.confirmPassword?.message}
              >
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register('confirmPassword')}
                />
              </Field>
              {error ? (
                <p
                  className="rounded-md border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save password'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void signOut()}>
                Cancel and sign out
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
