import * as SpeechToText from '@dbkable/react-native-speech-to-text';

let voicePromise: Promise<VoiceCaptureResult> | null = null;

export interface VoiceCaptureResult {
  supported: boolean;
  transcript: string;
  error: string | null;
}

export function resetVoicePromise() {
  voicePromise = null;
}

export function isVoiceSupported() {
  return true;
}

export async function captureVoiceText(
  options: {
    locale?: string;
    timeoutMs?: number;
    onTranscript?: (text: string) => void;
  } = {},
): Promise<VoiceCaptureResult> {
  if (voicePromise) {
    return voicePromise;
  }

  const {
    locale = 'en-IN',
    timeoutMs = 15000,
    onTranscript,
  } = options;

  voicePromise = new Promise(async resolve => {
    let transcript = '';
    let finished = false;
    let recognitionStarted = false;
    let receivedResults = false;

    let resultListener: any;
    let errorListener: any;
    let endListener: any;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      try {
        resultListener?.remove?.();
        errorListener?.remove?.();
        endListener?.remove?.();
      } catch {}
    };

    const finish = async (
      text: string,
      error: string | null = null,
    ) => {
      if (finished) {
        return;
      }

      finished = true;

      clearTimeout(timeoutId);

      cleanup();

      try {
        await SpeechToText.stop();
      } catch {}

      voicePromise = null;

      resolve({
        supported: true,
        transcript: text,
        error,
      });
    };

    try {
      console.log('[SpeechToText] Checking availability...');

      const available = await SpeechToText.isAvailable();
      console.log('SpeechToText =', SpeechToText);
console.log('start =', SpeechToText.start);
console.log('stop =', SpeechToText.stop);
console.log('isAvailable =', SpeechToText.isAvailable);

      console.log('[SpeechToText] Available:', available);

      if (!available) {
        voicePromise = null;

        resolve({
          supported: false,
          transcript: '',
          error: 'Speech recognition not available',
        });

        return;
      }

      const granted =
        await SpeechToText.requestPermissions();

      console.log('[SpeechToText] Permission:', granted);

      if (!granted) {
        voicePromise = null;

        resolve({
          supported: true,
          transcript: '',
          error: 'Microphone permission denied',
        });

        return;
      }

      // Stop old session BEFORE registering listeners
      try {
        await SpeechToText.stop();
      } catch {}

      console.log('[SpeechToText] Registering listeners');

      resultListener =
        SpeechToText.addSpeechResultListener(result => {
          console.log(
            '[SpeechToText] RESULT:',
            JSON.stringify(result),
          );

          receivedResults = true;

          if (
            result?.transcript &&
            result.transcript.trim().length > 0
          ) {
            transcript = result.transcript;

            onTranscript?.(transcript);

            if (result.isFinal) {
              finish(transcript, null);
            }
          }
        });

      errorListener =
        SpeechToText.addSpeechErrorListener(error => {
          console.log(
            '[SpeechToText] ERROR:',
            JSON.stringify(error),
          );

          finish(
            transcript,
            error?.message ||
              'Speech recognition failed',
          );
        });

      endListener =
        SpeechToText.addSpeechEndListener(() => {
          console.log('[SpeechToText] END EVENT');

          // Ignore old END events before recognition starts
          if (!recognitionStarted) {
            console.log(
              '[SpeechToText] Ignoring stale END event',
            );
            return;
          }

          setTimeout(() => {
            if (!finished) {
              finish(
                transcript,
                transcript
                  ? null
                  : 'No speech detected',
              );
            }
          }, 3000);
        });

      timeoutId = setTimeout(() => {
        console.log('[SpeechToText] TIMEOUT');

        finish(
          transcript,
          transcript
            ? null
            : 'Listening timeout - no speech detected',
        );
      }, timeoutMs);

      console.log('[SpeechToText] Starting Recognition...');

      await SpeechToText.start({
        language: 'en-US',
      });

      recognitionStarted = true;

      console.log(
        '[SpeechToText] Recognition Started',
      );
    } catch (error: any) {
      console.log(
        '[SpeechToText] FATAL ERROR:',
        error,
      );

      cleanup();

      voicePromise = null;

      resolve({
        supported: false,
        transcript: '',
        error:
          error?.message ||
          'Failed to start speech recognition',
      });
    }
  });

  return voicePromise;
}