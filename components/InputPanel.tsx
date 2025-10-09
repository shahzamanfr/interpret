import React from 'react';
import { LoadingState } from '../types';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import MicIcon from './icons/MicIcon';
import StopIcon from './icons/StopIcon';
import ChallengeBanner from './ChallengeBanner';
import LightbulbIcon from './icons/LightbulbIcon';
import StrategyTip from './StrategyTip';

interface InputPanelProps {
  explanation: string;
  onExplanationChange: (value: string) => void;
  onSubmit: () => void;
  loadingState: LoadingState;
  challengeInfo: { scoreToBeat: number } | null;
  onGetStrategy: () => void;
  isFetchingStrategy: boolean;
  strategy: string | null;
  onDismissStrategy: () => void;
}

const InputPanel: React.FC<InputPanelProps> = ({ 
  explanation, 
  onExplanationChange, 
  onSubmit, 
  loadingState, 
  challengeInfo,
  onGetStrategy,
  isFetchingStrategy,
  strategy,
  onDismissStrategy
}) => {
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition({
    onResult: (result) => onExplanationChange(explanation + (explanation ? ' ' : '') + result),
  });

  const isLoading = loadingState === LoadingState.GeneratingCaption || loadingState === LoadingState.GeneratingFeedback;
  const loadingText = loadingState === LoadingState.GeneratingCaption ? 'Analyzing image...' : 'Generating feedback...';
  
  return (
    <div className="border-t border-gray-800 pt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white tracking-tighter">Your Explanation</h2>
        <button
          onClick={onGetStrategy}
          disabled={isFetchingStrategy || isLoading || !!strategy}
          className="flex items-center px-4 py-2 text-sm text-gray-300 font-medium border border-gray-700 rounded-full hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isFetchingStrategy ? (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <LightbulbIcon className="w-4 h-4 mr-2" />
          )}
          Get Strategy
        </button>
      </div>

      {challengeInfo && <ChallengeBanner scoreToBeat={challengeInfo.scoreToBeat} />}
      {strategy && <StrategyTip strategy={strategy} onDismiss={onDismissStrategy} />}

      <div className="relative mt-4">
        <textarea
          value={explanation}
          onChange={(e) => onExplanationChange(e.target.value)}
          placeholder="Describe the image here, or use the microphone..."
          disabled={isLoading || isListening}
          className="w-full h-40 p-4 bg-gray-900 border border-gray-800 rounded-lg focus:ring-1 focus:ring-gray-600 focus:border-gray-600 transition-colors disabled:opacity-50 text-gray-300 placeholder-gray-600"
        />
        <div className="absolute top-3 right-3 flex space-x-2">
           {!isListening ? (
             <button 
               onClick={startListening} 
               disabled={isLoading}
               className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors" 
               aria-label="Start recording"
             >
               <MicIcon className="w-5 h-5 text-gray-400" />
             </button>
           ) : (
             <button 
               onClick={stopListening} 
               className="p-2 bg-red-900/50 rounded-full hover:bg-red-900/80 transition-colors animate-pulse" 
               aria-label="Stop recording"
             >
               <StopIcon className="w-5 h-5 text-red-400" />
             </button>
           )}
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={isLoading || !explanation}
        className="mt-6 w-full h-12 flex items-center justify-center px-6 bg-gray-800 text-white font-semibold rounded-full shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-opacity-75 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">{loadingText}</span>
            <div className="loading-dots flex items-center space-x-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
            </div>
          </div>
        ) : (
           <div className="flex items-center justify-between w-full">
            <span>Get Feedback</span>
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
            </div>
          </div>
        )}
      </button>
    </div>
  );
};

export default InputPanel;