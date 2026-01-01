/* Minimal production-ready proxy for AI and images. */
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { Readable } from "stream";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import speechRoutes from "./routes/speech.js";



ffmpeg.setFfmpegPath(ffmpegStatic);

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

if (SPEECH_PROVIDER === "gemini" && !GEMINI_KEY) {
  console.warn(
    `[backend] No GEMINI_API_KEY set. Speech routes will not work.`,
  );
} else if (SPEECH_PROVIDER !== "browser" && SPEECH_PROVIDER !== "gemini" && !SPEECH_API_KEY) {
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
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return cb(null, true);

      // If allowed origins is empty, allow all (permissive mode)
      if (ALLOWED_ORIGINS.length === 0) {
        return cb(null, true);
      }

      // Check if origin is explicitly allowed
      if (ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }

      // Special case: allow localhost for development to prevent developer friction
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        console.log(`[backend] 🔓 Local origin allowed: ${origin}`);
        return cb(null, true);
      }

      console.warn(`[backend] ❌ CORS Blocked origin: ${origin}`);
      console.warn(`[backend] Allowed origins (from .env): ${ALLOWED_ORIGINS.join(', ')}`);

      return cb(new Error(`Not allowed by CORS: Origin ${origin} not in allowed list`));
    },
    credentials: true,
  }),
);

// Configure multer for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    // Accept audio files or application/octet-stream (for blob uploads)
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      console.log('❌ Rejected mimetype:', file.mimetype);
      cb(new Error("Only audio files allowed"), false);
    }
  },
});

// Register speech routes
app.use("/api/speech", speechRoutes);

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

    const ai = new GoogleGenerativeAI(GEMINI_KEY);
    const model_instance = ai.getGenerativeModel({ model });
    const response = await model_instance.generateContent({
      contents,
      ...config,
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







// Hugging Face BLIP vision proxy (bypasses CORS)
app.post("/api/huggingface-vision", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        message: "imageBase64 is required"
      });
    }

    // Get HF API token from environment
    const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;

    if (!HF_TOKEN) {
      return res.status(503).json({
        error: "Service unavailable",
        message: "Hugging Face API key not configured"
      });
    }

    console.log("🖼️ Proxying to Hugging Face BLIP...");

    // Convert base64 to binary
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Call Hugging Face Inference API
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
        },
        body: imageBuffer,
      }
    );

    console.log("📥 HF Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ HF Error:", errorText);

      // If model is loading, return 503
      if (response.status === 503) {
        return res.status(503).json({
          error: "Model loading",
          message: "The vision model is loading. Please try again in 10-20 seconds.",
          retryAfter: 15
        });
      }

      return res.status(response.status).json({
        error: "Hugging Face API error",
        message: errorText
      });
    }

    const data = await response.json();
    const description = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;

    if (!description) {
      return res.status(500).json({
        error: "No description generated",
        message: "The model did not return a description"
      });
    }

    console.log("✅ Description:", description);

    res.json({
      success: true,
      description: description,
      provider: "huggingface-blip"
    });
  } catch (error) {
    console.error("Error in HF proxy:", error);
    res.status(500).json({
      error: "Proxy error",
      message: error.message || "Failed to process image with Hugging Face"
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

    console.log('📥 Audio received:', req.file.size, 'bytes,', req.file.mimetype);

    // Validate file size and type
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: "File too large",
        message: "Audio file must be less than 10MB",
      });
    }

    if (req.file.size < 100) {
      return res.status(400).json({
        error: "File too small",
        message: "Audio file appears to be empty or corrupted",
      });
    }

    // Check if API key is configured (Gemini uses GEMINI_KEY, others use SPEECH_API_KEY)
    if (SPEECH_PROVIDER === "gemini" && !GEMINI_KEY) {
      return res.status(503).json({
        error: "Service unavailable",
        message: "Gemini API key not configured",
        provider: SPEECH_PROVIDER,
      });
    } else if (SPEECH_PROVIDER !== "gemini" && !SPEECH_API_KEY) {
      return res.status(503).json({
        error: "Service unavailable",
        message: "Speech recognition service not configured",
        provider: SPEECH_PROVIDER,
      });
    }

    // Transcribe based on provider
    let transcript;
    try {
      if (SPEECH_PROVIDER === "gemini") {
        transcript = await transcribeWithGemini(req.file.buffer, req.file.mimetype);
      } else if (SPEECH_PROVIDER === "assemblyai") {
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
      console.error('❌ Transcription error:', transcriptionError);
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

// Gemini transcription function (uses existing Gemini API key)
async function transcribeWithGemini(audioBuffer, mimeType = 'audio/webm') {
  try {
    console.log('🚀 Gemini transcription:', audioBuffer.length, 'bytes');

    if (!GEMINI_KEY) {
      throw new Error('Gemini API key not configured');
    }

    // Detect MIME type from buffer if not provided
    let detectedMimeType = mimeType;
    if (!mimeType || mimeType === 'application/octet-stream') {
      // Default to webm for most browsers
      detectedMimeType = 'audio/webm';
    }



    // Convert buffer to base64
    const base64Audio = audioBuffer.toString('base64');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio to text. Only return the transcription, nothing else.' },
              {
                inline_data: {
                  mime_type: detectedMimeType,
                  data: base64Audio
                }
              }
            ]
          }]
        })
      }
    );



    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Gemini error:', errorText);
      throw new Error(`Gemini error: ${response.statusText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('✅ Transcript:', text.substring(0, 100));

    return {
      text: text.trim(),
      confidence: 0.9
    };
  } catch (error) {
    throw new Error(`Gemini transcription error: ${error.message}`);
  }
}

// Convert audio to WAV format
async function convertToWav(audioBuffer) {
  return new Promise((resolve, reject) => {
    const inputPath = join(tmpdir(), `input-${Date.now()}.webm`);
    const outputPath = join(tmpdir(), `output-${Date.now()}.wav`);

    try {
      writeFileSync(inputPath, audioBuffer);

      ffmpeg(inputPath)
        .toFormat('wav')
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => {
          try {
            const wavBuffer = readFileSync(outputPath);
            unlinkSync(inputPath);
            unlinkSync(outputPath);
            resolve(wavBuffer);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          try { unlinkSync(inputPath); } catch { }
          try { unlinkSync(outputPath); } catch { }
          reject(err);
        })
        .save(outputPath);
    } catch (err) {
      reject(err);
    }
  });
}

// AssemblyAI transcription function
async function transcribeWithAssemblyAI(audioBuffer) {
  try {
    console.log('📤 AssemblyAI upload:', audioBuffer.length, 'bytes');

    // Step 1: Upload audio
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        authorization: SPEECH_API_KEY,
      },
      body: audioBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('❌ Upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log('✅ Uploaded:', uploadResult.upload_url);

    // Step 2: Request transcription with enhanced settings
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
          punctuate: true,
          format_text: true,
          speech_model: "best",
        }),
      },
    );

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      throw new Error(`Transcription request failed: ${errorText}`);
    }

    const transcriptResult = await transcriptResponse.json();
    console.log('⏳ Polling transcript:', transcriptResult.id);
    console.log('📊 Request details:', JSON.stringify(transcriptResult, null, 2));

    // Step 3: Poll for result
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const pollingResponse = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptResult.id}`,
        { headers: { authorization: SPEECH_API_KEY } },
      );

      const transcript = await pollingResponse.json();
      console.log(`📊 Status: ${transcript.status}`);

      if (transcript.status === "completed") {
        console.log('✅ Transcript:', transcript.text || '(empty)');
        return {
          text: transcript.text || "",
          confidence: transcript.confidence || 0,
        };
      } else if (transcript.status === "error") {
        console.log('❌ Error:', transcript.error);
        throw new Error(transcript.error || "Transcription failed");
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Transcription timeout");
  } catch (error) {
    throw new Error(`AssemblyAI error: ${error.message}`);
  }
}

// Deepgram transcription function
async function transcribeWithDeepgram(audioBuffer) {
  try {
    console.log('🚀 Deepgram:', audioBuffer.length, 'bytes');

    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${SPEECH_API_KEY}`,
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
      },
    );



    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Deepgram error:', errorText);
      throw new Error(`Deepgram error: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();


    if (!result.results?.channels?.[0]?.alternatives?.[0]) {
      throw new Error("Invalid response format from Deepgram");
    }

    const transcript = result.results.channels[0].alternatives[0];
    console.log('✅ Transcript:', transcript.transcript.substring(0, 50));

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

  const isConfigured = SPEECH_PROVIDER === "gemini" ? !!GEMINI_KEY : !!SPEECH_API_KEY;
  console.log(`[backend] Speech API configured: ${isConfigured}`);

  if (SPEECH_PROVIDER === "gemini" && GEMINI_KEY) {
    console.log(`[backend] ✅ Using Gemini for speech-to-text`);
  } else if (!isConfigured) {
    console.log(
      `[backend] 💡 Get free API key: https://www.assemblyai.com/ ($50 credit)`,
    );
  }

  console.log(`[backend] 🔒 Allowed origins: ${ALLOWED_ORIGINS.length === 0 ? 'ALL (permissive)' : ALLOWED_ORIGINS.join(', ')}`);
});
