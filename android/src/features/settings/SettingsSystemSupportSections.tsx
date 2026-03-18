import {
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  REGION_OPTIONS,
} from "../InspectorMobileApp.constants";
import { SettingsPressRow, SettingsSection, SettingsSwitchRow } from "./SettingsPrimitives";
import { Text, View } from "react-native";

import { styles } from "../InspectorMobileApp.styles";

type IdiomaApp = (typeof APP_LANGUAGE_OPTIONS)[number];
type RegiaoApp = (typeof REGION_OPTIONS)[number];
type UsoBateria = (typeof BATTERY_OPTIONS)[number];

interface SettingsAdvancedResourcesSectionProps {
  entradaPorVoz: boolean;
  respostaPorVoz: boolean;
  uploadArquivosAtivo: boolean;
  integracoesConectadasTotal: number;
  integracoesDisponiveisTotal: number;
  onToggleEntradaPorVoz: (value: boolean) => void;
  onToggleRespostaPorVoz: (value: boolean) => void;
  onToggleUploadArquivos: (value: boolean) => void;
  onIntegracoesExternas: () => void;
  onPluginsIa: () => void;
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
}

interface SettingsSupportSectionProps {
  resumoSuporteApp: string;
  emailRetorno: string;
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
  onReportarProblema: () => void;
  onEnviarFeedback: () => void;
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
  entradaPorVoz,
  respostaPorVoz,
  uploadArquivosAtivo,
  integracoesConectadasTotal,
  integracoesDisponiveisTotal,
  onToggleEntradaPorVoz,
  onToggleRespostaPorVoz,
  onToggleUploadArquivos,
  onIntegracoesExternas,
  onPluginsIa,
}: SettingsAdvancedResourcesSectionProps) {
  return (
    <SettingsSection
      icon="flask-outline"
      subtitle="Ative recursos extras e integrações do app."
      testID="settings-section-recursos-avancados"
      title="Recursos avançados"
    >
      <SettingsSwitchRow
        icon="microphone-outline"
        onValueChange={onToggleEntradaPorVoz}
        testID="settings-advanced-voice-input-row"
        title="Entrada por voz"
        value={entradaPorVoz}
      />
      <SettingsSwitchRow
        icon="speaker-wireless"
        onValueChange={onToggleRespostaPorVoz}
        testID="settings-advanced-voice-output-row"
        title="Resposta por voz"
        value={respostaPorVoz}
      />
      <SettingsSwitchRow
        description="PDF, imagens e documentos no chat."
        icon="paperclip"
        onValueChange={onToggleUploadArquivos}
        testID="settings-advanced-upload-row"
        title="Upload de arquivos"
        value={uploadArquivosAtivo}
      />
      <SettingsPressRow
        icon="connection"
        onPress={onIntegracoesExternas}
        testID="settings-advanced-integrations-row"
        title="Integrações"
        value={`${integracoesConectadasTotal}/${integracoesDisponiveisTotal} conectadas`}
      />
      <SettingsPressRow
        icon="puzzle-outline"
        onPress={onPluginsIa}
        testID="settings-advanced-plugins-row"
        title="Plugins"
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
}: SettingsSystemSectionProps) {
  return (
    <SettingsSection
      icon="cellphone-cog"
      subtitle="Idioma, região, bateria e informações técnicas do app."
      testID="settings-section-sistema"
      title="Sistema"
    >
      <SettingsPressRow
        icon="translate"
        onPress={() => onSetIdiomaApp(nextOptionValue(idiomaApp, APP_LANGUAGE_OPTIONS))}
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
        value={ultimaVerificacaoAtualizacaoLabel}
      />
      <SettingsPressRow
        icon="bell-badge-outline"
        onPress={() => {
          onFecharConfiguracoes();
          onAbrirCentralAtividade();
        }}
        testID="settings-system-activity-center-row"
        title="Central de atividade"
      />
      <SettingsPressRow
        icon="cloud-upload-outline"
        onPress={() => {
          onFecharConfiguracoes();
          onAbrirFilaOffline();
        }}
        testID="settings-system-offline-queue-row"
        title="Fila offline"
      />
      <SettingsPressRow
        icon="refresh"
        onPress={() => {
          onFecharConfiguracoes();
          void onRefreshData();
        }}
        testID="settings-system-refresh-row"
        title="Atualizar dados"
      />
    </SettingsSection>
  );
}

export function SettingsSupportSection({
  resumoSuporteApp,
  emailRetorno,
  resumoFilaSuporteLocal,
  ultimoTicketSuporte,
  artigosAjudaCount,
  ticketsBugTotal,
  ticketsFeedbackTotal,
  filaSuporteCount,
  onCentralAjuda,
  onReportarProblema,
  onEnviarFeedback,
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
      <View style={styles.settingsInfoGrid}>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Build em uso</Text>
          <Text style={styles.settingsInfoText}>{resumoSuporteApp}</Text>
        </View>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Retorno</Text>
          <Text style={styles.settingsInfoText}>{emailRetorno}</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Fila local de suporte</Text>
        <Text style={styles.settingsInfoText}>{resumoFilaSuporteLocal}</Text>
        {ultimoTicketSuporte ? (
          <Text style={styles.settingsInfoSubtle}>
            Último envio • {ultimoTicketSuporte.kind === "bug" ? "Bug" : "Feedback"} • {ultimoTicketSuporte.createdAtLabel}
          </Text>
        ) : null}
      </View>
      <SettingsPressRow
        icon="book-open-page-variant-outline"
        onPress={onCentralAjuda}
        testID="settings-support-help-center-row"
        title="Central de ajuda"
        value={`${artigosAjudaCount} guia(s)`}
      />
      <SettingsPressRow
        icon="bug-outline"
        onPress={onReportarProblema}
        testID="settings-support-report-bug-row"
        title="Reportar problema"
        value={ticketsBugTotal ? `${ticketsBugTotal} na fila` : "Diagnóstico"}
      />
      <SettingsPressRow
        icon="message-draw"
        onPress={onEnviarFeedback}
        testID="settings-support-send-feedback-row"
        title="Enviar feedback"
        value={ticketsFeedbackTotal ? `${ticketsFeedbackTotal} na fila` : "Sugestões"}
      />
      <SettingsPressRow
        icon="file-export-outline"
        onPress={() => {
          void onExportarDiagnosticoApp();
        }}
        testID="settings-support-export-diagnostic-row"
        title="Exportar diagnóstico"
        value="TXT"
      />
      <SettingsPressRow
        icon="file-document-check-outline"
        onPress={onTermosUso}
        testID="settings-support-terms-row"
        title="Termos de uso"
      />
      <SettingsPressRow
        icon="shield-account-outline"
        onPress={onPoliticaPrivacidade}
        testID="settings-support-privacy-row"
        title="Política de privacidade"
      />
      <SettingsPressRow
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
