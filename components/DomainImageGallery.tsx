  import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../contexts/ThemeContext";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  total_results: number;
  per_page: number;
  page: number;
}

interface DomainImageGalleryProps {
  domain: string;
  onImageSelect?: (imageUrl: string, imageAlt: string) => void;
  onClose?: () => void;
  onImageUrlSet?: (imageUrl: string) => void;
}

const DOMAIN_QUERIES: Record<string, string> = {
  "professional-scenes":
    "business office meeting corporate workplace presentation team boardroom conference handshake collaboration executive professional work",
  "emotions-expression":
    "portrait emotion expression face human feeling reaction mood smile laugh serious contemplative person people",
  "nature-environment":
    "nature landscape forest mountain ocean wildlife outdoor environment sunset sunrise trees water natural scenic",
  "technology-innovation":
    "technology innovation tech digital computer robot ai future lab data cyber modern science engineering",
  "places-architecture":
    "architecture building city landmark place urban design structure bridge tower monument construction architectural",
  "art-creativity":
    "art creative artist studio painting design craft imagination sculpture gallery workshop artistic",
  "human-stories":
    "family people relationship community life story human connection friends children elderly social personal",
  "dream-fantasy":
    "fantasy dream surreal magical neon aurora mystical ethereal cosmic space universe abstract artistic",
};

// Cache for storing fetched images per domain
const imageCache = new Map<string, PexelsPhoto[]>();
const usedImages = new Map<string, Set<number>>();

const DomainImageGallery: React.FC<DomainImageGalleryProps> = ({
  domain,
  onImageSelect,
  onClose,
  onImageUrlSet,
}) => {
  const { theme } = useTheme();
  const [images, setImages] = useState<PexelsPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Get search query for domain
  const searchQuery = useMemo(() => {
    return DOMAIN_QUERIES[domain] || domain;
  }, [domain]);

  // Fetch images from Pexels API
  const fetchImages = useCallback(
    async (page: number = 1) => {
      const apiKey =
        import.meta.env.VITE_PEXELS_API_KEY ||
        "Ms4Vpz8j7cHnwMcyXsIgQzeCpY047YCNU5aJY3HlVPJOO4hNRwXexpgq";

      if (!apiKey || apiKey === "your_pexels_api_key_here") {
        console.warn("PEXELS_API_KEY not found. Using fallback images.");
        setError("API key not configured. Using fallback images.");
        setImages(generateFallbackImages(domain));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const query = searchQuery.split(" ")[0];
        const response = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=80&page=${page}`,
          {
            headers: {
              Authorization: apiKey,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data: PexelsResponse = await response.json();

        // Cache the results
        const cacheKey = `${domain}-${page}`;
        imageCache.set(cacheKey, data.photos);

        // Get available images (not used yet)
        const usedSet = usedImages.get(domain) || new Set();
        const availableImages = data.photos.filter(
          (photo) => !usedSet.has(photo.id),
        );

        // If we have enough available images, use them
        if (availableImages.length >= 25) {
          const selectedImages = availableImages.slice(0, 25);
          setImages(selectedImages);

          // Mark these images as used
          selectedImages.forEach((photo) => usedSet.add(photo.id));
          usedImages.set(domain, usedSet);
        } else {
          // Not enough new images, use cached images
          const cachedImages = imageCache.get(`${domain}-1`) || [];
          const randomSelection = [...cachedImages]
            .sort(() => Math.random() - 0.5)
            .slice(0, 25);
          setImages(randomSelection);
        }
      } catch (err) {
        console.error("Error fetching images:", err);
        setError("Failed to fetch images. Using fallback.");
        setImages(generateFallbackImages(domain));
      } finally {
        setLoading(false);
      }
    },
    [domain],
  );

  // Generate fallback images when API fails
  const generateFallbackImages = (domainSlug: string): PexelsPhoto[] => {
    const fallbackImages: PexelsPhoto[] = [];

    for (let i = 0; i < 25; i++) {
      fallbackImages.push({
        id: i + 1,
        width: 1600,
        height: 1200,
        url: `https://picsum.photos/1600/1200?random=${domainSlug}-${i}-${Date.now()}`,
        photographer: "Fallback",
        photographer_url: "",
        photographer_id: 0,
        avg_color: "#000000",
        src: {
          original: `https://picsum.photos/1600/1200?random=${domainSlug}-${i}-${Date.now()}`,
          large2x: `https://picsum.photos/1600/1200?random=${domainSlug}-${i}-${Date.now()}`,
          large: `https://picsum.photos/1600/1200?random=${domainSlug}-${i}-${Date.now()}`,
          medium: `https://picsum.photos/800/600?random=${domainSlug}-${i}-${Date.now()}`,
          small: `https://picsum.photos/400/300?random=${domainSlug}-${i}-${Date.now()}`,
          portrait: `https://picsum.photos/400/600?random=${domainSlug}-${i}-${Date.now()}`,
          landscape: `https://picsum.photos/800/400?random=${domainSlug}-${i}-${Date.now()}`,
          tiny: `https://picsum.photos/200/150?random=${domainSlug}-${i}-${Date.now()}`,
        },
        liked: false,
        alt: `Domain-specific ${domainSlug.replace("-", " ")} image ${i + 1}`,
      });
    }

    return fallbackImages;
  };

  // Load images when domain changes - fetchImages is stable now since it only depends on domain
  useEffect(() => {
    fetchImages(1);
  }, [domain, fetchImages]);

  // Create portal container and add classes
  useEffect(() => {
    // Create or get portal container
    let portalContainer = document.getElementById('gallery-portal');
    if (!portalContainer) {
      portalContainer = document.createElement('div');
      portalContainer.id = 'gallery-portal';
      portalContainer.style.cssText = 'position: fixed; inset: 0; z-index: 99999;';
      document.body.appendChild(portalContainer);
    }

    // Add classes to prevent theme transition overlays and hide scrollbar
    document.documentElement.classList.add('gallery-open');
    document.body.classList.add('gallery-open');
    
    // Prevent body scroll and hide overflow
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      document.documentElement.classList.remove('gallery-open');
      document.body.classList.remove('gallery-open');
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
      document.body.style.height = '';
      // Don't remove the container, it will be reused
    };
  }, []);

  // Handle image selection
  const handleImageClick = (image: PexelsPhoto) => {
    if (onImageSelect) {
      onImageSelect(image.src.large, image.alt);
    }
    if (onImageUrlSet) {
      onImageUrlSet(image.src.large);
    }
    if (onClose) {
      onClose();
    }
  };

  // Manual refresh
  const handleRefresh = () => {
    fetchImages(currentPage + 1);
    setCurrentPage((prev) => prev + 1);
  };

  return createPortal(
    <div
      className="domain-gallery-modal no-theme-transition fixed inset-0 z-[99999] overflow-hidden"
      style={{ 
        zIndex: 99999,
        backgroundColor: theme === "dark" ? "#000" : "#fff",
        opacity: 1,
        visibility: "visible",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        isolation: 'isolate'
      }}
    >
      {/* Top Navigation Bar */}
      <nav
        className={`sticky top-0 z-10 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b backdrop-blur-sm ${
          theme === "dark" 
            ? "border-gray-800 bg-black/95" 
            : "border-gray-200 bg-white/95"
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          {onClose && (
            <button
              onClick={onClose}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-none font-medium transition-colors min-h-[44px] touch-manipulation ${
                theme === "dark"
                  ? "text-gray-400 hover:text-white hover:bg-gray-800 active:bg-gray-700"
                  : "text-gray-600 hover:text-black hover:bg-gray-100 active:bg-gray-200"
              }`}
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span className="hidden sm:inline text-sm sm:text-base">Back to Home</span>
              <span className="sm:hidden text-sm">Back</span>
            </button>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 rounded-none font-medium transition-colors disabled:opacity-50 min-h-[44px] touch-manipulation text-sm sm:text-base ${
            theme === "dark"
              ? "bg-gray-800 text-white hover:bg-gray-700 active:bg-gray-600"
              : "bg-black text-white hover:bg-gray-900 active:bg-gray-800"
          }`}
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="hidden sm:inline">
            {loading ? "Loading..." : "Refresh"}
          </span>
          <span className="sm:hidden">{loading ? "..." : "New"}</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <div 
        className={`h-[calc(100vh-64px)] sm:h-[calc(100vh-73px)] overflow-y-auto overflow-x-hidden ${
          theme === "dark" ? "bg-black" : "bg-white"
        }`}
      >
        {/* Header Section */}
        <div 
          className={`max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 lg:py-8 ${
            theme === "dark" ? "bg-black" : "bg-white"
          }`}
        >
          <h1
            className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2 tracking-tight ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            {domain.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </h1>
          <p
            className={`text-xs sm:text-sm md:text-base lg:text-lg ${
              theme === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Select an image to continue • {images.length} images available
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div 
            className={`max-w-7xl mx-auto px-4 sm:px-6 mb-4 sm:mb-6 ${
              theme === "dark" ? "bg-black" : "bg-white"
            }`}
          >
            <div
              className={`p-3 sm:p-4 rounded-lg text-sm sm:text-base ${
                theme === "dark"
                  ? "bg-yellow-900/20 border border-yellow-500/30 text-yellow-200"
                  : "bg-yellow-50 border border-yellow-300 text-yellow-700"
              }`}
            >
              {error}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && images.length === 0 ? (
          <div 
            className={`flex flex-col items-center justify-center py-12 sm:py-20 min-h-[60vh] ${
              theme === "dark" ? "bg-black" : "bg-white"
            }`}
          >
            <div
              className={`animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 ${
                theme === "dark" ? "border-white" : "border-black"
              }`}
            ></div>
            <p
              className={`mt-4 text-base sm:text-lg ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Loading images...
            </p>
          </div>
        ) : (
          <>
            {/* Image Grid */}
            <div 
              className={`max-w-7xl mx-auto px-3 sm:px-6 pb-6 sm:pb-10 lg:pb-12 min-h-[60vh] ${
                theme === "dark" ? "bg-black" : "bg-white"
              }`}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
                {images.map((image) => (
                  <button
                    key={image.id}
                    onClick={() => handleImageClick(image)}
                    className={`group relative aspect-square overflow-hidden rounded-none transition-all duration-300 hover:scale-[1.02] active:scale-95 hover:shadow-xl touch-manipulation border ${
                      theme === "dark"
                        ? "bg-gray-900 hover:shadow-white/10 border-gray-800 hover:border-gray-700"
                        : "bg-gray-100 hover:shadow-black/20 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <img
                      src={image.src.large}
                      alt={image.alt}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-3">
                        <p className="text-white text-[10px] sm:text-xs font-medium line-clamp-2 leading-tight">
                          {image.alt}
                        </p>
                      </div>
                    </div>
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-300">
                      <div className="bg-white text-black px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-lg">
                        Select
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div
              className={`border-t py-4 sm:py-6 text-center px-4 ${
                theme === "dark"
                  ? "border-gray-800 text-gray-500 bg-black"
                  : "border-gray-200 text-gray-600 bg-white"
              }`}
            >
              <p className="text-xs sm:text-sm">
                Photos provided by{" "}
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`font-medium hover:underline ${
                    theme === "dark"
                      ? "text-gray-400 hover:text-white"
                      : "text-gray-700 hover:text-black"
                  }`}
                >
                  Pexels
                </a>
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.getElementById('gallery-portal') || document.body,
  );
};

export default DomainImageGallery;
