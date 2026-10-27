"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SafeImage } from "@/components/rental/SafeImage";

export default function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const list = images.length ? images : [null];
  const go = (d: number) => setI((cur) => (cur + d + list.length) % list.length);
  return (
    <div role="group" aria-roledescription="carousel" aria-label={`${name} images`} onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface md:aspect-square lg:aspect-[4/3]">
        <SafeImage src={list[i]} alt={`${name}, image ${i + 1} of ${list.length}`} priority sizes="(min-width:1024px) 55vw, 100vw" className="object-contain" />
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="touch-target absolute left-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-card/95 shadow ring-1 ring-border"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="touch-target absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-card/95 shadow ring-1 ring-border"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
      </div>
      {list.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Choose image">
          {list.map((src, idx) => (
            <li key={idx} className="shrink-0">
              <button type="button" onClick={() => setI(idx)} aria-label={`Show image ${idx + 1}`} aria-current={idx === i} className={`relative block h-16 w-16 overflow-hidden rounded-lg bg-surface ring-2 md:h-20 md:w-20 ${idx === i ? "ring-primary" : "ring-transparent hover:ring-border"}`}>
                <SafeImage src={src} alt="" sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
