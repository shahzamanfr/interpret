import { useState, useCallback } from 'react';
import { getApiUrl } from '../utils/config';

interface SpeechConfig {
  currentProvider: string;
  hasApiKey: boolean;
  isConfigured: boolean;
  providerInfo: {
    name: string;
    accuracy: string;
    setup: string;
  };
}

interface TranscriptionResult {
  success: boolean;
  text: string;
  confidence: number;
  provider: string;
}

export const useBackendSpeech = () => {
  const [config, setConfig] = useState<SpeechConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConfig = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl('/api/speech/config'));
      if (!response.ok) throw new Error('Failed to fetch config');

      const configData = await response.json();
      setConfig(configData);
      return configData;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<TranscriptionResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
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
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    config,
    isLoading,
    error,
    checkConfig,
    transcribeAudio
  };
};