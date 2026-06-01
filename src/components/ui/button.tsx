import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-sky-500 text-slate-950 hover:bg-sky-400 focus-visible:outline-sky-300",
        secondary: "border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 focus-visible:outline-gold",
        ghost: "text-slate-200 hover:bg-white/10 focus-visible:outline-slate-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function buttonClassName(variant?: VariantProps<typeof buttonVariants>["variant"]) {
  return buttonVariants({ variant });
}
