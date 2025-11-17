# 🎤 Microphone Debugging Guide

## Current Setup
- **Backend**: Express server on port 8787
- **Speech Provider**: AssemblyAI
- **API Key**: Configured and valid ✅

## Step-by-Step Testing

### 1. Start Backend Server
```bash
cd backend
node server.js
```

You should see:
```
[backend] listening on :8787
[backend] Speech provider: assemblyai
[backend] Speech API configured: true
```

### 2. Test Backend Directly
Open `TEST-MIC-BACKEND.html` in your browser:
1. Click "Start Recording"
2. Allow microphone permission
3. Speak for 3-5 seconds
4. Click "Stop Recording"
5. Watch the logs

### 3. Check Browser Console
Open DevTools (F12) and look for:
- `🎤 Starting...` - Hook is called
- `✅ Mic granted` - Permission granted
- `🎙️ Recording with: audio/xxx` - Format detected
- `📤 Sending to AssemblyAI...` - Upload started
- `✅ Transcript: ...` - Success!

### 4. Check Backend Console
Look for:
- `📥 Received audio: { size: xxx, mimetype: 'audio/xxx' }`
- `🚀 Uploading to AssemblyAI, size: xxx bytes`
- `📥 Upload response status: 200`
- `✅ Upload successful`

## Common Issues

### Issue 1: Backend Not Running
**Symptom**: `ERR_CONNECTION_REFUSED` in browser console
**Fix**: Start backend with `cd backend && node server.js`

### Issue 2: Microphone Permission Denied
**Symptom**: `Mic denied` error
**Fix**: 
- Click the lock icon in browser address bar
- Allow microphone access
- Refresh page

### Issue 3: Audio Format Not Supported
**Symptom**: `Upload failed: Unprocessable Entity`
**Fix**: Already handled - code tries multiple formats

### Issue 4: Audio File Too Small
**Symptom**: `File too small` error
**Fix**: Speak for at least 2-3 seconds

### Issue 5: CORS Error
**Symptom**: `CORS policy` error in console
**Fix**: Backend already has CORS enabled for localhost:5173

## Audio Format Priority
The code tries these formats in order:
1. `audio/wav` (best for AssemblyAI)
2. `audio/mp4` (good compatibility)
3. `audio/webm;codecs=opus` (Chrome/Edge)
4. `audio/webm` (fallback)

## Files Modified
- `hooks/useCustomSpeechRecognition.ts` - Records audio, sends to backend
- `backend/server.js` - Receives audio, sends to AssemblyAI
- `backend/.env` - Contains SPEECH_API_KEY

## Next Steps
1. Run `TEST-MIC-BACKEND.html` to isolate the issue
2. Check both browser and backend console logs
3. Verify audio is being recorded (check file size in logs)
4. Confirm backend receives the audio
5. Check AssemblyAI upload response
