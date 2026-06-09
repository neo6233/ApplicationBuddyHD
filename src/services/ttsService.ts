import Tts from 'react-native-tts';

let initPromise: Promise<void> | null = null;
let voiceConfigPromise: Promise<void> | null = null;

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

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

const selectIndianAccentVoice = async (): Promise<void> => {
  if (voiceConfigPromise) {
    return voiceConfigPromise;
  }

  voiceConfigPromise = (async () => {
    try {
      const voices = (await (Tts as any).voices?.()) || [];
      const preferredVoice = voices.find((voice: any) => {
        const name = normalizeText(String(voice?.name || ''));
        const language = normalizeText(String(voice?.language || ''));
        return (
          language === 'en-in' ||
          language.startsWith('en-in') ||
          name.includes('india') ||
          name.includes('indian') ||
          name.includes('en-in')
        );
      });

      if (preferredVoice?.id && typeof Tts.setDefaultVoice === 'function') {
        Tts.setDefaultVoice(preferredVoice.id);
      } else {
        Tts.setDefaultLanguage('en-IN');
      }

      Tts.setDefaultRate(0.45);
      Tts.setDefaultPitch(1.0);
    } catch {
      Tts.setDefaultLanguage('en-IN');
      Tts.setDefaultRate(0.45);
      Tts.setDefaultPitch(1.0);
    }
  })();

  return voiceConfigPromise;
};

export async function speak(text: string): Promise<void> {
  if (!text || typeof text !== 'string') return;

  try {
    await ensureTtsReady();
    await selectIndianAccentVoice();
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
