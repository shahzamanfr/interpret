import React from "react";
import { useTheme } from "../contexts/ThemeContext";

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="w-full px-4 lg:px-8 mx-auto max-w-7xl">
      <div
        className={`flex items-center justify-between pt-6 pb-2 border-b sticky top-0 z-30 backdrop-blur-md transition-colors duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${theme === "dark"
          ? "border-gray-800 bg-black/70"
          : "border-gray-200 bg-white/70"
          }`}
      >
        <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1.5 sm:gap-4 lg:gap-6">
          <img
            src="/logo.png"
            alt="Interpret Logo"
            className={`h-16 sm:h-20 w-auto object-contain transition-all duration-500 hover:scale-105 ${theme === "dark"
              ? "invert hue-rotate-180 brightness-[1.1] shadow-[0_0_20px_rgba(255,255,255,0.05)]"
              : "shadow-sm border border-gray-100"
              }`}
          />
          <div
            className={`hidden sm:block h-8 w-[1px] ${theme === "dark" ? "bg-gray-800" : "bg-gray-200"}`}
          />
          <p
            className={`text-xs lg:text-sm font-normal ${theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
          >
            an AI system for understanding human communication.
          </p>
        </div>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`rounded-full border px-3 py-2 text-xs sm:text-sm font-semibold hover:opacity-90 transition-colors duration-200 ${theme === "dark"
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
