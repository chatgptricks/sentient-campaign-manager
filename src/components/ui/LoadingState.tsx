export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <div className="h-20 animate-pulse rounded-xl bg-white/5" />
      <div className="h-20 animate-pulse rounded-xl bg-white/5" />
      <div className="h-20 animate-pulse rounded-xl bg-white/5" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status">
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
        <span className="size-5 animate-spin rounded-full border-2 border-white/15 border-t-[var(--acid)]" />
        Loading workspace
      </div>
    </div>
  );
}
