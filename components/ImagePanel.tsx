import React from "react";
import PlusIcon from "./icons/PlusIcon";
import { useTheme } from "../contexts/ThemeContext";

interface ImagePanelProps {
  imageUrl: string;
  onNewImage: () => void;
  isLoading: boolean;
  domainTitle?: string;
  domainEmoji?: string;
  domainDescription?: string;
}

const ImagePanel = React.forwardRef<HTMLImageElement, ImagePanelProps>(
  (
    {
      imageUrl,
      onNewImage,
      isLoading,
      domainTitle,
      domainEmoji,
      domainDescription,
    },
    ref,
  ) => {
    const { theme } = useTheme();
    const showDomainDetails = Boolean(domainTitle);
    const [imageError, setImageError] = React.useState(false);
    const [retryCount, setRetryCount] = React.useState(0);

    // Reset error state when imageUrl changes
    React.useEffect(() => {
      setImageError(false);
    }, [imageUrl]);

    const handleImageError = () => {
      console.error("Image failed to load:", imageUrl);
      setImageError(true);

      // Only retry once to avoid infinite loops
      if (retryCount < 1) {
        setRetryCount((prev) => prev + 1);
        setTimeout(() => {
          onNewImage();
        }, 2000);
      }
    };

    const handleImageLoad = () => {
      console.log("Image loaded successfully:", imageUrl);
      setImageError(false);
      setRetryCount(0);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className={`text-3xl font-bold tracking-tighter ${theme === "dark" ? "text-white" : "text-black"}`}
              >
                Image to Describe
              </h2>
              {showDomainDetails && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                    theme === "dark"
                      ? "border-gray-800 bg-gray-900/70 text-gray-300"
                      : "border-gray-300 bg-gray-100 text-gray-700"
                  }`}
                >
                  <span className="text-base" aria-hidden>
                    {domainEmoji}
                  </span>
                  <span
                    className={
                      theme === "dark" ? "text-gray-100" : "text-black"
                    }
                  >
                    {domainTitle}
                  </span>
                </span>
              )}
            </div>
            {domainDescription && (
              <p
                className={`max-w-2xl text-sm leading-relaxed ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}
              >
                {domainDescription}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onNewImage}
            disabled={isLoading}
            className={`self-start rounded-full border p-2 transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              theme === "dark"
                ? "border-gray-700 text-gray-400 hover:bg-gray-800 focus:ring-gray-600"
                : "border-gray-300 text-black hover:bg-gray-200 focus:ring-gray-300"
            }`}
            aria-label="Get new image"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
        <div
          className={`relative aspect-[4/3] overflow-hidden rounded-2xl ${theme === "dark" ? "bg-gray-900" : "bg-gray-100"}`}
        >
          {imageUrl && !imageError ? (
            <img
              key={imageUrl}
              ref={ref}
              src={imageUrl}
              alt="Describe this"
              crossOrigin="anonymous"
              className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          ) : (
            <div
              className={`flex h-full items-center justify-center ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}
            >
              {imageError
                ? `Retrying... (${retryCount}/1)`
                : "Loading image..."}
            </div>
          )}
          <div
            className={`pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent ${
              theme === "dark" ? "from-gray-950/40" : "from-gray-950/10"
            }`}
            aria-hidden
          />
        </div>
      </div>
    );
  },
);

ImagePanel.displayName = "ImagePanel";

export default ImagePanel;
