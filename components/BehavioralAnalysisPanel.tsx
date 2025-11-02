import React from "react";
import BrainIcon from "./icons/BrainIcon";
import TargetIcon from "./icons/TargetIcon";
import GrowthIcon from "./icons/GrowthIcon";
import { CommunicationBehavior } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface BehavioralAnalysisPanelProps {
  behavior?: CommunicationBehavior;
}

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  content: string;
  theme: "dark" | "light";
}> = ({ icon, label, content, theme }) => (
  <div
    className={`grid grid-cols-3 gap-4 border-t py-6 ${
      theme === "dark" ? "border-gray-800" : "border-gray-200"
    }`}
  >
    <div className="col-span-1">
      <div className="flex items-center">
        <div className="flex-shrink-0 w-5 h-5">{icon}</div>
        <h4
          className={`ml-2 text-sm font-medium ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {label}
        </h4>
      </div>
    </div>
    <p
      className={`col-span-2 ${
        theme === "dark" ? "text-gray-300" : "text-gray-800"
      }`}
    >
      {content}
    </p>
  </div>
);

const BehavioralAnalysisPanel: React.FC<BehavioralAnalysisPanelProps> = ({
  behavior,
}) => {
  const { theme } = useTheme();

  if (!behavior) {
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
          Communication Profile
        </h3>
        <p
          className={`mt-1 ${
            theme === "dark" ? "text-gray-500" : "text-gray-600"
          }`}
        >
          An analysis of your communication style.
        </p>
      </div>
      <div className="pb-6">
        <div
          className={`text-center ui-card p-4 rounded-xl ${
            theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              theme === "dark" ? "text-gray-400" : "text-gray-700"
            }`}
          >
            Your identified profile is:
          </p>
          <p
            className={`text-xl font-bold ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            {behavior.profile}
          </p>
        </div>
      </div>
      <div className="space-y-0">
        <InfoRow
          icon={
            <TargetIcon
              className={theme === "dark" ? "text-gray-500" : "text-gray-600"}
            />
          }
          label="Strength"
          content={behavior.strength}
          theme={theme}
        />
        <InfoRow
          icon={
            <GrowthIcon
              className={theme === "dark" ? "text-gray-500" : "text-gray-600"}
            />
          }
          label="Growth Area"
          content={behavior.growthArea}
          theme={theme}
        />
      </div>
    </div>
  );
};

export default BehavioralAnalysisPanel;
