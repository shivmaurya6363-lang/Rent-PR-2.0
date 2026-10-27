"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProductImageGalleryProps {
  images: string[];
  productName: string;
}

const ProductImageGallery = ({ images, productName }: ProductImageGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0);

  const hasImages = images && images.length > 0;
  const totalImages = hasImages ? images.length : 0;

  const goNext = () => {
    if (totalImages > 1) setSelectedImage((prev) => (prev + 1) % totalImages);
  };

  const goPrev = () => {
    if (totalImages > 1) setSelectedImage((prev) => (prev - 1 + totalImages) % totalImages);
  };

  return (
    <div className="space-y-3">
      {/* Main Image */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-card border border-border/60 group">
        {hasImages ? (
          <img
            src={images[selectedImage]}
            alt={`${productName} - Image ${selectedImage + 1}`}
            className="w-full h-full object-contain p-6 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No Image Available
          </div>
        )}



        {/* Nav Arrows */}
        {totalImages > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-foreground"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-foreground"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Accent line at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />
      </div>

      {/* Caption area (like "COOLS YOU FASTER") - only if product has features */}
      {/* Thumbnail Strip */}
      {totalImages > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                selectedImage === index
                  ? "border-primary shadow-md"
                  : "border-border/60 hover:border-muted-foreground"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
              {selectedImage === index && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductImageGallery;
