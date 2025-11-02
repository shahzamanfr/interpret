/* Minimal production-ready proxy for AI and images. */
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

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
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))
        return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
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
    if (!GEMINI_KEY) return res.status(503).json({ error: "AI unavailable" });
    const { model, contents, config } = req.body || {};
    if (!model || !contents)
      return res.status(400).json({ error: "model and contents required" });
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    res.json({ text: response.text, candidates: response.candidates || null });
  } catch (e) {
    const code = e?.error?.code || e?.status || 500;
    res.status(Number(code) || 500).json({ error: e?.message || "AI error" });
  }
});

// Simple image proxy with cache headers
app.get("/api/img", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || typeof url !== "string")
      return res.status(400).send("url required");
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).send("upstream error");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.set(
      "Content-Type",
      upstream.headers.get("content-type") || "image/jpeg",
    );
    upstream.body.pipe(res);
  } catch (e) {
    res.status(500).send("proxy error");
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

    console.log(
      `📥 Received audio: ${req.file.originalname} (${req.file.size} bytes)`,
    );

    // Check if API key is configured
    if (!SPEECH_API_KEY) {
      return res.json({
        success: false,
        error: "API not configured",
        message: "Please set SPEECH_API_KEY in .env file",
        provider: SPEECH_PROVIDER,
        note: "Get free API key: https://www.assemblyai.com/ ($50 free credit)",
      });
    }

    // Transcribe based on provider
    let transcript;
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

    res.json({
      success: true,
      text: transcript.text,
      confidence: transcript.confidence || 0,
      provider: SPEECH_PROVIDER,
    });
  } catch (error) {
    console.error("❌ Speech endpoint error:", error);
    res.status(500).json({
      error: "Transcription failed",
      message: error.message,
    });
  }
});

// AssemblyAI transcription function
async function transcribeWithAssemblyAI(audioBuffer) {
  console.log("🎤 Transcribing with AssemblyAI...");

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
    throw new Error(`Upload failed: ${uploadResponse.statusText}`);
  }

  const { upload_url } = await uploadResponse.json();
  console.log("✅ Audio uploaded");

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
        audio_url: upload_url,
        language_code: "en",
      }),
    },
  );

  if (!transcriptResponse.ok) {
    throw new Error(
      `Transcription request failed: ${transcriptResponse.statusText}`,
    );
  }

  const { id } = await transcriptResponse.json();
  console.log("⏳ Processing transcription...");

  // Step 3: Poll for result
  let transcript;
  while (true) {
    const pollingResponse = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      {
        headers: { authorization: SPEECH_API_KEY },
      },
    );

    transcript = await pollingResponse.json();

    if (transcript.status === "completed") {
      console.log("✅ Transcription complete");
      return {
        text: transcript.text,
        confidence: transcript.confidence,
      };
    } else if (transcript.status === "error") {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Deepgram transcription function
async function transcribeWithDeepgram(audioBuffer) {
  console.log("🎤 Transcribing with Deepgram...");

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
    throw new Error(`Deepgram error: ${response.statusText}`);
  }

  const result = await response.json();
  const transcript = result.results.channels[0].alternatives[0];

  console.log("✅ Transcription complete");
  return {
    text: transcript.transcript,
    confidence: transcript.confidence,
  };
}

// Whisper transcription function
async function transcribeWithWhisper(audioBuffer) {
  console.log("🎤 Transcribing with OpenAI Whisper...");

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
    throw new Error(`Whisper error: ${response.statusText}`);
  }

  const result = await response.json();

  console.log("✅ Transcription complete");
  return {
    text: result.text,
    confidence: 0.95,
  };
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
