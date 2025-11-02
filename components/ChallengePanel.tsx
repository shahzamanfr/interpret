import React, { useState } from "react";
import { useChallenge } from "../hooks/use-challenge";
import { useTheme } from "../contexts/ThemeContext";

interface ChallengePanelProps {
  challengeId: string | null;
  userId: string;
  userName: string;
  onScoreSubmit: (score: number, explanation: string) => void;
  userScore?: number;
  userExplanation?: string;
}

const ChallengePanel: React.FC<ChallengePanelProps> = ({
  challengeId,
  userId,
  userName,
  onScoreSubmit,
  userScore,
  userExplanation,
}) => {
  const { theme } = useTheme();
  const {
    challenge,
    participants,
    isConnected,
    isLoading,
    error,
    submitScore,
    getLeaderboard,
    hasUserSubmitted,
  } = useChallenge(challengeId, userId, userName);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitScore = async () => {
    if (!userScore || !userExplanation) return;

    setIsSubmitting(true);
    try {
      await submitScore(userScore, userExplanation);
      onScoreSubmit(userScore, userExplanation);
    } catch (err) {
      console.error("Error submitting score:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyChallengeLink = async () => {
    if (!challenge) return;

    const challengeUrl = `${window.location.origin}${window.location.pathname}?challenge=${challenge.challenge_id}`;
    try {
      await navigator.clipboard.writeText(challengeUrl);
      // You could add a toast notification here
      console.log("Challenge link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy challenge link:", err);
    }
  };

  const leaderboard = getLeaderboard();
  const userHasSubmitted = hasUserSubmitted();

  if (isLoading) {
    return (
      <div
        className={`rounded-lg border p-6 ${
          theme === "dark"
            ? "bg-gray-900 border-gray-800"
            : "bg-white border-gray-300"
        }`}
      >
        <div
          className={`text-center ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Loading challenge...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border p-6 ${
          theme === "dark"
            ? "bg-red-900/50 border-red-800"
            : "bg-red-50 border-red-300"
        }`}
      >
        <div
          className={`text-center ${
            theme === "dark" ? "text-red-400" : "text-red-700"
          }`}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!challenge) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border p-6 space-y-6 ${
        theme === "dark"
          ? "bg-gray-900 border-gray-800"
          : "bg-white border-gray-300"
      }`}
    >
      {/* Challenge Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3
            className={`text-lg font-semibold ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            Challenge Mode
          </h3>
          <div className="flex items-center space-x-2 mt-1">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
            />
            <span
              className={`text-sm ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>
        </div>
        <button
          onClick={copyChallengeLink}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center space-x-2"
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
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>Share</span>
        </button>
      </div>

      {/* Challenge Code */}
      <div className="text-center">
        <p
          className={`text-sm mb-2 ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Challenge Code
        </p>
        <p
          className={`text-2xl font-mono font-bold ${
            theme === "dark" ? "text-white" : "text-black"
          }`}
        >
          {challenge.challenge_id}
        </p>
      </div>

      {/* Participants Count */}
      <div className="text-center">
        <p
          className={`text-sm ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {participants.length} participant
          {participants.length !== 1 ? "s" : ""} joined
        </p>
      </div>

      {/* Submit Score Button */}
      {userScore && userExplanation && !userHasSubmitted && (
        <div className="text-center">
          <button
            onClick={handleSubmitScore}
            disabled={isSubmitting}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200"
          >
            {isSubmitting ? "Submitting..." : "Submit Score"}
          </button>
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div>
          <h4
            className={`text-md font-semibold mb-3 ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            Leaderboard
          </h4>
          <div className="space-y-2">
            {leaderboard.map((participant, index) => (
              <div
                key={participant.user_id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  participant.user_id === userId
                    ? theme === "dark"
                      ? "bg-blue-500/20 border border-blue-500/50"
                      : "bg-blue-100 border border-blue-300"
                    : theme === "dark"
                      ? "bg-gray-800"
                      : "bg-gray-100"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0
                        ? "bg-yellow-500 text-black"
                        : index === 1
                          ? "bg-gray-400 text-black"
                          : index === 2
                            ? "bg-orange-600 text-white"
                            : "bg-gray-600 text-white"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span
                    className={`font-medium ${
                      theme === "dark" ? "text-white" : "text-black"
                    }`}
                  >
                    {participant.user_name}
                    {participant.user_id === userId && " (You)"}
                  </span>
                </div>
                <div className="text-right">
                  <div
                    className={`text-lg font-bold ${
                      theme === "dark" ? "text-white" : "text-black"
                    }`}
                  >
                    {participant.score}
                  </div>
                  <div
                    className={`text-xs ${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    points
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waiting for submissions */}
      {leaderboard.length === 0 && participants.length > 0 && (
        <div
          className={`text-center ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          <p>Waiting for participants to submit their scores...</p>
        </div>
      )}
    </div>
  );
};

export default ChallengePanel;
