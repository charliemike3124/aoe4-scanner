function LoadingCard() {
  return <div className="h-64 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />;
}

export function LoadingState({
  count = 3,
  showHighlights = false,
}: {
  count?: number;
  showHighlights?: boolean;
}) {
  return (
    <div className="space-y-4" aria-label="Loading games">
      {showHighlights ? (
        <section className="space-y-3">
          <div className="space-y-2">
            <div className="h-6 w-28 animate-pulse rounded bg-white/[0.08]" />
            <div className="h-4 w-72 max-w-full animate-pulse rounded bg-white/[0.06]" />
          </div>
          <div className="space-y-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="space-y-2">
                <div className="h-6 w-28 animate-pulse rounded-full bg-gold/15" />
                <LoadingCard />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="space-y-3">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-white/[0.06]" />
          <div className="h-8 w-56 max-w-full animate-pulse rounded-md bg-white/[0.06]" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: count }, (_, item) => (
            <LoadingCard key={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
