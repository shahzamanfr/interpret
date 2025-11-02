import React from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useCustomSpeechRecognition } from "../hooks/useCustomSpeechRecognition";

interface CustomVoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const CustomVoiceRecorder: React.FC<CustomVoiceRecorderProps> = ({
  onTranscript,
  disabled,
}) => {
  const { theme } = useTheme();
  const [error, setError] = React.useState<string | null>(null);

  const { isRecording, audioLevel, status, startRecording, stopRecording } =
    useCustomSpeechRecognition({
      onTranscript: (text) => {
        console.log("📝 Received transcript:", text);
        onTranscript(text);
        setError(null);
      },
      onError: (errorMsg) => {
        console.error("❌ Error:", errorMsg);
        setError(errorMsg);
      },
    });

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      setError(null);
      startRecording();
    }
  };

  return (
    <div className="relative">
      {!isRecording ? (
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`p-2.5 rounded-full transition-all duration-300 ease-in-out hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
            theme === "dark"
              ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500"
              : "bg-gradient-to-br from-blue-400 to-blue-500 hover:from-blue-300 hover:to-blue-400"
          }`}
          aria-label="Start voice recording"
          title="Click to speak"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="p-2.5 rounded-full transition-all duration-300 ease-in-out animate-pulse shadow-md bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 hover:scale-105"
          aria-label="Stop recording"
          title="Click to stop"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="7" y="7" width="10" height="10" rx="2" />
          </svg>
        </button>
      )}

      {/* Status and Audio Level Indicator */}
      {status && !error && (
        <div
          className={`absolute top-full mt-2 right-0 px-3 py-2 rounded text-xs whitespace-nowrap z-50 shadow-lg ${
            theme === "dark"
              ? "bg-green-900/90 border border-green-500/30 text-green-200"
              : "bg-green-100 border border-green-400 text-green-700"
          }`}
        >
          <div className="font-semibold">{status}</div>
          {audioLevel > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px] opacity-70">Audio Level:</span>
              <div className="w-24 bg-black/20 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    audioLevel > 30
                      ? "bg-green-500"
                      : audioLevel > 10
                        ? "bg-yellow-500"
                        : "bg-gray-500"
                  }`}
                  style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono">{audioLevel}</span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-xs whitespace-nowrap z-50 shadow-lg max-w-xs">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}
    </div>
  );
};

export default CustomVoiceRecorder;
