import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';

import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="grid min-h-[65vh] place-items-center text-center">
      <div>
        <SearchX className="mx-auto size-9 text-[var(--acid)]" />
        <p className="mt-5 text-xs font-bold tracking-[0.14em] text-[var(--text-dim)] uppercase">
          404
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">Page not found</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          The workspace route may have moved or you may not have access.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
