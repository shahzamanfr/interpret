/* Minimal production-ready proxy for AI and images. */
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .filter(Boolean);
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const SPEECH_PROVIDER = process.env.SPEECH_PROVIDER || "assemblyai";
const SPEECH_API_KEY = process.env.SPEECH_API_KEY;

if (!GEMINI_KEY) {
  console.warn("[backend] No GEMINI_API_KEY set. AI routes will return 503.");
}

if (SPEECH_PROVIDER !== "browser" && !SPEECH_API_KEY) {
  console.warn(
    `[backend] No SPEECH_API_KEY set for ${SPEECH_PROVIDER}. Speech routes will use fallback.`,
  );
}

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))
        return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Configure multer for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files allowed"), false);
    }
  },
});

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Generic AI content generation
app.post("/api/ai/generate-content", async (req, res) => {
  try {
    if (!GEMINI_KEY) {
      return res.status(503).json({ 
        error: "AI service unavailable",
        message: "API key not configured" 
      });
    }
    
    const { model, contents, config } = req.body || {};
    if (!model || !contents) {
      return res.status(400).json({ 
        error: "Invalid request",
        message: "model and contents are required" 
      });
    }
    
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    
    res.json({ 
      text: response.text, 
      candidates: response.candidates || null 
    });
  } catch (e) {
    const code = e?.error?.code || e?.status || 500;
    const message = e?.message || "AI processing error";
    
    res.status(Number(code) || 500).json({ 
      error: "AI request failed",
      message: message,
      code: code
    });
  }
});

// Simple image proxy with cache headers
app.get("/api/img", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ 
        error: "Invalid request",
        message: "URL parameter is required" 
      });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ 
        error: "Invalid URL",
        message: "Please provide a valid URL" 
      });
    }
    
    const upstream = await fetch(url, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'AI-Communication-Coach/1.0'
      }
    });
    
    if (!upstream.ok) {
      return res.status(upstream.status).json({ 
        error: "Upstream error",
        message: `Failed to fetch image: ${upstream.statusText}` 
      });
    }
    
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.set(
      "Content-Type",
      upstream.headers.get("content-type") || "image/jpeg",
    );
    upstream.body.pipe(res);
  } catch (e) {
    res.status(500).json({ 
      error: "Proxy error",
      message: e.message || "Failed to proxy image" 
    });
  }
});

// Speech-to-Text configuration endpoint
app.get("/api/speech/config", (req, res) => {
  const provider = process.env.SPEECH_PROVIDER || "browser";
  const hasApiKey = !!process.env.SPEECH_API_KEY;

  const supportedProviders = {
    browser: {
      name: "Web Speech API (Browser)",
      free: true,
      realtime: true,
      requiresBackend: false,
      accuracy: "Medium",
      setup: "No setup required - works in browser",
    },
    assemblyai: {
      name: "AssemblyAI",
      free: "$50 free credit",
      realtime: true,
      requiresBackend: true,
      accuracy: "Very High",
      setup: "Sign up at https://www.assemblyai.com/",
      pricing: "$0.015/minute",
    },
    deepgram: {
      name: "Deepgram",
      free: "$200 free credit",
      realtime: true,
      requiresBackend: true,
      accuracy: "High",
      setup: "Sign up at https://deepgram.com/",
      pricing: "$0.0043/minute",
    },
  };

  res.json({
    currentProvider: provider,
    hasApiKey,
    isConfigured: provider === "browser" || hasApiKey,
    providerInfo: supportedProviders[provider],
    allProviders: supportedProviders,
  });
});

// Speech-to-Text transcribe endpoint with real API integration
app.post("/api/speech/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No audio file provided",
        message: "Please upload an audio file",
      });
    }

    // Validate file size and type
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: "File too large",
        message: "Audio file must be less than 10MB",
      });
    }

    // Check if API key is configured
    if (!SPEECH_API_KEY) {
      return res.status(503).json({
        error: "Service unavailable",
        message: "Speech recognition service not configured",
        provider: SPEECH_PROVIDER,
      });
    }

    // Transcribe based on provider
    let transcript;
    try {
      if (SPEECH_PROVIDER === "assemblyai") {
        transcript = await transcribeWithAssemblyAI(req.file.buffer);
      } else if (SPEECH_PROVIDER === "deepgram") {
        transcript = await transcribeWithDeepgram(req.file.buffer);
      } else if (SPEECH_PROVIDER === "whisper") {
        transcript = await transcribeWithWhisper(req.file.buffer);
      } else {
        return res.status(400).json({
          error: "Invalid provider",
          message: `Provider '${SPEECH_PROVIDER}' not supported`,
        });
      }
    } catch (transcriptionError) {
      return res.status(502).json({
        error: "Transcription service error",
        message: transcriptionError.message || "Failed to transcribe audio",
        provider: SPEECH_PROVIDER,
      });
    }

    res.json({
      success: true,
      text: transcript.text || "",
      confidence: transcript.confidence || 0,
      provider: SPEECH_PROVIDER,
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred during transcription",
    });
  }
});

// AssemblyAI transcription function
async function transcribeWithAssemblyAI(audioBuffer) {
  try {
    // Step 1: Upload audio
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        authorization: SPEECH_API_KEY,
        "content-type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    if (!uploadResult.upload_url) {
      throw new Error("No upload URL received from AssemblyAI");
    }

    // Step 2: Request transcription
    const transcriptResponse = await fetch(
      "https://api.assemblyai.com/v2/transcript",
      {
        method: "POST",
        headers: {
          authorization: SPEECH_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audio_url: uploadResult.upload_url,
          language_code: "en",
        }),
      },
    );

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      throw new Error(
        `Transcription request failed: ${transcriptResponse.statusText} - ${errorText}`,
      );
    }

    const transcriptResult = await transcriptResponse.json();
    if (!transcriptResult.id) {
      throw new Error("No transcript ID received from AssemblyAI");
    }

    // Step 3: Poll for result with timeout
    const maxAttempts = 60; // 1 minute timeout
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const pollingResponse = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptResult.id}`,
        {
          headers: { authorization: SPEECH_API_KEY },
        },
      );

      if (!pollingResponse.ok) {
        throw new Error(`Polling failed: ${pollingResponse.statusText}`);
      }

      const transcript = await pollingResponse.json();

      if (transcript.status === "completed") {
        return {
          text: transcript.text || "",
          confidence: transcript.confidence || 0,
        };
      } else if (transcript.status === "error") {
        throw new Error(`Transcription failed: ${transcript.error || "Unknown error"}`);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    throw new Error("Transcription timeout - processing took too long");
  } catch (error) {
    throw new Error(`AssemblyAI transcription error: ${error.message}`);
  }
}

// Deepgram transcription function
async function transcribeWithDeepgram(audioBuffer) {
  try {
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${SPEECH_API_KEY}`,
          "Content-Type": "audio/wav",
        },
        body: audioBuffer,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepgram error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.results?.channels?.[0]?.alternatives?.[0]) {
      throw new Error("Invalid response format from Deepgram");
    }
    
    const transcript = result.results.channels[0].alternatives[0];

    return {
      text: transcript.transcript || "",
      confidence: transcript.confidence || 0,
    };
  } catch (error) {
    throw new Error(`Deepgram transcription error: ${error.message}`);
  }
}

// Whisper transcription function
async function transcribeWithWhisper(audioBuffer) {
  try {
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), "audio.webm");
    formData.append("model", "whisper-1");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SPEECH_API_KEY}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    return {
      text: result.text || "",
      confidence: 0.95,
    };
  } catch (error) {
    throw new Error(`Whisper transcription error: ${error.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
  console.log(`[backend] Speech provider: ${SPEECH_PROVIDER}`);
  console.log(`[backend] Speech API configured: ${!!SPEECH_API_KEY}`);
  if (!SPEECH_API_KEY) {
    console.log(
      `[backend] 💡 Get free API key: https://www.assemblyai.com/ ($50 credit)`,
    );
  }
});
