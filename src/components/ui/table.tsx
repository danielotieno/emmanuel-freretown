import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/* shadcn/ui's Table in this site's tokens. It scrolls sideways inside itself, never the page. */

function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-line transition-colors", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-normal whitespace-nowrap text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td data-slot="table-cell" className={cn("px-3 py-3 align-middle", className)} {...props} />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
