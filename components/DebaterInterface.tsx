import React, { useState, useRef, useEffect } from "react";
import {
  CoachMode,
  Feedback,
  LoadingState,
  UploadedFile,
  FileUploadState,
} from "../types";
import {
  getDebateResponse,
  getEnhancedDebateEvaluation,
  processUploadedFilesForTeaching,
} from "../services/geminiService";
import { useTheme } from "../contexts/ThemeContext";
import CustomVoiceRecorder from "./CustomVoiceRecorder";

interface DebaterInterfaceProps {
  onBack: () => void;
  ai: any; // GoogleGenAI instance
}

interface DebateMessage {
  id: string;
  type: "user" | "agent";
  content: string;
  timestamp: Date;
  agentName?: string;
  agentPersonality?: string;
}

interface AIAgent {
  name: string;
  personality: string;
  description: string;
  avatar: string;
  color: string;
}

// Single AI opponent for one-on-one debate
const AI_OPPONENT: AIAgent = {
  name: "AI Opponent",
  personality: "Aggressive Debater",
  description:
    "A passionate human debater who will fight hard for their position and challenge every argument you make",
  avatar: "⚔️",
  color: "bg-red-500",
};

const DebaterInterface: React.FC<DebaterInterfaceProps> = ({ onBack, ai }) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState<
    "topic" | "debating" | "evaluation"
  >("topic");
  const [debateTopic, setDebateTopic] = useState<string>("");
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [loadingState, setLoadingState] = useState<LoadingState>(
    LoadingState.Idle,
  );
  const [error, setError] = useState<string | null>(null);
  const [finalEvaluation, setFinalEvaluation] = useState<Feedback | null>(null);
  const [discussionRound, setDiscussionRound] = useState<number>(0);
  const [userParticipationCount, setUserParticipationCount] =
    useState<number>(0);
  const [userStance, setUserStance] = useState<string>("");
  const [aiStance, setAiStance] = useState<string>("");

  // File upload state
  const [fileUploadState, setFileUploadState] = useState<FileUploadState>({
    files: [],
    isProcessing: false,
    error: null,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTranscript = (text: string) => {
    setCurrentMessage(text);
  };

  const handleTopicTranscript = (text: string) => {
    setDebateTopic(text);
  };

  const handleTopicSubmit = async () => {
    if (!debateTopic.trim()) {
      setError("Please provide a debate topic.");
      return;
    }

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      // Start the debate with AI opponent taking opposite stance
      const response = await getDebateResponse(ai, debateTopic, "", 0, true);

      // Store stances for evaluation
      setUserStance(response.userStance);
      setAiStance(response.aiStance);

      // Add initial AI opponent message
      const initialMessage: DebateMessage = {
        id: `agent-${Date.now()}`,
        type: "agent",
        content: response.content,
        timestamp: new Date(),
        agentName: AI_OPPONENT.name,
        agentPersonality: AI_OPPONENT.personality,
      };

      setMessages([initialMessage]);
      setCurrentStep("debating");
      setDiscussionRound(1);
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error starting debate:", err);
      setError(
        "An error occurred while starting the debate. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) {
      setError("Please enter your argument.");
      return;
    }

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    // Add user message
    const userMessage: DebateMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: currentMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setCurrentMessage("");
    setUserParticipationCount((prev) => prev + 1);
    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      // Get AI opponent rebuttal
      const response = await getDebateResponse(
        ai,
        debateTopic,
        currentMessage,
        discussionRound,
        false,
      );

      // Add AI opponent response
      const aiMessage: DebateMessage = {
        id: `agent-${Date.now()}`,
        type: "agent",
        content: response.content,
        timestamp: new Date(),
        agentName: AI_OPPONENT.name,
        agentPersonality: AI_OPPONENT.personality,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setDiscussionRound((prev) => prev + 1);
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error getting debate response:", err);
      setError(
        "An error occurred while getting the AI's response. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleEndDebate = async () => {
    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      // Prepare discussion history for evaluation
      const discussionHistory = messages.map((msg) => ({
        type: msg.type,
        content: msg.content,
        agentName: msg.agentName,
        agentPersonality: msg.agentPersonality,
        timestamp: msg.timestamp,
      }));

      // Get comprehensive final evaluation using enhanced debate evaluation
      const evaluation = await getEnhancedDebateEvaluation(
        ai,
        debateTopic,
        discussionHistory,
        userParticipationCount,
      );
      setFinalEvaluation(evaluation);

      setCurrentStep("evaluation");
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error getting final evaluation:", err);
      setError(
        "An error occurred while getting the final evaluation. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const resetInterface = () => {
    setCurrentStep("topic");
    setDebateTopic("");
    setMessages([]);
    setCurrentMessage("");
    setFinalEvaluation(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setDiscussionRound(0);
    setUserParticipationCount(0);
    setUserStance("");
    setAiStance("");
    setFileUploadState({ files: [], isProcessing: false, error: null });
  };

  // File handling functions
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);
    setFileUploadState((prev) => ({
      ...prev,
      isProcessing: true,
      error: null,
    }));

    try {
      const result = await processUploadedFilesForTeaching(
        ai,
        fileUploadState.files,
      );
      setDebateTopic(result.refinedContent);
      setFileUploadState((prev) => ({ ...prev, isProcessing: false }));
    } catch (err) {
      console.error("Error processing files:", err);
      setError(
        "An error occurred while processing your files. Please try again.",
      );
      setLoadingState(LoadingState.Error);
      setFileUploadState((prev) => ({
        ...prev,
        isProcessing: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const isLoading = loadingState === LoadingState.GeneratingFeedback;

  return (
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
              Debater Coach
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Live debate with AI - sharpen your argumentation skills
            </p>
          </div>
          <div className="w-20"></div> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Step 1: Topic Selection */}
        {currentStep === "topic" && (
          <div className="space-y-6">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gray-800/50 border border-gray-700/50 mb-6">
                <svg
                  className="w-6 h-6 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-semibold text-white mb-4">
                Choose Your Debate Topic
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
                Enter a topic or statement you'd like to debate. The AI will
                take the opposite stance and fight hard against your arguments
                in a real debate format.
              </p>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <label className="block text-lg font-medium mb-4 text-white">
                What would you like to debate about?
              </label>

              {/* Combined Input Area */}
              <div className="relative">
                <textarea
                  value={debateTopic}
                  onChange={(e) => setDebateTopic(e.target.value)}
                  placeholder="Type your debate topic or upload files to extract content..."
                  className="w-full h-32 p-4 pr-24 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-gray-600 resize-none transition-all duration-200 text-sm sm:text-base"
                  disabled={isLoading}
                />

                {/* Voice Recorder and File Upload Icons */}
                <div className="absolute top-4 right-4 flex space-x-2">
                  <CustomVoiceRecorder
                    onTranscript={handleTopicTranscript}
                    disabled={isLoading}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
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
                    : handleTopicSubmit
                }
                disabled={
                  isLoading ||
                  (fileUploadState.files.length === 0 && !debateTopic.trim()) ||
                  fileUploadState.isProcessing
                }
                className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading || fileUploadState.isProcessing
                  ? fileUploadState.files.length > 0
                    ? "Processing Files..."
                    : "Starting Debate..."
                  : fileUploadState.files.length > 0
                    ? "Extract & Start Debate"
                    : "Start Debate"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Live Debate */}
        {currentStep === "debating" && (
          <div className="space-y-6">
            {/* Debate Info */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center mb-4">
                <div className="w-2 h-2 rounded-full mr-3 bg-blue-400 animate-pulse"></div>
                <h3 className="text-xl font-semibold text-white">
                  Live Debate Battle
                </h3>
              </div>
              <h4 className="text-lg font-medium text-gray-300 mb-4">
                {debateTopic}
              </h4>

              {/* AI Opponent Info */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="flex items-center mb-2">
                  <span className="text-2xl mr-2">{AI_OPPONENT.avatar}</span>
                  <div>
                    <h4 className="font-medium text-white">
                      {AI_OPPONENT.name}
                    </h4>
                    <p className="text-xs text-gray-400">
                      {AI_OPPONENT.personality}
                    </p>
                  </div>
                </div>
                <p className="text-gray-300 text-sm">
                  {AI_OPPONENT.description}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="bg-gray-800/30 rounded-lg border border-gray-700 h-96 overflow-y-auto p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                        message.type === "user"
                          ? "bg-white text-black"
                          : "bg-gray-700 text-gray-100"
                      }`}
                    >
                      {message.type === "agent" && (
                        <div className="flex items-center mb-2">
                          <span className="text-lg mr-2">
                            {AI_OPPONENT.avatar}
                          </span>
                          <span className="text-sm font-medium text-gray-300">
                            {AI_OPPONENT.name} ({AI_OPPONENT.personality})
                          </span>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">
                        {message.content}
                      </p>
                      <p className="text-xs opacity-70 mt-2">
                        {message.type === "user" ? "You" : message.agentName} •{" "}
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-700 text-gray-100 px-4 py-3 rounded-lg">
                      <div className="flex items-start space-x-2 sm:space-x-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span className="text-sm">
                          AI opponent is thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="bg-gray-800/30 rounded-lg p-3 sm:p-4 border border-gray-700">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Make your argument..."
                    className="w-full p-3 sm:p-4 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-gray-600 transition-all duration-200 text-sm sm:text-base"
                    disabled={isLoading}
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      !isLoading &&
                      currentMessage.trim() &&
                      handleSendMessage()
                    }
                  />
                </div>
                <div className="flex space-x-2 justify-end sm:justify-start">
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !currentMessage.trim()}
                    className="px-6 py-3 sm:px-4 sm:py-2 bg-white text-black rounded-xl font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 min-h-[44px] text-sm sm:text-base"
                  >
                    Send
                  </button>
                  <CustomVoiceRecorder
                    onTranscript={handleTranscript}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Discussion Stats */}
            <div className="bg-gray-800/30 rounded-lg p-3 sm:p-4 border border-gray-700">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white">
                    {discussionRound}
                  </div>
                  <div className="text-sm text-gray-400">Debate Rounds</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {userParticipationCount}
                  </div>
                  <div className="text-sm text-gray-400">
                    Your Contributions
                  </div>
                </div>
              </div>
            </div>

            {/* End Debate Button */}
            <div className="text-center">
              <button
                onClick={handleEndDebate}
                disabled={isLoading}
                className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                End Debate & Get Final Evaluation
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Final Evaluation */}
        {currentStep === "evaluation" && finalEvaluation && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gray-800/50 border border-gray-700/50 mb-4">
                <svg
                  className="w-6 h-6 text-gray-300"
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
              <h2 className="text-3xl font-semibold text-white mb-4">
                Debate Performance Summary
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
                Here's your debate performance analysis. Individual categories
                (0-20) show specific strengths/weaknesses, while the overall
                score (0-100) reflects your total debate effectiveness.
              </p>
            </div>

            {/* Overall Score */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
              <div className="flex items-center justify-center mb-6">
                <h3 className="text-xl font-semibold text-white">
                  Overall Debate Score
                </h3>
              </div>
              <div className="flex justify-center">
                <div className="relative w-32 h-32 group">
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

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
                      strokeDasharray={`${finalEvaluation.overall_score}, 100`}
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white animate-pulse">
                        {finalEvaluation.overall_score}
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
                {Object.entries(finalEvaluation.category_scores).map(
                  ([category, score], index) => {
                    const categoryNames: { [key: string]: string } = {
                      // Enhanced debate evaluation categories
                      logicReasoning: "Logic & Reasoning",
                      evidenceQuality: "Evidence Quality",
                      toneLanguage: "Tone & Language",
                      opponentEngagement: "Opponent Engagement",
                      historicalPerformance: "Performance Consistency",
                      argumentStructure: "Argument Structure",
                      // Legacy support
                      argumentStrength: "Argument Strength",
                      evidenceSupport: "Evidence & Support",
                      logicalReasoning: "Logical Reasoning",
                      rebuttalEffectiveness: "Rebuttal Effectiveness",
                      persuasionImpact: "Persuasion & Impact",
                      engagementResponsiveness: "Engagement & Responsiveness",
                      logic: "Logic & Structure",
                      evidence: "Evidence & Facts",
                      clarity: "Clarity & Delivery",
                      engagement: "Engagement",
                      emotional: "Emotional Appeal",
                      time: "Time Management",
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

            {/* Final Feedback */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
              <h3 className="text-xl font-semibold text-white mb-4">
                Debater's Assessment
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                {finalEvaluation.feedback}
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-white mb-2">
                    Debate Strengths:
                  </h4>
                  <p className="text-gray-300">
                    {finalEvaluation.whatYouDidWell}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-white mb-2">
                    Areas to Improve:
                  </h4>
                  <p className="text-gray-300">
                    {finalEvaluation.areasForImprovement}
                  </p>
                </div>
              </div>
            </div>

            {/* Improvement Tips */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Personalized Coaching Recommendations
              </h3>
              <ul className="space-y-3">
                {finalEvaluation.tips.map((tip, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-white mr-3 mt-1">•</span>
                    <span className="text-gray-300">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Per-Message Breakdown */}
            {finalEvaluation.messageBreakdown && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Per-Message Performance Breakdown
                </h3>
                <p className="text-gray-400 mb-4">
                  Each of your responses scored individually. Category scores
                  (0-20) show specific strengths/weaknesses, while Overall
                  Performance (0-100) shows total debate effectiveness.
                </p>
                <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
                  <h4 className="text-sm font-medium text-white mb-2">
                    Score Interpretation:
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-red-400"></div>
                      <span className="text-gray-300">
                        0-25: Weak (needs major improvement)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-yellow-400"></div>
                      <span className="text-gray-300">
                        25-40: Decent (typical performance)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-green-400"></div>
                      <span className="text-gray-300">
                        40-55: Strong (good debater)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded bg-blue-400"></div>
                      <span className="text-gray-300">
                        55+: Elite (championship level)
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {finalEvaluation.messageBreakdown.map(
                    (message: any, index: number) => {
                      const getScoreColor = (score: number) => {
                        if (score <= 25)
                          return "text-red-400 bg-red-900/20 border-red-800";
                        if (score <= 40)
                          return "text-yellow-400 bg-yellow-900/20 border-yellow-800";
                        if (score <= 55)
                          return "text-green-400 bg-green-900/20 border-green-800";
                        return "text-blue-400 bg-blue-900/20 border-blue-800";
                      };

                      const getScoreLabel = (score: number) => {
                        if (score <= 25) return "Weak";
                        if (score <= 40) return "Decent";
                        if (score <= 55) return "Strong";
                        return "Elite";
                      };

                      return (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border ${getScoreColor(message.overallPerformance)}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-medium text-gray-300">
                                Message {message.messageNumber}
                              </span>
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(message.overallPerformance)}`}
                              >
                                {getScoreLabel(message.overallPerformance)} (
                                {message.overallPerformance}/100)
                              </span>
                            </div>
                          </div>
                          <div className="mb-3">
                            <p className="text-gray-200 italic">
                              "{message.messageContent}"
                            </p>
                          </div>
                          <div className="grid grid-cols-6 gap-2 mb-3">
                            <div className="text-center">
                              <div className="text-xs text-gray-400">Logic</div>
                              <div className="text-sm font-medium">
                                {message.scores.logicReasoning}/20
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400">
                                Evidence
                              </div>
                              <div className="text-sm font-medium">
                                {message.scores.evidenceQuality}/20
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400">Tone</div>
                              <div className="text-sm font-medium">
                                {message.scores.toneLanguage}/20
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400">
                                Engagement
                              </div>
                              <div className="text-sm font-medium">
                                {message.scores.opponentEngagement}/20
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400">
                                Structure
                              </div>
                              <div className="text-sm font-medium">
                                {message.scores.argumentStructure}/20
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-400">
                                Overall
                              </div>
                              <div className="text-sm font-medium">
                                {message.overallPerformance}/100
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-gray-300">
                            {message.critique}
                          </p>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {/* Detailed Debate Analysis */}
            {finalEvaluation.debateAnalysis && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Detailed Debate Analysis
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Your Strongest Argument:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{finalEvaluation.debateAnalysis.strongestArgument}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Your Weakest Argument:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{finalEvaluation.debateAnalysis.weakestArgument}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Best Rebuttal:
                    </h4>
                    <p className="text-gray-300 italic">
                      "{finalEvaluation.debateAnalysis.bestRebuttal}"
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Missed Opportunities:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.debateAnalysis.missedOpportunities}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Improvement Over Time:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.debateAnalysis.improvementOverTime}
                    </p>
                  </div>
                  {finalEvaluation.debateAnalysis.logicalConsistency && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Logical Consistency:
                      </h4>
                      <p className="text-gray-300">
                        {finalEvaluation.debateAnalysis.logicalConsistency}
                      </p>
                    </div>
                  )}
                  {finalEvaluation.debateAnalysis.evidenceEffectiveness && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Evidence Effectiveness:
                      </h4>
                      <p className="text-gray-300">
                        {finalEvaluation.debateAnalysis.evidenceEffectiveness}
                      </p>
                    </div>
                  )}
                  {finalEvaluation.debateAnalysis.rhetoricalSophistication && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Rhetorical Sophistication:
                      </h4>
                      <p className="text-gray-300">
                        {
                          finalEvaluation.debateAnalysis
                            .rhetoricalSophistication
                        }
                      </p>
                    </div>
                  )}
                  {finalEvaluation.debateAnalysis.logicalFallacies && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Logical Fallacies:
                      </h4>
                      <p className="text-gray-300">
                        {finalEvaluation.debateAnalysis.logicalFallacies}
                      </p>
                    </div>
                  )}
                  {finalEvaluation.debateAnalysis.argumentativePatterns && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Argumentative Patterns:
                      </h4>
                      <p className="text-gray-300">
                        {finalEvaluation.debateAnalysis.argumentativePatterns}
                      </p>
                    </div>
                  )}
                  {finalEvaluation.debateAnalysis.emotionalIntelligence && (
                    <div>
                      <h4 className="font-medium text-white mb-2">
                        Emotional Intelligence:
                      </h4>
                      <p className="text-gray-300">
                        {finalEvaluation.debateAnalysis.emotionalIntelligence}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Performance Insights */}
            {finalEvaluation.performanceInsights && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Advanced Performance Insights
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Debate Style:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.debateStyle}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Top Strengths:
                    </h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                      {finalEvaluation.performanceInsights.strengthAreas?.map(
                        (strength, index) => (
                          <li key={index}>{strength}</li>
                        ),
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Improvement Areas:
                    </h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                      {finalEvaluation.performanceInsights.improvementAreas?.map(
                        (area, index) => (
                          <li key={index}>{area}</li>
                        ),
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Strategic Moves:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.strategicMoves}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Tactical Errors:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.tacticalErrors}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Opponent Exploitation:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.opponentExploitation}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Pressure Handling:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.pressureHandling}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Comeback Ability:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.performanceInsights.comebackAbility}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* World-Class Comparison */}
            {finalEvaluation.worldClassComparison && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  World-Class Standards Comparison
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Current Skill Level:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.worldClassComparison.currentLevel}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Championship Gap:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.worldClassComparison.championshipGap}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Next Milestone:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.worldClassComparison.nextMilestone}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Training Focus:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.worldClassComparison.trainingFocus}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Communication Profile */}
            {finalEvaluation.communicationBehavior && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Your Debate Style
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Debate Profile:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.communicationBehavior.profile}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Key Strength:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.communicationBehavior.strength}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Growth Area:
                    </h4>
                    <p className="text-gray-300">
                      {finalEvaluation.communicationBehavior.growthArea}
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
                Start New Debate
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
  );
};

export default DebaterInterface;
