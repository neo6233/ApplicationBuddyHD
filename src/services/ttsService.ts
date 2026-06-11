import Tts from 'react-native-tts';

let initPromise: Promise<void> | null = null;
let voiceConfigPromise: Promise<void> | null = null;

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const containsDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

const detectPreferredLanguage = (text: string, override?: 'hi' | 'en'): 'hi' | 'en' => {
  if (override) return override;
  
  // If text contains Devanagari script, it's definitely Hindi
  if (containsDevanagari(text)) return 'hi';
  
  return 'en';
};

const ensureTtsReady = async (): Promise<void> => {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await Tts.getInitStatus();
    } catch {
      // Some builds do not reject but still initialize lazily.
    }
  })();

  return initPromise;
};

const selectIndianAccentVoice = async (language: 'hi' | 'en'): Promise<void> => {
  if (voiceConfigPromise) {
    return voiceConfigPromise;
  }

  voiceConfigPromise = (async () => {
    try {
      const voices = (await (Tts as any).voices?.()) || [];
      const targetLanguage = language === 'hi' ? 'hi-in' : 'en-in';
      const preferredVoice = voices.find((voice: any) => {
        const name = normalizeText(String(voice?.name || ''));
        const voiceLang = normalizeText(String(voice?.language || ''));
        return (
          voiceLang === targetLanguage ||
          voiceLang.startsWith(targetLanguage) ||
          name.includes('india') ||
          name.includes('indian') ||
          (targetLanguage === 'hi-in' && (name.includes('hindi') || name.includes('bharat')) ) ||
          name.includes('en-in')
        );
      });

      if (preferredVoice?.id && typeof Tts.setDefaultVoice === 'function') {
        Tts.setDefaultVoice(preferredVoice.id);
      } else {
        Tts.setDefaultLanguage(language === 'hi' ? 'hi-IN' : 'en-IN');
      }

      Tts.setDefaultRate(0.45);
      Tts.setDefaultPitch(1.0);
    } catch {
      Tts.setDefaultLanguage(language === 'hi' ? 'hi-IN' : 'en-IN');
      Tts.setDefaultRate(0.45);
      Tts.setDefaultPitch(1.0);
    }
  })();

  return voiceConfigPromise;
};

export async function speak(text: string, language?: 'hi' | 'en'): Promise<void> {
  if (!text || typeof text !== 'string') return;

  try {
    await ensureTtsReady();
    const preferredLanguage = detectPreferredLanguage(text, language);
    
    // Reset voice config cache when language changes to ensure proper voice selection
    voiceConfigPromise = null;
    
    await selectIndianAccentVoice(preferredLanguage);
    await Tts.stop();
    await new Promise(resolve => setTimeout(resolve, 120));
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
