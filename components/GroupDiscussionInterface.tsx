import React, { useState, useRef, useEffect } from "react";
import { CoachMode, Feedback, LoadingState } from "../types";
import {
  getGroupDiscussionResponse,
  getGroupDiscussionEvaluation,
} from "../services/geminiService";
import { useTheme } from "../contexts/ThemeContext";
import CustomVoiceRecorder from "./CustomVoiceRecorder";

interface GroupDiscussionInterfaceProps {
  onBack: () => void;
  ai: any; // GoogleGenAI instance
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
    description: "Data-driven, logical, asks probing questions",
    avatar: "🧠",
    color: "bg-blue-500",
  },
  {
    name: "Marcus",
    personality: "Creative Visionary",
    description: "Imaginative, thinks outside the box, challenges assumptions",
    avatar: "💡",
    color: "bg-purple-500",
  },
  {
    name: "Elena",
    personality: "Practical Realist",
    description: "Grounds ideas in reality, focuses on implementation",
    avatar: "⚖️",
    color: "bg-green-500",
  },
  {
    name: "David",
    personality: "Social Connector",
    description: "Builds on others' ideas, facilitates discussion",
    avatar: "🤝",
    color: "bg-orange-500",
  },
];

const GroupDiscussionInterface: React.FC<GroupDiscussionInterfaceProps> = ({
  onBack,
  ai,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      // Random chance for AI agents to continue talking (30% chance every 3-5 seconds)
      const shouldTalk = Math.random() < 0.3;

      if (shouldTalk && messages.length > 0) {
        // Get 1-2 AI agent responses
        const numResponses = Math.random() < 0.7 ? 1 : 2;

        for (let i = 0; i < numResponses; i++) {
          const response = await getGroupDiscussionResponse(
            ai,
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

    if (!ai) {
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
      const response = await getGroupDiscussionResponse(
        ai,
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

    if (!ai) {
      setError("AI service not available. Please check your API key.");
      return;
    }

    // Add user message
    const userMessage: GroupMessage = {
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
      // Randomly decide if AI agents should continue the conversation
      // 70% chance of AI agents continuing, 30% chance of ending turn
      const shouldContinue = Math.random() < 0.7;

      if (shouldContinue) {
        // Get 1-2 AI agent responses randomly
        const numResponses = Math.random() < 0.6 ? 1 : 2;

        for (let i = 0; i < numResponses; i++) {
          const response = await getGroupDiscussionResponse(
            ai,
            discussionTopic,
            currentMessage,
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

          // Small delay between AI responses for natural flow
          if (i < numResponses - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
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

      // Get comprehensive final evaluation
      const evaluation = await getGroupDiscussionEvaluation(
        ai,
        discussionTopic,
        discussionHistory,
        activeAgents,
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
    setDiscussionTopic("");
    setMessages([]);
    setCurrentMessage("");
    setFinalEvaluation(null);
    setError(null);
    setLoadingState(LoadingState.Idle);
    setActiveAgents([]);
    setDiscussionRound(0);
    setUserParticipationCount(0);
  };

  const isLoading = loadingState === LoadingState.GeneratingFeedback;

  return (
    <div
      className={`min-h-screen ${
        theme === "dark" ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {/* Header */}
      <div
        className={`border-b p-6 ${
          theme === "dark" ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className={`flex items-center transition-colors duration-200 ${
              theme === "dark"
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
              className={`text-2xl font-semibold ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              Group Discussion Coach
            </h1>
            <p
              className={`text-sm ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
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
                className={`text-3xl font-semibold mb-4 ${
                  theme === "dark" ? "text-white" : "text-black"
                }`}
              >
                Choose Your Discussion Topic
              </h2>
              <p
                className={`max-w-2xl mx-auto leading-relaxed ${
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Enter a topic for group discussion. You'll join 3 AI agents with
                different personalities in a realistic, dynamic conversation
                that will challenge and develop your discussion skills.
              </p>
            </div>

            <div
              className={`rounded-lg p-6 border ${
                theme === "dark"
                  ? "bg-gray-800/30 border-gray-700"
                  : "bg-gray-50 border-gray-300"
              }`}
            >
              <label
                className={`block text-lg font-medium mb-4 ${
                  theme === "dark" ? "text-white" : "text-black"
                }`}
              >
                What would you like to discuss?
              </label>
              <div className="relative">
                <textarea
                  value={discussionTopic}
                  onChange={(e) => setDiscussionTopic(e.target.value)}
                  placeholder="Example: 'The impact of AI on education' or 'Remote work vs office work' or 'Climate change solutions' or 'The future of social media'..."
                  className={`w-full h-32 p-4 pr-12 border-2 rounded-none focus:outline-none resize-none transition-all duration-200 text-sm sm:text-base focus:ring-2 ${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-gray-600 focus:ring-white/30"
                      : "bg-white border-gray-300 text-black placeholder-gray-500 focus:border-gray-300 focus:ring-blue-500/30"
                  }`}
                  disabled={isLoading}
                />

                {/* Voice Recorder */}
                <div className="absolute top-4 right-4">
                  <CustomVoiceRecorder
                    onTranscript={handleTopicTranscript}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleTopicSubmit}
                disabled={isLoading || !discussionTopic.trim()}
                className="px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2 inline-block"></div>
                    Starting Discussion...
                  </>
                ) : (
                  "Start Group Discussion"
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
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Contribute to the discussion..."
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-none text-white placeholder-gray-400 focus:outline-none focus:border-white/50 transition-colors duration-200"
                    disabled={isLoading || isAIActive}
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      !isLoading &&
                      !isAIActive &&
                      currentMessage.trim() &&
                      handleSendMessage()
                    }
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-semibold text-white mb-4">
                Group Discussion Performance Analysis
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
                Here's your comprehensive group discussion performance. The AI
                has evaluated your participation, communication skills, and
                contribution quality throughout the discussion.
              </p>
            </div>

            {/* Overall Score */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-xl font-semibold ${
                    theme === "dark" ? "text-white" : "text-black"
                  }`}
                >
                  Overall Group Discussion Score
                </h3>
                <div
                  className={`text-3xl font-bold ${
                    theme === "dark" ? "text-white" : "text-black"
                  }`}
                >
                  {finalEvaluation.overall_score}/100
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${finalEvaluation.overall_score}%` }}
                />
              </div>
            </div>

            {/* Category Scores */}
            <div
              className={`rounded-lg p-6 border ${
                theme === "dark"
                  ? "bg-gray-800/30 border-gray-700"
                  : "bg-gray-50 border-gray-300"
              }`}
            >
              <h3
                className={`text-xl font-semibold mb-4 ${
                  theme === "dark" ? "text-white" : "text-black"
                }`}
              >
                Group Discussion Skills Analysis
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(finalEvaluation.category_scores).map(
                  ([category, score]) => {
                    const categoryNames: { [key: string]: string } = {
                      participation: "Participation & Engagement",
                      communication: "Communication Clarity",
                      leadership: "Leadership & Initiative",
                      listening: "Active Listening",
                      collaboration: "Collaboration Skills",
                      criticalThinking: "Critical Thinking",
                      // Legacy support
                      clarity: "Clarity",
                      vocabulary: "Vocabulary",
                      grammar: "Grammar",
                      logic: "Logic",
                      fluency: "Fluency",
                      creativity: "Creativity",
                    };
                    return (
                      <div key={category} className="text-center">
                        <div
                          className={`text-2xl font-bold mb-1 ${
                            theme === "dark" ? "text-white" : "text-black"
                          }`}
                        >
                          {score}/20
                        </div>
                        <div
                          className={`text-sm ${
                            theme === "dark" ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {categoryNames[category] || category}
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                          <div
                            className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${(Number(score) / 20) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* Final Feedback */}
            <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Group Discussion Assessment
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                {finalEvaluation.feedback}
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-white mb-2">
                    Discussion Strengths:
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
                Group Discussion Improvement Tips
              </h3>
              <ul className="space-y-3">
                {finalEvaluation.tips.map((tip, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-green-400 mr-3 mt-1">•</span>
                    <span className="text-gray-300">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Communication Profile */}
            {finalEvaluation.communicationBehavior && (
              <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Your Discussion Style
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-white mb-2">
                      Discussion Profile:
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
                Start New Discussion
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

export default GroupDiscussionInterface;
