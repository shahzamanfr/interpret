# 🎤 Speech Recognition Setup Guide

## ✅ Current Status

- **Backend**: Configured with AssemblyAI
- **API Key**: Valid and working (22bf782f...)
- **Provider**: AssemblyAI (works on ALL browsers and mobile)

## 🚀 How to Start

### Step 1: Start Backend Server

Open a terminal and run:

```bash
cd backend
node server.js
```

OR double-click: `START-BACKEND.bat`

You should see:
```
[backend] listening on :8787
[backend] Speech provider: assemblyai
[backend] Speech API configured: true
```

### Step 2: Start Frontend

Open another terminal and run:

```bash
npm run dev
```

### Step 3: Test Microphone

1. Open http://localhost:5173
2. Click "Start Now"
3. Select an image
4. Click the blue microphone button
5. Allow microphone access
6. Speak clearly
7. Click the red stop button
8. Wait 2-3 seconds for transcription

## 🔍 Troubleshooting

### Backend not starting?

```bash
cd backend
npm install
node server.js
```

### Microphone not working?

1. Check browser console (F12) for errors
2. Verify backend is running on port 8787
3. Check microphone permissions in browser
4. Try in Chrome/Edge (best support)

### No transcription appearing?

1. Check backend terminal for errors
2. Verify you see "📤 Sending to AssemblyAI..." in browser console
3. Make sure you spoke for at least 1-2 seconds
4. Check internet connection (AssemblyAI needs internet)

## 📊 How It Works

1. **Browser** records audio using MediaRecorder
2. **Frontend** sends audio file to backend (localhost:8787)
3. **Backend** uploads to AssemblyAI API
4. **AssemblyAI** transcribes audio (2-3 seconds)
5. **Backend** returns transcript to frontend
6. **Frontend** displays text in textarea

## 🌐 Browser Support

✅ Chrome/Edge - Full support
✅ Firefox - Full support  
✅ Safari - Full support
✅ Mobile Chrome - Full support
✅ Mobile Safari - Full support

**Works everywhere because it uses backend API, not browser speech recognition!**
