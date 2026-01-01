import React, { useState, useRef } from 'react';
import { getApiUrl } from "../utils/config";
import MicIcon from './icons/MicIcon';
import StopIcon from './icons/StopIcon';

interface BackendVoiceRecorderProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export const BackendVoiceRecorder: React.FC<BackendVoiceRecorderProps> = ({
  onTranscript,
  onError,
  className = ''
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
    } catch (error: any) {
      onError?.(`Failed to start recording: ${error.message}`);
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

      // Send to backend for transcription
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch(getApiUrl("/api/speech/transcribe"), {
        method: "POST",
        body: formData,
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
      onError?.(`Transcription failed: ${error.message}`);
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
    <button
      onClick={handleClick}
      disabled={isProcessing}
      className={`
        flex items-center justify-center w-12 h-12 rounded-full
        transition-all duration-200 transform hover:scale-105
        ${isRecording
          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
          : 'bg-blue-500 hover:bg-blue-600'
        }
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      title={
        isProcessing
          ? 'Processing...'
          : isRecording
            ? 'Stop Recording'
            : 'Start Recording'
      }
    >
      {isProcessing ? (
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : isRecording ? (
        <StopIcon className="w-6 h-6 text-white" />
      ) : (
        <MicIcon className="w-6 h-6 text-white" />
      )}
    </button>
  );
};