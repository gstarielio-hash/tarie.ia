import { requestDevicePermission } from "../system/permissions";

interface VoiceOption {
  identifier?: string;
}

interface UseVoiceInputControllerParams {
  entradaPorVoz: boolean;
  microfonePermitido: boolean;
  preferredVoiceId: string;
  speechEnabled: boolean;
  voiceInputUnavailableMessage: string;
  voiceRuntimeSupported: boolean;
  voices: VoiceOption[];
  onOpenSystemSettings: () => void;
  onSetMicrofonePermitido: (value: boolean) => void;
  onSetPreferredVoiceId: (value: string) => void;
  onShowAlert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }>,
  ) => void;
}

export function useVoiceInputController({
  entradaPorVoz,
  microfonePermitido,
  preferredVoiceId,
  speechEnabled,
  voiceInputUnavailableMessage,
  voiceRuntimeSupported,
  voices,
  onOpenSystemSettings,
  onSetMicrofonePermitido,
  onSetPreferredVoiceId,
  onShowAlert,
}: UseVoiceInputControllerParams) {
  function handleAbrirAjudaDitado() {
    onShowAlert("Ditado no composer", voiceInputUnavailableMessage, [
      { text: "Fechar", style: "cancel" },
      {
        text: "Abrir ajustes",
        onPress: onOpenSystemSettings,
      },
    ]);
  }

  function onCyclePreferredVoice() {
    if (!voices.length) {
      return;
    }

    const currentIndex = voices.findIndex(
      (voice) => voice.identifier === preferredVoiceId,
    );
    const nextVoice =
      voices[(currentIndex + 1 + voices.length) % voices.length] || voices[0];
    onSetPreferredVoiceId(nextVoice?.identifier || "");
  }

  async function handleVoiceInputPress() {
    if (!speechEnabled || !entradaPorVoz) {
      onShowAlert(
        "Entrada por voz desativada",
        "Ative a fala e a transcrição automática nas configurações.",
      );
      return;
    }

    const permitido =
      microfonePermitido || (await requestDevicePermission("microphone"));
    onSetMicrofonePermitido(permitido);
    if (!permitido) {
      onShowAlert(
        "Microfone bloqueado",
        "Conceda acesso ao microfone para usar recursos de voz.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: onOpenSystemSettings,
          },
        ],
      );
      return;
    }

    if (!voiceRuntimeSupported) {
      handleAbrirAjudaDitado();
    }
  }

  return {
    handleAbrirAjudaDitado,
    handleVoiceInputPress,
    onCyclePreferredVoice,
  };
}
