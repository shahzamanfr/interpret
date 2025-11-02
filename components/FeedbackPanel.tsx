import React from "react";
import { Feedback, LoadingState } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface FeedbackPanelProps {
  feedback: Feedback | null;
  loadingState: LoadingState;
  imageUrl: string;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  feedback,
  loadingState,
  imageUrl,
}) => {
  const { theme } = useTheme();
  if (
    loadingState === LoadingState.GeneratingCaption ||
    loadingState === LoadingState.GeneratingFeedback
  ) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <div className="relative">
          <div
            className={`w-16 h-16 border-4 rounded-full animate-spin ${
              theme === "dark"
                ? "border-gray-800 border-t-white"
                : "border-gray-300 border-t-black"
            }`}
          ></div>
          <div
            className={`absolute inset-0 w-16 h-16 border-4 border-transparent rounded-full animate-spin ${
              theme === "dark" ? "border-t-gray-400" : "border-t-gray-500"
            }`}
            style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
          ></div>
        </div>
        <div className="mt-6 text-center">
          <p
            className={`font-medium text-lg mb-2 ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            {loadingState === LoadingState.GeneratingCaption
              ? "Analyzing your image..."
              : "Your coach is thinking..."}
          </p>
          <div className="flex items-center justify-center space-x-1">
            <div
              className={`w-2 h-2 rounded-full animate-bounce ${
                theme === "dark" ? "bg-gray-400" : "bg-gray-500"
              }`}
              style={{ animationDelay: "0ms" }}
            ></div>
            <div
              className={`w-2 h-2 rounded-full animate-bounce ${
                theme === "dark" ? "bg-gray-400" : "bg-gray-500"
              }`}
              style={{ animationDelay: "150ms" }}
            ></div>
            <div
              className={`w-2 h-2 rounded-full animate-bounce ${
                theme === "dark" ? "bg-gray-400" : "bg-gray-500"
              }`}
              style={{ animationDelay: "300ms" }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full text-center min-h-[300px] border-2 border-dashed rounded-lg ${
          theme === "dark" ? "border-gray-800" : "border-gray-300"
        }`}
      >
        <p
          className={`font-medium max-w-xs ${
            theme === "dark" ? "text-gray-400" : "text-gray-900"
          }`}
        >
          Your feedback will appear here once you submit an explanation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Score */}
      <div
        className={`flex justify-between items-start border-b pb-6 ${
          theme === "dark" ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <div>
          <h3
            className={`text-3xl font-bold tracking-tighter ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            Your Feedback
          </h3>
          <p className={theme === "dark" ? "text-gray-500" : "text-gray-600"}>
            An analysis of your explanation.
          </p>
        </div>
        <div
          className={`text-5xl font-bold tracking-tighter ${
            theme === "dark" ? "text-white" : "text-black"
          }`}
        >
          {feedback.score || feedback.overall_score}
          <span
            className={`text-3xl ${
              theme === "dark" ? "text-gray-600" : "text-gray-600"
            }`}
          >
            /100
          </span>
        </div>
      </div>

      {/* What You Did Well */}
      {feedback.whatYouDidWell && (
        <div
          className={`border-t py-6 ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <h4
            className={`text-sm font-medium mb-2 ${
              theme === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            What You Did Well
          </h4>
          <p className={theme === "dark" ? "text-gray-300" : "text-gray-800"}>
            {feedback.whatYouDidWell}
          </p>
        </div>
      )}

      {/* Areas for Improvement */}
      {feedback.areasForImprovement && (
        <div
          className={`border-t py-6 ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <h4
            className={`text-sm font-medium mb-2 ${
              theme === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Areas for Improvement
          </h4>
          <p className={theme === "dark" ? "text-gray-300" : "text-gray-800"}>
            {feedback.areasForImprovement}
          </p>
        </div>
      )}

      {/* Personalized Tip */}
      {feedback.personalizedTip && (
        <div
          className={`border-t py-6 ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <h4
            className={`text-sm font-medium mb-2 ${
              theme === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Personalized Tip
          </h4>
          <p className={theme === "dark" ? "text-gray-300" : "text-gray-800"}>
            {feedback.personalizedTip}
          </p>
        </div>
      )}
    </div>
  );
};

export default FeedbackPanel;
