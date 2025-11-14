import React from "react";
import { useTheme } from "../contexts/ThemeContext";

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="w-full px-4 lg:px-8 mx-auto max-w-7xl">
      <div
        className={`flex items-center justify-between py-5 border-b sticky top-0 z-30 backdrop-blur-md transition-colors duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          theme === "dark"
            ? "border-gray-800 bg-black/70"
            : "border-gray-200 bg-white/70"
        }`}
      >
        <div className="flex items-center space-x-3">
          <svg
            className={`w-6 h-6 ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          <h1
            className={`text-xl font-bold tracking-wide ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
            style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
          >
            Open Voice
          </h1>
        </div>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`rounded-full border px-3 py-2 text-xs sm:text-sm font-semibold hover:opacity-90 transition-colors duration-200 ${
            theme === "dark"
              ? "border-gray-600 bg-black text-white"
              : "border-gray-300 bg-white text-black"
          }`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
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
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
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
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
