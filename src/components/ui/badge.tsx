import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * shadcn/ui's Badge in this site's tokens. A badge always says its meaning in words; colour
 * only supports it (DESIGN.md §2).
 */
const VARIANTS = {
  /** A plain fact. */
  neutral: "border-line-strong bg-paper text-ink",
  /** Something to look at: a flag on a registration. */
  flag: "border-transparent bg-mist text-brand-deep",
  /** A count beside a navigation link. */
  count: "border-transparent bg-brand text-paper",
  /** On a Black tile. */
  onDark: "border-night-soft bg-night-soft text-paper",
} as const;

function Badge({
  className,
  variant = "neutral",
  ...props
}: ComponentProps<"span"> & { variant?: keyof typeof VARIANTS }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs leading-5 font-medium whitespace-nowrap tabular-nums",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
