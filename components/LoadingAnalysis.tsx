import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface LoadingAnalysisProps {
  title?: string;
}

const LoadingAnalysis: React.FC<LoadingAnalysisProps> = ({
  title = "Analyzing Your Performance"
}) => {
  const { theme } = useTheme();

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${
      theme === 'dark' ? 'bg-black/90' : 'bg-white/90'
    } backdrop-blur-md`}>
      <div className={`p-8 rounded-xl ${
        theme === 'dark' 
          ? 'bg-gray-900/95 border border-gray-700/50' 
          : 'bg-white/95 border border-gray-200/50'
      } shadow-2xl backdrop-blur-sm`}>
        
        <div className="flex flex-col items-center space-y-4">
          {/* Better Loading Icon */}
          <div className="relative">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 ${
              theme === 'dark' ? 'border-gray-700 border-t-white' : 'border-gray-200 border-t-black'
            }`}></div>
            <div className="absolute inset-0 rounded-full animate-ping border-2 border-blue-500/20"></div>
          </div>
          
          {/* Title */}
          <h3 className={`text-xl font-semibold text-center ${
            theme === 'dark' ? 'text-white' : 'text-black'
          }`}>
            {title}
          </h3>
        </div>
      </div>
    </div>
  );
};

export default LoadingAnalysis;