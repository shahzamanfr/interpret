import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { GoogleGenAI, Type } from "@google/genai";
import {
  CoachMode,
  Feedback,
  ScoreHistory,
  LoadingState,
  ImageDomain,
} from "./types";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ErrorBoundary from "./components/ErrorBoundary";
// removed DomainGallery
import ImagePanel from "./components/ImagePanel";
import InputPanel from "./components/InputPanel";
import FeedbackPanel from "./components/FeedbackPanel";
import ControlsPanel from "./components/ControlsPanel";
import ProgressPanel from "./components/ProgressPanel";
import BehavioralAnalysisPanel from "./components/BehavioralAnalysisPanel";
import RewritePanel from "./components/RewritePanel";
import {
  getExplanationStrategy,
} from "./services/geminiService";
import { getCoachingFeedbackWithGroq, describeImageWithGrok } from "./services/grokService";
import { imageDomains } from "./data/imageDomains";
import { getRandomImageWithRetry } from "./services/imageService";
import HomeDomains from "./components/HomeDomains";
import AboutSection from "./components/AboutSection";
import TeacherInterface from "./components/TeacherInterface";
import StorytellerInterface from "./components/StorytellerInterface";
import DebaterInterface from "./components/DebaterInterface";
import GroupDiscussionInterface from "./components/GroupDiscussionInterface";
import { useScrollAnimation } from "./hooks/useScrollAnimation";

interface ChallengeInfo {
  scoreToBeat: number;
}

const AppContent: React.FC = () => {
  const { theme } = useTheme();

  const initialDomain = imageDomains[0];
  const [selectedDomainSlug, setSelectedDomainSlug] = useState<string>(
    initialDomain?.slug ?? "",
  );
  const [domainImageIndices, setDomainImageIndices] = useState<
    Record<string, number>
  >(() => {
    const indices: Record<string, number> = {};
    imageDomains.forEach((domain) => {
      indices[domain.slug] = 0;
    });
    return indices;
  });
  const [imageUrl, setImageUrl] = useState<string>(() => {
    const timestamp = Date.now();
    const random1 = Math.floor(Math.random() * 999999999);
    const random2 = Math.random().toString(36).substring(2, 15);
    const random3 = Math.random().toString(36).substring(2, 15);
    return `https://picsum.photos/seed/${timestamp}-${random1}-${random2}-${random3}/1600/1200`;
  });

  // Debug wrapper for setImageUrl
  const setImageUrlWithLog = useCallback((url: string) => {
    if (import.meta.env.DEV) {
      console.log("🖼️ Setting image URL:", url);
    }
    setImageUrl(url);
  }, []);

  // Debug current imageUrl (dev only)
  if ((import.meta as any)?.env?.DEV) {
    console.log("🔍 Current imageUrl:", imageUrl);
  }
  const [userExplanation, setUserExplanation] = useState<string>("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>(CoachMode.Teacher);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistory[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(
    LoadingState.Idle,
  );
  const [error, setError] = useState<string | null>(null);
  const [challengeInfo, setChallengeInfo] = useState<ChallengeInfo | null>(
    null,
  );
  const [explanationStrategy, setExplanationStrategy] = useState<string | null>(
    null,
  );
  const [isFetchingStrategy, setIsFetchingStrategy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [showDescribeSection, setShowDescribeSection] =
    useState<boolean>(false);

  const [showTeacherInterface, setShowTeacherInterface] =
    useState<boolean>(false);
  const [showStorytellerInterface, setShowStorytellerInterface] =
    useState<boolean>(false);
  const [showDebaterInterface, setShowDebaterInterface] =
    useState<boolean>(false);
  const [showGroupDiscussionInterface, setShowGroupDiscussionInterface] =
    useState<boolean>(false);

  const [showHeadingAnimation, setShowHeadingAnimation] = useState(false);
  const [isReturningHome, setIsReturningHome] = useState<boolean>(false);

  // Coming Soon Modal State
  const [comingSoonFeature, setComingSoonFeature] = useState<{
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  } | null>(null);

  // Trigger heading animation after mount
  useEffect(() => {
    setTimeout(() => setShowHeadingAnimation(true), 100);
  }, []);

  // Initialize scroll animations (skip if returning home)
  useScrollAnimation(isReturningHome);

  // Force showDescribeSection to false when on home page
  useEffect(() => {
    const isOnHomePage =
      !showTeacherInterface &&
      !showStorytellerInterface &&
      !showDebaterInterface &&
      !showGroupDiscussionInterface;

    if (import.meta.env.DEV) {
      console.log("🔄 useEffect triggered:", {
        isOnHomePage,
        showDescribeSection,
        showTeacherInterface,
        showStorytellerInterface,
        showDebaterInterface,
        showGroupDiscussionInterface,
      });
    }

    if (isOnHomePage && showDescribeSection) {
      if (import.meta.env.DEV) {
        console.log("✅ Forcing showDescribeSection to false NOW!");
      }
      setShowDescribeSection(false);
    }
  }, [
    showTeacherInterface,
    showStorytellerInterface,
    showDebaterInterface,
    showGroupDiscussionInterface,
  ]);

  // Scroll to top when section changes
  useEffect(() => {
    // Instant scroll to top
    window.scrollTo({ top: 0, behavior: "instant" });
    // Also use scrollIntoView on body as backup
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }, [
    showDescribeSection,
    showTeacherInterface,
    showStorytellerInterface,
    showDebaterInterface,
    showGroupDiscussionInterface,
  ]);

  // Reset isReturningHome flag after showing home page
  useEffect(() => {
    if (
      isReturningHome &&
      !showTeacherInterface &&
      !showStorytellerInterface &&
      !showDebaterInterface &&
      !showGroupDiscussionInterface &&
      !showGroupDiscussionInterface &&
      !showDescribeSection
    ) {
      // Wait a bit for animations to complete, then reset flag
      const timer = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log("🔄 Resetting isReturningHome flag");
        }
        setIsReturningHome(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    isReturningHome,
    showTeacherInterface,
    showStorytellerInterface,
    showDebaterInterface,
    showGroupDiscussionInterface,
    showGroupDiscussionInterface,
    showDescribeSection,
  ]);

  // Groq API keys (supports multiple keys for automatic fallback)
  const groqApiKeys = useMemo(() => {
    try {
      const viteEnv = import.meta.env || {};
      const keys: string[] = [];

      // Try to load up to 4 API keys
      for (let i = 1; i <= 4; i++) {
        const keyName = i === 1 ? 'VITE_GROQ_API_KEY' : `VITE_GROQ_API_KEY_${i}`;
        const apiKey = (viteEnv as any)[keyName] ||
          (process as any)?.env?.[keyName.replace('VITE_', '')] ||
          (typeof localStorage !== "undefined" ? localStorage.getItem(keyName.replace('VITE_', '')) : null);

        if (apiKey && apiKey !== "your_groq_api_key_here" && apiKey !== `your_key_${i}`) {
          keys.push(apiKey);
        }
      }

      if ((import.meta as any)?.env?.DEV) {
        console.log("🔑 Groq API Keys Debug Info:", {
          keysFound: keys.length,
          keySlots: keys.map((_, idx) => `Key ${idx + 1}`),
        });
      }

      if (keys.length === 0) {
        console.error("❌ No GROQ_API_KEY found");
        return null;
      }

      if (import.meta.env.DEV) {
        console.log(`✅ ${keys.length} Groq API key(s) loaded successfully`);
      }
      return keys;
    } catch (error) {
      console.error("❌ Failed to load Groq API keys:", error);
      return null;
    }
  }, []);

  // Keep ai for legacy compatibility (strategy feature)
  const ai = useMemo(() => {
    try {
      const viteEnv = import.meta.env || {};
      const apiKey =
        (viteEnv as any).VITE_GEMINI_API_KEY ||
        (typeof localStorage !== "undefined"
          ? localStorage.getItem("GEMINI_API_KEY")
          : null);
      if (!apiKey) return null;
      return new GoogleGenAI({ apiKey });
    } catch {
      return null;
    }
  }, []);

  const domainLookup = useMemo<Record<string, ImageDomain>>(() => {
    const lookup: Record<string, ImageDomain> = {};
    imageDomains.forEach((domain) => {
      lookup[domain.slug] = domain;
    });
    return lookup;
  }, []);

  const effectiveSelectedDomain =
    selectedDomainSlug || (initialDomain?.slug ?? "");
  const activeDomain = useMemo(() => {
    if (!effectiveSelectedDomain) {
      return initialDomain;
    }
    return domainLookup[effectiveSelectedDomain] ?? initialDomain;
  }, [domainLookup, effectiveSelectedDomain, initialDomain]);

  const resetState = useCallback(() => {
    setUserExplanation("");
    setFeedback(null);
    setLoadingState(LoadingState.Idle);
    setError(null);
    setChallengeInfo(null);
    setExplanationStrategy(null);
  }, []);

  const handleImageUpload = useCallback((uploadedImageUrl: string) => {
    if (import.meta.env.DEV) {
      console.log("📤 Image uploaded:", uploadedImageUrl);
    }
    setImageUrl(uploadedImageUrl);
    resetState();
  }, [resetState]);

  const fetchNewImage = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log("🔄 Fetching random image...");
    }
    try {
      const randomImage = await getRandomImageWithRetry(activeDomain?.slug);
      if (import.meta.env.DEV) {
        console.log("✅ Image generated:", {
          url: randomImage.url,
          source: randomImage.source,
          category: randomImage.category,
        });
      }
      setImageUrl(randomImage.url);
      resetState();
    } catch (error) {
      console.error("❌ Failed to fetch image:", error);
      // Fallback - always unique
      const timestamp = Date.now();
      const random1 = Math.floor(Math.random() * 999999999);
      const random2 = Math.random().toString(36).substring(2, 15);
      const random3 = Math.random().toString(36).substring(2, 15);
      const random4 = Math.random().toString(36).substring(2, 15);
      const fallbackUrl = `https://picsum.photos/seed/${timestamp}-${random1}-${random2}-${random3}-${random4}/1600/1200`;
      if (import.meta.env.DEV) {
        console.log("🔄 Using fallback image");
      }
      setImageUrl(fallbackUrl);
      resetState();
    }
  }, [activeDomain?.slug, resetState]);

  const handleDomainSelect = useCallback(
    async (slug: string) => {
      const domain = domainLookup[slug];
      if (!domain) {
        return;
      }

      setSelectedDomainSlug(slug);
      // Keep indices state for future, but image generation is infinite random now
      setDomainImageIndices((prev) => ({ ...prev }));
      await fetchNewImage();
    },
    [domainLookup, fetchNewImage],
  );

  const handleImageSelect = useCallback(
    (slug: string, imageId: string) => {
      try {
        // Check if this is a selected image from DomainImageGallery (starts with 'selected-')
        if (imageId.startsWith("selected-")) {
          // For Pexels images, we need to get the image URL from the DomainImageGallery
          // The imageUrl will be set by the DomainImageGallery component
          setSelectedDomainSlug(slug);
          resetState();
          // Navigate to the describe section
          setShowDescribeSection(true);
          return;
        }

        // Find the specific image from the domain (for hardcoded domain images)
        const domain = domainLookup[slug];
        if (!domain) {
          console.error("Domain not found:", slug);
          setError("Failed to load image. Please try again.");
          return;
        }

        const selectedImage = domain.images.find((img) => img.id === imageId);
        if (selectedImage) {
          setImageUrl(selectedImage.src);
          setSelectedDomainSlug(slug);
          resetState();
        } else {
          console.error("Image not found:", imageId, "in domain:", slug);
          setError("Failed to load image. Please try again.");
        }
      } catch (err) {
        console.error("Error selecting image:", err);
        setError("Something went wrong. Please try again.");
      }
    },
    [domainLookup, resetState],
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const challengeImage = urlParams.get("image");
    const challengeScore = urlParams.get("score");

    if (challengeImage && challengeScore) {
      setImageUrl(decodeURIComponent(challengeImage));
      setChallengeInfo({ scoreToBeat: parseInt(challengeScore, 10) });
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const storedHistory = localStorage.getItem("scoreHistory");
    if (storedHistory) {
      setScoreHistory(JSON.parse(storedHistory));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scoreHistory.length > 0) {
      localStorage.setItem("scoreHistory", JSON.stringify(scoreHistory));
    }
  }, [scoreHistory]);

  const handleGetStrategy = async () => {
    // Strategy feature disabled - requires Gemini
    setError("Strategy feature is temporarily unavailable.");
    return;
  };

  // Clear URL hash on initial load to always start on home page
  useEffect(() => {
    // Clear hash on mount to force home page
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setShowDescribeSection(false);
  }, []);

  const handleSubmit = async () => {
    // Prevent concurrent submissions for stability
    const submittingRef =
      (handleSubmit as any)._submittingRef ||
      ((handleSubmit as any)._submittingRef = { current: false });
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Don't log unnecessarily

    if (!userExplanation.trim()) {
      setError("Please provide an explanation before submitting.");
      submittingRef.current = false;
      return;
    }

    // Check if we have Groq API key for feedback
    if (!groqApiKeys) {
      setError("Groq API key not configured. Please check your .env file.");
      submittingRef.current = false;
      return;
    }

    // Handle image mode only
    if (!imgRef.current) {
      setError("Image not loaded properly. Please try again.");
      return;
    }

    // Ensure image has finished loading and is drawable
    const waitForImageLoad = (image: HTMLImageElement, timeoutMs = 4000) =>
      new Promise<void>((resolve, reject) => {
        if (image.complete && image.naturalWidth > 0) return resolve();
        const onLoad = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Image failed to load"));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Image load timeout"));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          image.removeEventListener("load", onLoad);
          image.removeEventListener("error", onError);
        };
        image.addEventListener("load", onLoad);
        image.addEventListener("error", onError);
      });

    // Clear previous state first
    setError(null);
    setFeedback(null);
    setLoadingState(LoadingState.GeneratingCaption);

    try {
      await waitForImageLoad(imgRef.current);

      const makeCaption = async () => {
        console.log("🖼️ Using Hugging Face BLIP for image description...");

        if (!groqApiKeys) {
          throw new Error("Groq API key not configured");
        }

        // Convert image to base64
        const canvas = document.createElement("canvas");
        const img = imgRef.current as HTMLImageElement;

        const maxDimension = 1024;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64data = dataUrl.split(",")[1];

        console.log("📸 Generated base64 image data:", {
          length: base64data.length,
          dimensions: `${width}x${height}`,
          sample: base64data.substring(0, 50),
          imageUrl: img.src.substring(0, 100)
        });

        // Use Hugging Face BLIP for image description
        return await describeImageWithGrok(groqApiKeys, base64data);
      };

      let aiCaption: string;
      try {
        aiCaption = await makeCaption();
        console.log("✅ Grok Vision description:", aiCaption);
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isTransient =
          msg.includes("overloaded") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("timeout") ||
          msg.includes("Failed to fetch");
        if (isTransient) {
          await new Promise((r) => setTimeout(r, 600));
          aiCaption = await makeCaption();
        } else {
          throw e;
        }
      }

      setLoadingState(LoadingState.GeneratingFeedback);
      console.log("🤖 Now using Groq for coaching feedback...");

      const makeFeedback = async () => {
        if (!groqApiKeys) {
          throw new Error("Groq API key not configured");
        }
        return await getCoachingFeedbackWithGroq(
          groqApiKeys,
          aiCaption,
          userExplanation,
          coachMode,
          explanationStrategy,
        );
      };

      let coachFeedback;
      try {
        coachFeedback = await makeFeedback();
      } catch (e: any) {
        const msg = String(e?.message || e);
        const isTransient =
          msg.includes("overloaded") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("timeout") ||
          msg.includes("Failed to fetch");
        if (isTransient) {
          await new Promise((r) => setTimeout(r, 600));
          coachFeedback = await makeFeedback();
        } else {
          throw e;
        }
      }

      setFeedback(coachFeedback);
      const newHistoryEntry: ScoreHistory = {
        date: new Date().toISOString().split("T")[0],
        score: coachFeedback.score || coachFeedback.overall_score || 0,
        mode: coachMode,
      };
      setScoreHistory((prev) => [...prev, newHistoryEntry].slice(-10)); // Keep last 10 scores
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error during AI analysis:", err);

      // Provide more specific error messages
      let errorMessage =
        "An error occurred while getting feedback. Please try again.";
      if (err instanceof Error) {
        if (err.message.includes("Tainted")) {
          errorMessage =
            "CORS error detected. The image cannot be analyzed. Please reload the page.";
        } else if (err.message.includes("Failed to fetch")) {
          errorMessage =
            "Network error. Please check your internet connection and try again.";
        } else if (
          err.message.includes("timeout") ||
          err.message.includes("overloaded") ||
          err.message.includes("UNAVAILABLE")
        ) {
          errorMessage =
            "The AI service is busy. Please try again in a moment.";
        } else if (err.message.includes("API key")) {
          errorMessage =
            "API key issue. Please restart the development server.";
        } else {
          errorMessage = `Error: ${err.message}`;
        }
      }

      setError(errorMessage);
      setLoadingState(LoadingState.Error);
      setFeedback(null);
    } finally {
      submittingRef.current = false;
    }
  };

  const isLoading =
    loadingState === LoadingState.GeneratingCaption ||
    loadingState === LoadingState.GeneratingFeedback;
  const gallerySelectedSlug = activeDomain?.slug ?? initialDomain?.slug ?? "";

  // Show error if Groq API key is not configured
  if (!groqApiKeys) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          backgroundColor: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            textAlign: "center",
            padding: "40px",
            borderRadius: "12px",
            backgroundColor: "#1a1a1a",
            border: "1px solid #333",
          }}
        >
          <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>
            🔑 Groq API Key Required
          </h1>
          <p style={{ color: "#999", marginBottom: "24px", fontSize: "14px" }}>
            Please configure your Groq API key to use this application.
          </p>
          <p style={{ color: "#666", fontSize: "12px", marginBottom: "24px" }}>
            Add VITE_GROQ_API_KEY to your .env file.
          </p>
          <a
            href="https://console.groq.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: "#ffffff",
              color: "#000000",
              textDecoration: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Get Groq API Key
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`theme-animate-root min-h-screen font-sans transition-colors duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${theme === "dark" ? "bg-black text-white" : "bg-white text-black"
        }`}
    >
      {comingSoonFeature && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setComingSoonFeature(null)}
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-black p-8 shadow-2xl animate-in zoom-in-95 duration-300"
          >
            <div className="relative z-10 space-y-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50 text-gray-400">
                {comingSoonFeature.icon}
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-bold tracking-tight text-white uppercase">
                  {comingSoonFeature.title}
                </h3>
                <div className="mx-auto h-[1px] w-8 bg-gray-800" />
              </div>

              <p className="text-sm leading-relaxed text-gray-400 font-medium">
                {comingSoonFeature.description}
              </p>

              <div className="pt-2 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-600">
                Status: In Development
              </div>

              <button
                onClick={() => setComingSoonFeature(null)}
                className="w-full rounded-full border border-gray-800 bg-white py-3 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-gray-200 active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showTeacherInterface ? (
        <div className="animate-fade-in">
          <TeacherInterface
            onBack={() => {
              if (import.meta.env.DEV) {
                console.log("📍 BACK FROM TEACHER - Resetting to home");
              }
              // Immediately show all animated elements
              document
                .querySelectorAll("[data-scroll-animate]")
                .forEach((el) => {
                  el.classList.add("animate-in");
                });
              setIsReturningHome(true);
              setShowTeacherInterface(false);
              setShowDescribeSection(false);
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: "instant" });
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
              }, 0);
            }}
            ai={ai}
            grokApiKey={groqApiKeys}
          />
        </div>
      ) : showStorytellerInterface ? (
        <div className="animate-fade-in">
          <StorytellerInterface
            onBack={() => {
              if (import.meta.env.DEV) {
                console.log("📍 BACK FROM STORYTELLER - Resetting to home");
              }
              // Immediately show all animated elements
              document
                .querySelectorAll("[data-scroll-animate]")
                .forEach((el) => {
                  el.classList.add("animate-in");
                });
              setIsReturningHome(true);
              setShowStorytellerInterface(false);
              setShowDescribeSection(false);
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: "instant" });
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
              }, 0);
            }}
            ai={ai}
            grokApiKey={groqApiKeys}
          />
        </div>
      ) : showDebaterInterface ? (
        <div className="animate-fade-in">
          <DebaterInterface
            onBack={() => {
              if (import.meta.env.DEV) {
                console.log("📍 BACK FROM DEBATER - Resetting to home");
              }
              // Immediately show all animated elements
              document
                .querySelectorAll("[data-scroll-animate]")
                .forEach((el) => {
                  el.classList.add("animate-in");
                });
              setIsReturningHome(true);
              setShowDebaterInterface(false);
              setShowDescribeSection(false);
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: "instant" });
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
              }, 0);
            }}
            ai={ai}
            grokApiKey={groqApiKeys}
          />
        </div>
      ) : showGroupDiscussionInterface ? (
        <div className="animate-fade-in">
          <GroupDiscussionInterface
            onBack={() => {
              if (import.meta.env.DEV) {
                console.log(
                  "📍 BACK FROM GROUP DISCUSSION - Resetting to home",
                );
              }
              // Immediately show all animated elements
              document
                .querySelectorAll("[data-scroll-animate]")
                .forEach((el) => {
                  el.classList.add("animate-in");
                });
              setIsReturningHome(true);
              setShowGroupDiscussionInterface(false);
              setShowDescribeSection(false);
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: "instant" });
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
              }, 0);
            }}
            ai={ai}
            grokApiKey={groqApiKeys}
          />
        </div>
      ) : (
        <div key="home-page" className="animate-fade-in">
          <Header />
          <main className="w-full px-4 lg:px-8 mx-auto max-w-7xl">
            {import.meta.env.DEV &&
              console.log(
                "🏠 HOME PAGE - showDescribeSection =",
                showDescribeSection,
              )}
            {!showDescribeSection && (
              <section className="py-20">
                <div className="relative">
                  <div
                    className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_60%)] blur-3xl"
                    aria-hidden
                  />
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-14">
                    <div className="max-w-3xl space-y-6">
                      <p
                        className={`text-xs sm:text-sm uppercase tracking-[0.25em] sm:tracking-[0.35em] ${theme === "dark" ? "text-gray-600" : "text-gray-500"
                          }`}
                      >
                        Interpret
                      </p>
                      <h2
                        className={`text-[3rem] sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight ${theme === "dark" ? "text-white" : "text-black"
                          }`}
                        style={{
                          opacity: showHeadingAnimation ? 1 : 0,
                          transform: showHeadingAnimation
                            ? "translateY(0)"
                            : "translateY(30px)",
                          transition:
                            "opacity 1s ease-out, transform 1s ease-out",
                        }}
                      >
                        Build your explanation skills
                      </h2>
                      <p
                        className={`text-sm sm:text-base max-w-2xl leading-relaxed ${theme === "dark"
                          ? "text-gray-400/90"
                          : "text-gray-600"
                          }`}
                      >
                        Start with a random image to describe, then get instant
                        feedback and tips.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <button
                          onClick={() => setShowDescribeSection(true)}
                          className={`rounded-full border px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm lg:text-base font-semibold transition-all duration-300 whitespace-nowrap min-h-[44px] touch-manipulation ${theme === "dark"
                            ? "border-gray-600 bg-black text-white hover:bg-gray-900 hover:border-gray-500"
                            : "border-gray-800 bg-black text-white hover:bg-gray-900 hover:border-gray-700"
                            }`}
                        >
                          Try Image Describe
                        </button>
                        <button
                          onClick={() => setShowDescribeSection(true)}
                          className={`rounded-full border px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm lg:text-base font-semibold transition-all duration-300 whitespace-nowrap min-h-[44px] touch-manipulation ${theme === "dark"
                            ? "border-gray-600 bg-black text-white hover:bg-gray-900 hover:border-gray-500"
                            : "border-gray-800 bg-black text-white hover:bg-gray-900 hover:border-gray-700"
                            }`}
                        >
                          Start Now
                        </button>
                      </div>

                      <div className="mt-8" data-scroll-animate>
                        <div className="mb-6 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setShowTeacherInterface(true)}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15" />
                            </svg>
                            <span>Teacher</span>
                          </button>
                          <button
                            onClick={() => setShowDebaterInterface(true)}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            <span>Debater</span>
                          </button>
                          <button
                            onClick={() => setShowStorytellerInterface(true)}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            <span>Storyteller</span>
                          </button>
                          <button
                            onClick={() => setShowGroupDiscussionInterface(true)}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            <span>Group Discussion</span>
                          </button>
                          <button
                            onClick={() => setComingSoonFeature({
                              title: "Strategic Crisis Response",
                              description: "A high-stakes simulation designed to test leadership and decisive communication while navigating evolving emergency scenarios.",
                              color: "red",
                              icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            })}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Strategic Crisis Response</span>
                          </button>
                          <button
                            onClick={() => setComingSoonFeature({
                              title: "Mirror Persona",
                              description: "An advanced architectural mirror that mimics communication patterns to reveal unconscious habits and refine self-awareness.",
                              color: "blue",
                              icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            })}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>Mirror Persona</span>
                          </button>
                          <button
                            onClick={() => setComingSoonFeature({
                              title: "Play with Friend",
                              description: "Challenge your friends to explain the same image and compare scores. See who can craft the most compelling explanation and climb the leaderboard together.",
                              color: "green",
                              icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            })}
                            className={`group relative overflow-hidden border rounded-md px-3 py-2 text-xs font-semibold cursor-pointer hover:scale-105 transition-all duration-300 flex items-center space-x-2 min-h-[36px] ${theme === "dark"
                              ? "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:shadow-md hover:shadow-gray-500/20"
                              : "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-md hover:shadow-gray-700/20"
                              }`}
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span>Play with Friend</span>
                          </button>
                        </div>
                        <div
                          className="grid grid-cols-3 gap-3 max-w-2xl mx-auto md:max-w-none"
                          data-scroll-animate
                        >
                          {[
                            {
                              src: "/images/Gemini_Generated_Image_b5530wb5530wb553.png",
                              alt: "AI-Powered Professional Debate Coach",
                            },
                            {
                              src: "/images/Gemini_Generated_Image_ev6r7qev6r7qev6r.png",
                              alt: "AI Communication Coach with interactive feedback",
                            },
                            {
                              src: "/images/Gemini_Generated_Image_nqc4zsnqc4zsnqc4.png",
                              alt: "Performance analysis and feedback system",
                            },
                          ].map((image, i) => (
                            <div
                              key={i}
                              className={`relative aspect-[4/3] overflow-hidden rounded-lg md:rounded-2xl border ui-card ${theme === "dark"
                                ? "border-gray-800/70 bg-gray-900/60"
                                : "border-gray-200 bg-gray-50"
                                }`}
                            >
                              <img
                                src={image.src}
                                alt={image.alt}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hover:scale-[1.03]"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        {/* Expanded explanatory content */}
                        <div className="mt-6 space-y-4">
                          <div>
                            <div
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${theme === "dark"
                                ? "border-gray-800 bg-gray-900/60 text-gray-300"
                                : "border-gray-200 bg-gray-100 text-gray-700"
                                }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
                              Built to make your ideas land
                            </div>
                            <p
                              className={`mt-3 text-sm leading-relaxed max-w-2xl ${theme === "dark"
                                ? "text-gray-400"
                                : "text-gray-600"
                                }`}
                            >
                              Interpret helps you turn fuzzy
                              thoughts into crisp explanations. Practice on
                              realistic visuals, write your take, and get
                              instant feedback on clarity, structure, and
                              impact. Level up fast with strategies you can
                              reuse in interviews, standups, and presentations.
                            </p>
                          </div>
                          <div
                            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                            data-scroll-animate
                          >
                            <div
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${theme === "dark"
                                ? "bg-gray-900/60 border-gray-800 hover:bg-gray-900/80"
                                : "bg-black border-gray-800 hover:bg-gray-900"
                                }`}
                            >
                              <p
                                className="text-sm font-semibold"
                                style={{ color: "#ffffff" }}
                              >
                                Practice that sticks
                              </p>
                              <p
                                className="text-xs mt-1"
                                style={{ color: "#9ca3af" }}
                              >
                                Short, focused reps so you build habits—not just
                                answers.
                              </p>
                            </div>
                            <div
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${theme === "dark"
                                ? "bg-gray-900/60 border-gray-800 hover:bg-gray-900/80"
                                : "bg-black border-gray-800 hover:bg-gray-900"
                                }`}
                            >
                              <p
                                className="text-sm font-semibold"
                                style={{ color: "#ffffff" }}
                              >
                                Feedback that matters
                              </p>
                              <p
                                className="text-xs mt-1"
                                style={{ color: "#9ca3af" }}
                              >
                                Specific next steps on tone, structure, and
                                storytelling.
                              </p>
                            </div>
                            <a
                              href="#about"
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${theme === "dark"
                                ? "bg-gray-900/60 border-gray-800 hover:bg-gray-900/80"
                                : "bg-black border-gray-800 hover:bg-gray-900"
                                }`}
                            >
                              <p
                                className="text-sm font-semibold"
                                style={{ color: "#ffffff" }}
                              >
                                Learn how it works
                              </p>
                              <p
                                className="text-xs mt-1"
                                style={{ color: "#9ca3af" }}
                              >
                                Dive deeper into benefits and the coaching flow.
                              </p>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      data-scroll-animate
                      className={`w-full lg:max-w-xl rounded-3xl border p-7 space-y-5 ${theme === "dark"
                        ? "bg-black border-gray-800 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.6)]"
                        : "bg-white border-gray-200 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.1)]"
                        }`}
                    >
                      <HomeDomains
                        domains={imageDomains}
                        selectedDomainSlug={selectedDomainSlug}
                        onSelectDomain={async (slug) => {
                          await handleDomainSelect(slug);
                          setShowDescribeSection(true);
                        }}
                        onSelectImage={handleImageSelect}
                        onImageUrlSet={setImageUrlWithLog}
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Coach Selection Interface - Always show on home page */}
            {!showDescribeSection && (
              <>
                <section className="py-20">
                  <div className="max-w-5xl mx-auto">
                    <div
                      className="text-center mb-12 sm:mb-16 px-4"
                      data-scroll-animate
                    >
                      <p className="text-xs sm:text-sm uppercase tracking-[0.25em] sm:tracking-[0.35em] text-gray-600 mb-4">
                        AI Coaching
                      </p>
                      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
                        Choose your coaching style
                      </h2>
                      <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        Each coach brings a unique perspective to help you
                        improve your communication skills
                      </p>
                    </div>

                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                      data-scroll-animate
                    >
                      {/* Teacher Coach */}
                      <button
                        onClick={() => setShowTeacherInterface(true)}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_-25px_rgba(255,255,255,0.1)] focus:outline-none hover:border-white/50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight group-hover:text-white transition-colors duration-300">
                              Teacher
                            </h3>
                            <p className="mt-1 text-xs text-white leading-relaxed line-clamp-2 group-hover:text-gray-100 transition-colors duration-300">
                              Structured, constructive feedback focused on
                              learning and improvement
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Clear
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Guided
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Supportive
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="bg-white text-black px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                            <span>Start</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                      </button>

                      {/* Debater Coach */}
                      <button
                        onClick={() => setShowDebaterInterface(true)}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_-25px_rgba(255,255,255,0.1)] focus:outline-none hover:border-white/50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight group-hover:text-white transition-colors duration-300">
                              Debater
                            </h3>
                            <p className="mt-1 text-xs text-white leading-relaxed line-clamp-2 group-hover:text-gray-100 transition-colors duration-300">
                              Analytical, challenging feedback that pushes your
                              critical thinking
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Logical
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Critical
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Evidence
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="bg-white text-black px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                            <span>Start</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                      </button>

                      {/* Storyteller Coach */}
                      <button
                        onClick={() => setShowStorytellerInterface(true)}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_-25px_rgba(255,255,255,0.1)] focus:outline-none hover:border-white/50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight group-hover:text-white transition-colors duration-300">
                              Storyteller
                            </h3>
                            <p className="mt-1 text-xs text-white leading-relaxed line-clamp-2 group-hover:text-gray-100 transition-colors duration-300">
                              Creative, expressive feedback that enhances your
                              narrative skills
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Creative
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Engaging
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Expressive
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="bg-white text-black px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                            <span>Start</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                      </button>

                      {/* Group Discussion Coach */}
                      <button
                        onClick={() => setShowGroupDiscussionInterface(true)}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_-25px_rgba(255,255,255,0.1)] focus:outline-none hover:border-white/50"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight group-hover:text-white transition-colors duration-300">
                              Group Discussion
                            </h3>
                            <p className="mt-1 text-xs text-white leading-relaxed line-clamp-2 group-hover:text-gray-100 transition-colors duration-300">
                              Practice with AI agents in realistic group
                              discussions and get comprehensive feedback
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Dynamic
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Interactive
                          </div>
                          <div
                            className="text-xs bg-gray-800/50 rounded-lg px-2 py-1 text-center group-hover:bg-white/10 transition-all duration-300"
                            style={{ color: "#d1d5db" }}
                          >
                            Realistic
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="bg-white text-black px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                            <span>Start</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                      </button>

                      {/* Strategic Crisis Response */}
                      <button
                        onClick={() => setComingSoonFeature({
                          title: "Strategic Crisis Response",
                          description: "A high-stakes simulation designed to test leadership and decisive communication while navigating evolving emergency scenarios.",
                          color: "red",
                          icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        })}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left transition-all duration-500 hover:-translate-y-1 hover:border-gray-600 focus:outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight uppercase text-xs">
                              Strategic Crisis Response
                            </h3>
                            <p className="mt-1 text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                              Lead your team through high-pressure emergency simulations
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Leadership</div>
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Decisive</div>
                        </div>
                        <div className="absolute top-3 right-3">
                          <div className="text-gray-700 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-gray-900 rounded">
                            Soon
                          </div>
                        </div>
                      </button>

                      {/* Mirror Persona */}
                      <button
                        onClick={() => setComingSoonFeature({
                          title: "Mirror Persona",
                          description: "An advanced architectural mirror that mimics communication patterns to reveal unconscious habits and refine self-awareness.",
                          color: "blue",
                          icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        })}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left transition-all duration-500 hover:-translate-y-1 hover:border-gray-600 focus:outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight uppercase text-xs">
                              Mirror Persona
                            </h3>
                            <p className="mt-1 text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                              Face an AI mimic that reflects your communication architectural style
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Patterns</div>
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Self-Aware</div>
                        </div>
                        <div className="absolute top-3 right-3">
                          <div className="text-gray-700 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-gray-900 rounded">
                            Soon
                          </div>
                        </div>
                      </button>

                      {/* Play with Friend */}
                      <button
                        onClick={() => setComingSoonFeature({
                          title: "Play with Friend",
                          description: "Challenge your friends to explain the same image and compare scores. See who can craft the most compelling explanation and climb the leaderboard together.",
                          color: "green",
                          icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        })}
                        className="group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-black border border-gray-800 p-5 text-left transition-all duration-500 hover:-translate-y-1 hover:border-gray-600 focus:outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="text-white font-semibold tracking-tight uppercase text-xs">
                              Play with Friend
                            </h3>
                            <p className="mt-1 text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                              Challenge friends and compare scores on the same image
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Challenge</div>
                          <div className="text-[9px] border border-gray-800 rounded px-2 py-0.5 text-gray-600 font-bold uppercase tracking-tighter">Compete</div>
                        </div>
                        <div className="absolute top-3 right-3">
                          <div className="text-gray-700 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-gray-900 rounded">
                            Soon
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Start Button */}
                    <div className="text-center mt-12" data-scroll-animate>
                      <button
                        onClick={() => setShowDescribeSection(true)}
                        className="group relative rounded-full border border-gray-600 bg-black text-white px-8 py-3 text-sm font-semibold hover:border-white/50 hover:bg-white/5 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_rgba(255,255,255,0.2)] focus:outline-none"
                      >
                        <span className="relative z-10">Start Practicing</span>
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </button>
                    </div>
                  </div>
                </section>

                <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-6" />
                <AboutSection />
              </>
            )}

            {/* Image Describe Section */}
            {showDescribeSection && (
              <div className="py-14" id="image-describe">
                {/* Back to Home Button */}
                <div className="pt-8 mb-8">
                  <button
                    onClick={() => {
                      setIsReturningHome(true);
                      setShowDescribeSection(false);
                      // Wait for React to re-render home page, then show all animated elements
                      setTimeout(() => {
                        document
                          .querySelectorAll("[data-scroll-animate]")
                          .forEach((el) => {
                            el.classList.add("animate-in");
                          });
                        window.scrollTo({ top: 0, behavior: "instant" });
                        document.body.scrollTop = 0;
                        document.documentElement.scrollTop = 0;
                      }, 50);
                    }}
                    className="flex items-center text-gray-400 hover:text-white transition-colors duration-200"
                  >
                    <svg
                      className="w-5 h-5 mr-2"
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
                    Back to Home
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                  {/* Left Side - Image */}
                  <div className="space-y-4 sm:space-y-6">
                    <ImagePanel
                      ref={imgRef}
                      imageUrl={imageUrl}
                      onNewImage={fetchNewImage}
                      onImageUpload={handleImageUpload}
                      onPlayWithFriend={() => setComingSoonFeature({
                        title: "Play with Friend",
                        description: "Challenge your friends to explain the same image and compare scores. See who can craft the most compelling explanation and climb the leaderboard together.",
                        color: "green",
                        icon: <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      })}
                      isLoading={isLoading}
                      domainTitle={activeDomain?.title}
                      domainEmoji={activeDomain?.emoji}
                      domainDescription={activeDomain?.description}
                    />
                  </div>

                  {/* Right Side - Controls and Input */}
                  <div className="space-y-6">
                    <ControlsPanel
                      selectedMode={coachMode}
                      onModeChange={setCoachMode}
                      isDisabled={isLoading}
                    />
                    <InputPanel
                      explanation={userExplanation}
                      onExplanationChange={setUserExplanation}
                      onSubmit={handleSubmit}
                      loadingState={loadingState}
                      challengeInfo={challengeInfo}
                      onGetStrategy={handleGetStrategy}
                      isFetchingStrategy={isFetchingStrategy}
                      strategy={explanationStrategy}
                      onDismissStrategy={() => setExplanationStrategy(null)}
                    />
                    {error && (
                      <div className="text-red-400 bg-red-900/50 p-3 rounded-lg border border-red-800">
                        {error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Feedback Section - Full Width Below */}
                <div className="mt-8 sm:mt-12">
                  <FeedbackPanel
                    feedback={feedback}
                    loadingState={loadingState}
                    imageUrl={imageUrl}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8 scroll-stagger">
                    <BehavioralAnalysisPanel
                      behavior={feedback?.communicationBehavior}
                    />
                    <RewritePanel rewrite={feedback?.exampleRewrite} />
                  </div>
                  <div className="mt-8">
                    <ProgressPanel history={scoreHistory} />
                  </div>
                </div>
              </div>
            )}
          </main>
          <Footer />
        </div>
      )
      }
    </div >
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
