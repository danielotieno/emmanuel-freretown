import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * shadcn/ui's Card in this site's shapes (DESIGN.md §8, staff portal): a flat tile with a 24px
 * radius on the white page. No border and no shadow: the tone alone sets it apart.
 */
const TONES = {
  /** The neutral tile. */
  cloud: "bg-cloud text-ink",
  /** The one Black tile a screen may carry: what needs doing first. */
  night: "on-dark bg-night text-paper",
  /** A white tile with a hairline, for tables and lists. */
  paper: "border border-line bg-paper text-ink",
} as const;

function Card({
  className,
  tone = "cloud",
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof TONES }) {
  return (
    <div
      data-slot="card"
      className={cn("flex min-w-0 flex-col gap-5 rounded-3xl p-6", TONES[tone], className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}
      {...props}
    />
  );
}

/** A card's title: text, not a display line (the page title is the only serif on a screen). */
function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("font-sans text-base leading-snug font-medium tracking-normal", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-normal text-ink-muted", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
