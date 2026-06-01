export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  const horizontal =
    align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={
          side === "bottom"
            ? `pointer-events-none absolute top-full z-20 mt-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-200 shadow-2xl group-hover:block ${horizontal}`
            : `pointer-events-none absolute bottom-full z-20 mb-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-200 shadow-2xl group-hover:block ${horizontal}`
        }
      >
        {label}
      </span>
    </span>
  );
}
