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
  getCoachingFeedback,
  generateImageCaption,
  imageToGenerativePart,
  getExplanationStrategy,
} from "./services/geminiService";
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
    showDescribeSection,
  ]);

  const ai = useMemo(() => {
    try {
      // Try multiple ways to get the API key
      const viteEnv = import.meta.env || {};
      const apiKey =
        (viteEnv as any).VITE_GEMINI_API_KEY ||
        (viteEnv as any).VITE_API_KEY ||
        (process as any)?.env?.GEMINI_API_KEY ||
        (process as any)?.env?.API_KEY ||
        (typeof localStorage !== "undefined"
          ? localStorage.getItem("GEMINI_API_KEY")
          : null);

      // Fallback API key for development only
      const fallbackKey = "AIzaSyBPEjh_dA8zE28fkzAm-bk7ozKADItV-yw";

      if ((import.meta as any)?.env?.DEV) {
        console.log("🔑 API Key Debug Info:", {
          importMetaEnvType: typeof import.meta.env,
          hasViteGeminiKey: !!(viteEnv as any).VITE_GEMINI_API_KEY,
          hasViteApiKey: !!(viteEnv as any).VITE_API_KEY,
          hasKey: !!apiKey,
          usingFallback: !apiKey,
        });
      }

      const finalKey = apiKey || fallbackKey;

      if (!finalKey || finalKey === "your_gemini_api_key_here") {
        console.error("❌ GEMINI_API_KEY not found");
        return null;
      }

      if (import.meta.env.DEV) {
        console.log("✅ Gemini AI initialized successfully");
      }
      return new GoogleGenAI({ apiKey: finalKey });
    } catch (error) {
      console.error("❌ Failed to initialize Gemini AI:", error);
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
    if (!ai || !imgRef.current) {
      setError("Cannot get strategy until the image is loaded.");
      return;
    }
    setIsFetchingStrategy(true);
    setError(null);
    try {
      const imagePart = await imageToGenerativePart(imgRef.current);
      const strategy = await getExplanationStrategy(ai, imagePart);
      setExplanationStrategy(strategy);
    } catch (err) {
      console.error(err);
      setError("Could not fetch a strategy. Please try again.");
    } finally {
      setIsFetchingStrategy(false);
    }
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
      return;
    }
    if (!ai) {
      if (import.meta.env.DEV) {
        console.log("❌ AI not initialized - API key missing");
      }
      // For testing purposes, show mock feedback
      const mockFeedback = {
        role: coachMode,
        overall_score: 85,
        category_scores: {
          clarity: 18,
          vocabulary: 17,
          grammar: 20,
          logic: 15,
          fluency: 16,
          creativity: 15,
        },
        feedback: `As a ${coachMode}, I can see you've provided a thoughtful explanation. Your communication shows good structure and clarity.`,
        tips: [
          "Add more descriptive adjectives to enhance vocabulary richness.",
          "Slow down your delivery to improve clarity.",
          "Use transitions between ideas for better flow.",
          "Consider adding emotional context to make it more engaging.",
        ],
        // Legacy fields
        score: 85,
        whatYouDidWell: "Good structure and clear communication.",
        areasForImprovement:
          "Could use richer vocabulary and smoother transitions.",
        personalizedTip:
          "Focus on adding descriptive language to enhance your explanation.",
        spokenResponse: "Your explanation shows good structure and clarity.",
        communicationBehavior: {
          profile: "Clear Communicator",
          strength: "Good organization of ideas",
          growthArea: "Vocabulary richness",
        },
        exampleRewrite: {
          original: "The image shows a person.",
          improved:
            "The image depicts a confident individual standing in a professional setting.",
          reasoning:
            "The improved version adds descriptive language and context.",
        },
      };

      setFeedback(mockFeedback);
      setLoadingState(LoadingState.Done);
      if (import.meta.env.DEV) {
        console.log("🎭 Using mock feedback for testing");
      }
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
        const imagePart = await imageToGenerativePart(
          imgRef.current as HTMLImageElement,
        );
        return await generateImageCaption(ai, imagePart);
      };

      let aiCaption: string;
      try {
        aiCaption = await makeCaption();
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

      const makeFeedback = async () => {
        return await getCoachingFeedback(
          ai,
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

  // Show error if AI is not initialized
  if (!ai) {
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
            🔑 API Key Required
          </h1>
          <p style={{ color: "#999", marginBottom: "24px", fontSize: "14px" }}>
            Please configure your Gemini API key to use this application.
          </p>
          <p style={{ color: "#666", fontSize: "12px", marginBottom: "24px" }}>
            Get your free API key from Google AI Studio and add it to your
            environment variables.
          </p>
          <a
            href="https://makersuite.google.com/app/apikey"
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
            Get API Key
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`theme-animate-root min-h-screen font-sans transition-colors duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        theme === "dark" ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
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
                        className={`text-xs sm:text-sm uppercase tracking-[0.25em] sm:tracking-[0.35em] ${
                          theme === "dark" ? "text-gray-600" : "text-gray-500"
                        }`}
                      >
                        AI COMMUNICATION COACH
                      </p>
                      <h2
                        className={`text-[3rem] sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight ${
                          theme === "dark" ? "text-white" : "text-black"
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
                        className={`text-sm sm:text-base max-w-2xl leading-relaxed ${
                          theme === "dark"
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
                          className={`rounded-full border px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm lg:text-base font-semibold hover:opacity-95 transition-all duration-200 whitespace-nowrap min-h-[44px] touch-manipulation hover:scale-105 active:scale-95 ${
                            theme === "dark"
                              ? "border-gray-600 bg-black text-white hover:bg-gray-900 hover:shadow-lg"
                              : "border-gray-300 bg-white text-black hover:bg-gray-50 hover:shadow-lg"
                          }`}
                        >
                          Try Image Describe
                        </button>
                        <button
                          onClick={() => setShowDescribeSection(true)}
                          className={`rounded-full border px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm lg:text-base font-semibold hover:opacity-95 transition-all duration-200 whitespace-nowrap min-h-[44px] touch-manipulation hover:scale-105 active:scale-95 ${
                            theme === "dark"
                              ? "border-gray-600 bg-black text-white hover:bg-gray-900 hover:shadow-lg"
                              : "border-gray-300 bg-white text-black hover:bg-gray-50 hover:shadow-lg"
                          }`}
                        >
                          Start Now
                        </button>
                      </div>

                      <div className="mt-8" data-scroll-animate>
                        <div className="mb-6 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setShowTeacherInterface(true)}
                            className={`rounded-md border px-4 py-2 text-xs font-semibold cursor-pointer hover:translate-y-[-2px] transition-all duration-200 flex items-center space-x-2 ${
                              theme === "dark"
                                ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
                                : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:shadow-md"
                            }`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                            </svg>
                            <span>Teacher</span>
                          </button>
                          <button
                            onClick={() => setShowDebaterInterface(true)}
                            className={`rounded-md border px-4 py-2 text-xs font-semibold cursor-pointer hover:translate-y-[-2px] transition-all duration-200 flex items-center space-x-2 ${
                              theme === "dark"
                                ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
                                : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:shadow-md"
                            }`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span>Debater</span>
                          </button>
                          <button
                            onClick={() => setShowStorytellerInterface(true)}
                            className={`rounded-md border px-4 py-2 text-xs font-semibold cursor-pointer hover:translate-y-[-2px] transition-all duration-200 flex items-center space-x-2 ${
                              theme === "dark"
                                ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
                                : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:shadow-md"
                            }`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                            </svg>
                            <span>Storyteller</span>
                          </button>
                          <button
                            onClick={() =>
                              setShowGroupDiscussionInterface(true)
                            }
                            className={`rounded-md border px-4 py-2 text-xs font-semibold cursor-pointer hover:translate-y-[-2px] transition-all duration-200 flex items-center space-x-2 ${
                              theme === "dark"
                                ? "border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
                                : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:shadow-md"
                            }`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                            </svg>
                            <span>Group Discussion</span>
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
                              className={`relative aspect-[4/3] overflow-hidden rounded-lg md:rounded-2xl border ui-card ${
                                theme === "dark"
                                  ? "border-gray-800/70 bg-gray-900/60"
                                  : "border-gray-200 bg-gray-50"
                              }`}
                            >
                              <img
                                src={image.src}
                                alt={image.alt}
                                className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hover:scale-[1.03]"
                              />
                            </div>
                          ))}
                        </div>
                        {/* Expanded explanatory content */}
                        <div className="mt-6 space-y-4">
                          <div>
                            <div
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                                theme === "dark"
                                  ? "border-gray-800 bg-gray-900/60 text-gray-300"
                                  : "border-gray-200 bg-gray-100 text-gray-700"
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
                              Built to make your ideas land
                            </div>
                            <p
                              className={`mt-3 text-sm leading-relaxed max-w-2xl ${
                                theme === "dark"
                                  ? "text-gray-400"
                                  : "text-gray-600"
                              }`}
                            >
                              AI Communication Coach helps you turn fuzzy
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
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${
                                theme === "dark"
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
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${
                                theme === "dark"
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
                              className={`rounded-2xl p-5 transition-colors duration-300 border ${
                                theme === "dark"
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
                      className={`w-full lg:max-w-xl rounded-3xl border p-7 space-y-5 ${
                        theme === "dark"
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
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
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
      )}
    </div>
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
