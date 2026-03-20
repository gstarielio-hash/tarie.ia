import {
  AI_MODEL_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  TEMPERATURE_STEPS,
} from "../InspectorMobileApp.constants";
import {
  SettingsPressRow,
  SettingsScaleRow,
  SettingsSection,
  SettingsSegmentedRow,
  SettingsSwitchRow,
} from "./SettingsPrimitives";

type ModeloIa = (typeof AI_MODEL_OPTIONS)[number];
type EstiloResposta = (typeof RESPONSE_STYLE_OPTIONS)[number];
type IdiomaResposta = (typeof RESPONSE_LANGUAGE_OPTIONS)[number];
type TomConversa = (typeof CONVERSATION_TONE_OPTIONS)[number];

interface SettingsExperienceAiSectionProps {
  modeloIa: ModeloIa;
  estiloResposta: EstiloResposta;
  idiomaResposta: IdiomaResposta;
  memoriaIa: boolean;
  aprendizadoIa: boolean;
  tomConversa: TomConversa;
  temperaturaIa: number;
  onAbrirMenuModeloIa: () => void;
  onSetEstiloResposta: (value: EstiloResposta) => void;
  onSetIdiomaResposta: (value: IdiomaResposta) => void;
  onSetMemoriaIa: (value: boolean) => void;
  onSetAprendizadoIa: (value: boolean) => void;
  onSetTomConversa: (value: TomConversa) => void;
  onSetTemperaturaIa: (value: number) => void;
}

function nextOptionValue<T extends string>(
  current: T,
  options: readonly T[],
): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

export function SettingsExperienceAiSection({
  modeloIa,
  estiloResposta,
  idiomaResposta,
  memoriaIa,
  aprendizadoIa,
  tomConversa,
  temperaturaIa,
  onAbrirMenuModeloIa,
  onSetEstiloResposta,
  onSetIdiomaResposta,
  onSetMemoriaIa,
  onSetAprendizadoIa,
  onSetTomConversa,
  onSetTemperaturaIa,
}: SettingsExperienceAiSectionProps) {
  return (
    <SettingsSection
      icon="robot-outline"
      subtitle="Ajuste o comportamento da inteligência artificial nas conversas."
      title="Preferências da IA"
    >
      <SettingsPressRow
        icon="brain"
        onPress={onAbrirMenuModeloIa}
        testID="settings-ai-model-row"
        title="Modelo de IA"
        value={modeloIa}
      />
      <SettingsPressRow
        icon="message-text-outline"
        onPress={() =>
          onSetEstiloResposta(
            nextOptionValue(estiloResposta, RESPONSE_STYLE_OPTIONS),
          )
        }
        title="Estilo de resposta"
        value={estiloResposta}
      />
      <SettingsPressRow
        icon="translate"
        onPress={() =>
          onSetIdiomaResposta(
            nextOptionValue(idiomaResposta, RESPONSE_LANGUAGE_OPTIONS),
          )
        }
        title="Idioma da resposta"
        value={idiomaResposta}
      />
      <SettingsSwitchRow
        description="Permite lembrar preferências entre conversas."
        icon="memory"
        onValueChange={onSetMemoriaIa}
        title="Memória da IA"
        value={memoriaIa}
      />
      <SettingsSwitchRow
        description="Consentimento para melhoria contínua do modelo."
        icon="school-outline"
        onValueChange={onSetAprendizadoIa}
        title="Permitir aprendizado da IA"
        value={aprendizadoIa}
      />
      <SettingsSegmentedRow
        description="Tom principal do assistente durante a conversa."
        icon="account-voice"
        onChange={onSetTomConversa}
        options={CONVERSATION_TONE_OPTIONS}
        title="Tom da conversa"
        value={tomConversa}
      />
      <SettingsScaleRow
        description="Mais baixo para precisão, mais alto para criatividade."
        icon="tune-variant"
        maxLabel="Criativa"
        minLabel="Precisa"
        onChange={onSetTemperaturaIa}
        title="Temperatura da resposta"
        value={temperaturaIa}
        values={TEMPERATURE_STEPS}
      />
    </SettingsSection>
  );
}
