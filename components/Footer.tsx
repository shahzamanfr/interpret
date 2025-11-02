import React from "react";
import { useTheme } from "../contexts/ThemeContext";

const Footer: React.FC = () => {
  const { theme } = useTheme();

  return (
    <footer
      className={`relative border-t transition-colors duration-700 ${
        theme === "dark"
          ? "border-gray-800 bg-black"
          : "border-gray-200 bg-white"
      }`}
      style={{
        zIndex: 1,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <h3
              className={`text-xl font-semibold ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              AI Communication Coach
            </h3>
            <p
              className={`text-sm leading-relaxed ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Master the art of clear, compelling communication through
              AI-powered practice and personalized feedback.
            </p>
          </div>

          {/* Features Section */}
          <div className="space-y-4">
            <h4
              className={`font-medium ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              Features
            </h4>
            <ul
              className={`space-y-2 text-sm ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              <li>Image Description Practice</li>
              <li>AI-Powered Feedback</li>
              <li>Multiple Coaching Styles</li>
              <li>Debate & Discussion Training</li>
              <li>Progress Tracking</li>
            </ul>
          </div>

          {/* Contact Section */}
          <div className="space-y-4">
            <h4
              className={`font-medium ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              Contact
            </h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-lg ${
                    theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                    />
                  </svg>
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      theme === "dark" ? "text-white" : "text-black"
                    }`}
                  >
                    Mohammed Shahzaman
                  </p>
                  <a
                    href="mailto:mohammedzama9024@gmail.com"
                    className={`text-sm transition-colors duration-200 hover:underline ${
                      theme === "dark"
                        ? "text-blue-400 hover:text-blue-300"
                        : "text-blue-600 hover:text-blue-500"
                    }`}
                  >
                    mohammedzama9024@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div
          className={`mt-8 pt-8 border-t ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <div className="text-center space-y-3">
            <p
              className={`text-sm font-medium ${
                theme === "dark" ? "text-gray-300" : "text-gray-700"
              }`}
            >
              Website created by Mohammed Shahzaman
            </p>
            <p
              className={`text-sm ${
                theme === "dark" ? "text-gray-500" : "text-gray-500"
              }`}
            >
              © 2024 AI Communication Coach. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
