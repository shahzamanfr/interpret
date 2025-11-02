import React, { useState, useEffect } from "react";
import { ImageDomain } from "../types";
import DomainImageGallery from "./DomainImageGallery";
import { useTheme } from "../contexts/ThemeContext";

interface HomeDomainsProps {
  domains: ImageDomain[];
  selectedDomainSlug?: string;
  onSelectDomain: (slug: string) => void;
  onSelectImage: (slug: string, imageId: string) => void;
  onImageUrlSet?: (imageUrl: string) => void;
}

const HomeDomains: React.FC<HomeDomainsProps> = ({
  domains,
  selectedDomainSlug,
  onSelectDomain,
  onSelectImage,
  onImageUrlSet,
}) => {
  const { theme } = useTheme();
  const [galleryDomain, setGalleryDomain] = useState<ImageDomain | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const handleDomainClick = (domain: ImageDomain) => {
    setGalleryDomain(domain);
    setSelectedImageId(null);
  };

  const handleImageSelect = (imageId: string) => {
    if (galleryDomain) {
      setSelectedImageId(imageId);
      onSelectImage(galleryDomain.slug, imageId);
      setGalleryDomain(null);
    }
  };

  const handleCloseGallery = () => {
    setGalleryDomain(null);
    setSelectedImageId(null);
  };

  // Keep parent visible when gallery is open
  useEffect(() => {
    if (galleryDomain) {
      // Find all elements with data-scroll-animate and add animate-in class
      const elements = document.querySelectorAll("[data-scroll-animate]");
      elements.forEach((el) => {
        el.classList.add("animate-in");
      });
    }
  }, [galleryDomain, theme]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {domains.map((domain) => {
          const isSelected = domain.slug === selectedDomainSlug;
          return (
            <button
              key={domain.slug}
              type="button"
              onClick={() => handleDomainClick(domain)}
              className={`group relative flex h-full min-h-[160px] sm:min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border p-4 sm:p-5 text-left transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none touch-manipulation ${
                theme === "dark"
                  ? "bg-black border-gray-800 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)]"
                  : "bg-white border-gray-200 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.1)]"
              } ${
                isSelected
                  ? theme === "dark"
                    ? "ring-2 ring-white/30"
                    : "ring-2 ring-black/20"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl sm:text-xl flex-shrink-0" aria-hidden>
                  {domain.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <h3
                    className={`font-semibold tracking-tight text-base sm:text-sm ${theme === "dark" ? "text-white" : "text-black"}`}
                  >
                    {domain.title}
                  </h3>
                  <p
                    className={`mt-1.5 sm:mt-1 text-xs leading-relaxed line-clamp-2 ${theme === "dark" ? "text-white/80" : "text-gray-700"}`}
                  >
                    {domain.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {domain.images.slice(0, 3).map((img) => (
                  <div
                    key={img.id}
                    className={`relative aspect-[4/3] overflow-hidden rounded-lg border ${
                      theme === "dark"
                        ? "bg-black border-gray-800/70"
                        : "bg-gray-100 border-gray-200"
                    }`}
                  >
                    <img
                      src={img.src}
                      alt={img.alt}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div
                      className={`absolute inset-0 bg-gradient-to-t via-transparent to-transparent ${
                        theme === "dark" ? "from-black/30" : "from-black/10"
                      }`}
                      aria-hidden
                    />
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Domain Image Gallery Modal */}
      {galleryDomain ? (
        <DomainImageGallery
          domain={galleryDomain.slug}
          onImageSelect={(imageUrl, imageAlt) => {
            // Create a unique ID for the selected image
            const imageId = `selected-${Date.now()}`;
            // Call the parent's onSelectImage with the slug and imageId
            onSelectImage(galleryDomain.slug, imageId);

            // Close the gallery
            setGalleryDomain(null);
          }}
          onImageUrlSet={onImageUrlSet}
          onClose={handleCloseGallery}
        />
      ) : null}
    </>
  );
};

export default HomeDomains;
