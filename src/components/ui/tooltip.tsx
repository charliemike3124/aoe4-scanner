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
  const surface =
    "pointer-events-none absolute z-20 hidden w-max max-w-[min(18rem,calc(100vw-2rem))] border border-[#3b443f] border-l-gold bg-[#171c19] px-3 py-2 text-[11px] font-medium leading-5 tracking-[0.01em] text-[#d0cec4] shadow-[0_12px_32px_rgba(0,0,0,0.4)] group-hover:block group-focus-within:block";

  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={
          side === "bottom"
            ? `${surface} top-full mt-2 ${horizontal}`
            : `${surface} bottom-full mb-2 ${horizontal}`
        }
      >
        {label}
      </span>
    </span>
  );
}
