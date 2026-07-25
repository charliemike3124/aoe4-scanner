import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border px-4 text-xs font-bold uppercase tracking-[0.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-gold bg-gold text-[#0b0e0d] hover:bg-[#d2b16f] focus-visible:outline-gold",
        secondary: "border-[#3b443f] bg-transparent text-[#e8e3d4] hover:border-gold hover:text-gold focus-visible:outline-gold",
        ghost: "border-transparent text-[#c8c7bf] hover:border-[#2b332f] hover:bg-[#171c19] hover:text-[#e8e3d4] focus-visible:outline-[#9ea097]",
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
