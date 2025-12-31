import React, { useState, useRef, useEffect } from "react";
import { CoachMode, Feedback, LoadingState, UploadedFile, FileUploadState } from "../types";
import { processUploadedFilesForTeaching } from "../services/geminiService";
import {
  getGroupDiscussionResponseWithGroq,
  getGroupDiscussionEvaluationWithGroq
} from "../services/grokService";
import { useTheme } from "../contexts/ThemeContext";
import CustomVoiceRecorder from "./CustomVoiceRecorder";
import { extractTextFromImageOrPDF } from "../services/ocrService";

interface GroupDiscussionInterfaceProps {
  onBack: () => void;
  ai: any; // GoogleGenAI instance (for file processing)
  grokApiKey?: string | string[]; // Groq API key(s) for discussion
}

interface GroupMessage {
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

const AI_AGENTS: AIAgent[] = [
  {
    name: "Sarah",
    personality: "Analytical Thinker",
    description: "Brings data and research. Asks clarifying questions. Helps think through details.",
    avatar: "🧠",
    color: "bg-blue-500",
  },
  {
    name: "Marcus",
    personality: "Creative Visionary",
    description: "Suggests new approaches. Builds on others' ideas. Thinks outside the box.",
    avatar: "💡",
    color: "bg-purple-500",
  },
  {
    name: "Elena",
    personality: "Practical Realist",
    description: "Focuses on implementation. Shares real-world experience. Keeps things grounded.",
    avatar: "⚖️",
    color: "bg-green-500",
  },
  {
    name: "David",
    personality: "Social Connector",
    description: "Links different perspectives. Facilitates collaboration. Builds consensus.",
    avatar: "🤝",
    color: "bg-orange-500",
  },
];

const GroupDiscussionInterface: React.FC<GroupDiscussionInterfaceProps> = ({
  onBack,
  ai,
  grokApiKey,
}) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState<
    "topic" | "discussing" | "evaluation"
  >("topic");
  const [discussionTopic, setDiscussionTopic] = useState<string>("");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [loadingState, setLoadingState] = useState<LoadingState>(
    LoadingState.Idle,
  );
  const [error, setError] = useState<string | null>(null);
  const [finalEvaluation, setFinalEvaluation] = useState<Feedback | null>(null);

  const [activeAgents, setActiveAgents] = useState<AIAgent[]>([]);
  const [discussionRound, setDiscussionRound] = useState<number>(0);
  const [userParticipationCount, setUserParticipationCount] =
    useState<number>(0);
  const [isAIActive, setIsAIActive] = useState<boolean>(false);

  const [fileUploadState, setFileUploadState] = useState<FileUploadState>({
    files: [],
    isProcessing: false,
    error: null,
  });
  const [isOCRLoading, setIsOCRLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Random AI conversation trigger
  useEffect(() => {
    if (
      currentStep === "discussing" &&
      activeAgents.length > 0 &&
      !isAIActive &&
      loadingState === LoadingState.Idle
    ) {
      const interval = setInterval(
        () => {
          triggerAIConversation();
        },
        Math.random() * 5000 + 3000,
      ); // Random interval between 3-8 seconds

      return () => clearInterval(interval);
    }
  }, [
    currentStep,
    activeAgents.length,
    isAIActive,
    loadingState,
    discussionTopic,
    messages,
  ]);

  const handleTranscript = (text: string) => {
    setCurrentMessage(text);
  };

  const handleTopicTranscript = (text: string) => {
    setDiscussionTopic(text);
  };

  // Function to make AI agents spontaneously talk to each other
  const triggerAIConversation = async () => {
    if (!ai || isAIActive || loadingState !== LoadingState.Idle) return;

    setIsAIActive(true);
    setLoadingState(LoadingState.GeneratingFeedback);

    try {
      // Random chance for AI agents to continue talking (37% chance every 3-8 seconds)
      const shouldTalk = Math.random() < 0.37;

      if (shouldTalk && messages.length > 0) {
        // Get 1-2 AI agent responses
        const numResponses = Math.random() < 0.7 ? 1 : 2;

        for (let i = 0; i < numResponses; i++) {
          const response = await getGroupDiscussionResponseWithGroq(
            grokApiKey,
            discussionTopic,
            "",
            discussionRound + i,
            false,
            activeAgents,
            messages,
          );

          // Add AI response
          const aiMessage: GroupMessage = {
            id: `agent-${Date.now()}-${i}`,
            type: "agent",
            content: response.content,
            timestamp: new Date(),
            agentName: response.agentName,
            agentPersonality: response.agentPersonality,
          };

          setMessages((prev) => [...prev, aiMessage]);
          setDiscussionRound((prev) => prev + 1);

          // Small delay between AI responses
          if (i < numResponses - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }
    } catch (err) {
      console.error("Error in AI conversation:", err);
    } finally {
      setIsAIActive(false);
      setLoadingState(LoadingState.Idle);
    }
  };

  const handleTopicSubmit = async () => {
    if (!discussionTopic.trim()) {
      setError("Please provide a discussion topic.");
      return;
    }

    console.log("🔍 DEBUG: grokApiKey value:", grokApiKey, "Type:", typeof grokApiKey, "Is Array:", Array.isArray(grokApiKey));

    if (!grokApiKey) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      // Select 3 random agents for the discussion
      const shuffled = [...AI_AGENTS].sort(() => 0.5 - Math.random());
      const selectedAgents = shuffled.slice(0, 3);
      setActiveAgents(selectedAgents);

      // Start the group discussion
      const response = await getGroupDiscussionResponseWithGroq(
        grokApiKey,
        discussionTopic,
        "",
        0,
        true,
        selectedAgents,
      );

      // Add initial agent message
      const initialMessage: GroupMessage = {
        id: `agent-${Date.now()}`,
        type: "agent",
        content: response.content,
        timestamp: new Date(),
        agentName: response.agentName,
        agentPersonality: response.agentPersonality,
      };

      setMessages([initialMessage]);
      setCurrentStep("discussing");
      setDiscussionRound(1);
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error starting group discussion:", err);
      setError(
        "An error occurred while starting the discussion. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) {
      setError("Please enter your contribution to the discussion.");
      return;
    }

    if (!grokApiKey) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    // Store the message before clearing it
    const messageToSend = currentMessage.trim();

    // Add user message
    const userMessage: GroupMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: messageToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setCurrentMessage("");
    setUserParticipationCount((prev) => prev + 1);
    setLoadingState(LoadingState.GeneratingFeedback);
    setError(null);

    try {
      // Always get at least 1 AI response to user messages
      const numResponses = Math.random() < 0.6 ? 1 : 2;

      for (let i = 0; i < numResponses; i++) {
        const response = await getGroupDiscussionResponseWithGroq(
          grokApiKey,
          discussionTopic,
          messageToSend, // Use stored message
          discussionRound + i,
          false,
          activeAgents,
          [...messages, userMessage], // Include the new user message
        );

        // Add AI response
        const aiMessage: GroupMessage = {
          id: `agent-${Date.now()}-${i}`,
          type: "agent",
          content: response.content,
          timestamp: new Date(),
          agentName: response.agentName,
          agentPersonality: response.agentPersonality,
        };

        setMessages((prev) => [...prev, aiMessage]);

        // Small delay between AI responses for natural flow
        if (i < numResponses - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      setDiscussionRound((prev) => prev + 1);
      setLoadingState(LoadingState.Done);
    } catch (err) {
      console.error("Error getting group discussion response:", err);
      setError(
        "An error occurred while getting the AI's response. Please try again.",
      );
      setLoadingState(LoadingState.Error);
    }
  };

  const handleEndDiscussion = async () => {
    if (!grokApiKey) {
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

      // Get comprehensive final evaluation
      const evaluation = await getGroupDiscussionEvaluationWithGroq(
        grokApiKey,
        discussionTopic,
        discussionHistory,
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

  const handleTryAgain = () => {
    setMessages([]);
    setCurrentMessage("");
    setFinalEvaluation(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setDiscussionRound(0);
    setUserParticipationCount(0);
    // Restart the discussion with same agents and topic
    // Since we keep activeAgents, the discussion useEffect will resume naturally
    setCurrentStep("discussing");
    setIsAIActive(false);
  };

  const resetInterface = () => {
    setCurrentStep("topic");
    setDiscussionTopic("");
    setMessages([]);
    setCurrentMessage("");
    setFinalEvaluation(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setActiveAgents([]);
    setDiscussionRound(0);
    setUserParticipationCount(0);
    setFileUploadState({ files: [], isProcessing: false, error: null });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        setFileUploadState((prev) => ({ ...prev, error: `Unsupported file type: ${file.type}. Please upload images or PDF files only.` }));
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setFileUploadState((prev) => ({ ...prev, error: `File ${file.name} is too large. Maximum size is 10MB.` }));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const base64Content = content.split(",")[1];

        const uploadedFile: UploadedFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: file.size,
          content: base64Content,
          mimeType: file.type,
        };

        setFileUploadState((prev) => ({ ...prev, files: [...prev.files, uploadedFile], error: null }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (fileId: string) => {
    setFileUploadState((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== fileId) }));
  };

  const handleFileSubmit = async () => {
    if (fileUploadState.files.length === 0) {
      setError("Please upload at least one file.");
      return;
    }

    setFileUploadState({ ...fileUploadState, isProcessing: true, error: null });
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

      setDiscussionTopic((prev) =>
        prev.trim()
          ? `${prev}\n\n${combinedText.trim()}`
          : combinedText.trim()
      );

      setFileUploadState({ files: [], isProcessing: false, error: null });
    } catch (err) {
      console.error("Error processing files:", err);
      const errorMsg = err instanceof Error ? err.message : "An error occurred while processing your files. Please try again.";
      setError(errorMsg);
      setFileUploadState({ ...fileUploadState, isProcessing: false, error: errorMsg });
    }
  };

  const isLoading = loadingState === LoadingState.GeneratingFeedback;

  return (
    <>
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
                Group Discussion Coach
              </h1>
              <p
                className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
              >
                Practice with AI agents in realistic group discussions
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
                      d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                    />
                  </svg>
                </div>
                <h2
                  className={`text-3xl font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-black"
                    }`}
                >
                  Professional Group Discussion
                </h2>
                <p
                  className={`max-w-2xl mx-auto leading-relaxed ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                >
                  Collaborate on any topic with 3 AI agents who work like real team members - they'll build on your ideas, share insights, and help develop solutions together.
                </p>
              </div>

              <div
                className={`rounded-lg p-6 border ${theme === "dark"
                  ? "bg-gray-800/30 border-gray-700"
                  : "bg-gray-50 border-gray-300"
                  }`}
              >
                <label
                  className={`block text-lg font-medium mb-4 ${theme === "dark" ? "text-white" : "text-black"
                    }`}
                >
                  What professional topic would you like to discuss?
                </label>
                <div className="relative">
                  <textarea
                    value={discussionTopic}
                    onChange={(e) => setDiscussionTopic(e.target.value)}
                    placeholder="Type your discussion topic or upload files to extract content..."
                    className={`w-full h-32 p-4 pr-24 border-2 rounded-none focus:outline-none resize-none transition-all duration-200 text-sm sm:text-base focus:ring-2 ${theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-gray-600 focus:ring-white/30"
                      : "bg-white border-gray-300 text-black placeholder-gray-500 focus:border-gray-300 focus:ring-blue-500/30"
                      }`}
                    disabled={isLoading}
                  />

                  {/* Voice Recorder and File Upload */}
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
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2 transition-colors duration-200 rounded-lg ${theme === "dark"
                        ? "text-gray-400 hover:text-white hover:bg-gray-700"
                        : "text-gray-500 hover:text-black hover:bg-gray-200"
                        }`}
                      title="Upload files (images/PDFs)"
                      disabled={isLoading}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* File List */}
                {fileUploadState.files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className={`text-sm font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                      Uploaded Files:
                    </h4>
                    <div className="space-y-2">
                      {fileUploadState.files.map((file) => (
                        <div key={file.id} className={`flex items-center justify-between rounded-lg p-2 ${theme === "dark" ? "bg-gray-900/50" : "bg-gray-100"}`}>
                          <div className="flex items-center space-x-2">
                            <div className="text-lg">{file.type.startsWith("image/") ? "🖼️" : "📄"}</div>
                            <div>
                              <div className={`text-sm font-medium ${theme === "dark" ? "text-white" : "text-black"}`}>{file.name}</div>
                              <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                            </div>
                          </div>
                          <button onClick={() => removeFile(file.id)} className="text-red-400 hover:text-red-300 transition-colors duration-200 p-1" disabled={isLoading}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                  onClick={fileUploadState.files.length > 0 ? handleFileSubmit : handleTopicSubmit}
                  disabled={isLoading || (fileUploadState.files.length === 0 && !discussionTopic.trim()) || fileUploadState.isProcessing}
                  className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isLoading || fileUploadState.isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2 inline-block"></div>
                      {fileUploadState.files.length > 0 ? "Processing Files..." : "Starting Discussion..."}
                    </>
                  ) : (
                    fileUploadState.files.length > 0 ? "Extract & Start Discussion" : "Start Group Discussion"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Group Discussion */}
          {currentStep === "discussing" && (
            <div className="space-y-6">
              {/* Discussion Info */}
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center mb-4">
                  <div
                    className={`w-2 h-2 rounded-full mr-3 ${isAIActive ? "bg-blue-400 animate-pulse" : "bg-green-400 animate-pulse"}`}
                  ></div>
                  <h3 className="text-xl font-semibold text-white">
                    Live Group Discussion
                    {isAIActive && (
                      <span className="text-sm text-blue-400 ml-2">
                        (AI agents discussing...)
                      </span>
                    )}
                  </h3>
                </div>
                <h4 className="text-lg font-medium text-gray-300 mb-4">
                  {discussionTopic}
                </h4>

                {/* Active Agents */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeAgents.map((agent, index) => (
                    <div
                      key={index}
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
                    >
                      <div className="flex items-center mb-2">
                        <span className="text-2xl mr-2">{agent.avatar}</span>
                        <div>
                          <h4 className="font-medium text-white">{agent.name}</h4>
                          <p className="text-xs text-gray-400">
                            {agent.personality}
                          </p>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm">{agent.description}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                  <p className="text-blue-200 text-sm">
                    💡 <strong>Collaborative Discussion:</strong> These agents work together like real team members - they'll build on your ideas, share insights, and help develop solutions.
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
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${message.type === "user"
                          ? "bg-white text-black"
                          : "bg-gray-700 text-gray-100"
                          }`}
                      >
                        {message.type === "agent" && (
                          <div className="flex items-center mb-2">
                            <span className="text-lg mr-2">
                              {
                                activeAgents.find(
                                  (a) => a.name === message.agentName,
                                )?.avatar
                              }
                            </span>
                            <span className="text-sm font-medium text-gray-300">
                              {message.agentName} ({message.agentPersonality})
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
                  {(isLoading || isAIActive) && (
                    <div className="flex justify-start">
                      <div className="bg-gray-700 text-gray-100 px-4 py-3 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span className="text-sm">
                            {isAIActive
                              ? "AI agents are discussing..."
                              : "AI agents are thinking..."}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                <div className="flex space-x-3">
                  <div className="flex-1">
                    <textarea
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      placeholder="Contribute to the discussion..."
                      className="w-full h-24 p-3 bg-gray-800 border-2 border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:border-white transition-colors duration-200 resize-none"
                      disabled={isLoading || isAIActive}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!isLoading && !isAIActive && currentMessage.trim()) {
                            handleSendMessage();
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || isAIActive || !currentMessage.trim()}
                      className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                      Send
                    </button>
                    <CustomVoiceRecorder
                      onTranscript={handleTranscript}
                      disabled={isLoading || isAIActive}
                    />
                  </div>
                </div>
              </div>

              {/* Discussion Stats */}
              <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {discussionRound}
                    </div>
                    <div className="text-sm text-gray-400">Discussion Rounds</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {userParticipationCount}
                    </div>
                    <div className="text-sm text-gray-400">
                      Your Contributions
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {activeAgents.length}
                    </div>
                    <div className="text-sm text-gray-400">AI Agents</div>
                  </div>
                </div>
              </div>

              {/* End Discussion Button */}
              <div className="text-center">
                <button
                  onClick={handleEndDiscussion}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  End Discussion & Get Analysis
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-3xl font-semibold text-white mb-4">
                  Discussion Performance Analysis
                </h2>
                <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
                  The AI has evaluated your participation, communication skills, and
                  contribution quality throughout the group discussion.
                </p>
              </div>

              {/* Overall Score */}
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
                <div className="flex items-center justify-center mb-6">
                  <h3 className="text-xl font-semibold text-white">
                    Overall Performance Score
                  </h3>
                </div>
                <div className="flex justify-center">
                  <div className="relative w-32 h-32 group">
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
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-white transition-all duration-2000 ease-out drop-shadow-lg"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${finalEvaluation.overall_score || finalEvaluation.score}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-white animate-pulse">
                          {finalEvaluation.overall_score || finalEvaluation.score}
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
                  Skill Breakdown (0-20 each)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {Object.entries(finalEvaluation.category_scores || {}).map(
                    ([category, score], index) => {
                      const categoryNames: { [key: string]: string } = {
                        participation: "Participation",
                        communication: "Clarity",
                        leadership: "Leadership",
                        listening: "Listening",
                        collaboration: "Collaboration",
                        criticalThinking: "Critical Thinking",
                        clarity: "Flow",
                        vocabulary: "Vocabulary",
                        grammar: "Accuracy",
                        logic: "Reasoning",
                        fluency: "Fluency",
                        creativity: "Originality",
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
                            <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-300 ${color.replace("text-", "bg-")} blur-sm`}></div>
                            <svg
                              className="w-20 h-20 transform -rotate-90 relative z-10"
                              viewBox="0 0 36 36"
                            >
                              <path
                                className="text-gray-700"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className={`${color} transition-all duration-2000 ease-out drop-shadow-sm`}
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                fill="none"
                                strokeDasharray={`${percentage}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                              <div className="text-lg font-bold text-white group-hover:text-gray-100 transition-colors duration-300">
                                {score}
                              </div>
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs font-medium text-white group-hover:text-gray-100 transition-colors duration-300">
                              {categoryNames[category] || category}
                            </div>
                            <div className="text-[10px] text-gray-500">/20</div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Assessment Section */}
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Facilitator's Assessment
                </h3>
                <p className="text-gray-300 leading-relaxed mb-6">
                  {finalEvaluation.feedback}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {finalEvaluation.whatYouDidWell && (
                    <div className="bg-green-900/10 border border-green-900/30 rounded-xl p-4">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-green-400 uppercase tracking-wider mb-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Discussion Strengths
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {finalEvaluation.whatYouDidWell}
                      </p>
                    </div>
                  )}
                  {finalEvaluation.areasForImprovement && (
                    <div className="bg-blue-900/10 border border-blue-900/30 rounded-xl p-4">
                      <h4 className="flex items-center gap-2 text-sm font-bold text-blue-400 uppercase tracking-wider mb-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Growth Opportunities
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {finalEvaluation.areasForImprovement}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendation Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Improvement Tips */}
                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Top Recommendations
                  </h3>
                  <ul className="space-y-4">
                    {(finalEvaluation.tips || []).map((tip: string, index: number) => (
                      <li key={index} className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400">
                          {index + 1}
                        </div>
                        <span className="text-sm text-gray-300 leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Discussion Analysis */}
                {finalEvaluation.groupDiscussionAnalysis && (
                  <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
                    <h3 className="text-xl font-semibold text-white mb-4">
                      Discussion Deep-Dive
                    </h3>
                    <div className="space-y-4">
                      {finalEvaluation.groupDiscussionAnalysis.strongestContribution && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Impact Highlight:</h4>
                          <p className="text-sm text-gray-300 italic">"{finalEvaluation.groupDiscussionAnalysis.strongestContribution}"</p>
                        </div>
                      )}
                      {finalEvaluation.groupDiscussionAnalysis.bestInteraction && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Best Interaction:</h4>
                          <p className="text-sm text-gray-300">{finalEvaluation.groupDiscussionAnalysis.bestInteraction}</p>
                        </div>
                      )}
                      {finalEvaluation.groupDiscussionAnalysis.groupDynamics && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Group Dynamics:</h4>
                          <p className="text-sm text-gray-300">{finalEvaluation.groupDiscussionAnalysis.groupDynamics}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-Message Breakdown */}
              {finalEvaluation.messageBreakdown && (
                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg hover:shadow-white/5">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Per-Message Performance Breakdown
                  </h3>
                  <p className="text-gray-400 mb-6 text-sm">
                    Review how each of your contributions was scored individually.
                    This breakdown helps identify specific moments of impact or missed opportunities.
                  </p>

                  <div className="space-y-4">
                    {finalEvaluation.messageBreakdown.map((message: any, index: number) => {
                      const getScoreColor = (score: number) => {
                        if (score <= 25) return "text-red-400 bg-red-900/20 border-red-800";
                        if (score <= 40) return "text-yellow-400 bg-yellow-900/20 border-yellow-800";
                        if (score <= 60) return "text-green-400 bg-green-900/20 border-green-800";
                        return "text-blue-400 bg-blue-900/20 border-blue-800";
                      };

                      const getScoreLabel = (score: number) => {
                        if (score <= 25) return "Improving";
                        if (score <= 40) return "Solid";
                        if (score <= 60) return "Strong";
                        return "Expert";
                      };

                      return (
                        <div
                          key={index}
                          className={`p-5 rounded-2xl border ${getScoreColor(message.overallPerformance)}`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black uppercase tracking-widest opacity-50">
                                Msg #{message.messageNumber}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getScoreColor(message.overallPerformance)}`}>
                                {getScoreLabel(message.overallPerformance)} • {message.overallPerformance}/100
                              </span>
                            </div>
                          </div>
                          <div className="mb-4">
                            <p className="text-gray-200 italic leading-relaxed text-sm">
                              "{message.messageContent}"
                            </p>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                            {Object.entries(message.scores).map(([key, val]: [string, any]) => {
                              const labelMap: Record<string, string> = {
                                participation: "Engage",
                                communication: "Clarity",
                                leadership: "Lead",
                                listening: "Listen",
                                collaboration: "Team",
                                criticalThinking: "Logic"
                              };
                              return (
                                <div key={key} className="bg-black/20 rounded-lg p-2 text-center border border-white/5">
                                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{labelMap[key] || key}</div>
                                  <div className="text-sm font-black text-white">{val}/20</div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                            <span className="text-blue-400 text-lg">“</span>
                            <p className="text-xs text-gray-400 italic leading-relaxed">
                              {message.critique}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Communication Profile */}
              {finalEvaluation.communicationBehavior && (
                <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all duration-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h3 className="text-xl font-semibold text-white">Your Discussion Style</h3>
                    <div className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-black uppercase tracking-[.2em]">
                      {finalEvaluation.communicationBehavior.profile}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Dominant Strength</h4>
                      <p className="text-gray-300 leading-relaxed">{finalEvaluation.communicationBehavior.strength}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Refinement Area</h4>
                      <p className="text-gray-300 leading-relaxed">{finalEvaluation.communicationBehavior.growthArea}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Example Rewrite */}
              {finalEvaluation.exampleRewrite && (
                <div className="bg-white rounded-2xl p-8 text-black">
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-6">
                    Professional Elevation
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[.3em] text-gray-400 mb-2">Original Context</h4>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <p className="text-sm italic text-gray-600">"{finalEvaluation.exampleRewrite.original}"</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <h4 className="text-[10px] font-black uppercase tracking-[.3em] text-gray-400 mb-2">Strategic Reasoning</h4>
                        <p className="text-sm font-medium leading-relaxed">{finalEvaluation.exampleRewrite.reasoning}</p>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h4 className="text-[10px] font-black uppercase tracking-[.3em] text-gray-400 mb-2">Recommended Contribution</h4>
                      <div className="flex-1 p-6 bg-black rounded-2xl flex items-center justify-center">
                        <p className="text-lg font-bold text-white text-center leading-relaxed">
                          {finalEvaluation.exampleRewrite.improved}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 pt-8">
                <button
                  onClick={handleTryAgain}
                  className="w-full sm:w-auto px-10 py-4 bg-white text-black rounded-full font-black uppercase tracking-widest text-xs hover:bg-gray-100 transition-all duration-300 shadow-xl active:scale-95"
                >
                  Try Again
                </button>
                <button
                  onClick={resetInterface}
                  className="w-full sm:w-auto px-10 py-4 bg-gray-800 text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-gray-700 transition-all duration-300 border border-gray-700 active:scale-95"
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

export default GroupDiscussionInterface;
