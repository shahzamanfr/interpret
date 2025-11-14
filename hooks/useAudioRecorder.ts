import { useState, useRef, useCallback } from 'react';

interface UseAudioRecorderOptions {
  onDataAvailable?: (audioBlob: Blob) => void;
  onError?: (error: Error) => void;
  mimeType?: string;
  audioBitsPerSecond?: number;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  audioBlob: Blob | null;
  audioURL: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
  error: string | null;
}

const useAudioRecorder = (
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderReturn => {
  const {
    onDataAvailable,
    onError,
    mimeType = 'audio/webm',
    audioBitsPerSecond = 128000,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      console.log('🎤 Starting recording...');

      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const err = 'MediaDevices API not supported. Please use a modern browser.';
        console.error('❌', err);
        throw new Error(err);
      }
      console.log('✅ MediaDevices API supported');

      // Request microphone access
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      console.log('✅ Microphone access granted');
      mediaStreamRef.current = stream;

      // Determine best mime type
      let recordMimeType = mimeType;
      const supportedTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        recordMimeType =
          supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
          '';
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: recordMimeType,
        audioBitsPerSecond,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recordMimeType });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioURL(url);
        setIsRecording(false);
        setIsPaused(false);

        if (onDataAvailable) {
          onDataAvailable(blob);
        }

        // Cleanup stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      // Handle errors
      mediaRecorder.onerror = (event: Event) => {
        const errorEvent = event as ErrorEvent;
        const errorMessage = errorEvent.error?.message || 'Recording error';
        setError(errorMessage);
        setIsRecording(false);

        if (onError) {
          onError(new Error(errorMessage));
        }
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      console.log('✅ Recording started with mime type:', recordMimeType);
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      const error = err as Error;
      console.error('❌ Recording error:', error);

      let errorMessage = 'Failed to start recording';

      if (error.name === 'NotAllowedError') {
        errorMessage =
          'Microphone access denied. Please allow microphone permissions.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        errorMessage =
          'Microphone is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'No microphone meets the required constraints.';
      } else {
        errorMessage = error.message || errorMessage;
      }

      setError(errorMessage);
      setIsRecording(false);

      if (onError) {
        onError(new Error(errorMessage));
      }
    }
  }, [mimeType, audioBitsPerSecond, onDataAvailable, onError]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'paused'
    ) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const clearRecording = useCallback(() => {
    // Revoke URL to free memory
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }

    setAudioBlob(null);
    setAudioURL(null);
    setError(null);
    chunksRef.current = [];
  }, [audioURL]);

  return {
    isRecording,
    isPaused,
    audioBlob,
    audioURL,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    error,
  };
};

export default useAudioRecorder;
