import React from "react";
import TrophyIcon from "./icons/TrophyIcon";
import { useTheme } from "../contexts/ThemeContext";

interface ChallengeBannerProps {
  scoreToBeat: number;
}

const ChallengeBanner: React.FC<ChallengeBannerProps> = ({ scoreToBeat }) => {
  const { theme } = useTheme();

  return (
    <div
      className={`border p-4 rounded-lg mb-4 flex items-center ${
        theme === "dark"
          ? "border-gray-800 bg-gray-900/50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <TrophyIcon className="w-6 h-6 mr-4 text-amber-400 flex-shrink-0" />
      <div>
        <p
          className={`font-bold ${
            theme === "dark" ? "text-white" : "text-black"
          }`}
        >
          Challenge Accepted!
        </p>
        <p
          className={`text-sm ${
            theme === "dark" ? "text-gray-400" : "text-gray-700"
          }`}
        >
          Your friend scored {scoreToBeat}. Can you beat them? Give it your best
          shot!
        </p>
      </div>
    </div>
  );
};

export default ChallengeBanner;
