import React from "react";
import { CoachMode } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface ControlsPanelProps {
  selectedMode: CoachMode;
  onModeChange: (mode: CoachMode) => void;
  isDisabled: boolean;
}

const modes = [
  { id: CoachMode.Teacher, label: "Teacher" },
  { id: CoachMode.Debater, label: "Debater" },
  { id: CoachMode.Storyteller, label: "Storyteller" },
];

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  selectedMode,
  onModeChange,
  isDisabled,
}) => {
  const { theme } = useTheme();

  return (
    <div
      className={`border-t pt-8 ${
        theme === "dark" ? "border-gray-800" : "border-gray-200"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start space-x-2.5">
          <svg
            className={`w-5 h-5 mt-0.5 flex-shrink-0 opacity-40 ${
              theme === "dark" ? "text-gray-400" : "text-gray-500"
            }`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
          <div className="flex-1">
            <p
              className={`text-sm md:text-base font-medium leading-relaxed italic ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              "The art of communication is the language of leadership. Express yourself with clarity, and the world will listen."
            </p>
            <p
              className={`text-xs mt-2 ${
                theme === "dark" ? "text-gray-500" : "text-gray-500"
              }`}
            >
              — James Humes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlsPanel;
