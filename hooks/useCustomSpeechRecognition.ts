import { useState, useRef, useCallback } from 'react';

interface CustomSpeechRecognitionOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
}

export const useCustomSpeechRecognition = ({ onTranscript, onError }: CustomSpeechRecognitionOptions) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const webSpeechRecognitionRef = useRef<any>(null);
  const interimTranscriptRef = useRef<string>('');
  const finalTranscriptRef = useRef<string>(''); // Accumulate final results

  // Monitor audio level
  const monitorAudioLevel = useCallback((stream: MediaStream) => {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
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
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting custom audio recording...');
      setStatus('Requesting microphone access...');
      
      // Reset transcript refs for new recording session
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      
      // Request microphone with high quality settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Good for speech recognition
        }
      });
      
      console.log('✅ Microphone access granted');
      setStatus('Recording... Speak now!');
      
      // Start audio level monitoring
      monitorAudioLevel(stream);
      
      // Start Web Speech API for real-time interim results
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          // Loop through ALL results to accumulate final text
          for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Update the accumulated final transcript
          if (finalTranscript) {
            finalTranscriptRef.current += finalTranscript;
          }
          
          // Combine accumulated final + current interim
          const fullTranscript = (finalTranscriptRef.current + interimTranscript).trim();
          
          if (fullTranscript) {
            interimTranscriptRef.current = fullTranscript;
            console.log('⚡ Full transcript:', fullTranscript);
            onTranscript(fullTranscript);
          }
        };
        
        recognition.onerror = (event: any) => {
          console.warn('⚠️ Web Speech error (non-critical):', event.error);
        };
        
        try {
          recognition.start();
          webSpeechRecognitionRef.current = recognition;
          console.log('✅ Real-time transcription started');
        } catch (e) {
          console.warn('⚠️ Web Speech unavailable, will use API only');
        }
      }
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('📦 Audio chunk received:', event.data.size, 'bytes');
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log('🛑 Recording stopped');
        
        // Stop Web Speech API
        if (webSpeechRecognitionRef.current) {
          try {
            webSpeechRecognitionRef.current.stop();
            webSpeechRecognitionRef.current = null;
          } catch (e) {
            console.log('Web speech already stopped');
          }
        }
        
        // Use the accumulated transcript from Web Speech API
        console.log('📝 Final transcript:', finalTranscriptRef.current);
        setStatus('Done!');
        
        if (finalTranscriptRef.current.trim()) {
          onTranscript(finalTranscriptRef.current.trim());
        } else if (interimTranscriptRef.current.trim()) {
          onTranscript(interimTranscriptRef.current.trim());
        }
        
        setTimeout(() => setStatus(''), 1000);
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
      };
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log('🎙️ Recording started successfully');
      
    } catch (error: any) {
      console.error('❌ Failed to start recording:', error);
      setStatus('');
      setIsRecording(false);
      onError?.(error.message || 'Failed to access microphone');
    }
  }, [monitorAudioLevel, onTranscript, onError]);

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('🛑 Stopping recording...');
    
    if (webSpeechRecognitionRef.current) {
      try {
        webSpeechRecognitionRef.current.stop();
      } catch (e) {
        console.log('Web speech already stopped');
      }
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
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
