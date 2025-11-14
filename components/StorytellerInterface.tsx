import React, { useState, useRef } from "react";
import {
  CoachMode,
  Feedback,
  LoadingState,
  UploadedFile,
  FileUploadState,
} from "../types";
import {
  getTextScenarioFeedback,
  refineScenarioForStorytelling,
  getEnhancedStorytellerEvaluation,
  processUploadedFilesForTeaching,
} from "../services/geminiService";
import { useTheme } from "../contexts/ThemeContext";
import CustomVoiceRecorder from "./CustomVoiceRecorder";
import LoadingAnalysis from "./LoadingAnalysis";

interface StorytellerInterfaceProps {
  onBack: () => void;
  ai: any; // GoogleGenAI instance
}

const StorytellerInterface: React.FC<StorytellerInterfaceProps> = ({
  onBack,
  ai,
}) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState<
    "input" | "refined" | "storytelling" | "feedback"
  >("input");
  const [userScenario, setUserScenario] = useState<string>("");
  const [refinedScenario, setRefinedScenario] = useState<string>("");
  const [userStory, setUserStory] = useState<string>("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(
    LoadingState.Idle,
  );
  const [error, setError] = useState<string | null>(null);
  const [useOwnNarration, setUseOwnNarration] = useState<boolean>(false);

  // File upload state
  const [fileUploadState, setFileUploadState] = useState<FileUploadState>({
    files: [],
    isProcessing: false,
    error: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScenarioSubmit = async () => {
    if (!userScenario.trim()) {
      setError("Please provide a scenario or story prompt to refine.");
      return;
    }

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      const refined = await refineScenarioForStorytelling(ai, userScenario);
      setRefinedScenario(refined);
      setCurrentStep("refined");
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error refining scenario:", err);
      setError(
        "An error occurred while refining your story prompt. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleStorytellingSubmit = async () => {
    if (!userStory.trim()) {
      setError("Please provide your story before submitting.");
      return;
    }

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);
    setFeedback(null);

    try {
      const promptForEval = useOwnNarration ? "" : refinedScenario;
      const storytellerFeedback = await getEnhancedStorytellerEvaluation(
        ai,
        promptForEval,
        userStory,
      );
      setFeedback(storytellerFeedback);
      setCurrentStep("feedback");
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error getting storyteller feedback:", err);
      setError("An error occurred while getting feedback. Please try again.");
      setLoadingState(LoadingState.Error);
    }
  };

  const resetInterface = () => {
    setCurrentStep("input");
    setUserScenario("");
    setRefinedScenario("");
    setUserStory("");
    setFeedback(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setFileUploadState({ files: [], isProcessing: false, error: null });
    setUseOwnNarration(false);
  };

  // Voice recording handlers
  const handleScenarioTranscript = (text: string) => {
    setUserScenario(text);
  };

  const handleStoryTranscript = (text: string) => {
    setUserStory(text);
  };

  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      // Check file type
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        setFileUploadState((prev) => ({
          ...prev,
          error: `Unsupported file type: ${file.type}. Please upload images or PDF files only.`,
        }));
        return;
      }

      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setFileUploadState((prev) => ({
          ...prev,
          error: `File ${file.name} is too large. Maximum size is 10MB.`,
        }));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const base64Content = content.split(",")[1]; // Remove data:type;base64, prefix

        const uploadedFile: UploadedFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: file.size,
          content: base64Content,
          mimeType: file.type,
        };

        setFileUploadState((prev) => ({
          ...prev,
          files: [...prev.files, uploadedFile],
          error: null,
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (fileId: string) => {
    setFileUploadState((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }));
  };

  const handleFileSubmit = async () => {
    if (fileUploadState.files.length === 0) {
      setError("Please upload at least one file.");
      return;
    }

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setFileUploadState({ files: fileUploadState.files, isProcessing: true, error: null });
    setError(null);

    try {
      const result = await processUploadedFilesForTeaching(ai, fileUploadState.files);
      setUserScenario(result.refinedContent);
      setFileUploadState({ files: [], isProcessing: false, error: null });
    } catch (err) {
      console.error("Error processing files:", err);
      const errorMsg = err instanceof Error ? err.message : "An error occurred while processing your files. Please try again.";
      setError(errorMsg);
      setFileUploadState({ files: fileUploadState.files, isProcessing: false, error: errorMsg });
    }
  };

  const isLoading = loadingState === LoadingState.GeneratingFeedback;

  return (
    <>
      {/* Dedicated Loading UI */}
      {loadingState === LoadingState.GeneratingFeedback && currentStep === "storytelling" && (
        <LoadingAnalysis 
          title="Analyzing Your Storytelling"
          subtitle="Evaluating creativity, emotion, and narrative flow"
        />
      )}
      
      <div
        className={`min-h-screen ${
          theme === "dark" ? "bg-black text-white" : "bg-white text-black"
        }`}
      >
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors duration-200"
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
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-black dark:text-white">
              Storyteller Coach
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Test your storytelling abilities with creative feedback
            </p>
          </div>
          <div className="w-20"></div> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="max-w-md mx-auto">
            <div className="relative">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500 ease-out"
                  style={{
                    width: `${
                      currentStep === "input"
                        ? "25%"
                        : currentStep === "refined"
                          ? "50%"
                          : currentStep === "storytelling"
                            ? "75%"
                            : "100%"
                    }`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Input Scenario */}
        {currentStep === "input" && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Step 1: Provide Your Story Idea
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Give us any story idea, scenario, or creative prompt you'd like
                to develop into a story. It can be anything - from a simple
                character to a complex plot idea.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <label className="block text-lg font-semibold mb-4 text-white">
                What story would you like to tell?
              </label>

              {/* Combined Input Area */}
              <div className="relative">
                <textarea
                  value={userScenario}
                  onChange={(e) => setUserScenario(e.target.value)}
                  placeholder="Type your story idea or upload files to extract content..."
                  className="w-full h-32 p-4 pr-24 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-gray-600 resize-none transition-all duration-200 text-sm sm:text-base"
                  disabled={isLoading}
                />

                {/* Voice Recorder and File Upload Icons */}
                <div className="absolute top-4 right-4 flex space-x-2">
                  <CustomVoiceRecorder
                    onTranscript={handleScenarioTranscript}
                    disabled={isLoading}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-white transition-colors duration-200 hover:bg-gray-700 rounded-lg"
                    title="Upload files (images/PDFs)"
                    disabled={isLoading}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* File List */}
              {fileUploadState.files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-gray-300">
                    Uploaded Files:
                  </h4>
                  <div className="space-y-2">
                    {fileUploadState.files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between bg-gray-900/50 rounded-lg p-2"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="text-lg">
                            {file.type.startsWith("image/") ? "🖼️" : "📄"}
                          </div>
                          <div>
                            <div className="text-white text-sm font-medium">
                              {file.name}
                            </div>
                            <div className="text-xs text-gray-400">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(file.id)}
                          className="text-red-400 hover:text-red-300 transition-colors duration-200 p-1"
                          disabled={isLoading}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File Upload Error */}
              {fileUploadState.error && (
                <div className="mt-4 bg-red-900/50 border border-red-800 rounded-lg p-3 text-red-200 text-sm">
                  {fileUploadState.error}
                </div>
              )}
            </div>

            <div className="text-center">
              <button
                onClick={
                  fileUploadState.files.length > 0
                    ? handleFileSubmit
                    : handleScenarioSubmit
                }
                disabled={
                  isLoading ||
                  (fileUploadState.files.length === 0 &&
                    !userScenario.trim()) ||
                  fileUploadState.isProcessing
                }
                className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading || fileUploadState.isProcessing
                  ? fileUploadState.files.length > 0
                    ? "Processing Files..."
                    : "Crafting Story Prompt..."
                  : fileUploadState.files.length > 0
                    ? "Extract & Create Story Prompt"
                    : "Create Story Prompt"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Refined Scenario */}
        {currentStep === "refined" && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Step 2: Your Story Prompt
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Here's your story idea transformed into an engaging, creative
                prompt. Now you'll tell this story with all your storytelling
                skills.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Your Story Prompt:
              </h3>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {refinedScenario}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
              <button
                onClick={() => {
                  setUseOwnNarration(false);
                  setCurrentStep("storytelling");
                }}
                className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition-colors duration-200"
              >
                Use This Prompt
              </button>
              <button
                onClick={() => {
                  setUseOwnNarration(true);
                  setCurrentStep("storytelling");
                }}
                className="px-6 py-3 rounded-lg font-medium transition-colors duration-200 border border-gray-600 text-white hover:bg-gray-700"
              >
                Start My Own Narration
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Storytelling */}
        {currentStep === "storytelling" && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Step 3: Tell Your Story
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Now tell the story based on the prompt above. Be creative,
                engaging, and captivating. Show your storytelling skills with
                vivid descriptions, compelling characters, and an engaging
                narrative.
              </p>
            </div>

            {!useOwnNarration && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Story Prompt:
                </h3>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {refinedScenario}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <label className="block text-lg font-semibold mb-4 text-white">
                Your Story:
              </label>
              <div className="relative">
                <textarea
                  value={userStory}
                  onChange={(e) => setUserStory(e.target.value)}
                  placeholder="Tell your story here. Be creative, engaging, and captivating. Use vivid descriptions, compelling characters, and an engaging narrative..."
                  className="w-full h-64 p-4 pr-12 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-gray-600 resize-none transition-all duration-200 text-sm sm:text-base"
                  disabled={isLoading}
                />

                {/* Voice Recorder */}
                <div className="absolute top-4 right-4">
                  <CustomVoiceRecorder
                    onTranscript={handleStoryTranscript}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleStorytellingSubmit}
                disabled={isLoading || !userStory.trim()}
                className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading ? "Evaluating..." : "Get Storytelling Feedback"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Feedback */}
        {currentStep === "feedback" && feedback && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Your Storytelling Performance
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Here's how well you told your story. The Storyteller AI has
                evaluated your creativity, narrative flow, and engagement
                skills.
              </p>
            </div>

            {/* Overall Score */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
              <div className="flex items-center justify-center mb-6">
                <h3 className="text-xl font-semibold text-white">
                  Overall Storytelling Score
                </h3>
              </div>
              <div className="flex justify-center">
                <div className="relative w-32 h-32 group">
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                  <svg
                    className="w-32 h-32 transform -rotate-90 relative z-10"
                    viewBox="0 0 36 36"
                  >
                    <path
                      className="text-gray-700"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-white transition-all duration-2000 ease-out drop-shadow-lg"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={`${feedback.overall_score}, 100`}
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white animate-pulse">
                        {feedback.overall_score}
                      </div>
                      <div className="text-sm text-gray-400">/100</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Category Scores */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-6 text-center">
                Individual Category Performance (0-20 each)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {Object.entries(feedback.category_scores).map(
                  ([category, score], index) => {
                    const categoryNames: { [key: string]: string } = {
                      narrativeStructure: "Narrative Structure",
                      characterDevelopment: "Character Development",
                      descriptiveLanguage: "Descriptive Language",
                      emotionalImpact: "Emotional Impact",
                      creativity: "Creativity & Originality",
                      engagement: "Engagement & Pacing",
                      // Legacy support
                      clarity: "Clarity",
                      vocabulary: "Vocabulary Richness",
                      grammar: "Grammar Accuracy",
                      logic: "Logic & Coherence",
                      fluency: "Fluency",
                    };

                    const percentage = (Number(score) / 20) * 100;
                    const colors = [
                      "text-purple-400",
                      "text-pink-400",
                      "text-blue-400",
                      "text-green-400",
                      "text-yellow-400",
                      "text-red-400",
                    ];
                    const color = colors[index % colors.length];

                    return (
                      <div
                        key={category}
                        className="flex flex-col items-center group cursor-pointer"
                      >
                        <div className="relative w-20 h-20 mb-3 group-hover:scale-110 transition-transform duration-300">
                          {/* Glow effect on hover */}
                          <div
                            className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-300 ${color.replace("text-", "bg-")} blur-sm`}
                          ></div>

                          <svg
                            className="w-20 h-20 transform -rotate-90 relative z-10"
                            viewBox="0 0 36 36"
                          >
                            <path
                              className="text-gray-700"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              d="M18 2.0845
                              a 15.9155 15.9155 0 0 1 0 31.831
                              a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className={`${color} transition-all duration-2000 ease-out drop-shadow-sm`}
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              fill="none"
                              strokeDasharray={`${percentage}, 100`}
                              style={{ animationDelay: `${index * 200}ms` }}
                              d="M18 2.0845
                              a 15.9155 15.9155 0 0 1 0 31.831
                              a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="text-lg font-bold text-white group-hover:text-gray-100 transition-colors duration-300">
                              {score}
                            </div>
                          </div>
                        </div>
                        <div className="text-center group-hover:scale-105 transition-transform duration-300">
                          <div className="text-sm font-medium text-white group-hover:text-gray-100 transition-colors duration-300">
                            {categoryNames[category] || category}
                          </div>
                          <div className="text-xs text-gray-400">/20</div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* Storyteller Feedback */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
              <h3 className="text-xl font-semibold text-white mb-4">
                Storyteller's Assessment
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                {feedback.feedback}
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-white mb-2">
                    Storytelling Strengths:
                  </h4>
                  <p className="text-gray-300">{feedback.whatYouDidWell}</p>
                </div>

                <div>
                  <h4 className="font-medium text-white mb-2">
                    Areas to Improve:
                  </h4>
                  <p className="text-gray-300">
                    {feedback.areasForImprovement}
                  </p>
                </div>
              </div>
            </div>

            {/* Improvement Tips */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
              <h3 className="text-xl font-semibold text-white mb-4">
                Personalized Storytelling Recommendations
              </h3>
              <ul className="space-y-3">
                {feedback.tips.map((tip, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-purple-400 mr-3 mt-1">•</span>
                    <span className="text-gray-300">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Detailed Storytelling Analysis */}
            {feedback.storytellingAnalysis && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Detailed Storytelling Analysis
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Your Strongest Storytelling Moment:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{feedback.storytellingAnalysis.strongestMoment}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Your Weakest Storytelling Moment:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{feedback.storytellingAnalysis.weakestMoment}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Best Storytelling Technique:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{feedback.storytellingAnalysis.bestTechnique}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Missed Storytelling Opportunities:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.storytellingAnalysis.missedOpportunities}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Emotional Connection:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.storytellingAnalysis.emotionalConnection}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Communication Profile */}
            {feedback.communicationBehavior && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Your Storytelling Style
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Storytelling Profile:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.communicationBehavior.profile}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Key Strength:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.communicationBehavior.strength}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Growth Area:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.communicationBehavior.growthArea}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Example Rewrite */}
            {feedback.exampleRewrite && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Example Storytelling Improvement
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Your Version:
                    </h4>
                    <p className="text-gray-300 bg-gray-900/50 p-3 rounded">
                      {feedback.exampleRewrite.original}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Improved Storytelling:
                    </h4>
                    <p className="text-gray-300 bg-gray-900/50 p-3 rounded">
                      {feedback.exampleRewrite.improved}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Why This Works Better:
                    </h4>
                    <p className="text-gray-300">
                      {feedback.exampleRewrite.reasoning}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Button */}
            <div className="text-center">
              <button
                onClick={resetInterface}
                className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors duration-200"
              >
                Try Another Story
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}
      </div>
      </div>
    </>
  );
};

export default StorytellerInterface;
