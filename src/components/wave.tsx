/** The sea from the crest, as one soft wave line (DESIGN.md §1). Decorative only. */
export function Wave({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M0 18 C 50 6, 100 6, 150 18 S 250 30, 300 18 S 375 8, 400 14 L 400 32 L 0 32 Z"
        fill="currentColor"
      />
    </svg>
  );
}
