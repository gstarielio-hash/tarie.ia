import {
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  REGION_OPTIONS,
  SPEECH_LANGUAGE_OPTIONS,
} from "../InspectorMobileApp.constants";
import {
  SettingsPressRow,
  SettingsScaleRow,
  SettingsSection,
  SettingsSwitchRow,
} from "./SettingsPrimitives";

type IdiomaApp = (typeof APP_LANGUAGE_OPTIONS)[number];
type RegiaoApp = (typeof REGION_OPTIONS)[number];
type UsoBateria = (typeof BATTERY_OPTIONS)[number];
type SpeechLanguage = (typeof SPEECH_LANGUAGE_OPTIONS)[number];

interface SettingsAdvancedResourcesSectionProps {
  speechEnabled: boolean;
  entradaPorVoz: boolean;
  respostaPorVoz: boolean;
  microfonePermitido: boolean;
  voiceLanguage: SpeechLanguage;
  speechRate: number;
  preferredVoiceLabel: string;
  sttSupported: boolean;
  ttsSupported: boolean;
  onToggleSpeechEnabled: (value: boolean) => void;
  onToggleEntradaPorVoz: (value: boolean) => void;
  onToggleRespostaPorVoz: (value: boolean) => void;
  onSetVoiceLanguage: (value: SpeechLanguage) => void;
  onSetSpeechRate: (value: number) => void;
  onCyclePreferredVoice: () => void;
  onAbrirAjudaDitado: () => void;
  onAbrirAjustesDoSistema: () => void;
}

interface SettingsSystemSectionProps {
  idiomaApp: IdiomaApp;
  regiaoApp: RegiaoApp;
  economiaDados: boolean;
  usoBateria: UsoBateria;
  resumoPermissoes: string;
  appBuildChannel: string;
  appVersionLabel: string;
  ultimaVerificacaoAtualizacaoLabel: string;
  resumoCentralAtividade: string;
  resumoFilaOffline: string;
  resumoCache: string;
  verificandoAtualizacoes: boolean;
  sincronizandoDados: boolean;
  onSetIdiomaApp: (value: IdiomaApp) => void;
  onSetRegiaoApp: (value: RegiaoApp) => void;
  onSetEconomiaDados: (value: boolean) => void;
  onSetUsoBateria: (value: UsoBateria) => void;
  onPermissoes: () => void;
  onVerificarAtualizacoes: () => void;
  onFecharConfiguracoes: () => void;
  onAbrirCentralAtividade: () => void;
  onAbrirFilaOffline: () => void;
  onRefreshData: () => void | Promise<void>;
  onLimparCache: () => void;
}

interface SettingsSupportSectionProps {
  resumoSuporteApp: string;
  emailRetorno: string;
  supportChannelLabel: string;
  resumoFilaSuporteLocal: string;
  ultimoTicketSuporte: {
    kind: "bug" | "feedback";
    createdAtLabel: string;
  } | null;
  artigosAjudaCount: number;
  ticketsBugTotal: number;
  ticketsFeedbackTotal: number;
  filaSuporteCount: number;
  onCentralAjuda: () => void;
  onCanalSuporte?: () => void;
  onReportarProblema: () => void;
  onEnviarFeedback: () => void;
  onSobreApp: () => void;
  onExportarDiagnosticoApp: () => void | Promise<void>;
  onTermosUso: () => void;
  onPoliticaPrivacidade: () => void;
  onLicencas: () => void;
  onLimparFilaSuporteLocal: () => void;
}

function nextOptionValue<T extends string>(current: T, options: readonly T[]): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

export function SettingsAdvancedResourcesSection({
  speechEnabled,
  entradaPorVoz,
  respostaPorVoz,
  microfonePermitido,
  voiceLanguage,
  speechRate,
  preferredVoiceLabel,
  sttSupported,
  ttsSupported,
  onToggleSpeechEnabled,
  onToggleEntradaPorVoz,
  onToggleRespostaPorVoz,
  onSetVoiceLanguage,
  onSetSpeechRate,
  onCyclePreferredVoice,
  onAbrirAjudaDitado,
  onAbrirAjustesDoSistema,
}: SettingsAdvancedResourcesSectionProps) {
  return (
    <SettingsSection
      icon="microphone-message"
      subtitle="Preferências locais para transcrição e leitura assistida."
      testID="settings-section-recursos-avancados"
      title="Fala"
    >
      <SettingsSwitchRow
        description="Habilita o conjunto de preferências de fala neste dispositivo."
        icon="record-rec"
        onValueChange={onToggleSpeechEnabled}
        testID="settings-speech-enabled-row"
        title="Ativar fala"
        value={speechEnabled}
      />
      <SettingsSwitchRow
        description="Prepara o app para abrir fluxos de fala com transcrição quando houver suporte."
        icon="microphone-outline"
        onValueChange={onToggleEntradaPorVoz}
        testID="settings-advanced-voice-input-row"
        title="Transcrever automaticamente"
        value={entradaPorVoz}
      />
      <SettingsPressRow
        description="Idioma preferido para voz, leitura e fallback de ditado."
        icon="translate"
        onPress={() => onSetVoiceLanguage(nextOptionValue(voiceLanguage, SPEECH_LANGUAGE_OPTIONS))}
        title="Idioma de voz"
        value={voiceLanguage}
      />
      <SettingsScaleRow
        description="Afeta a velocidade real da síntese de voz."
        icon="speedometer"
        maxLabel="Rápida"
        minLabel="Lenta"
        onChange={onSetSpeechRate}
        title="Velocidade da fala"
        value={speechRate}
        values={[0.6, 0.8, 1, 1.2, 1.4]}
      />
      {ttsSupported ? (
        <SettingsPressRow
          description="Quando disponível no sistema, o app usa a voz escolhida na leitura automática."
          icon="account-voice"
          onPress={onCyclePreferredVoice}
          title="Voz preferida"
          value={preferredVoiceLabel}
        />
      ) : null}
      <SettingsSwitchRow
        description="Quando disponível no dispositivo, o app pode ler respostas em voz alta."
        icon="speaker-wireless"
        onValueChange={onToggleRespostaPorVoz}
        testID="settings-advanced-voice-output-row"
        title="Ler respostas automaticamente"
        value={respostaPorVoz}
      />
      <SettingsPressRow
        description={
          sttSupported
            ? "Ditado nativo disponível para o composer."
            : microfonePermitido
              ? "Nesta build o fallback é o teclado por voz do sistema."
              : "Permita o microfone para usar os atalhos de voz."
        }
        icon="microphone-message"
        onPress={onAbrirAjudaDitado}
        title="Ditado no composer"
        value={sttSupported ? "Nativo" : "Teclado do sistema"}
      />
      <SettingsPressRow
        description="Abre os ajustes do sistema para revisar acessibilidade, som e permissões relacionadas."
        icon="cog-outline"
        onPress={onAbrirAjustesDoSistema}
        testID="settings-advanced-system-voice-row"
        title="Ajustes de voz do sistema"
      />
    </SettingsSection>
  );
}

export function SettingsSystemSection({
  idiomaApp,
  regiaoApp,
  economiaDados,
  usoBateria,
  resumoPermissoes,
  appBuildChannel,
  appVersionLabel,
  ultimaVerificacaoAtualizacaoLabel,
  resumoCentralAtividade,
  resumoFilaOffline,
  resumoCache,
  verificandoAtualizacoes,
  sincronizandoDados,
  onSetIdiomaApp,
  onSetRegiaoApp,
  onSetEconomiaDados,
  onSetUsoBateria,
  onPermissoes,
  onVerificarAtualizacoes,
  onFecharConfiguracoes,
  onAbrirCentralAtividade,
  onAbrirFilaOffline,
  onRefreshData,
  onLimparCache,
}: SettingsSystemSectionProps) {
  return (
    <SettingsSection
      icon="cellphone-cog"
      subtitle="Idioma, região, bateria e informações técnicas do app."
      testID="settings-section-sistema"
      title="Sistema"
    >
      <SettingsPressRow
        description="Troca completa de idioma ainda depende da camada de i18n do app."
        icon="translate"
        testID="settings-system-language-row"
        title="Idioma do aplicativo"
        value={idiomaApp}
      />
      <SettingsPressRow
        icon="map-marker-radius-outline"
        onPress={() => onSetRegiaoApp(nextOptionValue(regiaoApp, REGION_OPTIONS))}
        testID="settings-system-region-row"
        title="Região"
        value={regiaoApp}
      />
      <SettingsSwitchRow
        icon="signal-cellular-outline"
        onValueChange={onSetEconomiaDados}
        testID="settings-system-data-saver-row"
        title="Economia de dados"
        value={economiaDados}
      />
      <SettingsPressRow
        icon="battery-heart-variant"
        onPress={() => onSetUsoBateria(nextOptionValue(usoBateria, BATTERY_OPTIONS))}
        testID="settings-system-battery-row"
        title="Uso de bateria"
        value={usoBateria}
      />
      <SettingsPressRow
        icon="shield-sync-outline"
        onPress={onPermissoes}
        testID="settings-system-permissions-center-row"
        title="Central de permissões"
        value={resumoPermissoes}
      />
      <SettingsPressRow
        description={appBuildChannel}
        icon="information-outline"
        onPress={onVerificarAtualizacoes}
        title="Versão do aplicativo"
        value={appVersionLabel}
      />
      <SettingsPressRow
        icon="refresh-circle"
        onPress={onVerificarAtualizacoes}
        testID="settings-system-check-updates-row"
        title="Verificar atualizações"
        value={verificandoAtualizacoes ? "Verificando..." : ultimaVerificacaoAtualizacaoLabel}
      />
      <SettingsPressRow
        icon="bell-badge-outline"
        onPress={() => {
          onFecharConfiguracoes();
          onAbrirCentralAtividade();
        }}
        testID="settings-system-activity-center-row"
        title="Central de atividade"
        value={resumoCentralAtividade}
      />
      <SettingsPressRow
        icon="cloud-upload-outline"
        onPress={() => {
          onFecharConfiguracoes();
          onAbrirFilaOffline();
        }}
        testID="settings-system-offline-queue-row"
        title="Fila offline"
        value={resumoFilaOffline}
      />
      <SettingsPressRow
        icon="refresh"
        onPress={() => {
          onFecharConfiguracoes();
          void onRefreshData();
        }}
        testID="settings-system-refresh-row"
        title="Sincronizar agora"
        value={sincronizandoDados ? "Sincronizando..." : "Executar"}
      />
      <SettingsPressRow
        icon="broom"
        onPress={onLimparCache}
        testID="settings-system-clear-cache-row"
        title="Limpar cache"
        value={resumoCache}
      />
    </SettingsSection>
  );
}

export function SettingsSupportSection({
  resumoSuporteApp,
  emailRetorno,
  supportChannelLabel,
  resumoFilaSuporteLocal,
  artigosAjudaCount,
  ticketsBugTotal,
  ticketsFeedbackTotal,
  filaSuporteCount,
  onCentralAjuda,
  onCanalSuporte,
  onReportarProblema,
  onEnviarFeedback,
  onSobreApp,
  onExportarDiagnosticoApp,
  onTermosUso,
  onPoliticaPrivacidade,
  onLicencas,
  onLimparFilaSuporteLocal,
}: SettingsSupportSectionProps) {
  return (
    <SettingsSection
      icon="lifebuoy"
      subtitle="Ajuda, feedback e documentos do aplicativo."
      testID="settings-section-suporte"
      title="Suporte"
    >
      <SettingsPressRow
        icon="book-open-page-variant-outline"
        onPress={onCentralAjuda}
        testID="settings-support-help-center-row"
        title="Central de ajuda"
        value={`${artigosAjudaCount} guia(s)`}
      />
      {onCanalSuporte ? (
        <SettingsPressRow
          description="Canal operacional do backend mobile para falar com a equipe de suporte."
          icon="whatsapp"
          onPress={onCanalSuporte}
          testID="settings-support-channel-row"
          title="Falar com suporte"
          value={supportChannelLabel}
        />
      ) : null}
      <SettingsPressRow
        description={resumoSuporteApp}
        icon="bug-outline"
        onPress={onReportarProblema}
        testID="settings-support-report-bug-row"
        title="Reportar problema"
        value={ticketsBugTotal ? `${ticketsBugTotal} na fila` : "Diagnóstico"}
      />
      <SettingsPressRow
        description={emailRetorno}
        icon="message-draw"
        onPress={onEnviarFeedback}
        testID="settings-support-send-feedback-row"
        title="Enviar feedback"
        value={ticketsFeedbackTotal ? `${ticketsFeedbackTotal} na fila` : "Sugestões"}
      />
      <SettingsPressRow
        description={resumoFilaSuporteLocal}
        icon="file-export-outline"
        onPress={() => {
          void onExportarDiagnosticoApp();
        }}
        testID="settings-support-export-diagnostic-row"
        title="Exportar diagnóstico"
        value="TXT"
      />
      <SettingsPressRow
        description="Versão, build, ambiente e documentos disponíveis nesta instalação."
        icon="information-outline"
        onPress={onSobreApp}
        testID="settings-support-about-row"
        title="Sobre o app"
      />
      <SettingsPressRow
        description="Resumo operacional das regras de uso aplicadas ao app móvel do inspetor."
        icon="file-document-check-outline"
        onPress={onTermosUso}
        testID="settings-support-terms-row"
        title="Termos de uso"
      />
      <SettingsPressRow
        description="Tratamento de dados, retenção e controles de privacidade desta build."
        icon="shield-account-outline"
        onPress={onPoliticaPrivacidade}
        testID="settings-support-privacy-row"
        title="Política de privacidade"
      />
      <SettingsPressRow
        description="Dependências de terceiros e respectivas licenças incluídas na build."
        icon="scale-balance"
        onPress={onLicencas}
        testID="settings-support-licenses-row"
        title="Licenças"
      />
      {filaSuporteCount ? (
        <SettingsPressRow
          danger
          icon="tray-remove"
          onPress={onLimparFilaSuporteLocal}
          title="Limpar fila local"
          value="Remover itens"
        />
      ) : null}
    </SettingsSection>
  );
}
