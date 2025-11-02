# 🎤 Voice Input Setup (5 Minutes)

## What You're Getting
- Record voice → Send to API → Get text back
- Uses AssemblyAI (FREE $50 credit) or Deepgram ($200 free)
- No browser dependency

## Quick Setup

### 1. Get Free API Key (2 minutes)

**Option A: AssemblyAI (Recommended)**
```
1. Go to: https://www.assemblyai.com/
2. Sign up with email/GitHub
3. Copy your API key
4. You get $50 FREE credit
```

**Option B: Deepgram**
```
1. Go to: https://deepgram.com/
2. Sign up
3. Copy API key
4. You get $200 FREE credit
```

### 2. Configure Backend (1 minute)

Create `backend/.env`:
```env
SPEECH_PROVIDER=assemblyai
SPEECH_API_KEY=paste_your_key_here
PORT=8787
```

### 3. Install & Run (2 minutes)

```bash
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Frontend
cd ..
npm run dev
```

### 4. Use It!

1. Open your app
2. Click the blue microphone button 🎙️
3. Speak
4. Text appears in the input field!

## That's It!

Voice recording → Backend API → Transcription → Text appears

No browser speech API needed!

## Costs

- AssemblyAI: $50 free = 3,333 minutes
- Deepgram: $200 free = 46,512 minutes
- After that: Pennies per minute

## Troubleshooting

**Backend won't start?**
```bash
cd backend
npm install
```

**"API not configured" error?**
- Check `backend/.env` exists
- Check `SPEECH_API_KEY` is set
- Restart backend: `npm start`

**No text appears?**
- Check backend is running (Terminal 1)
- Check console for errors (F12)
- Make sure you have API key with credits

## Done!

Your microphone now records → sends to API → gets text back.

No browser dependency. Real API transcription.