import React from "react";
import { ExampleRewrite } from "../types";
import MagicIcon from "./icons/MagicIcon";
import { useTheme } from "../contexts/ThemeContext";

interface RewritePanelProps {
  rewrite?: ExampleRewrite;
}

const RewritePanel: React.FC<RewritePanelProps> = ({ rewrite }) => {
  const { theme } = useTheme();

  if (!rewrite) {
    return null;
  }

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
          Impact Rewrite
        </h3>
        <p
          className={`mt-1 ${
            theme === "dark" ? "text-gray-500" : "text-gray-600"
          }`}
        >
          A suggestion to make your language more powerful.
        </p>
      </div>
      <div className="space-y-6">
        <div>
          <p
            className={`text-sm font-medium ${
              theme === "dark" ? "text-gray-400" : "text-gray-700"
            }`}
          >
            Your Original Sentence:
          </p>
          <blockquote
            className={`mt-2 p-4 border-l-2 italic ${
              theme === "dark"
                ? "bg-gray-900 border-gray-700 text-gray-400"
                : "bg-gray-100 border-gray-400 text-gray-800"
            }`}
          >
            "{rewrite.original}"
          </blockquote>
        </div>
        <div>
          <p
            className={`text-sm font-medium ${
              theme === "dark" ? "text-gray-400" : "text-gray-700"
            }`}
          >
            Impactful Rewrite:
          </p>
          <blockquote
            className={`mt-2 p-4 border-l-2 font-medium ${
              theme === "dark"
                ? "bg-gray-900 border-gray-300 text-white"
                : "bg-green-50 border-green-400 text-black"
            }`}
          >
            "{rewrite.improved}"
          </blockquote>
        </div>
        <div>
          <p
            className={`text-sm font-medium ${
              theme === "dark" ? "text-gray-400" : "text-gray-700"
            }`}
          >
            The 'Why':
          </p>
          <p
            className={`mt-2 ${
              theme === "dark" ? "text-gray-300" : "text-gray-800"
            }`}
          >
            {rewrite.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RewritePanel;
