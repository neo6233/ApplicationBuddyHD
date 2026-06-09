import Tts from 'react-native-tts';

export async function speak(text: string): Promise<void> {
  if (!text || typeof text !== 'string') return;

  try {
    Tts.setDefaultLanguage('en-US');
    Tts.setDefaultRate(0.5);
    Tts.setDefaultPitch(1.0);
    await Tts.speak(text);
  } catch (error) {
    console.warn('[TTS] Failed to speak:', error);
  }
}

export async function stopSpeaking(): Promise<void> {
  try {
    await Tts.stop();
  } catch {
    // ignore
  }
}
