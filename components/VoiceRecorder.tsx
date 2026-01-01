import React, { useState, useRef } from "react";
import { getApiUrl } from '../utils/config';
import { useTheme } from "../contexts/ThemeContext";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscript,
  disabled,
}) => {
  const { theme } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await processRecording();
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (error: any) {
      setError(`Failed to start recording: ${error.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processRecording = async () => {
    try {
      if (chunksRef.current.length === 0) {
        throw new Error('No audio data recorded');
      }

      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch(getApiUrl('/api/speech/transcribe'), {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Transcription failed');
      }

      const result = await response.json();

      if (result.success && result.text) {
        onTranscript(result.text);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error: any) {
      setError(`Transcription failed: ${error.message}`);
    } finally {
      cleanup();
      setIsProcessing(false);
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (!isProcessing) {
      startRecording();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className={`p-2.5 rounded-full transition-all duration-300 ease-in-out hover:scale-105 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${isRecording
            ? "bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 animate-pulse"
            : theme === "dark"
              ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500"
              : "bg-gradient-to-br from-blue-400 to-blue-500 hover:from-blue-300 hover:to-blue-400"
          }`}
        aria-label={isProcessing ? "Processing..." : isRecording ? "Stop recording" : "Start voice recording"}
        title={isProcessing ? "Processing..." : isRecording ? "Click to stop" : "Click to speak"}
      >
        {isProcessing ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : isRecording ? (
          <svg
            className="w-5 h-5 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="7" y="7" width="10" height="10" rx="2" />
          </svg>
        ) : (
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
        )}
      </button>

      {(isRecording || isProcessing) && (
        <div className={`absolute top-full mt-2 right-0 px-3 py-2 rounded text-xs whitespace-nowrap z-50 ${theme === "dark"
            ? "bg-blue-900/90 border border-blue-500/30 text-blue-200"
            : "bg-blue-100 border border-blue-400 text-blue-700"
          }`}>
          {isProcessing ? "Processing with AssemblyAI..." : "Recording..."}
        </div>
      )}
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-xs whitespace-nowrap z-50">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
