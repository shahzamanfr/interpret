import React from "react";
import PlusIcon from "./icons/PlusIcon";
import { useTheme } from "../contexts/ThemeContext";

interface ImagePanelProps {
  imageUrl: string;
  onNewImage: () => void;
  onImageUpload?: (imageUrl: string) => void;
  onPlayWithFriend?: () => void;
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
      onImageUpload,
      onPlayWithFriend,
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
    const fileInputRef = React.useRef<HTMLInputElement>(null);

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

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Please select a valid image file');
          return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert('Image file must be less than 5MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result && onImageUpload) {
            onImageUpload(result);
          }
        };
        reader.onerror = () => {
          alert('Error reading file. Please try again.');
        };
        reader.readAsDataURL(file);
      }
      // Reset input value to allow same file upload again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    const handleUploadClick = () => {
      fileInputRef.current?.click();
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
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${theme === "dark"
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNewImage}
              disabled={isLoading}
              className={`self-start rounded-full border p-2 transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme === "dark"
                ? "border-gray-700 text-gray-400 hover:bg-gray-800 focus:ring-gray-600"
                : "border-gray-300 text-black hover:bg-gray-200 focus:ring-gray-300"
                }`}
              aria-label="Get new image"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            {onImageUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="Upload image file"
                />
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={isLoading}
                  className={`self-start rounded-full border p-2 transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme === "dark"
                    ? "border-gray-700 text-gray-400 hover:bg-gray-800 focus:ring-gray-600"
                    : "border-gray-300 text-black hover:bg-gray-200 focus:ring-gray-300"
                    }`}
                  aria-label="Upload your own image"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </button>
              </>
            )}
            {onPlayWithFriend && (
              <button
                type="button"
                onClick={onPlayWithFriend}
                disabled={isLoading}
                className={`self-start rounded-full border p-2 transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${theme === "dark"
                    ? "border-gray-700 text-gray-400 hover:bg-gray-800 focus:ring-gray-600"
                    : "border-gray-300 text-black hover:bg-gray-200 focus:ring-gray-300"
                  }`}
                aria-label="Play with friend"
                title="Play with Friend"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
            )}
          </div>
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
            className={`pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent ${theme === "dark" ? "from-gray-950/40" : "from-gray-950/10"
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
