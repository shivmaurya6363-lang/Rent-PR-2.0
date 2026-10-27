import Image from "next/image";

const allowedHosts = (() => {
  const hosts = new Set(["images.unsplash.com"]);
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
  } catch {
    /* ignore malformed env */
  }
  return hosts;
})();

/**
 * Optimised next/image for hosts we have whitelisted (Supabase storage, Unsplash),
 * a plain lazy <img> for anything else a vendor pasted in, and a neutral
 * placeholder when there is no image at all. Never throws on a bad URL.
 */
export function SafeImage({ src, alt, className, sizes = "(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw", priority = false }: {
  src: string | null | undefined; alt: string; className?: string; sizes?: string; priority?: boolean;
}) {
  if (!src) {
    return <div role="img" aria-label={alt} className={`flex h-full w-full items-center justify-center bg-surface text-xs text-muted-foreground ${className ?? ""}`}>No image</div>;
  }
  let host = "";
  try {
    host = new URL(src, "https://local.invalid").hostname;
  } catch {
    /* relative or invalid */
  }
  if (src.startsWith("/") || allowedHosts.has(host)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className ?? "object-cover"} />;
  }
  return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={`absolute inset-0 h-full w-full ${className ?? "object-cover"}`} />;
}
