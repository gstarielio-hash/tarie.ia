import * as Speech from "expo-speech";

import type { AppSettings } from "../../settings";

export interface VoiceRuntimeState {
  voices: Speech.Voice[];
  ttsSupported: boolean;
  sttSupported: boolean;
}

export function mapSpeechLanguageToLocale(
  language: AppSettings["speech"]["voiceLanguage"],
): string | undefined {
  if (language === "Português") {
    return "pt-BR";
  }
  if (language === "Inglês") {
    return "en-US";
  }
  if (language === "Espanhol") {
    return "es-ES";
  }
  return undefined;
}

export async function loadVoiceRuntimeState(
  preferredLanguage: AppSettings["speech"]["voiceLanguage"],
): Promise<VoiceRuntimeState> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const locale = mapSpeechLanguageToLocale(preferredLanguage);
    const filteredVoices = locale
      ? voices.filter((voice) =>
          String(voice.language || "")
            .toLowerCase()
            .startsWith(locale.slice(0, 2).toLowerCase()),
        )
      : voices;
    return {
      voices: filteredVoices,
      ttsSupported: true,
      sttSupported: false,
    };
  } catch {
    return {
      voices: [],
      ttsSupported: false,
      sttSupported: false,
    };
  }
}

export async function stopSpeechPlayback(): Promise<void> {
  try {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
    }
  } catch {
    // Falha de TTS não deve quebrar o chat.
  }
}

export async function speakAssistantResponse(params: {
  text: string;
  speech: AppSettings["speech"];
}): Promise<void> {
  const text = String(params.text || "").trim();
  if (!text || !params.speech.enabled || !params.speech.autoReadResponses) {
    return;
  }

  const locale = mapSpeechLanguageToLocale(params.speech.voiceLanguage);
  const options: Speech.SpeechOptions = {
    language: locale,
    rate: params.speech.speechRate,
  };
  if (params.speech.voiceId) {
    options.voice = params.speech.voiceId;
  }

  await stopSpeechPlayback();
  Speech.speak(text, options);
}

export function buildVoiceInputUnavailableMessage(
  language: AppSettings["speech"]["voiceLanguage"],
): string {
  const idioma =
    language === "Sistema"
      ? "o idioma atual do sistema"
      : `o idioma ${language}`;
  return `Ditado nativo ainda depende de um módulo de STT nesta build. Use o teclado por voz do sistema com ${idioma}.`;
}
