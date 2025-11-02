import { useState, useEffect, useRef, useCallback } from "react";

// Fix: Add types for Web Speech API to resolve TypeScript errors about missing definitions.
// The Web Speech API is not part of the standard DOM typings and this provides the necessary types for the compiler.
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognitionOptions {
  onResult: (transcript: string) => void;
}

const useSpeechRecognition = ({ onResult }: SpeechRecognitionOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);

  // Keep onResult ref updated without triggering re-initialization
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Initialize speech recognition once
  useEffect(() => {
    console.log("🎙️ Initializing speech recognition...");

    if (
      typeof window === "undefined" ||
      (!("SpeechRecognition" in window) &&
        !("webkitSpeechRecognition" in window))
    ) {
      console.error("❌ Speech recognition not supported by this browser.");
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    console.log("✅ Speech Recognition API found:", SpeechRecognitionAPI);

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      console.log("🎤 Speech recognition started!");
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log("📝 Speech result received");
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece;
        } else {
          interimTranscript += transcriptPiece;
        }
      }

      if (finalTranscript) {
        console.log("✅ Final transcript:", finalTranscript);
        setTranscript(finalTranscript);
        onResultRef.current(finalTranscript);
      } else if (interimTranscript) {
        console.log("⏳ Interim transcript:", interimTranscript);
      }
    };

    recognition.onend = () => {
      console.log("🛑 Speech recognition ended");
      setIsListening(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("❌ Speech recognition error:", event.error);
      setIsListening(false);

      if (
        event.error === "not-allowed" ||
        event.error === "not-allowed-error"
      ) {
        console.error("❌ Microphone permission denied by user or system");
        alert(
          "🚫 Microphone Access Denied!\n\n" +
            "Please follow these steps:\n\n" +
            "1. Click the 🔒 lock icon in the address bar\n" +
            "2. Find 'Microphone' and change to 'Allow'\n" +
            "3. Refresh the page\n\n" +
            "OR\n\n" +
            "Chrome: chrome://settings/content/microphone\n" +
            "Edge: edge://settings/content/microphone\n\n" +
            "Make sure Windows/Mac also allows browser access to microphone!",
        );
      } else if (event.error === "no-speech") {
        console.warn("⚠️ No speech detected");
        // Don't show alert for no-speech, just stop listening
      } else if (event.error === "aborted") {
        console.warn("⚠️ Speech recognition aborted");
      } else if (event.error === "audio-capture") {
        console.error("❌ Audio capture failed - no microphone found");
        alert(
          "🎤 No Microphone Found!\n\n" +
            "Please:\n" +
            "1. Connect a microphone to your device\n" +
            "2. Check system sound settings\n" +
            "3. Make sure the microphone is not being used by another app",
        );
      } else if (event.error === "network") {
        console.error("❌ Network error during speech recognition");
        alert(
          "Network error. Please check your internet connection and try again.",
        );
      } else {
        console.error(`❌ Unexpected error: ${event.error}`);
        alert(
          `Speech recognition error: ${event.error}\n\nPlease refresh the page and try again.`,
        );
      }
    };

    recognitionRef.current = recognition;
    console.log("✅ Speech recognition initialized");

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log("Recognition already stopped");
        }
      }
    };
  }, []); // Empty dependency array - only initialize once

  const startListening = useCallback(() => {
    console.log("🎤 startListening called");
    console.log("recognitionRef.current:", recognitionRef.current);
    console.log("isListening:", isListening);

    if (!recognitionRef.current) {
      console.error("❌ Recognition not initialized!");
      alert(
        "Speech recognition is not available.\n\n" +
          "Please:\n" +
          "1. Use Chrome or Edge browser\n" +
          "2. Refresh the page\n" +
          "3. Check that you're on a secure connection (HTTPS or localhost)",
      );
      return;
    }

    if (isListening) {
      console.warn("⚠️ Already listening");
      return;
    }

    try {
      setTranscript("");
      console.log("🚀 Starting recognition...");
      recognitionRef.current.start();
      console.log("✅ Recognition start called successfully");
    } catch (error) {
      console.error("❌ Error starting recognition:", error);
      setIsListening(false);

      // If already started error, try to stop and restart
      if (error instanceof Error && error.message.includes("already")) {
        console.warn("⚠️ Recognition already started, restarting...");
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (e) {
          console.error("❌ Failed to restart:", e);
          alert(
            "Failed to start speech recognition.\n\n" +
              "Please click the microphone button again.",
          );
        }
      } else if (
        error instanceof Error &&
        error.message.includes("permission")
      ) {
        alert(
          "🚫 Microphone permission required!\n\n" +
            "Please allow microphone access in your browser settings and try again.",
        );
      } else {
        alert(
          `Failed to start speech recognition.\n\n` +
            `Error: ${error}\n\n` +
            `Try refreshing the page or checking your microphone connection.`,
        );
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    console.log("🛑 stopListening called");
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
        console.log("✅ Recognition stopped");
      } catch (error) {
        console.error("❌ Error stopping recognition:", error);
        setIsListening(false);
      }
    }
  }, [isListening]);

  return { isListening, transcript, startListening, stopListening };
};

export default useSpeechRecognition;
