// A photo spot on a page (hero photo, location photo, instructor photo...).
// Where it's used: Home and About Us.
//
// It shows the photo saved in site_content.image_path, using next/image (which
// makes phone-sized copies and loads them only when needed). If no photo has
// been added yet, it shows the brown gradient box from the designs instead,
// so the page never has an empty hole. The size and shape come from the
// className the page passes in (e.g. "h-55 rounded-3xl").

import Image from "next/image";
import { cn } from "@/lib/cn";
import { siteImageUrl } from "@/lib/site-images";

type SiteImageProps = {
  path: string | null | undefined; // site_content.image_path (see src/lib/site-images.ts)
  alt: string; // what the photo shows, for screen readers ("" = just decoration)
  // How wide the photo is on screen, so the browser picks the right size,
  // e.g. "(min-width: 1024px) 50vw, 100vw" = half the screen on laptops,
  // the full width on phones.
  sizes: string;
  preload?: boolean; // true only for the big photo at the top of a page
  className?: string; // size, shape and position of the box
};

// A photo, or the gradient placeholder box.
// Takes: the image path, alt text, sizes, preload and the box's classes.
// Gives back: a box that fills with the photo (cropped to fit) or the gradient.
export function SiteImage({ path, alt, sizes, preload = false, className }: SiteImageProps) {
  const src = siteImageUrl(path);

  return (
    <div
      // The gradient is always underneath, so it also shows while a photo loads.
      // relative + overflow-hidden: the photo fills this box and is cut to its
      // rounded corners.
      className={cn("relative overflow-hidden bg-linear-135 from-tan to-caramel", className)}
      // An empty gradient box means nothing to a screen reader, so hide it
      aria-hidden={src ? undefined : true}
    >
      {src && (
        <Image
          src={src}
          alt={alt}
          fill // fill the box (the box sets the size)
          sizes={sizes}
          preload={preload}
          className="object-cover" // crop instead of stretching
        />
      )}
    </div>
  );
}
