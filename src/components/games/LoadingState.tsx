export function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-40 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
      ))}
    </div>
  );
}

