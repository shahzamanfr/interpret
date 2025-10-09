import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { CoachMode, Feedback, ScoreHistory, LoadingState, ImageDomain } from './types';
import Header from './components/Header';
// removed DomainGallery
import ImagePanel from './components/ImagePanel';
import InputPanel from './components/InputPanel';
import FeedbackPanel from './components/FeedbackPanel';
import ControlsPanel from './components/ControlsPanel';
import ProgressPanel from './components/ProgressPanel';
import BehavioralAnalysisPanel from './components/BehavioralAnalysisPanel';
import RewritePanel from './components/RewritePanel';
import { getCoachingFeedback, generateImageCaption, imageToGenerativePart, getExplanationStrategy } from './services/geminiService';
import { imageDomains } from './data/imageDomains';
import HomeDomains from './components/HomeDomains';
import AboutSection from './components/AboutSection';
import CoachPreview from './components/CoachPreview';

interface ChallengeInfo {
  scoreToBeat: number;
}

const App: React.FC = () => {
  const initialDomain = imageDomains[0];
  const [selectedDomainSlug, setSelectedDomainSlug] = useState<string>(initialDomain?.slug ?? '');
  const [domainImageIndices, setDomainImageIndices] = useState<Record<string, number>>(() => {
    const indices: Record<string, number> = {};
    imageDomains.forEach((domain) => {
      indices[domain.slug] = 0;
    });
    return indices;
  });
  const [imageUrl, setImageUrl] = useState<string>(() => `https://picsum.photos/1024/768?random=${new Date().getTime()}`);
  const [userExplanation, setUserExplanation] = useState<string>('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>(CoachMode.Teacher);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistory[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.Idle);
  const [error, setError] = useState<string | null>(null);
  const [challengeInfo, setChallengeInfo] = useState<ChallengeInfo | null>(null);
  const [explanationStrategy, setExplanationStrategy] = useState<string | null>(null);
  const [isFetchingStrategy, setIsFetchingStrategy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [showDescribeSection, setShowDescribeSection] = useState<boolean>(() => window.location.hash === '#image-describe');
  
  const ai = useMemo(() => {
    if (process.env.API_KEY) {
      return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return null;
  }, []);

  const domainLookup = useMemo<Record<string, ImageDomain>>(() => {
    const lookup: Record<string, ImageDomain> = {};
    imageDomains.forEach((domain) => {
      lookup[domain.slug] = domain;
    });
    return lookup;
  }, []);

  const effectiveSelectedDomain = selectedDomainSlug || (initialDomain?.slug ?? '');
  const activeDomain = useMemo(() => {
    if (!effectiveSelectedDomain) {
      return initialDomain;
    }
    return domainLookup[effectiveSelectedDomain] ?? initialDomain;
  }, [domainLookup, effectiveSelectedDomain, initialDomain]);

  const resetState = useCallback(() => {
    setUserExplanation('');
    setFeedback(null);
    setLoadingState(LoadingState.Idle);
    setError(null);
    setChallengeInfo(null);
    setExplanationStrategy(null);
  }, []);


  const fetchNewImage = useCallback(() => {
    const newImageUrl = `https://picsum.photos/1024/768?random=${new Date().getTime()}`;
    setImageUrl(newImageUrl);
    resetState();
  }, [resetState]);

  const handleDomainSelect = useCallback((slug: string) => {
    const domain = domainLookup[slug];
    if (!domain) {
      return;
    }

    setSelectedDomainSlug(slug);
    // Keep indices state for future, but image generation is random now
    setDomainImageIndices((prev) => ({ ...prev }));
    fetchNewImage();
  }, [domainLookup, fetchNewImage]);

  const handleImageSelect = useCallback((slug: string, _imageId: string) => {
    // Selecting an image now just triggers a new random image within the chosen domain context
    const domain = domainLookup[slug];
    if (!domain) {
      return;
    }
    setSelectedDomainSlug(slug);
    fetchNewImage();
  }, [domainLookup, fetchNewImage]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const challengeImage = urlParams.get('image');
    const challengeScore = urlParams.get('score');

    if (challengeImage && challengeScore) {
      setImageUrl(decodeURIComponent(challengeImage));
      setChallengeInfo({ scoreToBeat: parseInt(challengeScore, 10) });
       // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const storedHistory = localStorage.getItem('scoreHistory');
    if (storedHistory) {
      setScoreHistory(JSON.parse(storedHistory));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scoreHistory.length > 0) {
      localStorage.setItem('scoreHistory', JSON.stringify(scoreHistory));
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
      const imagePart = imageToGenerativePart(imgRef.current);
      const strategy = await getExplanationStrategy(ai, imagePart);
      setExplanationStrategy(strategy);
    } catch (err) {
      console.error(err);
      setError("Could not fetch a strategy. Please try again.");
    } finally {
      setIsFetchingStrategy(false);
    }
  };

  // Toggle visibility of the describe section based on URL hash
  useEffect(() => {
    const onHashChange = () => {
      setShowDescribeSection(window.location.hash === '#image-describe');
    };
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSubmit = async () => {
    if (!userExplanation.trim()) {
      setError("Please provide an explanation before submitting.");
      return;
    }
    if (!ai) {
      setError("API Key is not configured. Please check your environment variables.");
      return;
    }
    if (!imgRef.current) {
      setError("Image not loaded properly. Please try again.");
      return;
    }

    setLoadingState(LoadingState.GeneratingCaption);
    setError(null);
    setFeedback(null);

    try {
      const imagePart = imageToGenerativePart(imgRef.current);
      
      const aiCaption = await generateImageCaption(ai, imagePart);
      
      setLoadingState(LoadingState.GeneratingFeedback);
      
      const coachFeedback = await getCoachingFeedback(ai, aiCaption, userExplanation, coachMode, explanationStrategy);
      
      setFeedback(coachFeedback);
      const newHistoryEntry: ScoreHistory = {
        date: new Date().toISOString().split('T')[0],
        score: coachFeedback.score,
        mode: coachMode,
      };
      setScoreHistory(prev => [...prev, newHistoryEntry].slice(-10)); // Keep last 10 scores
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error(err);
      setError("An error occurred while getting feedback. Please try again.");
      setLoadingState(LoadingState.Error);
    }
  };

  const isLoading = loadingState === LoadingState.GeneratingCaption || loadingState === LoadingState.GeneratingFeedback;
  const gallerySelectedSlug = activeDomain?.slug ?? (initialDomain?.slug ?? '');

  return (
    <div className="min-h-screen bg-black font-sans">
      <Header />
      <main className="w-full px-4 lg:px-8 mx-auto max-w-7xl">
        {!showDescribeSection && (
          <section className="py-20">
            <div className="relative">
              <div className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_60%)] blur-3xl" aria-hidden />
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-14">
                <div className="max-w-3xl space-y-6">
                <p className="text-xs uppercase tracking-[0.35em] text-gray-600">AI Communication Coach</p>
                <h2 className="text-5xl sm:text-6xl font-semibold tracking-tight text-white">Build your explanation skills</h2>
                <p className="text-base text-gray-400/90 max-w-2xl">Start with a random image to describe, then get instant feedback and tips.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a href="#image-describe" className="rounded-full border border-gray-600 bg-black text-white px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition-colors duration-200">Try Image Describe</a>
                  <a href="#image-describe" className="rounded-full border border-gray-600 bg-black text-white px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition-colors duration-200">Start Now</a>
                </div>
                <div className="mt-8">
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs font-semibold text-gray-300">Teacher</span>
                      <span className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs font-semibold text-gray-300">Debater</span>
                      <span className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs font-semibold text-gray-300">Storyteller</span>
                    </div>
                  <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1,2,3].map((i) => (
                      <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-gray-800/70 bg-gray-900/60 ui-card">
                        <img
                          src={`https://picsum.photos/seed/hero-${i}/640/480`}
                          alt="Website preview"
                          className="h-full w-full object-cover grayscale contrast-125 hover:grayscale-0 transition-[transform,filter] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" aria-hidden />
                      </div>
                    ))}
                  </div>
                  {/* Expanded explanatory content */}
                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs font-semibold text-gray-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
                        Built to make your ideas land
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-gray-400 max-w-2xl">
                        AI Communication Coach helps you turn fuzzy thoughts into crisp explanations. Practice on realistic visuals,
                        write your take, and get instant feedback on clarity, structure, and impact. Level up fast with
                        strategies you can reuse in interviews, standups, and presentations.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-2xl ui-card p-5 transition-colors duration-300 hover:bg-gray-900/60">
                        <p className="text-white text-sm font-semibold">Practice that sticks</p>
                        <p className="text-xs text-gray-400 mt-1">Short, focused reps so you build habits—not just answers.</p>
                      </div>
                      <div className="rounded-2xl ui-card p-5 transition-colors duration-300 hover:bg-gray-900/60">
                        <p className="text-white text-sm font-semibold">Feedback that matters</p>
                        <p className="text-xs text-gray-400 mt-1">Specific next steps on tone, structure, and storytelling.</p>
                      </div>
                      <a href="#about" className="rounded-2xl ui-card p-5 transition-colors duration-300 hover:bg-gray-900/60">
                        <p className="text-white text-sm font-semibold">Learn how it works</p>
                        <p className="text-xs text-gray-400 mt-1">Dive deeper into benefits and the coaching flow.</p>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
                <div className="w-full lg:max-w-xl rounded-3xl ui-card p-7 space-y-5 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.6)]">
                <HomeDomains
                  domains={imageDomains}
                  selectedDomainSlug={selectedDomainSlug}
                  onSelectDomain={(slug) => {
                    handleDomainSelect(slug);
                    window.location.hash = '#image-describe';
                  }}
                />
                  <CoachPreview />
              </div>
              </div>
            </div>
          </section>
        )}

        {!showDescribeSection && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-6" />
            <AboutSection />
          </>
        )}

        {showDescribeSection && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 py-14" id="image-describe">
            <div className="lg:col-span-7 space-y-10">
              {/* DomainGallery removed as requested */}
              <ImagePanel
                ref={imgRef}
                imageUrl={imageUrl}
                onNewImage={fetchNewImage}
                isLoading={isLoading}
                domainTitle={activeDomain?.title}
                domainEmoji={activeDomain?.emoji}
                domainDescription={activeDomain?.description}
              />
              <ControlsPanel selectedMode={coachMode} onModeChange={setCoachMode} isDisabled={isLoading} />
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
              {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-lg border border-red-800">{error}</div>}
            </div>
            <div className="lg:col-span-5 space-y-8 mt-12 lg:mt-0">
              <FeedbackPanel feedback={feedback} loadingState={loadingState} imageUrl={imageUrl} />
              <BehavioralAnalysisPanel behavior={feedback?.communicationBehavior} />
              <RewritePanel rewrite={feedback?.exampleRewrite} />
              <ProgressPanel history={scoreHistory} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
