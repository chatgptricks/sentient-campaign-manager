import { Check, Copy, ServerCog } from 'lucide-react';
import { useState } from 'react';

import { configHealth } from '../../lib/supabase/config';
import { Button } from '../../components/ui/Button';

export function ConfigurationPage() {
  const [copied, setCopied] = useState(false);
  const template =
    'VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me\nVITE_BASE_PATH=/sentient-campaign-manager/';
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-7 sm:p-9">
        <div className="grid size-12 place-items-center rounded-lg bg-[var(--acid)]/8 text-[var(--acid-ink)]">
          <ServerCog className="size-6" />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[var(--acid-ink)] uppercase">
          Configuration health
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--text)]">
          Connect the Supabase project
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
          The static frontend built successfully, but production data and authentication stay
          disabled until public Supabase configuration is provided. Never place a service-role key
          in Vite variables.
        </p>
        <dl className="mt-7 grid gap-3 sm:grid-cols-3">
          {Object.entries(configHealth).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <dt className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-dim)] uppercase">
                {key.replace(/([A-Z])/g, ' $1')}
              </dt>
              <dd
                className={`mt-2 text-sm font-semibold ${value === 'missing' ? 'text-amber-300' : 'text-[var(--text)]'}`}
              >
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="relative mt-6 overflow-hidden rounded-lg border border-[var(--border)] bg-black/30">
          <pre className="overflow-x-auto p-5 text-xs leading-6 text-[var(--text-muted)]">
            {template}
          </pre>
          <Button
            className="absolute top-3 right-3"
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(template);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </main>
  );
}
