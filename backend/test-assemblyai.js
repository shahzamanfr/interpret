import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.SPEECH_API_KEY;

console.log('🧪 Testing AssemblyAI API Key...');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT FOUND');

async function testAPI() {
  try {
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'GET',
      headers: {
        'authorization': API_KEY,
      }
    });
    
    console.log('Status:', response.status);
    
    if (response.status === 200 || response.status === 404) {
      console.log('✅ API Key is VALID');
      console.log('✅ AssemblyAI connection working');
      return true;
    } else if (response.status === 401) {
      console.log('❌ API Key is INVALID');
      return false;
    } else {
      console.log('⚠️ Unexpected status:', response.status);
      const text = await response.text();
      console.log('Response:', text);
      return false;
    }
  } catch (error) {
    console.log('❌ Connection error:', error.message);
    return false;
  }
}

testAPI();
