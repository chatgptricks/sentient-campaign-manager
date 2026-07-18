import { ShieldAlert } from 'lucide-react';

import { useAuth } from './AuthProvider';
import { Button } from '../../components/ui/Button';

export function NoAccessPage() {
  const { profile, signOut } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
      <div className="max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-amber-400/10 text-amber-300">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-[var(--text)]">
          No application role assigned
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          {profile?.email} is authenticated, but an administrator must assign at least one Campaign
          Manager role.
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
