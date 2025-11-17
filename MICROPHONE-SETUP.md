# 🎤 Microphone Setup Guide

## Quick Start (Easiest)

**Double-click: `START-FULL-APP.bat`**

This will:
1. Install backend dependencies (if needed)
2. Start backend server (port 8787)
3. Start frontend server (port 5173)
4. Open your browser

---

## Manual Start (If needed)

### Step 1: Start Backend
```bash
cd backend
npm install
node server.js
```

Backend should show:
```
[backend] listening on :8787
[backend] Speech provider: assemblyai
[backend] Speech API configured: true
```

### Step 2: Start Frontend (in new terminal)
```bash
npm run dev
```

---

## Test Backend is Working

**Open: `TEST-BACKEND-WORKING.html`** in your browser

This will:
- ✅ Check if backend is running
- 🎤 Test microphone recording
- 📤 Test transcription API

---

## Troubleshooting

### ❌ "Backend not running"
**Solution:** Run `START-BACKEND.bat` or `cd backend && node server.js`

### ❌ "Microphone permission denied"
**Solution:** 
1. Click lock icon in address bar
2. Allow microphone access
3. Refresh page

### ❌ "No speech detected"
**Solution:**
- Speak louder and longer (3-5 seconds minimum)
- Check Windows microphone settings
- Make sure mic is not muted

### ❌ Backend errors
**Solution:**
```bash
cd backend
npm install
node server.js
```

---

## How It Works

1. **Frontend** (React) - Records audio from microphone
2. **Backend** (Express) - Receives audio file
3. **AssemblyAI** - Transcribes audio to text
4. **Frontend** - Displays transcription

---

## API Keys

Your `.env` files are already configured:
- ✅ Gemini API Key
- ✅ AssemblyAI API Key ($50 free credit)

---

## Browser Support

Works on all browsers when using backend:
- ✅ Chrome
- ✅ Firefox  
- ✅ Edge
- ✅ Safari
- ✅ Opera

---

## Need Help?

1. Run `TEST-BACKEND-WORKING.html`
2. Check browser console (F12)
3. Check backend terminal for errors
