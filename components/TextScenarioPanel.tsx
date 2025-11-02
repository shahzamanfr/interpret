import React, { useState } from 'react';
import { TextScenario } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface TextScenarioPanelProps {
  selectedScenario: TextScenario | null;
  onScenarioSelect: (scenario: TextScenario) => void;
  userText: string;
  onUserTextChange: (text: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const textScenarios: TextScenario[] = [
  {
    id: 'abstract-concept',
    title: 'Abstract Concept',
    description: 'Explain a complex idea or theory',
    prompt: 'Explain the concept of "artificial intelligence" to someone who has never heard of it before.',
    category: 'Educational'
  },
  {
    id: 'story-narrative',
    title: 'Story Narrative',
    description: 'Tell a compelling story',
    prompt: 'Write a short story about a person who discovers they have a unique ability.',
    category: 'Creative'
  },
  {
    id: 'persuasive-argument',
    title: 'Persuasive Argument',
    description: 'Make a convincing case',
    prompt: 'Argue why remote work is better than office work for most companies.',
    category: 'Debate'
  },
  {
    id: 'problem-solving',
    title: 'Problem Solving',
    description: 'Describe a solution approach',
    prompt: 'Explain how you would solve the problem of traffic congestion in a major city.',
    category: 'Analytical'
  },
  {
    id: 'personal-reflection',
    title: 'Personal Reflection',
    description: 'Share insights and experiences',
    prompt: 'Describe a moment that changed your perspective on life.',
    category: 'Personal'
  },
  {
    id: 'technical-explanation',
    title: 'Technical Explanation',
    description: 'Break down complex topics',
    prompt: 'Explain how a computer processes information to someone with no technical background.',
    category: 'Technical'
  }
];

const TextScenarioPanel: React.FC<TextScenarioPanelProps> = ({
  selectedScenario,
  onScenarioSelect,
  userText,
  onUserTextChange,
  onSubmit,
  isLoading
}) => {
  const { theme } = useTheme();
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleCustomSubmit = () => {
    if (customPrompt.trim()) {
      const customScenario: TextScenario = {
        id: 'custom',
        title: 'Custom Prompt',
        description: 'Your own scenario',
        prompt: customPrompt,
        category: 'Custom'
      };
      onScenarioSelect(customScenario);
      setShowCustomPrompt(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scenario Selection */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tighter mb-6">Choose Your Scenario</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {textScenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onScenarioSelect(scenario)}
              disabled={isLoading}
              className={`p-4 rounded-lg border text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                ${selectedScenario?.id === scenario.id
                  ? theme === 'dark'
                    ? 'border-gray-600 bg-gray-800/50'
                    : 'border-blue-500 bg-blue-50'
                  : theme === 'dark'
                    ? 'border-gray-800 bg-gray-900/30 hover:bg-gray-800/40 hover:border-gray-700'
                    : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'
                }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className={`font-semibold ${
                  theme === 'dark' ? 'text-white' : 'text-black'
                }`}>{scenario.title}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  theme === 'dark'
                    ? 'text-gray-400 bg-gray-800'
                    : 'text-gray-900 bg-gray-200'
                }`}>
                  {scenario.category}
                </span>
              </div>
              <p className={`text-sm mb-3 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-900'
              }`}>{scenario.description}</p>
              <p className={`text-sm italic ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-900'
              }`}>"{scenario.prompt}"</p>
            </button>
          ))}
          
          {/* Custom Prompt Option */}
          <button
            onClick={() => setShowCustomPrompt(true)}
            disabled={isLoading}
            className={`p-4 rounded-lg border text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
              theme === 'dark'
                ? 'border-gray-800 bg-gray-900/30 hover:bg-gray-800/40 hover:border-gray-700'
                : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className={`font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-black'
              }`}>Custom Prompt</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${
                theme === 'dark'
                  ? 'text-gray-400 bg-gray-800'
                  : 'text-gray-600 bg-gray-200'
              }`}>
                Custom
              </span>
            </div>
            <p className={`text-sm mb-3 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-900'
            }`}>Create your own scenario</p>
            <p className={`text-sm italic ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-900'
            }`}>"Write your own prompt here..."</p>
          </button>
        </div>
      </div>

      {/* Custom Prompt Modal */}
      {showCustomPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`border rounded-lg p-6 w-full max-w-2xl ${
            theme === 'dark' 
              ? 'bg-gray-900 border-gray-800' 
              : 'bg-white border-gray-200'
          }`}>
            <h3 className={`text-xl font-semibold mb-4 ${
              theme === 'dark' ? 'text-white' : 'text-black'
            }`}>Create Custom Prompt</h3>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Enter your custom prompt or scenario here..."
              className={`w-full h-32 p-4 border rounded-lg focus:ring-1 focus:ring-gray-600 focus:border-gray-600 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-gray-300 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-black placeholder-gray-400'
              }`}
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setShowCustomPrompt(false)}
                className={`px-4 py-2 transition-colors ${
                  theme === 'dark'
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-900 hover:text-black'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCustomSubmit}
                disabled={!customPrompt.trim()}
                className={`px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-800 text-white hover:bg-gray-700'
                    : 'bg-black text-white hover:bg-gray-900'
                }`}
              >
                Use Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Scenario Display */}
      {selectedScenario && (
        <div className={`rounded-lg p-6 border ${
          theme === 'dark'
            ? 'bg-gray-900/50 border-gray-800'
            : 'bg-gray-50 border-gray-300'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className={`text-xl font-semibold ${
                theme === 'dark' ? 'text-white' : 'text-black'
              }`}>{selectedScenario.title}</h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-900'
              }`}>{selectedScenario.description}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${
              theme === 'dark'
                ? 'text-gray-400 bg-gray-800'
                : 'text-gray-600 bg-gray-200'
            }`}>
              {selectedScenario.category}
            </span>
          </div>
          <div className={`rounded-lg p-4 mb-6 ${
            theme === 'dark' ? 'bg-gray-800/50' : 'bg-white border border-gray-300'
          }`}>
            <p className={`italic ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-900'
            }`}>"{selectedScenario.prompt}"</p>
          </div>
          
          {/* Text Input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-900'
            }`}>
              Your Response
            </label>
            <textarea
              value={userText}
              onChange={(e) => onUserTextChange(e.target.value)}
              placeholder="Write your response here..."
              disabled={isLoading}
              className={`w-full h-40 p-4 border rounded-lg disabled:opacity-50 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-gray-300 placeholder-gray-500 focus:ring-1 focus:ring-gray-600 focus:border-gray-600'
                  : 'bg-white border-gray-300 text-black placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
          </div>
          
          {/* Submit Button */}
          <button
            onClick={onSubmit}
            disabled={isLoading || !userText.trim()}
            className={`mt-6 w-full h-12 flex items-center justify-center px-6 font-semibold rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
              theme === 'dark'
                ? 'bg-gray-800 text-white hover:bg-gray-700 focus:ring-gray-600 disabled:bg-gray-600 disabled:text-gray-400'
                : 'bg-black text-white hover:bg-gray-900 focus:ring-blue-500 disabled:bg-gray-400 disabled:text-white'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-900'}>Analyzing your response...</span>
                <div className="loading-dots flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    theme === 'dark' ? 'bg-gray-400' : 'bg-gray-500'
                  }`}></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span>Get Feedback</span>
                <div className="flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                </div>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TextScenarioPanel;
