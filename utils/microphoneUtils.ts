/**
 * Microphone Utilities for Cross-Browser Compatibility
 */

export interface MicrophoneCapabilities {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasSpeechRecognition: boolean;
  hasMediaRecorder: boolean;
  supportedMimeTypes: string[];
  recommendedMimeType: string | null;
}

/**
 * Check browser capabilities for microphone features
 */
export async function checkMicrophoneCapabilities(): Promise<MicrophoneCapabilities> {
  const capabilities: MicrophoneCapabilities = {
    hasMediaDevices: false,
    hasGetUserMedia: false,
    hasSpeechRecognition: false,
    hasMediaRecorder: false,
    supportedMimeTypes: [],
    recommendedMimeType: null,
  };

  // Check MediaDevices API
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    capabilities.hasMediaDevices = true;
    
    if (navigator.mediaDevices.getUserMedia) {
      capabilities.hasGetUserMedia = true;
    }
  }

  // Check Speech Recognition API
  if (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  ) {
    capabilities.hasSpeechRecognition = true;
  }

  // Check MediaRecorder API
  if (typeof window !== 'undefined' && 'MediaRecorder' in window) {
    capabilities.hasMediaRecorder = true;

    // Test supported MIME types
    const typesToTest = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ];

    for (const type of typesToTest) {
      if (MediaRecorder.isTypeSupported(type)) {
        capabilities.supportedMimeTypes.push(type);
      }
    }

    capabilities.recommendedMimeType = capabilities.supportedMimeTypes[0] || null;
  }

  return capabilities;
}

/**
 * Request microphone permission with proper error handling
 */
export async function requestMicrophonePermission(): Promise<{
  success: boolean;
  stream?: MediaStream;
  error?: string;
}> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        success: false,
        error: 'MediaDevices API not supported. Please use a modern browser (Chrome, Edge, Firefox, Safari).',
      };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    return {
      success: true,
      stream,
    };
  } catch (error: any) {
    let errorMessage = 'Failed to access microphone';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage = 'Microphone access denied. Please allow microphone permissions in your browser settings.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage = 'No microphone found. Please connect a microphone and try again.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMessage = 'Microphone is already in use by another application.';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = 'No microphone meets the required constraints.';
    } else if (error.name === 'SecurityError') {
      errorMessage = 'Microphone access blocked by security policy. Please use HTTPS or localhost.';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get best supported MIME type for recording
 */
export function getBestMimeType(): string | null {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
    return null;
  }

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return null;
}

/**
 * Test microphone by recording a short sample
 */
export async function testMicrophone(): Promise<{
  success: boolean;
  audioLevel?: number;
  error?: string;
}> {
  try {
    const permissionResult = await requestMicrophonePermission();
    
    if (!permissionResult.success || !permissionResult.stream) {
      return {
        success: false,
        error: permissionResult.error,
      };
    }

    const stream = permissionResult.stream;

    // Test audio level
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      stream.getTracks().forEach(track => track.stop());
      return {
        success: false,
        error: 'AudioContext not supported',
      };
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    analyser.fftSize = 256;
    microphone.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Wait a bit and check audio level
    await new Promise(resolve => setTimeout(resolve, 100));
    
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    // Cleanup
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();

    return {
      success: true,
      audioLevel: Math.round(average),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Microphone test failed',
    };
  }
}

/**
 * Get user-friendly browser name
 */
export function getBrowserInfo(): {
  name: string;
  version: string;
  isSupported: boolean;
} {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = 'Unknown';
  let isSupported = false;

  if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
    name = 'Chrome';
    isSupported = true;
  } else if (ua.indexOf('Edg') > -1) {
    name = 'Edge';
    isSupported = true;
  } else if (ua.indexOf('Firefox') > -1) {
    name = 'Firefox';
    isSupported = true;
  } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
    name = 'Safari';
    isSupported = true;
  }

  // Extract version
  const match = ua.match(new RegExp(name + '/([0-9.]+)'));
  if (match) {
    version = match[1];
  }

  return { name, version, isSupported };
}
