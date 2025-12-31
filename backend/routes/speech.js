import express from 'express';
const router = express.Router();
import multer from 'multer';
import SpeechService from '../speech-service.js';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files only
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  },
});

// Initialize speech service based on environment variables
const getSpeechService = () => {
  const provider = process.env.SPEECH_PROVIDER || 'browser';
  const apiKey = process.env.SPEECH_API_KEY;

  return new SpeechService({
    provider,
    apiKey,
    language: 'en',
  });
};

/**
 * POST /api/speech/transcribe
 * Transcribe audio file to text
 *
 * Body: FormData with 'audio' file
 * Returns: { text, confidence, provider }
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided',
        message: 'Please upload an audio file',
      });
    }

    console.log(`📥 Received audio file: ${req.file.originalname} (${req.file.size} bytes)`);

    const service = getSpeechService();
    const options = {
      diarization: req.body.diarization === 'true',
      timestamps: req.body.timestamps === 'true',
      language: req.body.language || 'en',
    };

    console.log(`🎤 Transcribing with ${service.provider}...`);
    const result = await service.transcribe(req.file.buffer, options);

    if (result.error) {
      console.error('❌ Transcription error:', result.error);
      return res.status(500).json({
        error: 'Transcription failed',
        message: result.error,
        provider: result.provider,
      });
    }

    console.log(`✅ Transcription complete: ${result.text.substring(0, 50)}...`);
    res.json({
      success: true,
      text: result.text,
      confidence: result.confidence,
      provider: result.provider,
      words: result.words || [],
      speakers: result.speakers || [],
      language: result.language,
    });
  } catch (error) {
    console.error('❌ Transcription endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/speech/config
 * Get speech service configuration
 *
 * Returns: { provider, hasApiKey, supported }
 */
router.get('/config', (req, res) => {
  const provider = process.env.SPEECH_PROVIDER || 'browser';
  const hasApiKey = !!process.env.SPEECH_API_KEY;

  const supportedProviders = {
    browser: {
      name: 'Web Speech API (Browser)',
      free: true,
      realtime: true,
      requiresBackend: false,
      accuracy: 'Medium',
      setup: 'No setup required - works in browser',
    },
    assemblyai: {
      name: 'AssemblyAI',
      free: '$50 free credit',
      realtime: true,
      requiresBackend: true,
      accuracy: 'Very High',
      setup: 'Sign up at https://www.assemblyai.com/',
      pricing: '$0.015/minute',
    },
    deepgram: {
      name: 'Deepgram',
      free: '$200 free credit',
      realtime: true,
      requiresBackend: true,
      accuracy: 'High',
      setup: 'Sign up at https://deepgram.com/',
      pricing: '$0.0043/minute',
    },
    whisper: {
      name: 'OpenAI Whisper',
      free: false,
      realtime: false,
      requiresBackend: true,
      accuracy: 'High',
      setup: 'Get API key at https://platform.openai.com/',
      pricing: '$0.006/minute',
    },
    google: {
      name: 'Google Cloud Speech-to-Text',
      free: '60 minutes/month for 12 months',
      realtime: true,
      requiresBackend: true,
      accuracy: 'High',
      setup: 'Set up at https://cloud.google.com/speech-to-text',
      pricing: '$0.006/15 seconds',
    },
  };

  res.json({
    currentProvider: provider,
    hasApiKey,
    isConfigured: provider === 'browser' || hasApiKey,
    providerInfo: supportedProviders[provider],
    allProviders: supportedProviders,
  });
});

/**
 * GET /api/speech/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const provider = process.env.SPEECH_PROVIDER || 'browser';
  const hasApiKey = !!process.env.SPEECH_API_KEY;

  res.json({
    status: 'ok',
    provider,
    configured: provider === 'browser' || hasApiKey,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/speech/test
 * Test endpoint for quick validation
 */
router.post('/test', async (req, res) => {
  try {
    const service = getSpeechService();
    const provider = service.provider;

    if (provider === 'browser') {
      return res.json({
        success: true,
        message: 'Browser-based speech recognition should be tested on frontend',
        provider,
      });
    }

    if (!service.apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key not configured',
        message: `Please set SPEECH_API_KEY environment variable for ${provider}`,
        provider,
      });
    }

    res.json({
      success: true,
      message: `Speech service configured with ${provider}`,
      provider,
      hasApiKey: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
