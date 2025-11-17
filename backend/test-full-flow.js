import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

console.log('🧪 Testing Full Speech Recognition Flow\n');

// Test 1: Check if backend is running
async function testBackendRunning() {
  console.log('1️⃣ Testing if backend is running...');
  try {
    const res = await fetch('http://localhost:8787/api/health');
    if (res.ok) {
      console.log('✅ Backend is running on port 8787\n');
      return true;
    }
  } catch (err) {
    console.log('❌ Backend is NOT running');
    console.log('   Run: cd backend && node server.js\n');
    return false;
  }
}

// Test 2: Check speech config
async function testSpeechConfig() {
  console.log('2️⃣ Testing speech configuration...');
  try {
    const res = await fetch('http://localhost:8787/api/speech/config');
    const data = await res.json();
    console.log('   Provider:', data.currentProvider);
    console.log('   Has API Key:', data.hasApiKey);
    console.log('   Is Configured:', data.isConfigured);
    
    if (data.isConfigured) {
      console.log('✅ Speech service is configured\n');
      return true;
    } else {
      console.log('❌ Speech service NOT configured\n');
      return false;
    }
  } catch (err) {
    console.log('❌ Failed to check config:', err.message, '\n');
    return false;
  }
}

// Test 3: Test with dummy audio
async function testTranscription() {
  console.log('3️⃣ Testing transcription endpoint...');
  try {
    // Create a minimal WAV file (silence)
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00, // File size
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6D, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk size
      0x01, 0x00, 0x01, 0x00, // Audio format, channels
      0x44, 0xAC, 0x00, 0x00, // Sample rate (44100)
      0x88, 0x58, 0x01, 0x00, // Byte rate
      0x02, 0x00, 0x10, 0x00, // Block align, bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x00, 0x00, 0x00  // Data size
    ]);
    
    const form = new FormData();
    form.append('audio', wavHeader, {
      filename: 'test.wav',
      contentType: 'audio/wav'
    });
    
    const res = await fetch('http://localhost:8787/api/speech/transcribe', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const data = await res.json();
    console.log('   Status:', res.status);
    console.log('   Response:', JSON.stringify(data, null, 2));
    
    if (res.ok) {
      console.log('✅ Transcription endpoint is working\n');
      return true;
    } else {
      console.log('❌ Transcription failed:', data.message || data.error, '\n');
      return false;
    }
  } catch (err) {
    console.log('❌ Transcription test failed:', err.message, '\n');
    return false;
  }
}

// Run all tests
async function runTests() {
  const backendRunning = await testBackendRunning();
  if (!backendRunning) {
    console.log('⚠️ Start backend first: cd backend && node server.js');
    return;
  }
  
  const configOk = await testSpeechConfig();
  if (!configOk) {
    console.log('⚠️ Check backend/.env file has SPEECH_API_KEY and SPEECH_PROVIDER');
    return;
  }
  
  await testTranscription();
  
  console.log('✅ All tests complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Make sure backend is running: cd backend && node server.js');
  console.log('   2. Start frontend: npm run dev');
  console.log('   3. Click mic button and speak');
  console.log('   4. Check browser console for logs');
}

runTests();
