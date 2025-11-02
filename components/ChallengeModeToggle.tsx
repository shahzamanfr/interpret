import React, { useState } from "react";
import { useChallenge } from "../hooks/use-challenge";
import { useTheme } from "../contexts/ThemeContext";

interface ChallengeModeToggleProps {
  imageUrl: string;
  userId: string;
  userName: string;
  onChallengeCreated: (challengeId: string) => void;
  onChallengeJoined: (challengeId: string) => void;
}

const ChallengeModeToggle: React.FC<ChallengeModeToggleProps> = ({
  imageUrl,
  userId,
  userName,
  onChallengeCreated,
  onChallengeJoined,
}) => {
  const { theme } = useTheme();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [challengeCode, setChallengeCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createNewChallenge } = useChallenge(null, userId, userName);

  const handleCreateChallenge = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const challenge = await createNewChallenge(imageUrl);
      if (challenge) {
        onChallengeCreated(challenge.challenge_id);
      } else {
        setError(
          "Failed to create challenge. Please check your Supabase setup.",
        );
      }
    } catch (err) {
      console.error("Error creating challenge:", err);
      setError("Failed to create challenge. Please check your Supabase setup.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinChallenge = async () => {
    if (!challengeCode.trim()) {
      setError("Please enter a challenge code");
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      onChallengeJoined(challengeCode.trim().toUpperCase());
    } catch (err) {
      console.error("Error joining challenge:", err);
      setError("Failed to join challenge");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-6 ${
        theme === "dark"
          ? "bg-gray-900 border-gray-800"
          : "bg-white border-gray-300"
      }`}
    >
      <div className="text-center mb-6">
        <h3
          className={`text-lg font-semibold mb-2 ${
            theme === "dark" ? "text-white" : "text-black"
          }`}
        >
          Challenge Mode
        </h3>
        <p
          className={`text-sm ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Compete with friends in real-time!
        </p>
      </div>

      {!showJoinForm ? (
        <div className="space-y-4">
          <button
            onClick={handleCreateChallenge}
            disabled={isCreating}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-colors duration-200"
          >
            {isCreating ? "Creating Challenge..." : "Create Challenge"}
          </button>

          <div className="text-center">
            <span className="text-gray-400 text-sm">or</span>
          </div>

          <button
            onClick={() => setShowJoinForm(true)}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-lg font-medium transition-colors duration-200"
          >
            Join Challenge
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                theme === "dark" ? "text-gray-300" : "text-gray-700"
              }`}
            >
              Enter Challenge Code
            </label>
            <input
              type="text"
              value={challengeCode}
              onChange={(e) => setChallengeCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 ${
                theme === "dark"
                  ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                  : "bg-white border-gray-300 text-black placeholder-gray-500"
              }`}
              maxLength={6}
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleJoinChallenge}
              disabled={isJoining || !challengeCode.trim()}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium transition-colors duration-200"
            >
              {isJoining ? "Joining..." : "Join"}
            </button>

            <button
              onClick={() => {
                setShowJoinForm(false);
                setChallengeCode("");
                setError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors duration-200 ${
                theme === "dark"
                  ? "bg-gray-600 hover:bg-gray-700 text-white"
                  : "bg-gray-300 hover:bg-gray-400 text-black"
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className={`mt-4 p-3 border rounded-lg ${
            theme === "dark"
              ? "bg-red-900/50 border-red-800"
              : "bg-red-50 border-red-300"
          }`}
        >
          <p
            className={`text-sm ${
              theme === "dark" ? "text-red-400" : "text-red-700"
            }`}
          >
            {error}
          </p>
        </div>
      )}
    </div>
  );
};

export default ChallengeModeToggle;
