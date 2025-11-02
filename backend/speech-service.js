// Speech-to-Text Service with Multiple API Options
// Supports: Web Speech API (browser), AssemblyAI, Deepgram, OpenAI Whisper, Google Cloud

const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

class SpeechService {
  constructor(config = {}) {
    this.provider = config.provider || 'browser'; // 'browser', 'assemblyai', 'deepgram', 'whisper', 'google'
    this.apiKey = config.apiKey || process.env.SPEECH_API_KEY;
    this.language = config.language || 'en-US';
  }

  /**
   * Transcribe audio file to text
   * @param {Buffer|String} audioData - Audio buffer or file path
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} { text, confidence, provider }
   */
  async transcribe(audioData, options = {}) {
    try {
      switch (this.provider) {
        case 'assemblyai':
          return await this.transcribeAssemblyAI(audioData, options);
        case 'deepgram':
          return await this.transcribeDeepgram(audioData, options);
        case 'whisper':
          return await this.transcribeWhisper(audioData, options);
        case 'google':
          return await this.transcribeGoogle(audioData, options);
        case 'browser':
          return {
            error: 'Browser API should be used on frontend',
            text: '',
            provider: 'browser'
          };
        default:
          throw new Error(`Unknown provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      return {
        error: error.message,
        text: '',
        provider: this.provider
      };
    }
  }

  /**
   * AssemblyAI Transcription
   * FREE TIER: $50 credit on signup
   * Pricing: $0.00025 per second (~$0.015/minute)
   * Best for: High accuracy, speaker diarization
   */
  async transcribeAssemblyAI(audioData, options = {}) {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key required. Get free credits at: https://www.assemblyai.com/');
    }

    const headers = {
      'authorization': this.apiKey,
      'content-type': 'application/json'
    };

    // Step 1: Upload audio file
    const uploadUrl = await this.uploadToAssemblyAI(audioData);

    // Step 2: Request transcription
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadUrl,
        language_code: this.language,
        punctuate: true,
        format_text: true,
        speaker_labels: options.diarization || false
      },
      { headers }
    );

    const transcriptId = transcriptResponse.data.id;

    // Step 3: Poll for result
    let transcript = await this.pollAssemblyAI(transcriptId, headers);

    return {
      text: transcript.text,
      confidence: transcript.confidence,
      provider: 'assemblyai',
      words: transcript.words || [],
      speakers: transcript.utterances || []
    };
  }

  async uploadToAssemblyAI(audioData) {
    const headers = {
      'authorization': this.apiKey,
      'content-type': 'application/octet-stream'
    };

    const buffer = Buffer.isBuffer(audioData) ? audioData : fs.readFileSync(audioData);

    const response = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      buffer,
      { headers }
    );

    return response.data.upload_url;
  }

  async pollAssemblyAI(transcriptId, headers) {
    const pollingUrl = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;

    while (true) {
      const response = await axios.get(pollingUrl, { headers });
      const status = response.data.status;

      if (status === 'completed') {
        return response.data;
      } else if (status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${response.data.error}`);
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Deepgram Transcription
   * FREE TIER: $200 credit on signup
   * Pricing: $0.0043 per minute
   * Best for: Real-time streaming, low latency
   */
  async transcribeDeepgram(audioData, options = {}) {
    if (!this.apiKey) {
      throw new Error('Deepgram API key required. Get free credits at: https://deepgram.com/');
    }

    const buffer = Buffer.isBuffer(audioData) ? audioData : fs.readFileSync(audioData);

    const response = await axios.post(
      'https://api.deepgram.com/v1/listen',
      buffer,
      {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'audio/wav'
        },
        params: {
          model: options.model || 'nova-2',
          language: this.language,
          punctuate: true,
          diarize: options.diarization || false,
          smart_format: true
        }
      }
    );

    const result = response.data.results.channels[0].alternatives[0];

    return {
      text: result.transcript,
      confidence: result.confidence,
      provider: 'deepgram',
      words: result.words || []
    };
  }

  /**
   * OpenAI Whisper Transcription
   * Pricing: $0.006 per minute
   * Best for: Multiple languages, good accuracy
   */
  async transcribeWhisper(audioData, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key required. Get it at: https://platform.openai.com/');
    }

    const buffer = Buffer.isBuffer(audioData) ? audioData : fs.readFileSync(audioData);

    const formData = new FormData();
    formData.append('file', buffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });
    formData.append('model', options.model || 'whisper-1');
    formData.append('language', this.language.split('-')[0]); // 'en' from 'en-US'
    formData.append('response_format', 'verbose_json');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        }
      }
    );

    return {
      text: response.data.text,
      confidence: 0.95, // Whisper doesn't provide confidence scores
      provider: 'whisper',
      language: response.data.language,
      duration: response.data.duration,
      segments: response.data.segments || []
    };
  }

  /**
   * Google Cloud Speech-to-Text
   * FREE TIER: 60 minutes per month for first 12 months
   * Pricing: $0.006 per 15 seconds
   * Best for: Google Cloud integration
   */
  async transcribeGoogle(audioData, options = {}) {
    // This requires Google Cloud SDK to be properly configured
    // For simplicity, using REST API here
    if (!this.apiKey) {
      throw new Error('Google Cloud API key required. Get it at: https://cloud.google.com/speech-to-text');
    }

    const buffer = Buffer.isBuffer(audioData) ? audioData : fs.readFileSync(audioData);
    const audioBytes = buffer.toString('base64');

    const response = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
      {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: this.language,
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: options.timestamps || false,
          diarizationConfig: options.diarization ? {
            enableSpeakerDiarization: true,
            minSpeakerCount: 1,
            maxSpeakerCount: 6
          } : undefined
        },
        audio: {
          content: audioBytes
        }
      }
    );

    if (!response.data.results || response.data.results.length === 0) {
      return {
        text: '',
        confidence: 0,
        provider: 'google',
        error: 'No transcription results'
      };
    }

    const result = response.data.results[0].alternatives[0];

    return {
      text: result.transcript,
      confidence: result.confidence || 0,
      provider: 'google',
      words: result.words || []
    };
  }

  /**
   * Stream audio for real-time transcription
   * @param {ReadableStream} audioStream - Audio stream
   * @param {Function} callback - Called with each transcription chunk
   */
  async streamTranscribe(audioStream, callback) {
    // Implementation depends on provider
    // Deepgram and AssemblyAI have good streaming support
    if (this.provider === 'deepgram') {
      return await this.streamDeepgram(audioStream, callback);
    } else if (this.provider === 'assemblyai') {
      return await this.streamAssemblyAI(audioStream, callback);
    } else {
      throw new Error(`Streaming not supported for provider: ${this.provider}`);
    }
  }

  async streamDeepgram(audioStream, callback) {
    const WebSocket = require('ws');
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&language=${this.language}`,
      {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      }
    );

    ws.on('open', () => {
      audioStream.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      });

      audioStream.on('end', () => {
        ws.close();
      });
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());
      if (response.channel?.alternatives?.[0]) {
        callback({
          text: response.channel.alternatives[0].transcript,
          isFinal: response.is_final,
          confidence: response.channel.alternatives[0].confidence
        });
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      callback({ error: error.message });
    });

    return new Promise((resolve) => {
      ws.on('close', () => resolve());
    });
  }

  async streamAssemblyAI(audioStream, callback) {
    const WebSocket = require('ws');
    const ws = new WebSocket(
      `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.apiKey}`
    );

    ws.on('open', () => {
      audioStream.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          const audioData = chunk.toString('base64');
          ws.send(JSON.stringify({ audio_data: audioData }));
        }
      });

      audioStream.on('end', () => {
        ws.send(JSON.stringify({ terminate_session: true }));
      });
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());
      if (response.message_type === 'FinalTranscript') {
        callback({
          text: response.text,
          isFinal: true,
          confidence: response.confidence
        });
      } else if (response.message_type === 'PartialTranscript') {
        callback({
          text: response.text,
          isFinal: false,
          confidence: 0
        });
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      callback({ error: error.message });
    });

    return new Promise((resolve) => {
      ws.on('close', () => resolve());
    });
  }
}

// Export service
module.exports = SpeechService;

// Example usage:
/*

// AssemblyAI (Best overall - free $50 credit)
const service = new SpeechService({
  provider: 'assemblyai',
  apiKey: 'your-assemblyai-key'
});

// Deepgram (Best for real-time - free $200 credit)
const service = new SpeechService({
  provider: 'deepgram',
  apiKey: 'your-deepgram-key'
});

// OpenAI Whisper (Good multilingual)
const service = new SpeechService({
  provider: 'whisper',
  apiKey: 'your-openai-key'
});

// Transcribe audio file
const result = await service.transcribe('./audio.wav');
console.log(result.text);

// Stream real-time transcription
await service.streamTranscribe(audioStream, (chunk) => {
  console.log(chunk.text);
});

*/
