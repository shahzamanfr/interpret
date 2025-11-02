import React from "react";
import { CategoryScores } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface CategoryScoresPanelProps {
  scores?: CategoryScores;
}

const CategoryScoresPanel: React.FC<CategoryScoresPanelProps> = ({
  scores,
}) => {
  const { theme } = useTheme();

  if (!scores) {
    return null;
  }

  const categoryNames: { [key: string]: string } = {
    clarity: "Clarity",
    detail: "Detail Level",
    accuracy: "Accuracy",
    structure: "Structure",
    vocabulary: "Vocabulary",
    completeness: "Completeness",
  };

  const getScoreColor = (score: number) => {
    if (theme === "dark") {
      if (score <= 5) return "text-red-400";
      if (score <= 10) return "text-orange-400";
      if (score <= 15) return "text-yellow-400";
      return "text-green-400";
    } else {
      if (score <= 5) return "text-red-600";
      if (score <= 10) return "text-orange-600";
      if (score <= 15) return "text-yellow-600";
      return "text-green-600";
    }
  };

  const getScoreBgColor = (score: number) => {
    if (theme === "dark") {
      if (score <= 5) return "bg-red-400";
      if (score <= 10) return "bg-orange-400";
      if (score <= 15) return "bg-yellow-400";
      return "bg-green-400";
    } else {
      if (score <= 5) return "bg-red-500";
      if (score <= 10) return "bg-orange-500";
      if (score <= 15) return "bg-yellow-500";
      return "bg-green-500";
    }
  };

  return (
    <div
      className={`border-t pt-8 ${
        theme === "dark" ? "border-gray-800" : "border-gray-200"
      }`}
    >
      <div className="mb-6">
        <h3
          className={`text-3xl font-bold tracking-tighter ${
            theme === "dark" ? "text-white" : "text-black"
          }`}
        >
          Detailed Analysis
        </h3>
        <p
          className={`mt-1 ${
            theme === "dark" ? "text-gray-500" : "text-gray-600"
          }`}
        >
          Breakdown of your performance across key communication skills.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(scores).map(([category, score]) => {
          const percentage = (Number(score) / 20) * 100;

          return (
            <div
              key={category}
              className={`ui-card p-4 rounded-xl ${
                theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"
              }`}
            >
              <div className="text-center">
                <div
                  className={`text-3xl font-bold ${getScoreColor(Number(score))}`}
                >
                  {score}
                </div>
                <div
                  className={`text-sm ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  /20
                </div>
                <div
                  className={`text-sm font-medium mt-2 ${
                    theme === "dark" ? "text-white" : "text-black"
                  }`}
                >
                  {categoryNames[category] || category}
                </div>
                <div
                  className={`w-full rounded-full h-2 mt-3 ${
                    theme === "dark" ? "bg-gray-700" : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`h-2 rounded-full transition-all duration-1000 ${getScoreBgColor(Number(score))}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryScoresPanel;
