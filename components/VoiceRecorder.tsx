import React, { useState, useRef, useEffect } from "react";
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
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const accumulatedTextRef = useRef<string>("");
  const interimTextRef = useRef<string>("");
  const isInitializedRef = useRef(false);
  const shouldBeListeningRef = useRef(false);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const [micLevel, setMicLevel] = useState(0);

  // Initialize speech recognition once on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    
    console.log("🎙️ Initializing Voice Recorder...");
    
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      console.error("❌ Speech recognition not supported");
      setError("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎤 Voice recording started!");
      setIsListening(true);
      shouldBeListeningRef.current = true;
      setError(null);
      setStatus("Listening... Speak now!");
      lastSpeechTimeRef.current = Date.now();
      accumulatedTextRef.current = "";
      interimTextRef.current = "";
    };

    recognition.onresult = (event: any) => {
      console.log("📝 Speech result event fired!");
      console.log("Event details:", {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
        results: event.results
      });
      
      setStatus("Detected speech!");
      lastSpeechTimeRef.current = Date.now();

      // Clear existing silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        console.log(`Result ${i}: isFinal=${result.isFinal}, transcript="${transcript}"`);
        
        if (result.isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        console.log("✅ Final transcript:", finalTranscript);
        accumulatedTextRef.current += finalTranscript;
        interimTextRef.current = "";
      } else if (interimTranscript) {
        console.log("⏳ Interim transcript:", interimTranscript);
      }

      // Send live updates with accumulated + interim text
      const currentText = accumulatedTextRef.current + interimTranscript;
      console.log("📤 Sending to app:", currentText);
      if (currentText.trim()) {
        onTranscript(currentText.trim());
      }

      // Set new silence timer for 8 seconds
      silenceTimerRef.current = setTimeout(() => {
        if (
          recognitionRef.current &&
          Date.now() - lastSpeechTimeRef.current >= 8000
        ) {
          console.log("⏸️ Auto-stopping due to silence");
          recognitionRef.current.stop();
        }
      }, 8000);
    };

    recognition.onerror = (event: any) => {
      console.error("❌ Speech recognition error:", event.error);
      
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setIsListening(false);
        setError("Microphone access denied. Please allow microphone access.");
        alert("🚫 Microphone Permission Denied!\n\nPlease:\n1. Click the lock icon in the address bar\n2. Allow microphone access\n3. Refresh the page");
      } else if (event.error === "no-speech") {
        // Don't stop listening on no-speech, just log it and continue
        console.warn("⚠️ No speech detected yet, but still listening...");
        setStatus("No speech yet... Keep talking!");
        // Don't call setIsListening(false) - let it keep trying
      } else if (event.error === "audio-capture") {
        setIsListening(false);
        setError("No microphone found. Please connect a microphone.");
        alert("🎤 No Microphone Found!\n\nPlease:\n1. Connect a microphone\n2. Check Windows sound settings\n3. Make sure mic is not being used by another app");
      } else if (event.error === "network") {
        setIsListening(false);
        setError("Network error. Check your internet connection.");
      } else if (event.error === "aborted") {
        console.warn("⚠️ Recognition aborted, will restart if needed");
        // Don't show error, just let it end naturally
      } else {
        setIsListening(false);
        setError("Error: " + event.error);
      }
    };

    recognition.onend = () => {
      console.log("🛑 Voice recording ended. shouldBeListening:", shouldBeListeningRef.current);
      
      // If we should still be listening and it ended without explicit stop, try to restart
      if (shouldBeListeningRef.current && recognitionRef.current) {
        console.log("🔄 Auto-restarting recognition (no-speech timeout)...");
        setStatus("Restarting... Keep talking!");
        setTimeout(() => {
          if (recognitionRef.current && shouldBeListeningRef.current) {
            try {
              recognitionRef.current.start();
              console.log("✅ Recognition restarted successfully");
            } catch (e) {
              console.error("❌ Failed to restart:", e);
              setIsListening(false);
              shouldBeListeningRef.current = false;
              setStatus("");
              accumulatedTextRef.current = "";
              interimTextRef.current = "";
            }
          }
        }, 200);
      } else {
        console.log("🛑 Stopping for real - user clicked stop or error occurred");
        setIsListening(false);
        shouldBeListeningRef.current = false;
        setStatus("");
        // Reset for next recording
        accumulatedTextRef.current = "";
        interimTextRef.current = "";
      }
    };

    recognitionRef.current = recognition;
    isInitializedRef.current = true;
    console.log("✅ Voice Recorder initialized successfully");
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log("Recognition cleanup");
        }
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [onTranscript]);

  const startListening = async () => {
    try {
      console.log("🎤 Start listening clicked");
      setError(null);

      if (!recognitionRef.current) {
        console.error("❌ Recognition not initialized!");
        setError("Please refresh the page and try again.");
        return;
      }

      if (isListening) {
        console.warn("⚠️ Already listening");
        return;
      }

      // Request microphone permission and set up audio level monitoring
      console.log("🎤 Requesting microphone permission...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        console.log("✅ Microphone permission granted");
        
        // Set up audio level monitoring
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        analyser.fftSize = 256;
        microphone.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        
        // Monitor audio level
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudioLevel = () => {
          if (!shouldBeListeningRef.current) {
            stream.getTracks().forEach(track => track.stop());
            audioContext.close();
            return;
          }
          
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMicLevel(Math.round(average));
          
          if (average > 10) {
            console.log("🔊 Microphone is picking up sound! Level:", Math.round(average));
          }
          
          requestAnimationFrame(checkAudioLevel);
        };
        checkAudioLevel();
        
        console.log("🎧 Audio monitoring started. Speak to see if mic is working...");
      } catch (permErr: any) {
        console.error("❌ Microphone permission denied:", permErr);
        setError("Microphone permission denied. Please allow access.");
        alert("🚫 Microphone Access Required!\n\nPlease:\n1. Click 'Allow' when browser asks for microphone access\n2. Or click the lock icon in the address bar\n3. Set Microphone to 'Allow'\n4. Refresh the page and try again");
        return;
      }

      console.log("🚀 Starting speech recognition...");
      recognitionRef.current.start();
      console.log("✅ Recognition start() called");
    } catch (err: any) {
      console.error("❌ Error starting recognition:", err);
      setIsListening(false);
      
      // Handle "already started" error
      if (err.message && err.message.includes("already")) {
        console.warn("⚠️ Recognition already active, restarting...");
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (e) {
          setError("Please try again");
        }
      } else {
        setError(err.message || "Failed to start recording");
      }
    }
  };

  const stopListening = () => {
    console.log("🛑 Stop listening clicked");
    shouldBeListeningRef.current = false;
    setMicLevel(0);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };

  return (
    <div className="relative">
      {!isListening ? (
        <button
          onClick={startListening}
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
          onClick={stopListening}
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

      {status && !error && (
        <div className={`absolute top-full mt-2 right-0 px-3 py-2 rounded text-xs whitespace-nowrap z-50 ${
          theme === "dark"
            ? "bg-green-900/90 border border-green-500/30 text-green-200"
            : "bg-green-100 border border-green-400 text-green-700"
        }`}>
          <div>{status}</div>
          {micLevel > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px]">Mic:</span>
              <div className="flex-1 bg-black/20 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all duration-100"
                  style={{ width: `${Math.min(micLevel * 2, 100)}%` }}
                />
              </div>
              <span className="text-[10px]">{micLevel}</span>
            </div>
          )}
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
