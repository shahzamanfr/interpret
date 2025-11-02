import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ScoreHistory } from "../types";
import { useTheme } from "../contexts/ThemeContext";

interface ProgressPanelProps {
  history: ScoreHistory[];
}

const ProgressPanel: React.FC<ProgressPanelProps> = ({ history }) => {
  const { theme } = useTheme();

  const chartData = history.map((item, index) => ({
    name: `Session ${index + 1}`,
    score: item.score,
    mode: item.mode,
  }));

  const averageScore =
    history.length > 0
      ? (
          history.reduce((sum, item) => sum + item.score, 0) / history.length
        ).toFixed(1)
      : "N/A";
  const lastScore =
    history.length > 0 ? history[history.length - 1].score : "N/A";

  return (
    <div
      className={`border-t pt-8 ${
        theme === "dark" ? "border-gray-800" : "border-gray-200"
      }`}
    >
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2
            className={`text-3xl font-bold tracking-tighter ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            Your Progress
          </h2>
          <p
            className={`mt-1 ${
              theme === "dark" ? "text-gray-500" : "text-gray-600"
            }`}
          >
            Analysis of your last 10 sessions.
          </p>
        </div>
        <div className="flex space-x-8 text-right">
          <div>
            <div
              className={`text-2xl font-bold ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              {lastScore}
            </div>
            <div
              className={`text-sm ${
                theme === "dark" ? "text-gray-500" : "text-gray-600"
              }`}
            >
              Last Score
            </div>
          </div>
          <div>
            <div
              className={`text-2xl font-bold ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              {averageScore}
            </div>
            <div
              className={`text-sm ${
                theme === "dark" ? "text-gray-500" : "text-gray-600"
              }`}
            >
              Average
            </div>
          </div>
        </div>
      </div>
      {history.length > 1 ? (
        <div className="w-full h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme === "dark" ? "#2d3748" : "#e2e8f0"}
              />
              <XAxis
                dataKey="name"
                tick={{
                  fill: theme === "dark" ? "#718096" : "#4a5568",
                  fontSize: 12,
                }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{
                  fill: theme === "dark" ? "#718096" : "#4a5568",
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === "dark" ? "#1a202c" : "#ffffff",
                  border: `1px solid ${theme === "dark" ? "#2d3748" : "#e2e8f0"}`,
                  borderRadius: "0.5rem",
                  color: theme === "dark" ? "#cbd5e0" : "#2d3748",
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke={theme === "dark" ? "#ffffff" : "#000000"}
                strokeWidth={2}
                dot={{ fill: theme === "dark" ? "#ffffff" : "#000000", r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className={`text-center py-10 border-2 border-dashed rounded-lg ${
            theme === "dark"
              ? "text-gray-600 border-gray-800"
              : "text-gray-500 border-gray-300"
          }`}
        >
          <p>Complete a few more sessions to see your progress chart!</p>
        </div>
      )}
    </div>
  );
};

export default ProgressPanel;
