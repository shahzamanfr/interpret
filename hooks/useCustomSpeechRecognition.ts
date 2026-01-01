import { useState, useRef, useCallback } from 'react';
import { getApiUrl } from '../utils/config';

interface CustomSpeechRecognitionOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

export const useCustomSpeechRecognition = ({ onTranscript, onError }: CustomSpeechRecognitionOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const monitorAudioLevel = useCallback((stream: MediaStream) => {
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.warn('AudioContext not supported');
        return;
      }

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkLevel = () => {
        if (!analyserRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.round(average));

        animationFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    } catch (err) {
      console.error('Audio monitoring error:', err);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting...');
      setStatus('Requesting mic...');

      // Request microphone with optimal settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;

      console.log('✅ Mic granted');
      setStatus('🎙️ Recording... (speak now)');
      setIsRecording(true);
      startTimeRef.current = Date.now();

      monitorAudioLevel(stream);

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }
      console.log('✅ MIME:', mimeType);

      if (!mimeType) {
        throw new Error('No supported audio format');
      }

      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log('Chunk:', e.data.size, 'bytes');
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const duration = (Date.now() - startTimeRef.current) / 1000;
        console.log('📤 Recording duration:', duration, 'seconds');

        if (duration < 2) {
          console.warn('⚠️ Too short:', duration, 's');
          setStatus('⚠️ Record for 3+ seconds');
          onError?.('Hold button and speak for at least 3 seconds');
          setTimeout(() => setStatus(''), 3000);
          return;
        }

        setStatus('Transcribing...');
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log('📤 Audio:', blob.size, 'bytes,', duration, 's, chunks:', audioChunksRef.current.length);

        if (blob.size < 1000) {
          console.warn('⚠️ Empty audio');
          setStatus('⚠️ No audio');
          onError?.('Mic not working');
          setTimeout(() => setStatus(''), 3000);
          return;
        }

        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        try {
          console.log('🚀 Sending...');
          const res = await fetch(getApiUrl('/api/speech/transcribe'), {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          console.log('📥', res.status, ':', data);

          if (!res.ok) {
            console.error('❌', data.message);
            setStatus('❌ Error');
            onError?.(data.message || 'Backend error');
            return;
          }

          if (data.text && data.text.trim()) {
            console.log('✅', data.text);
            onTranscript(data.text);
            setStatus('✅ Done!');
          } else {
            console.warn('⚠️ Empty');
            setStatus('⚠️ No speech');
            onError?.('Speak clearly into mic');
          }
        } catch (err: any) {
          console.error('❌ Error:', err);
          onError?.('Transcription failed: ' + err.message);
          setStatus('❌ Failed');
        }

        setTimeout(() => setStatus(''), 2000);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

    } catch (err: any) {
      console.error('❌ Mic error:', err);
      setStatus('');
      setIsRecording(false);

      let errorMsg = 'Microphone access denied';
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Please allow microphone access';
      } else if (err.name === 'NotFoundError') {
        errorMsg = 'No microphone found';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Microphone is in use';
      }

      onError?.(errorMsg);
    }
  }, [monitorAudioLevel, onTranscript, onError]);

  const stopRecording = useCallback(() => {
    console.log('🛑 Stopping...');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  return {
    isRecording,
    audioLevel,
    status,
    startRecording,
    stopRecording,
  };
};
