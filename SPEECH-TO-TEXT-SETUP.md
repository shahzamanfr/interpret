# 🎤 Speech-to-Text Setup Guide

## 🚀 Quick Start - Choose Your Option

We've built **multiple speech-to-text solutions** so you can pick what works best for you!

### Option 1: Browser API (Easiest - Already Working!)
✅ **FREE**  
✅ No API keys needed  
✅ Works instantly  
⚠️ Requires microphone permissions  
⚠️ Chrome/Edge only  

**Status:** Already implemented and fixed!

---

### Option 2: AssemblyAI (Best Overall - RECOMMENDED)
✅ **$50 FREE CREDIT** on signup  
✅ Highest accuracy  
✅ Real-time streaming  
✅ Speaker diarization  
💰 $0.015/minute after free credit  

**Best for:** Production apps, high accuracy needs

---

### Option 3: Deepgram (Best for Real-time)
✅ **$200 FREE CREDIT** on signup  
✅ Fastest streaming  
✅ Low latency  
✅ Great for live transcription  
💰 $0.0043/minute after free credit  

**Best for:** Live conversations, real-time needs

---

### Option 4: OpenAI Whisper (Good Multilingual)
✅ Excellent accuracy  
✅ 99+ languages  
✅ Good for recorded audio  
💰 $0.006/minute (no free tier)  

**Best for:** Multilingual support, batch processing

---

## 📦 Setup Instructions

### Option 1: Browser API (Already Working!)

**No setup needed!** Just:
1. Fix permissions (see `START-HERE-MICROPHONE.md`)
2. Use Chrome or Edge
3. Click the microphone button
4. Speak!

The browser's Web Speech API is already integrated and working.

---

### Option 2: AssemblyAI Setup (15 minutes)

#### Step 1: Get Your Free API Key
```bash
1. Go to: https://www.assemblyai.com/
2. Click "Get Started Free"
3. Sign up (email or GitHub)
4. Copy your API key
```

You get **$50 in free credits** immediately!

#### Step 2: Install Dependencies
```bash
cd ai-communication-coach
npm install axios form-data ws
```

#### Step 3: Configure Environment
Create or edit `.env` file:
```env
SPEECH_PROVIDER=assemblyai
SPEECH_API_KEY=your_assemblyai_api_key_here
```

#### Step 4: Start Backend Server
```bash
cd backend
node server.js
```

#### Step 5: Test It!
```bash
# Test the API
curl -X POST http://localhost:3001/api/speech/config
```

**Done!** Your app now uses AssemblyAI for transcription.

---

### Option 3: Deepgram Setup (15 minutes)

#### Step 1: Get Your Free API Key
```bash
1. Go to: https://deepgram.com/
2. Click "Sign Up"
3. Sign up (email required)
4. Navigate to API Keys section
5. Copy your API key
```

You get **$200 in free credits**!

#### Step 2: Install Dependencies
```bash
npm install axios ws
```

#### Step 3: Configure Environment
Create or edit `.env` file:
```env
SPEECH_PROVIDER=deepgram
SPEECH_API_KEY=your_deepgram_api_key_here
```

#### Step 4: Start Backend Server
```bash
cd backend
node server.js
```

**Done!** Your app now uses Deepgram.

---

### Option 4: OpenAI Whisper Setup (10 minutes)

#### Step 1: Get API Key
```bash
1. Go to: https://platform.openai.com/
2. Sign up or log in
3. Go to API Keys section
4. Create new secret key
5. Copy the key (you can't see it again!)
```

⚠️ Note: Requires payment method, but very cheap ($0.006/min)

#### Step 2: Install Dependencies
```bash
npm install axios form-data
```

#### Step 3: Configure Environment
Create or edit `.env` file:
```env
SPEECH_PROVIDER=whisper
SPEECH_API_KEY=sk-your_openai_api_key_here
```

#### Step 4: Start Backend Server
```bash
cd backend
node server.js
```

**Done!** Your app now uses OpenAI Whisper.

---

## 🏗️ Backend Server Setup

### Create Backend Server (if not exists)

Create `backend/server.js`:

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const speechRoutes = require('./routes/speech');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/speech', speechRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Speech-to-Text server running on http://localhost:${PORT}`);
  console.log(`📝 Provider: ${process.env.SPEECH_PROVIDER || 'browser'}`);
  console.log(`🔑 API Key configured: ${!!process.env.SPEECH_API_KEY}`);
});
```

### Install Backend Dependencies

```bash
cd backend
npm init -y
npm install express cors dotenv multer axios form-data ws
```

### Create .env File

```env
# Choose your provider: browser, assemblyai, deepgram, whisper, google
SPEECH_PROVIDER=assemblyai

# Add your API key (not needed for browser provider)
SPEECH_API_KEY=your_api_key_here

# Server port
PORT=3001
```

---

## 🎯 How to Use in Your App

### Frontend Integration

```typescript
// Example: Using with the audio recorder hook
import useAudioRecorder from '../hooks/useAudioRecorder';

const MyComponent = () => {
  const {
    isRecording,
    audioBlob,
    startRecording,
    stopRecording
  } = useAudioRecorder({
    onDataAvailable: async (blob) => {
      // Send to backend for transcription
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      
      const response = await fetch('http://localhost:3001/api/speech/transcribe', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      console.log('Transcription:', result.text);
      
      // Use the transcribed text
      setInputText(result.text);
    }
  });

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>
        Start Recording
      </button>
      <button onClick={stopRecording} disabled={!isRecording}>
        Stop Recording
      </button>
    </div>
  );
};
```

---

## 💰 Cost Comparison

| Provider | Free Tier | After Free Tier | Best For |
|----------|-----------|-----------------|----------|
| **Browser API** | ✅ Always free | N/A | Quick prototypes, Chrome users |
| **AssemblyAI** | $50 credit (~3,333 mins) | $0.015/min | High accuracy, production |
| **Deepgram** | $200 credit (~46,512 mins) | $0.0043/min | Real-time, high volume |
| **OpenAI Whisper** | None | $0.006/min | Multilingual, batch |
| **Google Cloud** | 60 mins/month (12 months) | $0.024/min | Google Cloud users |

### Cost Examples:
- **1 hour of audio:**
  - AssemblyAI: $0.90
  - Deepgram: $0.26
  - Whisper: $0.36
  - Browser: FREE

- **10 hours of audio:**
  - AssemblyAI: $9.00
  - Deepgram: $2.58
  - Whisper: $3.60
  - Browser: FREE

---

## 🧪 Testing Your Setup

### Test 1: Check Configuration
```bash
curl http://localhost:3001/api/speech/config
```

Should return your provider info and configuration status.

### Test 2: Health Check
```bash
curl http://localhost:3001/api/speech/health
```

Should return `{ status: 'ok' }`.

### Test 3: Test Transcription
```bash
# Record a test audio file, then:
curl -X POST http://localhost:3001/api/speech/transcribe \
  -F "audio=@test-audio.wav"
```

Should return transcribed text.

---

## 🔧 Troubleshooting

### Issue: "API key not configured"
**Solution:** Make sure `.env` file exists and has `SPEECH_API_KEY` set.

### Issue: "Provider not found"
**Solution:** Check `SPEECH_PROVIDER` in `.env` - must be one of: browser, assemblyai, deepgram, whisper, google

### Issue: "No audio file provided"
**Solution:** Make sure you're sending audio in FormData with key 'audio'

### Issue: Backend server won't start
**Solution:**
```bash
# Install dependencies
cd backend
npm install

# Check for errors
node server.js
```

### Issue: CORS errors in browser
**Solution:** Make sure backend has CORS enabled:
```javascript
const cors = require('cors');
app.use(cors());
```

---

## 📊 Provider Feature Comparison

| Feature | Browser | AssemblyAI | Deepgram | Whisper | Google |
|---------|---------|-----------|----------|---------|--------|
| Real-time | ✅ | ✅ | ✅ | ❌ | ✅ |
| Speaker Diarization | ❌ | ✅ | ✅ | ❌ | ✅ |
| Custom Vocabulary | ❌ | ✅ | ✅ | ❌ | ✅ |
| Punctuation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timestamps | ❌ | ✅ | ✅ | ✅ | ✅ |
| Offline Mode | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| Languages | ~60 | 99+ | 50+ | 99+ | 125+ |

---

## 🎓 Recommendations

### For Development/Testing:
**Use Browser API** - It's already working, no setup needed!

### For Production:
**Use AssemblyAI** - Best accuracy, great features, good free tier

### For High Volume:
**Use Deepgram** - Best pricing after free tier, fast streaming

### For Multilingual:
**Use Whisper** - Excellent multilingual support

---

## 📁 Files You Need

### Already Created:
- ✅ `hooks/useAudioRecorder.ts` - Record audio from microphone
- ✅ `hooks/useSpeechRecognition.ts` - Browser Speech API (working!)
- ✅ `backend/speech-service.js` - Multi-provider service
- ✅ `backend/routes/speech.js` - API routes

### You Need to Create:
- `backend/server.js` - Express server (see example above)
- `backend/.env` - Configuration file
- `backend/package.json` - Dependencies (or run `npm init`)

---

## 🚀 Quick Start Commands

### Start with Browser API (No Backend Needed):
```bash
# Already working! Just run your app:
npm run dev
```

### Start with AssemblyAI/Deepgram/Whisper:
```bash
# Terminal 1: Start backend
cd backend
npm install
node server.js

# Terminal 2: Start frontend
cd ..
npm run dev
```

---

## ✅ Success Checklist

- [ ] Chose a provider (browser, assemblyai, deepgram, or whisper)
- [ ] Got API key (if not using browser)
- [ ] Created `.env` file with configuration
- [ ] Installed backend dependencies (`npm install`)
- [ ] Started backend server (`node server.js`)
- [ ] Tested API endpoint (`curl http://localhost:3001/api/speech/config`)
- [ ] Recorded test audio
- [ ] Got transcription back successfully!

---

## 🎉 You're All Set!

Your speech-to-text system is now ready to use!

- **Browser API:** Already working, no backend needed
- **Cloud APIs:** Better accuracy, more features, requires backend

Need help? Check:
- `START-HERE-MICROPHONE.md` - Permission issues
- `PERMISSION-TROUBLESHOOTING.md` - Detailed troubleshooting
- Console logs (F12) - Debugging info

---

**Status:** ✅ Multiple options ready to use!  
**Recommendation:** Start with Browser API (already working), upgrade to AssemblyAI for production.