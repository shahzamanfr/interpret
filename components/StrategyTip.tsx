import React from "react";
import LightbulbIcon from "./icons/LightbulbIcon";
import { useTheme } from "../contexts/ThemeContext";

interface StrategyTipProps {
  strategy: string;
  onDismiss: () => void;
}

const StrategyTip: React.FC<StrategyTipProps> = ({ strategy, onDismiss }) => {
  const { theme } = useTheme();

  return (
    <div
      className={`border p-4 rounded-lg my-4 flex items-start animate-fade-in ${
        theme === "dark"
          ? "border-gray-800 bg-gray-900/50"
          : "border-purple-200 bg-purple-50"
      }`}
    >
      <LightbulbIcon className="w-6 h-6 mr-4 text-purple-400 flex-shrink-0 mt-1" />
      <div className="flex-grow">
        <p
          className={`font-bold ${theme === "dark" ? "text-white" : "text-black"}`}
        >
          Your Strategy
        </p>
        <p
          className={`italic ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
        >
          "{strategy}"
        </p>
      </div>
      <button
        onClick={onDismiss}
        className={`ml-4 p-1 rounded-full ${
          theme === "dark"
            ? "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            : "text-gray-600 hover:bg-gray-200 hover:text-gray-800"
        }`}
        aria-label="Dismiss strategy"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
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
  );
};

// Add fade-in animation to tailwind config if possible, or use a style tag.
const style = document.createElement("style");
style.innerHTML = `
@keyframes fade-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
`;
document.head.appendChild(style);

export default StrategyTip;
