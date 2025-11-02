# 🎤 How to Test Your Microphone

## Quick Start (2 minutes)

### Option 1: Standalone Test Page (Recommended)
1. Open `TEST-MICROPHONE.html` in Chrome or Edge browser
2. Click "Start Recording" button
3. **Speak clearly into your microphone**
4. Watch your words appear in the transcript box
5. Click "Stop Recording" when done

### Option 2: In Your App
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open the app in your browser
3. Look for the **blue microphone button** (🎙️) in the input area
4. Click the microphone button
5. **Allow microphone permissions** when prompted
6. Speak into your microphone
7. Your words should appear in the input field
8. Click the red stop button when finished

## Expected Behavior

### ✅ Working Correctly
- Microphone button appears (blue circle with mic icon)
- Clicking button prompts for permission (first time)
- Button turns red and pulses while listening
- Spoken words appear as text in real-time
- Text stays in the input field after stopping

### ❌ Not Working
- No microphone button appears
- Browser shows "not supported" message
- Permission denied error
- No text appears when speaking
- Error messages in console

## Troubleshooting

### Problem: "Microphone access denied"
**Solution:**
1. Click the lock icon 🔒 in the browser address bar
2. Find "Microphone" permission
3. Change to "Allow"
4. Refresh the page

### Problem: "Speech recognition not supported"
**Solution:**
- Switch to **Google Chrome** or **Microsoft Edge**
- Update your browser to the latest version
- Don't use Firefox (limited support)

### Problem: No text appears when speaking
**Solution:**
1. Check your microphone is connected and working
2. Test in System Settings → Sound → Input
3. Speak louder and more clearly
4. Move closer to the microphone
5. Reduce background noise

### Problem: Button doesn't respond
**Solution:**
1. Check browser console for errors (F12)
2. Refresh the page
3. Clear browser cache
4. Try incognito/private mode

## System Requirements

### Browsers (Required)
- ✅ Google Chrome (v25+)
- ✅ Microsoft Edge (v79+)
- ✅ Safari (v14.1+)
- ⚠️ Firefox (limited support)
- ❌ Internet Explorer (not supported)

### Hardware
- 🎤 Working microphone (built-in or external)
- 🔊 System audio input enabled
- 🌐 Internet connection (for speech API)

### Permissions
- Microphone access allowed in browser
- JavaScript enabled
- Not in private/incognito mode (some browsers restrict mic access)

## Testing Checklist

- [ ] Open test page or app
- [ ] Microphone button is visible
- [ ] Click microphone button
- [ ] Browser asks for permission (first time)
- [ ] Click "Allow" on permission prompt
- [ ] Button turns red and pulses
- [ ] Speak: "Testing one two three"
- [ ] Text appears in input field
- [ ] Click stop button
- [ ] Text remains in field
- [ ] Success! ✅

## Common Test Phrases

Try these phrases to test:
- "Hello, this is a test."
- "The quick brown fox jumps over the lazy dog."
- "Testing one two three four five."
- "This is my explanation of the image."

## What Was Fixed

The microphone now works because:
1. ✅ Fixed dependency issues in the speech recognition hook
2. ✅ Proper initialization (only once, not repeatedly)
3. ✅ Better error handling
4. ✅ Memoized callbacks prevent re-renders
5. ✅ Improved browser compatibility checks

## Still Having Issues?

1. **Check the console logs** (Press F12 → Console tab)
   - Look for errors marked with ❌
   - Green logs (✅) mean it's working

2. **Try the standalone test page first**
   - `TEST-MICROPHONE.html` shows detailed logs
   - Easier to debug than the full app

3. **Verify microphone works elsewhere**
   - Try recording in another app
   - Test on https://www.onlinemictest.com/

4. **Browser-specific issues**
   - Chrome: Check chrome://settings/content/microphone
   - Edge: Check edge://settings/content/microphone
   - Safari: Check Preferences → Websites → Microphone

## Success! 🎉

If you can see your spoken words appearing as text, **it's working!**

You can now:
- Use voice input in your app
- Dictate explanations instead of typing
- Save time and speak naturally
- Enjoy hands-free input

---

**Need Help?** Check `MICROPHONE-FIX.md` for technical details.