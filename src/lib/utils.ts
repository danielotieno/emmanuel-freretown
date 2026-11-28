import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * `text-card`, `text-small` and the other steps of the type scale (globals.css) are font sizes,
 * not colours: told so, tailwind-merge keeps `text-small text-ink-muted` together.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "title", "subtitle", "lead", "body", "card", "button", "small"] },
      ],
    },
  },
});

/** Joins class names; a later class wins over an earlier one for the same property (shadcn/ui). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
