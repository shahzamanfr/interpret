import React from "react";
import { LoadingState } from "../types";
import CustomVoiceRecorder from "./CustomVoiceRecorder";
import ChallengeBanner from "./ChallengeBanner";
import LightbulbIcon from "./icons/LightbulbIcon";
import StrategyTip from "./StrategyTip";
import { useTheme } from "../contexts/ThemeContext";

interface InputPanelProps {
  explanation: string;
  onExplanationChange: (value: string) => void;
  onSubmit: () => void;
  loadingState: LoadingState;
  challengeInfo: { scoreToBeat: number } | null;
  onGetStrategy: () => void;
  isFetchingStrategy: boolean;
  strategy: string | null;
  onDismissStrategy: () => void;
}

const InputPanel: React.FC<InputPanelProps> = ({
  explanation,
  onExplanationChange,
  onSubmit,
  loadingState,
  challengeInfo,
  onGetStrategy,
  isFetchingStrategy,
  strategy,
  onDismissStrategy,
}) => {
  const { theme } = useTheme();

  const handleTranscript = (text: string) => {
    console.log("🎤 Transcription received:", text);
    onExplanationChange(text);
  };

  const isLoading =
    loadingState === LoadingState.GeneratingCaption ||
    loadingState === LoadingState.GeneratingFeedback;
  const loadingText =
    loadingState === LoadingState.GeneratingCaption
      ? "Analyzing image..."
      : "Generating feedback...";

  return (
    <div
      className={`border-t pt-8 transition-colors duration-200 ${theme === "dark" ? "border-gray-800" : "border-gray-200"}`}
    >
      <div className="flex justify-between items-center mb-6">
        <h2
          className={`text-3xl font-bold tracking-tighter ${theme === "dark" ? "text-white" : "text-black"}`}
        >
          Your Explanation
        </h2>
        <button
          onClick={onGetStrategy}
          disabled={isFetchingStrategy || isLoading || !!strategy}
          className={`flex items-center px-4 py-2 text-sm font-medium border rounded-full focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
            theme === "dark"
              ? "text-gray-300 border-gray-700 hover:bg-gray-800 focus:ring-gray-600"
              : "text-black border-gray-300 hover:bg-gray-100 focus:ring-gray-300"
          }`}
        >
          {isFetchingStrategy ? (
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : (
            <LightbulbIcon className="w-4 h-4 mr-2" />
          )}
          Get Strategy
        </button>
      </div>

      {challengeInfo && (
        <ChallengeBanner scoreToBeat={challengeInfo.scoreToBeat} />
      )}
      {strategy && (
        <StrategyTip strategy={strategy} onDismiss={onDismissStrategy} />
      )}

      <div className="relative mt-4">
        <textarea
          value={explanation}
          onChange={(e) => onExplanationChange(e.target.value)}
          placeholder="Describe the image here, or use the microphone..."
          disabled={isLoading}
          className={`w-full h-40 p-4 border-2 rounded-none focus:ring-2 focus:outline-none disabled:opacity-50 transition-all duration-200 text-sm sm:text-base resize-none ${
            theme === "dark"
              ? "bg-gray-900 border-gray-800 focus:border-gray-800 focus:ring-white/30 text-gray-300 placeholder-gray-600"
              : "bg-white border-gray-200 focus:border-gray-200 focus:ring-blue-500/30 text-black placeholder-gray-500"
          }`}
        />
        <div className="absolute top-3 right-3 flex space-x-2 z-10">
          <CustomVoiceRecorder onTranscript={handleTranscript} disabled={isLoading} />
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={isLoading || !explanation}
        className={`mt-6 w-full h-14 flex items-center justify-center px-8 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
          theme === "dark"
            ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:ring-blue-500 disabled:from-gray-600 disabled:to-gray-700"
            : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:ring-blue-400 disabled:from-gray-400 disabled:to-gray-500"
        }`}
      >
        {isLoading ? (
          <div className="flex items-center space-x-3">
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-white font-medium">{loadingText}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-lg font-semibold">Get AI Feedback</span>
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        )}
      </button>
    </div>
  );
};

export default InputPanel;
