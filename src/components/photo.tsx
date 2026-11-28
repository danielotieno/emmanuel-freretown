import type { StaticImageData } from "next/image";

/**
 * A photograph below the first screen: loaded only when the reader nears it, so it costs nothing
 * on first load (DESIGN.md §5). To replace a photo, replace its file in
 * `src/app/(public)/images/` with one of the same name and about the same shape.
 */
export function Photo(props: { image: StaticImageData; alt: string; className?: string }) {
  const { image, alt, className } = props;
  return (
    // A plain <img>: Next's image optimiser doesn't run on Cloudflare (DESIGN.md §5).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
