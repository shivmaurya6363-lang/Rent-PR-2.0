"use client";

import { useState, useEffect, useCallback } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const fallbackSlides = [
  {
    title: "Rent Printers for Your Office",
    subtitle: "Affordable monthly plans with free delivery & installation",
    cta_text: "Browse Printers",
    cta_link: "/products",
    image_url: "",
    mobile_image_url: null as string | null,
    gradient: "from-[hsl(168,78%,22%)] via-[hsl(168,65%,30%)] to-[hsl(168,50%,40%)]",
  },
  {
    title: "Flexible Rental Plans",
    subtitle: "Choose 3, 6, or 12 month plans — the longer you rent, the more you save!",
    cta_text: "View Plans",
    cta_link: "/products",
    image_url: "",
    mobile_image_url: null as string | null,
    gradient: "from-[hsl(220,25%,18%)] via-[hsl(220,20%,25%)] to-[hsl(168,40%,30%)]",
  },
  {
    title: "Hassle-Free Experience",
    subtitle: "Free doorstep delivery, installation & 24/7 support included",
    cta_text: "Get Started",
    cta_link: "/products",
    image_url: "",
    mobile_image_url: null as string | null,
    gradient: "from-[hsl(24,80%,45%)] via-[hsl(24,70%,40%)] to-[hsl(168,50%,30%)]",
  },
];

const HeroSlider = () => {
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const isMobile = useIsMobile();

  const { data: dbSlides } = useQuery({
    queryKey: ['slider-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slider_images')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const slides = dbSlides && dbSlides.length > 0
    ? dbSlides.map(s => ({
        title: s.title || '',
        subtitle: s.subtitle || '',
        cta_text: s.cta_text || 'Browse Products',
        cta_link: s.cta_link || '/products',
        image_url: s.image_url,
        mobile_image_url: s.mobile_image_url,
        gradient: '',
      }))
    : fallbackSlides;

  const goTo = useCallback((index: number) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrent(index);
    setTimeout(() => setIsAnimating(false), 600);
  }, [isAnimating]);

  const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);
  const prev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [current, goTo, slides.length]);

  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  const getImageUrl = (slide: typeof slides[0]) => {
    if (isMobile && slide.mobile_image_url) return slide.mobile_image_url;
    return slide.image_url;
  };

  return (
    <section className="relative w-full overflow-hidden hidden md:block">
      {/* Container with aspect ratio for responsive height */}
      <div className="relative w-full aspect-[16/6] md:aspect-[16/5] rounded-[15px] overflow-hidden">
        {slides.map((slide, i) => {
          const imgUrl = getImageUrl(slide);
          return (
            <div
              key={i}
              className={`absolute inset-0 transition-all duration-600 ease-out ${
                i === current ? "opacity-100 scale-100" : "opacity-0 scale-105"
              }`}
            >
              {/* Image-based slide */}
              {imgUrl ? (
                <Link to={slide.cta_link} className="relative w-full h-full block cursor-pointer">
                  <img
                    src={imgUrl}
                    alt={slide.title || 'Promotional banner'}
                    className="w-full h-full object-cover object-center"
                  />
                  {(slide.title || slide.subtitle) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/30 to-transparent" />
                  )}
                  {(slide.title || slide.subtitle) && (
                    <div className="absolute inset-0 flex items-center">
                      <div className="container mx-auto px-4">
                        <div className="max-w-xl space-y-4 md:space-y-5">
                          {slide.title && (
                            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-[1.15] tracking-tight drop-shadow-lg">
                              {slide.title}
                            </h1>
                          )}
                          {slide.subtitle && (
                            <p className="text-sm sm:text-base md:text-lg text-white/90 max-w-md leading-relaxed drop-shadow">
                              {slide.subtitle}
                            </p>
                          )}
                          <Button
                            size="lg"
                            className="bg-white text-foreground hover:bg-white/90 shadow-lg rounded-full gap-2 mt-1 font-semibold"
                          >
                            {slide.cta_text}
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Link>
              ) : (
                /* Gradient fallback slide */
                <Link to={slide.cta_link} className={`w-full h-full flex items-center bg-gradient-to-br ${slide.gradient} cursor-pointer`}>
                  <div className="absolute right-[-5%] top-[-10%] w-[40%] h-[120%] rounded-full bg-white/[0.04]" />
                  <div className="absolute right-[10%] bottom-[-20%] w-[25%] h-[80%] rounded-full bg-white/[0.03]" />
                  <div className="container mx-auto px-4 relative z-10">
                    <div className="max-w-xl space-y-4 md:space-y-5">
                      {slide.title && (
                        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
                          {slide.title}
                        </h1>
                      )}
                      {slide.subtitle && (
                        <p className="text-sm sm:text-base md:text-lg text-white/80 max-w-md leading-relaxed">
                          {slide.subtitle}
                        </p>
                      )}
                      <Button
                        size="lg"
                        className="bg-white text-foreground hover:bg-white/90 shadow-lg rounded-full gap-2 mt-1 font-semibold"
                      >
                        {slide.cta_text}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? "bg-white w-8" : "bg-white/40 w-1.5"
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

export default HeroSlider;
