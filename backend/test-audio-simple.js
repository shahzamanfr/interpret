import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.SPEECH_API_KEY;

console.log('🧪 Testing AssemblyAI with sample audio...');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT FOUND');

async function testTranscription() {
  try {
    // Create a simple test audio buffer (silence)
    const testAudio = Buffer.alloc(44100); // 1 second of silence at 44.1kHz
    
    console.log('\n📤 Step 1: Upload audio...');
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'authorization': API_KEY,
      },
      body: testAudio,
    });
    
    console.log('Upload status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.log('❌ Upload failed:', error);
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload URL:', uploadResult.upload_url);
    
    console.log('\n📝 Step 2: Request transcription...');
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: uploadResult.upload_url,
        language_code: 'en',
      }),
    });
    
    console.log('Transcript request status:', transcriptResponse.status);
    
    if (!transcriptResponse.ok) {
      const error = await transcriptResponse.text();
      console.log('❌ Transcript request failed:', error);
      return;
    }
    
    const transcriptResult = await transcriptResponse.json();
    console.log('✅ Transcript ID:', transcriptResult.id);
    
    console.log('\n⏳ Step 3: Polling for result...');
    let attempts = 0;
    while (attempts < 30) {
      const pollingResponse = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptResult.id}`,
        { headers: { 'authorization': API_KEY } }
      );
      
      const transcript = await pollingResponse.json();
      console.log(`Status: ${transcript.status}`);
      
      if (transcript.status === 'completed') {
        console.log('\n✅ SUCCESS!');
        console.log('Text:', transcript.text || '(empty - expected for silence)');
        console.log('Confidence:', transcript.confidence);
        return;
      } else if (transcript.status === 'error') {
        console.log('\n❌ Transcription error:', transcript.error);
        return;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n⚠️ Timeout');
  } catch (error) {
    console.log('\n❌ Error:', error.message);
  }
}

testTranscription();
