# Speech Recognition Troubleshooting Guide

## Problem: AssemblyAI API working but no text recognized

### Quick Diagnosis

Run these commands in order:

```bash
# 1. Test API key
cd backend
node test-assemblyai.js

# 2. Test audio upload
node test-audio-simple.js

# 3. Start backend with logging
node server.js
```

### Common Issues & Fixes

#### Issue 1: Empty Transcripts (Most Common)

**Symptoms:**
- Backend returns `{ text: "", confidence: 0 }`
- Console shows "⚠️ Empty transcript"

**Causes:**
1. **Audio too quiet** - Microphone volume too low
2. **Wrong audio format** - Browser encoding not compatible
3. **Audio too short** - Less than 2 seconds of speech
4. **Background noise** - AssemblyAI filters out non-speech

**Solutions:**

```bash
# Windows: Check microphone settings
1. Right-click speaker icon → Sounds
2. Recording tab → Select microphone
3. Properties → Levels → Set to 80-100%
4. Advanced → Uncheck "Allow applications to take exclusive control"
```

**Test in browser console:**
```javascript
// Check if mic is working
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a,b) => a+b) / dataArray.length;
      console.log('Mic level:', avg); // Should be > 10 when speaking
    }, 100);
  });
```

#### Issue 2: Audio Format Problems

**Symptoms:**
- Backend receives audio but AssemblyAI returns error
- Console shows "Transcription failed"

**Fix:** Update browser audio format handling

The issue is that WebM/Opus format from browsers may not be properly decoded by AssemblyAI.

**Solution:** Add audio conversion in backend (already implemented with ffmpeg)

#### Issue 3: API Key Issues

**Symptoms:**
- 401 Unauthorized errors
- "API key not configured"

**Fix:**
```bash
# Check .env file
cat backend/.env | grep SPEECH_API_KEY

# Should show:
# SPEECH_API_KEY=055275ef9fb9495e82c6fcd5538a77ea

# If missing, add it:
echo "SPEECH_API_KEY=055275ef9fb9495e82c6fcd5538a77ea" >> backend/.env
```

#### Issue 4: CORS Errors

**Symptoms:**
- "CORS policy" errors in browser console
- Network requests blocked

**Fix:** Backend already configured, but verify:
```javascript
// In backend/server.js
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Testing Workflow

1. **Test microphone in Windows:**
   - Settings → System → Sound → Input
   - Speak and watch the blue bar move
   - Should reach 50%+ when speaking normally

2. **Test in browser:**
   - Open DevTools (F12)
   - Console tab
   - Record audio and watch logs
   - Should see: "✅ Mic granted" → "📤 Audio: XXXX bytes"

3. **Test backend:**
   - Backend console should show:
   ```
   📥 Audio received: XXXX bytes, audio/webm
   📤 AssemblyAI upload: XXXX bytes
   ✅ Uploaded: https://...
   ⏳ Polling transcript: ...
   📊 Status: processing
   📊 Status: completed
   ✅ Transcript: your text here
   ```

### Debug Checklist

- [ ] Microphone permissions granted in browser
- [ ] Microphone volume at 80%+ in Windows
- [ ] Backend running on port 8787
- [ ] SPEECH_API_KEY set in backend/.env
- [ ] Speaking clearly for 3+ seconds
- [ ] Audio blob size > 1000 bytes
- [ ] No other apps using microphone

### Advanced Debugging

**Enable verbose logging:**

In `useCustomSpeechRecognition.ts`, the logging is already comprehensive. Watch for:

```
🎤 Starting...
✅ Mic granted
✅ MIME: audio/webm;codecs=opus
Chunk: 1234 bytes
Chunk: 1234 bytes
📤 Recording duration: 3.5 seconds
📤 Audio: 12345 bytes, 3.5 s, chunks: 3
🚀 Sending...
📥 200 : { success: true, text: "...", ... }
✅ your transcribed text
```

**If stuck at "Transcribing...":**
- Check backend console for errors
- Verify AssemblyAI API quota (https://www.assemblyai.com/app)
- Try shorter recording (3-5 seconds)

**If "No speech detected":**
- Speak LOUDER and CLEARER
- Move closer to microphone
- Reduce background noise
- Try different microphone

### Still Not Working?

1. **Switch to Gemini (free alternative):**
   ```bash
   # In backend/.env
   SPEECH_PROVIDER=gemini
   # Uses existing GEMINI_API_KEY
   ```

2. **Use browser speech recognition:**
   ```bash
   # In backend/.env
   SPEECH_PROVIDER=browser
   # No backend needed, works in Chrome/Edge
   ```

3. **Check AssemblyAI status:**
   - Visit: https://status.assemblyai.com/
   - Verify API is operational

### Contact Support

If none of these work:
1. Run `node backend/test-audio-simple.js`
2. Copy the full output
3. Check browser console for errors
4. Share logs for debugging
