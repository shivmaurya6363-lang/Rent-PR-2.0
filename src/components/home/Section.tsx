import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Section({ id, eyebrow, title, intro, href, hrefLabel = "View all", children, tone = "plain", className = "" }: {
  id?: string; eyebrow?: string; title: string; intro?: string; href?: string; hrefLabel?: string; children: React.ReactNode; tone?: "plain" | "surface"; className?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`${tone === "surface" ? "bg-surface" : ""} py-12 md:py-16 ${className}`}>
      <div className="container-page">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
          <div className="max-w-2xl">
            {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
            <h2 id={id ? `${id}-title` : undefined} className="t-display text-2xl md:text-[2rem] md:leading-tight">{title}</h2>
            {intro && <p className="mt-2 text-[15px] text-muted-foreground">{intro}</p>}
          </div>
          {href && (
            <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {hrefLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5">{children}</div>;
}
