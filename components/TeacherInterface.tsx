import React, { useState, useRef } from "react";
import {
  CoachMode,
  Feedback,
  LoadingState,
  UploadedFile,
  FileUploadState,
} from "../types";
import {
  getEnhancedTeacherEvaluation,
  processUploadedFilesForTeaching,
} from "../services/geminiService";
import {
  refineScenarioForTeachingWithGroq,
  getTeacherEvaluationWithGroq
} from "../services/grokService";
import { useTheme } from "../contexts/ThemeContext";
import CustomVoiceRecorder from "./CustomVoiceRecorder";
import LoadingAnalysis from "./LoadingAnalysis";
import { extractTextFromImageOrPDF } from "../services/ocrService";

interface TeacherInterfaceProps {
  onBack: () => void;
  ai: any; // GoogleGenAI instance (for file processing and evaluation)
  grokApiKey?: string | string[]; // Groq API key(s) for scenario refinement
}

const TeacherInterface: React.FC<TeacherInterfaceProps> = ({ onBack, ai, grokApiKey }) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState<
    "input" | "refined" | "teaching" | "feedback"
  >("input");
  const [userScenario, setUserScenario] = useState<string>("");
  const [refinedScenario, setRefinedScenario] = useState<string>("");
  const [userTeaching, setUserTeaching] = useState<string>("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(
    LoadingState.Idle,
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [isEditingTopic, setIsEditingTopic] = useState<boolean>(false);
  // Chapter-based teaching state
  type TeachingChapter = { id: string; title: string; content: string };
  const [teachingChapters, setTeachingChapters] = useState<TeachingChapter[]>(
    [],
  );
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);

  // File upload state
  const [fileUploadState, setFileUploadState] = useState<FileUploadState>({
    files: [],
    isProcessing: false,
    error: null,
  });
  const [isOCRLoading, setIsOCRLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Predefined topics for selection
  const predefinedTopics = [
    "Machine Learning Fundamentals",
    "Climate Change and Global Warming",
    "The Water Cycle",
    "Photosynthesis Process",
    "The Solar System",
    "Human Digestive System",
    "World War II History",
    "Basic Programming Concepts",
    "The Theory of Evolution",
    "Renewable Energy Sources",
    "The Human Brain",
    "Ancient Egyptian Civilization",
    "The Periodic Table",
    "Economic Systems",
    "The Immune System",
  ];

  const handleScenarioSubmit = async () => {
    if (!userScenario.trim()) {
      setError("Please provide a scenario or topic to refine.");
      return;
    }

    if (!grokApiKey) {
      setError("Grok API key not available. Please check your configuration.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      console.log("🤖 Using Grok for teaching scenario refinement...");
      const refined = await refineScenarioForTeachingWithGroq(grokApiKey, userScenario);
      setRefinedScenario(refined);
      setCurrentStep("refined");
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error refining scenario:", err);
      setError(
        "An error occurred while refining your scenario. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleTeachingSubmit = async () => {
    const hasChapters = teachingChapters.length > 0;
    const combinedTeaching = hasChapters
      ? teachingChapters
        .filter((ch) => ch.title.trim() || ch.content.trim())
        .map(
          (ch, idx) =>
            `Chapter ${idx + 1}: ${ch.title || "Untitled"}\n\n${ch.content}`,
        )
        .join("\n\n---\n\n")
      : userTeaching;

    if (!combinedTeaching.trim()) {
      setError(
        "Please provide your teaching explanation (add chapters or content) before submitting.",
      );
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
      let teacherFeedback;
      if (grokApiKey) {
        console.log("🤖 Using Grok for teacher evaluation...");
        teacherFeedback = await getTeacherEvaluationWithGroq(
          grokApiKey,
          refinedScenario,
          combinedTeaching,
        );
      } else {
        console.log("💎 Using Gemini for teacher evaluation...");
        teacherFeedback = await getEnhancedTeacherEvaluation(
          ai,
          refinedScenario,
          combinedTeaching,
        );
      }
      setFeedback(teacherFeedback);
      setCurrentStep("feedback");
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error getting teacher feedback:", err);
      setError("An error occurred while getting feedback. Please try again.");
      setLoadingState(LoadingState.Error);
    }
  };

  const handleTryAgain = () => {
    setCurrentStep("teaching");
    setUserTeaching("");
    setFeedback(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setFileUploadState({ files: [], isProcessing: false, error: null });
    setTeachingChapters([]);
    setActiveChapterIndex(0);
  };

  const resetInterface = () => {
    setCurrentStep("input");
    setUserScenario("");
    setRefinedScenario("");
    setUserTeaching("");
    setFeedback(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setFileUploadState({ files: [], isProcessing: false, error: null });
    setSelectedTopic("");
    setIsEditingTopic(false);
    setTeachingChapters([]);
    setActiveChapterIndex(0);
  };

  const handleTopicSelect = (topic: string) => {
    setSelectedTopic(topic);
    setUserScenario(topic);
  };

  const handleEditTopic = () => {
    setIsEditingTopic(true);
  };

  const handleSaveTopic = () => {
    setIsEditingTopic(false);
  };

  // Voice recording handlers
  const handleScenarioTranscript = (text: string) => {
    setUserScenario(text);
  };

  const handleTeachingTranscript = (text: string) => {
    setUserTeaching(text);
  };

  const handleChapterTranscript = (text: string, chapterId: string) => {
    setTeachingChapters((prev) =>
      prev.map((ch) => (ch.id === chapterId ? { ...ch, content: text } : ch)),
    );
  };

  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = [];

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
      reader.onload = async (e) => {
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

    setFileUploadState(prev => ({ ...prev, isProcessing: true, error: null }));
    setError(null);

    try {
      let combinedText = "";
      for (const file of fileUploadState.files) {
        // Extract text from each file using OCR.space
        const result = await extractTextFromImageOrPDF(file.content, file.type);
        if (result.text) {
          combinedText += `\n\n--- Extracted from ${file.name} ---\n${result.text}`;
        } else if (result.error) {
          throw new Error(`OCR Error (${file.name}): ${result.error}`);
        }
      }

      setUserScenario((prev) =>
        prev.trim()
          ? `${prev}\n\n${combinedText.trim()}`
          : combinedText.trim()
      );

      setFileUploadState({ files: [], isProcessing: false, error: null });
    } catch (err) {
      console.error("Error processing files:", err);
      const errorMsg = err instanceof Error ? err.message : "An error occurred while processing your files. Please try again.";
      setError(errorMsg);
      setFileUploadState(prev => ({ ...prev, isProcessing: false, error: errorMsg }));
    }
  };

  const isLoading = loadingState === LoadingState.GeneratingFeedback;

  return (
    <>
      {/* Dedicated Loading UI */}
      {loadingState === LoadingState.GeneratingFeedback && currentStep === "teaching" && (
        <LoadingAnalysis
          title="Analyzing Your Teaching"
          subtitle="Evaluating clarity, structure, and educational effectiveness"
        />
      )}

      <div
        className={`min-h-screen ${theme === "dark" ? "bg-black text-white" : "bg-white text-black"
          }`}
      >
        {/* Header */}
        <div
          className={`border-b p-6 ${theme === "dark" ? "border-gray-800" : "border-gray-200"
            }`}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <button
              onClick={onBack}
              className={`flex items-center transition-colors duration-200 ${theme === "dark"
                ? "text-gray-400 hover:text-white"
                : "text-gray-600 hover:text-black"
                }`}
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
              <h1
                className={`text-2xl font-semibold ${theme === "dark" ? "text-white" : "text-black"
                  }`}
              >
                Teacher Coach
              </h1>
              <p
                className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
              >
                Test your teaching abilities with structured feedback
              </p>
            </div>
            <div className="w-20"></div> {/* Spacer for centering */}
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              <div
                className={`flex items-center ${currentStep === "input" ? "text-white" : currentStep === "refined" || currentStep === "teaching" || currentStep === "feedback" ? "text-green-400" : "text-gray-500"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "input" ? "bg-white text-black" : currentStep === "refined" || currentStep === "teaching" || currentStep === "feedback" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-400"}`}
                >
                  1
                </div>
                <span className="ml-2 text-sm">Input Scenario</span>
              </div>
              <div
                className={`w-16 h-0.5 ${currentStep === "refined" || currentStep === "teaching" || currentStep === "feedback" ? "bg-green-500" : "bg-gray-700"}`}
              ></div>
              <div
                className={`flex items-center ${currentStep === "refined" ? "text-white" : currentStep === "teaching" || currentStep === "feedback" ? "text-green-400" : "text-gray-500"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "refined" ? "bg-white text-black" : currentStep === "teaching" || currentStep === "feedback" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-400"}`}
                >
                  2
                </div>
                <span className="ml-2 text-sm">Refined Topic</span>
              </div>
              <div
                className={`w-16 h-0.5 ${currentStep === "teaching" || currentStep === "feedback" ? "bg-green-500" : "bg-gray-700"}`}
              ></div>
              <div
                className={`flex items-center ${currentStep === "teaching" ? "text-white" : currentStep === "feedback" ? "text-green-400" : "text-gray-500"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "teaching" ? "bg-white text-black" : currentStep === "feedback" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-400"}`}
                >
                  3
                </div>
                <span className="ml-2 text-sm">Teach It</span>
              </div>
              <div
                className={`w-16 h-0.5 ${currentStep === "feedback" ? "bg-green-500" : "bg-gray-700"}`}
              ></div>
              <div
                className={`flex items-center ${currentStep === "feedback" ? "text-white" : "text-gray-500"}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep === "feedback" ? "bg-white text-black" : "bg-gray-700 text-gray-400"}`}
                >
                  4
                </div>
                <span className="ml-2 text-sm">Get Feedback</span>
              </div>
            </div>
          </div>

          {/* Step 1: Input Scenario */}
          {currentStep === "input" && (
            <div className="space-y-8 animate-fade-in">
              {/* Header Section */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 mb-6 group hover:scale-105 transition-all duration-300">
                  <svg
                    className="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors duration-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
                <h2
                  className={`text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent ${theme === "dark" ? "text-white" : "text-black"
                    }`}
                >
                  Choose Your Teaching Topic
                </h2>
                <p
                  className={`text-lg max-w-3xl mx-auto leading-relaxed ${theme === "dark" ? "text-gray-300" : "text-gray-600"
                    }`}
                >
                  Select from our curated topics or create your own. Upload files
                  to extract content, or type your own teaching material.
                </p>
              </div>

              {/* Topic Selection Section */}
              <div
                className={`rounded-2xl p-8 border backdrop-blur-sm transition-all duration-300 hover:shadow-2xl ${theme === "dark"
                  ? "bg-gray-800/40 border-gray-700/50 hover:border-gray-600/50"
                  : "bg-white/80 border-gray-200/50 hover:border-gray-300/50"
                  }`}
              >
                <div className="mb-6">
                  <h3
                    className={`text-xl font-semibold mb-2 ${theme === "dark" ? "text-white" : "text-black"
                      }`}
                  >
                    🎯 Quick Topic Selection
                  </h3>
                  <p
                    className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                      }`}
                  >
                    Choose from our popular teaching topics or create your own
                  </p>
                </div>

                {/* Predefined Topics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {predefinedTopics.map((topic, index) => (
                    <button
                      key={topic}
                      onClick={() => handleTopicSelect(topic)}
                      className={`group relative p-4 rounded-xl border text-left transition-all duration-300 hover:scale-105 hover:shadow-lg ${selectedTopic === topic
                        ? "border-blue-500 bg-blue-500/10 shadow-blue-500/20"
                        : theme === "dark"
                          ? "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-700/50"
                          : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-100/50"
                        }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${selectedTopic === topic
                            ? "bg-blue-400"
                            : "bg-gray-400 group-hover:bg-gray-300"
                            }`}
                        />
                        <span
                          className={`text-sm font-medium transition-colors duration-300 ${selectedTopic === topic
                            ? "text-blue-300"
                            : theme === "dark"
                              ? "text-gray-300 group-hover:text-white"
                              : "text-gray-700 group-hover:text-black"
                            }`}
                        >
                          {topic}
                        </span>
                      </div>
                      {selectedTopic === topic && (
                        <div className="absolute top-2 right-2">
                          <svg
                            className="w-4 h-4 text-blue-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom Input Section */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-px h-4 bg-gray-400" />
                    <span
                      className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                        }`}
                    >
                      OR CREATE YOUR OWN
                    </span>
                  </div>

                  <div className="relative group">
                    <textarea
                      value={userScenario}
                      onChange={(e) => setUserScenario(e.target.value)}
                      placeholder="Type your custom topic here or upload files to extract content..."
                      className={`w-full h-32 p-4 pr-24 rounded-none border-2 transition-all duration-300 resize-none focus:outline-none group-hover:shadow-lg text-sm sm:text-base ${theme === "dark"
                        ? "bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 focus:border-white"
                        : "bg-white/50 border-gray-300 text-black placeholder-gray-500 focus:border-gray-400"
                        }`}
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
                        className={`p-2 rounded-lg transition-all duration-300 hover:scale-110 ${theme === "dark"
                          ? "text-gray-400 hover:text-white hover:bg-gray-700"
                          : "text-gray-500 hover:text-black hover:bg-gray-200"
                          }`}
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
                    <div className="space-y-3 animate-fade-in">
                      <h4
                        className={`text-sm font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                          }`}
                      >
                        📁 Uploaded Files:
                      </h4>
                      <div className="space-y-2">
                        {fileUploadState.files.map((file, index) => (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between rounded-lg p-3 transition-all duration-300 hover:scale-102 ${theme === "dark"
                              ? "bg-gray-900/50 border border-gray-700"
                              : "bg-gray-100/50 border border-gray-200"
                              }`}
                            style={{ animationDelay: `${index * 100}ms` }}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="text-xl">
                                {file.type.startsWith("image/") ? "🖼️" : "📄"}
                              </div>
                              <div>
                                <div
                                  className={`text-sm font-medium ${theme === "dark" ? "text-white" : "text-black"
                                    }`}
                                >
                                  {file.name}
                                </div>
                                <div
                                  className={`text-xs ${theme === "dark"
                                    ? "text-gray-400"
                                    : "text-gray-500"
                                    }`}
                                >
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => removeFile(file.id)}
                              className="text-red-400 hover:text-red-300 transition-all duration-300 p-1 hover:scale-110 rounded"
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
                    <div className="bg-red-900/50 border border-red-800 rounded-lg p-4 text-red-200 text-sm animate-fade-in">
                      {fileUploadState.error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="text-center pt-6">
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
                      className={`group relative px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed ${theme === "dark"
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                        : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                        }`}
                    >
                      <span className="relative z-10 flex items-center space-x-2">
                        {isLoading || fileUploadState.isProcessing ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                            <span>
                              {fileUploadState.files.length > 0
                                ? "Processing Files..."
                                : "Refining..."}
                            </span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                            <span>
                              {fileUploadState.files.length > 0
                                ? "Extract & Refine Content"
                                : "Refine My Topic"}
                            </span>
                          </>
                        )}
                      </span>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Refined Scenario */}
          {currentStep === "refined" && (
            <div className="space-y-8 animate-fade-in">
              {/* Header Section */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-green-500/30 mb-6 group hover:scale-105 transition-all duration-300">
                  <svg
                    className="w-8 h-8 text-green-400 group-hover:text-green-300 transition-colors duration-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2
                  className={`text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent ${theme === "dark" ? "text-white" : "text-black"
                    }`}
                >
                  Refined Teaching Material
                </h2>
                <p
                  className={`text-lg max-w-3xl mx-auto leading-relaxed ${theme === "dark" ? "text-gray-300" : "text-gray-600"
                    }`}
                >
                  Your topic has been optimized for teaching. Review, edit, and
                  customize the content before you start teaching.
                </p>
              </div>

              {/* Editable Content Section */}
              <div
                className={`rounded-2xl p-8 border backdrop-blur-sm transition-all duration-300 hover:shadow-2xl ${theme === "dark"
                  ? "bg-gray-800/40 border-gray-700/50 hover:border-gray-600/50"
                  : "bg-white/80 border-gray-200/50 hover:border-gray-300/50"
                  }`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3
                      className={`text-xl font-semibold mb-2 ${theme === "dark" ? "text-white" : "text-black"
                        }`}
                    >
                      📝 Teaching Content
                    </h3>
                    <p
                      className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }`}
                    >
                      Click to edit and customize your teaching material
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setCurrentStep("input")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-105 ${theme === "dark"
                        ? "text-gray-400 hover:text-white hover:bg-gray-700"
                        : "text-gray-600 hover:text-black hover:bg-gray-200"
                        }`}
                    >
                      <svg
                        className="w-4 h-4 inline mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Edit Topic
                    </button>
                  </div>
                </div>

                {/* Editable Content Area */}
                <div className="relative group">
                  <textarea
                    value={refinedScenario}
                    onChange={(e) => setRefinedScenario(e.target.value)}
                    className={`w-full min-h-[400px] p-6 rounded-none border-2 transition-all duration-300 resize-none focus:outline-none group-hover:shadow-lg text-sm sm:text-base ${theme === "dark"
                      ? "bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 focus:border-white"
                      : "bg-white/50 border-gray-300 text-black placeholder-gray-500 focus:border-gray-400"
                      }`}
                    placeholder="Your refined teaching content will appear here..."
                  />

                  {/* Edit Indicator */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${theme === "dark"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-green-100 text-green-700 border border-green-200"
                        }`}
                    >
                      ✏️ Editable
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-700/50">
                  <div className="flex items-center space-x-4">
                    <div
                      className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${theme === "dark"
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                        : "bg-blue-100 text-blue-700 border border-blue-200"
                        }`}
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
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-sm font-medium">Ready to Teach</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentStep("teaching")}
                    className={`group relative px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl ${theme === "dark"
                      ? "bg-gradient-to-r from-green-500 to-blue-500 text-white hover:from-green-600 hover:to-blue-600"
                      : "bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-700 hover:to-blue-700"
                      }`}
                  >
                    <span className="relative z-10 flex items-center space-x-2">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      <span>Start Teaching</span>
                    </span>
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500 to-blue-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Teaching */}
          {currentStep === "teaching" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-semibold text-white mb-4">
                  Step 3: Teach Your Topic
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto">
                  Now explain the topic above as if you're teaching it to someone
                  who has never heard of it before. Be clear, engaging, and
                  thorough in your explanation.
                </p>
              </div>

              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Topic to Teach:
                </h3>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {refinedScenario}
                  </p>
                </div>
              </div>

              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-lg font-semibold text-white">
                    Your Teaching Explanation (Chapter by Chapter):
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setTeachingChapters((prev) => [
                          ...prev,
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            title: "",
                            content: "",
                          },
                        ])
                      }
                      className="px-3 py-1.5 text-sm rounded bg-white text-black font-medium hover:bg-gray-100"
                      disabled={isLoading}
                    >
                      + Add Chapter
                    </button>
                    {teachingChapters.length > 0 && (
                      <button
                        onClick={() => setTeachingChapters([])}
                        className="px-3 py-1.5 text-sm rounded border border-gray-600 text-white hover:bg-gray-700"
                        disabled={isLoading}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {teachingChapters.length === 0 && (
                  <div className="relative">
                    <textarea
                      value={userTeaching}
                      onChange={(e) => setUserTeaching(e.target.value)}
                      placeholder="Explain the topic above as if you're teaching it to a student. Be clear, engaging, and comprehensive... Or click 'Add Chapter' to structure your explanation."
                      className="w-full h-48 p-4 pr-12 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:border-white resize-none transition-all duration-200 text-sm sm:text-base"
                      disabled={isLoading}
                    />
                    <div className="absolute top-4 right-4">
                      <CustomVoiceRecorder
                        onTranscript={handleTeachingTranscript}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}

                {teachingChapters.length > 0 && (
                  <div className="space-y-4">
                    {teachingChapters.map((ch, idx) => (
                      <div
                        key={ch.id}
                        className="rounded-lg border border-gray-700 bg-gray-900/40 p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              Chapter {idx + 1}
                            </span>
                            <textarea
                              value={ch.title}
                              onChange={(e) =>
                                setTeachingChapters((prev) =>
                                  prev.map((c, i) =>
                                    i === idx
                                      ? { ...c, title: e.target.value }
                                      : c,
                                  ),
                                )
                              }
                              placeholder="Chapter title (e.g., Introduction to Photosynthesis)"
                              className="px-3 py-2 h-10 w-full min-w-[200px] rounded-none bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-white/40 resize-none overflow-hidden"
                              disabled={isLoading}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveChapterIndex(idx)}
                              className={`px-2.5 py-1 text-xs rounded border ${activeChapterIndex === idx ? "bg-white text-black border-white" : "text-white border-gray-600 hover:bg-gray-700"}`}
                              disabled={isLoading}
                            >
                              Focus
                            </button>
                            <button
                              onClick={() =>
                                setTeachingChapters((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                              className="px-2.5 py-1 text-xs rounded border border-red-700 text-red-300 hover:bg-red-900/30"
                              disabled={isLoading}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="relative">
                          <textarea
                            value={ch.content}
                            onChange={(e) =>
                              setTeachingChapters((prev) =>
                                prev.map((c, i) =>
                                  i === idx
                                    ? { ...c, content: e.target.value }
                                    : c,
                                ),
                              )
                            }
                            placeholder="Write this chapter's explanation here..."
                            className={`w-full h-40 p-3 pr-12 rounded-none bg-gray-800 border ${activeChapterIndex === idx ? "border-white/50" : "border-gray-700"} text-white placeholder-gray-500 focus:outline-none focus:border-white/60 resize-none`}
                            disabled={isLoading}
                          />
                          <div className="absolute top-3 right-3">
                            <CustomVoiceRecorder
                              onTranscript={(text) =>
                                handleChapterTranscript(text, ch.id)
                              }
                              disabled={isLoading}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-center">
                <button
                  onClick={handleTeachingSubmit}
                  disabled={
                    isLoading ||
                    (teachingChapters.length === 0 && !userTeaching.trim())
                  }
                  className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isLoading ? "Evaluating..." : "Get Teaching Feedback"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Feedback */}
          {currentStep === "feedback" && feedback && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-semibold text-white mb-4">
                  Your Teaching Performance
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto">
                  Here's how well you explained your topic. The Teacher AI has
                  evaluated your clarity, coherence, and creativity in teaching.
                </p>
              </div>

              {/* Overall Score */}
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
                <div className="flex items-center justify-center mb-6">
                  <h3 className="text-xl font-semibold text-white">
                    Overall Teaching Score
                  </h3>
                </div>
                <div className="flex justify-center">
                  <div className="relative w-32 h-32 group">
                    {/* Glow effect */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 to-green-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

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
                        clarity: "Clarity & Explanation",
                        structure: "Structure & Organization",
                        engagement: "Engagement & Interest",
                        educationalValue: "Educational Value",
                        accessibility: "Accessibility & Adaptability",
                        completeness: "Completeness & Depth",
                        // Legacy support
                        vocabulary: "Vocabulary Richness",
                        grammar: "Grammar Accuracy",
                        logic: "Logic & Coherence",
                        fluency: "Fluency",
                        creativity: "Creativity",
                      };

                      const percentage = (Number(score) / 20) * 100;
                      const colors = [
                        "text-blue-400",
                        "text-green-400",
                        "text-purple-400",
                        "text-yellow-400",
                        "text-red-400",
                        "text-pink-400",
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

              {/* Teacher Feedback */}
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Teacher's Assessment
                </h3>
                <p className="text-gray-300 leading-relaxed mb-4">
                  {feedback.feedback}
                </p>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Teaching Strengths:
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
                  Personalized Teaching Recommendations
                </h3>
                <ul className="space-y-3">
                  {feedback.tips.map((tip, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-blue-400 mr-3 mt-1">•</span>
                      <span className="text-gray-300">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detailed Teaching Analysis */}
              {feedback.teachingAnalysis && (
                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Detailed Teaching Analysis
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Your Strongest Teaching Moment:
                      </h4>
                      <p className="text-gray-300 italic">
                        "{feedback.teachingAnalysis.strongestMoment}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Your Weakest Teaching Moment:
                      </h4>
                      <p className="text-gray-300 italic">
                        "{feedback.teachingAnalysis.weakestMoment}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Best Explanation Technique:
                      </h4>
                      <p className="text-gray-300 italic">
                        "{feedback.teachingAnalysis.bestExplanation}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Missed Teaching Opportunities:
                      </h4>
                      <p className="text-gray-300">
                        {feedback.teachingAnalysis.missedOpportunities}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Audience Adaptation:
                      </h4>
                      <p className="text-gray-300">
                        {feedback.teachingAnalysis.audienceAdaptation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Communication Profile */}
              {feedback.communicationBehavior && (
                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Your Teaching Style
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Teaching Profile:
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
                    Example Teaching Improvement
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
                        Improved Teaching:
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

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={handleTryAgain}
                  className="w-full sm:w-auto px-8 py-3 bg-white text-black rounded-xl font-semibold hover:bg-gray-100 transition-all duration-300 shadow-lg shadow-white/5 active:scale-95"
                >
                  Try Again
                </button>
                <button
                  onClick={resetInterface}
                  className="w-full sm:w-auto px-8 py-3 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-700 transition-all duration-300 border border-gray-700 active:scale-95"
                >
                  New Topic
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

export default TeacherInterface;
