"use client";

import { useState, useEffect, useCallback } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileSlide {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  display_order: number;
  is_active: boolean;
}

const MobileHeroSlider = () => {
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const { data: dbSlides } = useQuery({
    queryKey: ['mobile-slider-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mobile_slider_images' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as unknown as MobileSlide[];
    },
  });

  const slides = dbSlides && dbSlides.length > 0
    ? dbSlides.map(s => ({
        title: s.title || '',
        subtitle: s.subtitle || '',
        cta_text: s.cta_text || 'Browse Products',
        cta_link: s.cta_link || '/products',
        image_url: s.image_url,
      }))
    : [];

  const goTo = useCallback((index: number) => {
    if (isAnimating || slides.length === 0) return;
    setIsAnimating(true);
    setCurrent(index);
    setTimeout(() => setIsAnimating(false), 600);
  }, [isAnimating, slides.length]);

  const next = useCallback(() => {
    if (slides.length === 0) return;
    goTo((current + 1) % slides.length);
  }, [current, goTo, slides.length]);

  const prev = useCallback(() => {
    if (slides.length === 0) return;
    goTo((current - 1 + slides.length) % slides.length);
  }, [current, goTo, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section className="relative w-full overflow-hidden md:hidden">
      <div className="relative w-full aspect-square overflow-hidden">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`absolute inset-0 transition-all duration-600 ease-out ${
              i === current ? "opacity-100 scale-100" : "opacity-0 scale-105"
            }`}
          >
            <Link to={slide.cta_link} className="relative w-full h-full block cursor-pointer">
              <img
                src={slide.image_url}
                alt={slide.title || 'Promotional banner'}
                className="w-full h-full object-cover object-center"
              />
              {(slide.title || slide.subtitle) && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              )}
              {(slide.title || slide.subtitle) && (
                <div className="absolute inset-0 flex items-end pb-14">
                  <div className="px-4 w-full">
                    <div className="space-y-2">
                      {slide.title && (
                        <h1 className="text-xl font-extrabold text-white leading-tight tracking-tight drop-shadow-lg">
                          {slide.title}
                        </h1>
                      )}
                      {slide.subtitle && (
                        <p className="text-sm text-white/90 leading-relaxed drop-shadow">
                          {slide.subtitle}
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="bg-white text-foreground hover:bg-white/90 shadow-lg rounded-full gap-2 mt-1 font-semibold"
                      >
                        {slide.cta_text}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Link>
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? "bg-white w-6" : "bg-white/40 w-1.5"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default MobileHeroSlider;
