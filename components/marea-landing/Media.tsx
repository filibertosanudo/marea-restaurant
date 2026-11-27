import Image from "next/image";
import { Placeholder } from "./Placeholder";

/**
 * A photo filling its block, or the drawn placeholder when there is none.
 * The blocks already have their size from CSS (aspect-ratio or absolute
 * inset), so the image fills them instead of bringing a size of its own.
 */
export function Media({
  src,
  label,
  sizes,
  navy = false,
  hero = false,
}: {
  src?: string | null;
  label: string;
  sizes: string;
  navy?: boolean;
  /**
   * The page's LCP element: preloaded from the head, and encoded at the
   * lower of the two qualities next.config allows, since it is the one
   * photo the landing's performance budget waits on.
   */
  hero?: boolean;
}) {
  if (!src) return <Placeholder label={label} navy={navy} />;
  return (
    <div className="ml-media">
      {/* Decorative: the heading and text beside every photo already say what it shows. */}
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        preload={hero}
        quality={hero ? 60 : undefined}
        className="ml-media-img"
      />
    </div>
  );
}
