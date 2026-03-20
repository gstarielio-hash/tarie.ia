import {
  DATA_RETENTION_OPTIONS,
  MEDIA_COMPRESSION_OPTIONS,
} from "../InspectorMobileApp.constants";
import {
  SettingsPressRow,
  SettingsScaleRow,
  SettingsSection,
  SettingsSwitchRow,
} from "./SettingsPrimitives";

type DataRetention = (typeof DATA_RETENTION_OPTIONS)[number];
type MediaCompression = (typeof MEDIA_COMPRESSION_OPTIONS)[number];
type UploadSecurityTopic = "validacao" | "urls" | "bloqueios";

interface SettingsSecurityDataConversationsSectionProps {
  resumoDadosConversas: string;
  conversasOcultasTotal: number;
  salvarHistoricoConversas: boolean;
  compartilharMelhoriaIa: boolean;
  analyticsOptIn: boolean;
  crashReportsOptIn: boolean;
  wifiOnlySync: boolean;
  conversasVisiveisTotal: number;
  retencaoDados: DataRetention;
  backupAutomatico: boolean;
  sincronizacaoDispositivos: boolean;
  autoUploadAttachments: boolean;
  mediaCompression: MediaCompression;
  cacheStatusLabel: string;
  limpandoCache: boolean;
  nomeAutomaticoConversas: boolean;
  fixarConversas: boolean;
  onSetSalvarHistoricoConversas: (value: boolean) => void;
  onSetCompartilharMelhoriaIa: (value: boolean) => void;
  onSetAnalyticsOptIn: (value: boolean) => void;
  onSetCrashReportsOptIn: (value: boolean) => void;
  onSetWifiOnlySync: (value: boolean) => void;
  onExportarDados: (formato: "JSON" | "PDF") => void;
  onGerenciarConversasIndividuais: () => void;
  onSetRetencaoDados: (value: DataRetention) => void;
  onApagarHistoricoConfiguracoes: () => void;
  onLimparTodasConversasConfig: () => void;
  onToggleBackupAutomatico: (value: boolean) => void;
  onToggleSincronizacaoDispositivos: (value: boolean) => void;
  onToggleAutoUploadAttachments: (value: boolean) => void;
  onSetMediaCompression: (value: MediaCompression) => void;
  onLimparCache: () => void;
  onSetNomeAutomaticoConversas: (value: boolean) => void;
  onSetFixarConversas: (value: boolean) => void;
}

interface SettingsSecurityPermissionsSectionProps {
  resumoPermissoes: string;
  resumoPermissoesCriticas: string;
  microfonePermitido: boolean;
  cameraPermitida: boolean;
  arquivosPermitidos: boolean;
  notificacoesPermitidas: boolean;
  biometriaPermitida: boolean;
  showBiometricsPermission?: boolean;
  permissoesNegadasTotal: number;
  onGerenciarPermissao: (nome: string, status: string) => void;
  onAbrirAjustesDoSistema: (contexto: string) => void;
  onRevisarPermissoesCriticas: () => void;
}

interface SettingsSecurityFileUploadSectionProps {
  onDetalhesSegurancaArquivos: (topico: UploadSecurityTopic) => void;
}

interface SettingsSecurityNotificationPrivacySectionProps {
  resumoPrivacidadeNotificacoes: string;
  previewPrivacidadeNotificacao: string;
  mostrarConteudoNotificacao: boolean;
  ocultarConteudoBloqueado: boolean;
  mostrarSomenteNovaMensagem: boolean;
  onToggleMostrarConteudoNotificacao: (value: boolean) => void;
  onToggleOcultarConteudoBloqueado: (value: boolean) => void;
  onToggleMostrarSomenteNovaMensagem: (value: boolean) => void;
}

interface SettingsSecurityDeleteAccountSectionProps {
  resumoExcluirConta: string;
  reautenticacaoStatus: string;
  onExportarAntesDeExcluirConta: () => void;
  onReautenticacaoSensivel: () => void;
  onExcluirConta: () => void;
}

function nextOptionValue<T extends string>(current: T, options: readonly T[]): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

export function SettingsSecurityDataConversationsSection({
  salvarHistoricoConversas,
  compartilharMelhoriaIa,
  analyticsOptIn,
  crashReportsOptIn,
  wifiOnlySync,
  conversasVisiveisTotal,
  retencaoDados,
  backupAutomatico,
  sincronizacaoDispositivos,
  autoUploadAttachments,
  mediaCompression,
  cacheStatusLabel,
  limpandoCache,
  nomeAutomaticoConversas,
  fixarConversas,
  onSetSalvarHistoricoConversas,
  onSetCompartilharMelhoriaIa,
  onSetAnalyticsOptIn,
  onSetCrashReportsOptIn,
  onSetWifiOnlySync,
  onExportarDados,
  onGerenciarConversasIndividuais,
  onSetRetencaoDados,
  onApagarHistoricoConfiguracoes,
  onLimparTodasConversasConfig,
  onToggleBackupAutomatico,
  onToggleSincronizacaoDispositivos,
  onToggleAutoUploadAttachments,
  onSetMediaCompression,
  onLimparCache,
  onSetNomeAutomaticoConversas,
  onSetFixarConversas,
}: SettingsSecurityDataConversationsSectionProps) {
  return (
    <SettingsSection
      icon="forum-outline"
      subtitle="Controle retenção, consentimentos locais e regras de sincronização do app."
      testID="settings-section-dados-conversas"
      title="Controles de dados"
    >
      <SettingsSwitchRow
        icon="history"
        onValueChange={onSetSalvarHistoricoConversas}
        testID="settings-data-history-toggle-row"
        title="Salvar histórico de conversas"
        value={salvarHistoricoConversas}
      />
      <SettingsSwitchRow
        description="Consentimento para melhoria da IA."
        icon="share-variant-outline"
        onValueChange={onSetCompartilharMelhoriaIa}
        testID="settings-data-improve-toggle-row"
        title="Permitir uso para melhoria da IA"
        value={compartilharMelhoriaIa}
      />
      <SettingsSwitchRow
        description="Controla a gravação local de telemetria leve e diagnóstico operacional."
        icon="chart-line"
        onValueChange={onSetAnalyticsOptIn}
        testID="settings-data-analytics-toggle-row"
        title="Analytics do app"
        value={analyticsOptIn}
      />
      <SettingsSwitchRow
        description="Captura localmente erros JS não tratados quando houver consentimento."
        icon="alert-decagram-outline"
        onValueChange={onSetCrashReportsOptIn}
        testID="settings-data-crash-toggle-row"
        title="Relatórios de falha"
        value={crashReportsOptIn}
      />
      <SettingsSwitchRow
        description="Restringe sincronizações de fila e monitoramento de atividade a conexões Wi-Fi."
        icon="wifi-lock"
        onValueChange={onSetWifiOnlySync}
        testID="settings-data-wifi-only-toggle-row"
        title="Sincronizar só no Wi-Fi"
        value={wifiOnlySync}
      />
      <SettingsPressRow
        description="A exportação exige reautenticação."
        icon="database-export-outline"
        onPress={() => onExportarDados("JSON")}
        testID="settings-data-export-row"
        title="Exportar conversas"
        value="JSON"
      />
      <SettingsPressRow
        description="A exportação exige reautenticação."
        icon="file-pdf-box"
        onPress={() => onExportarDados("PDF")}
        title="Exportar conversas"
        value="PDF"
      />
      <SettingsPressRow
        description="Abra o histórico lateral para fixar, retomar ou remover conversas específicas."
        icon="playlist-edit"
        onPress={onGerenciarConversasIndividuais}
        title="Gerenciar conversas individualmente"
        value={`${conversasVisiveisTotal} ativas`}
      />
      <SettingsPressRow
        description="Define por quanto tempo o histórico pode permanecer salvo."
        icon="timer-sand"
        onPress={() => onSetRetencaoDados(nextOptionValue(retencaoDados, DATA_RETENTION_OPTIONS))}
        title="Retenção de dados"
        value={retencaoDados}
      />
      <SettingsPressRow
        danger
        description="Confirmação obrigatória antes da exclusão."
        icon="delete-sweep-outline"
        onPress={onApagarHistoricoConfiguracoes}
        title="Apagar histórico"
      />
      <SettingsPressRow
        danger
        description="Remove todas as conversas locais e sincronizadas deste perfil."
        icon="trash-can-outline"
        onPress={onLimparTodasConversasConfig}
        title="Excluir conversas"
      />
      <SettingsSwitchRow
        icon="cloud-sync-outline"
        onValueChange={onToggleBackupAutomatico}
        title="Backup automático"
        value={backupAutomatico}
      />
      <SettingsSwitchRow
        icon="devices"
        onValueChange={onToggleSincronizacaoDispositivos}
        title="Sincronização entre dispositivos"
        value={sincronizacaoDispositivos}
      />
      <SettingsSwitchRow
        icon="cloud-upload-outline"
        onValueChange={onToggleAutoUploadAttachments}
        title="Upload automático de anexos"
        value={autoUploadAttachments}
      />
      <SettingsPressRow
        description="Define a intensidade da compressão aplicada a imagens antes do envio."
        icon="image-size-select-small"
        onPress={() => onSetMediaCompression(nextOptionValue(mediaCompression, MEDIA_COMPRESSION_OPTIONS))}
        title="Compressão de mídia"
        value={mediaCompression}
      />
      <SettingsPressRow
        description="Remove cache local de leitura, atividade e arquivos temporários do app."
        icon="broom"
        onPress={onLimparCache}
        title="Limpar cache local"
        value={limpandoCache ? "Limpando..." : cacheStatusLabel}
      />
      <SettingsSwitchRow
        icon="tag-text-outline"
        onValueChange={onSetNomeAutomaticoConversas}
        title="Nome automático de conversas"
        value={nomeAutomaticoConversas}
      />
      <SettingsSwitchRow
        icon="pin-outline"
        onValueChange={onSetFixarConversas}
        title="Fixar conversas"
        value={fixarConversas}
      />
    </SettingsSection>
  );
}

export function SettingsSecurityPermissionsSection({
  microfonePermitido,
  cameraPermitida,
  arquivosPermitidos,
  notificacoesPermitidas,
  biometriaPermitida,
  showBiometricsPermission = false,
  permissoesNegadasTotal,
  onGerenciarPermissao,
  onAbrirAjustesDoSistema,
  onRevisarPermissoesCriticas,
}: SettingsSecurityPermissionsSectionProps) {
  return (
    <SettingsSection
      icon="shield-key-outline"
      subtitle="Status atual de acesso ao microfone, câmera, arquivos e notificações."
      title="Permissões"
    >
      <SettingsPressRow
        icon="microphone-outline"
        onPress={() => onGerenciarPermissao("Microfone", microfonePermitido ? "permitido" : "negado")}
        title="Microfone"
        value={microfonePermitido ? "Permitido" : "Negado"}
      />
      <SettingsPressRow
        icon="camera-outline"
        onPress={() => onGerenciarPermissao("Câmera", cameraPermitida ? "permitido" : "negado")}
        title="Câmera"
        value={cameraPermitida ? "Permitido" : "Negado"}
      />
      <SettingsPressRow
        icon="file-document-outline"
        onPress={() => onGerenciarPermissao("Arquivos", arquivosPermitidos ? "permitido" : "negado")}
        title="Arquivos"
        value={arquivosPermitidos ? "Permitido" : "Negado"}
      />
      <SettingsPressRow
        icon="bell-outline"
        onPress={() => onGerenciarPermissao("Notificações", notificacoesPermitidas ? "permitido" : "negado")}
        title="Notificações"
        value={notificacoesPermitidas ? "Permitido" : "Negado"}
      />
      {showBiometricsPermission ? (
        <SettingsPressRow
          icon="fingerprint"
          onPress={() => onGerenciarPermissao("Biometria", biometriaPermitida ? "permitido" : "negado")}
          title="Biometria"
          value={biometriaPermitida ? "Permitido" : "Negado"}
        />
      ) : null}
      <SettingsPressRow
        description="Abra diretamente os ajustes do Android para revisar todas as permissões deste app."
        icon="open-in-app"
        onPress={() => onAbrirAjustesDoSistema("as permissões do app do inspetor")}
        title="Abrir ajustes do sistema"
      />
      <SettingsPressRow
        description="Reúne câmera, arquivos e notificações, que são as permissões mais sensíveis no fluxo do inspetor."
        icon="shield-sync-outline"
        onPress={onRevisarPermissoesCriticas}
        title="Revisar permissões críticas"
        value={permissoesNegadasTotal ? `${permissoesNegadasTotal} pendente(s)` : "Tudo certo"}
      />
    </SettingsSection>
  );
}

export function SettingsSecurityFileUploadSection({
  onDetalhesSegurancaArquivos,
}: SettingsSecurityFileUploadSectionProps) {
  return (
    <SettingsSection
      icon="file-lock-outline"
      subtitle="Uploads são tratados como área crítica com validação e armazenamento protegido."
      title="Segurança de arquivos enviados"
    >
      <SettingsPressRow
        description="Tipos aceitos: PDF, JPG, PNG e DOCX, com limite de 20 MB por arquivo."
        icon="shield-check-outline"
        onPress={() => onDetalhesSegurancaArquivos("validacao")}
        title="Validação de tipo e tamanho"
        value="Ativa"
      />
      <SettingsPressRow
        description="Os arquivos só são servidos por URLs assinadas e vinculadas ao acesso correto."
        icon="link-variant"
        onPress={() => onDetalhesSegurancaArquivos("urls")}
        title="URLs protegidas"
        value="Assinadas"
      />
      <SettingsPressRow
        description="Falhas de validação e bloqueios devolvem feedback claro antes do envio."
        icon="alert-octagon-outline"
        onPress={() => onDetalhesSegurancaArquivos("bloqueios")}
        title="Falhas e bloqueios"
        value="Com feedback"
      />
    </SettingsSection>
  );
}

export function SettingsSecurityNotificationPrivacySection({
  mostrarConteudoNotificacao,
  ocultarConteudoBloqueado,
  mostrarSomenteNovaMensagem,
  onToggleMostrarConteudoNotificacao,
  onToggleOcultarConteudoBloqueado,
  onToggleMostrarSomenteNovaMensagem,
}: SettingsSecurityNotificationPrivacySectionProps) {
  return (
    <SettingsSection
      icon="bell-cog-outline"
      subtitle="Defina o quanto aparece das mensagens nas notificações."
      testID="settings-section-privacidade-notificacoes"
      title="Privacidade em notificações"
    >
      <SettingsSwitchRow
        description="Mostra o conteúdo da conversa quando permitido."
        icon="message-text-outline"
        onValueChange={onToggleMostrarConteudoNotificacao}
        testID="settings-notification-show-content-row"
        title="Mostrar conteúdo da mensagem"
        value={mostrarConteudoNotificacao}
      />
      <SettingsSwitchRow
        description="Nunca exibe prévias na tela bloqueada."
        icon="cellphone-lock"
        onValueChange={onToggleOcultarConteudoBloqueado}
        testID="settings-notification-hide-locked-row"
        title="Ocultar conteúdo na tela bloqueada"
        value={ocultarConteudoBloqueado}
      />
      <SettingsSwitchRow
        description='Exibe apenas o aviso "Nova mensagem".'
        icon="message-badge-outline"
        onValueChange={onToggleMostrarSomenteNovaMensagem}
        testID="settings-notification-show-generic-row"
        title='Mostrar apenas "Nova mensagem"'
        value={mostrarSomenteNovaMensagem}
      />
    </SettingsSection>
  );
}

export function SettingsSecurityDeleteAccountSection({
  reautenticacaoStatus,
  onExportarAntesDeExcluirConta,
  onReautenticacaoSensivel,
  onExcluirConta,
}: SettingsSecurityDeleteAccountSectionProps) {
  return (
    <SettingsSection
      icon="alert-outline"
      subtitle="Área crítica para remoção permanente da conta."
      testID="settings-section-excluir-conta"
      title="Excluir conta"
    >
      <SettingsPressRow
        description="Faça um backup do perfil antes da exclusão definitiva."
        icon="database-export-outline"
        onPress={onExportarAntesDeExcluirConta}
        testID="settings-delete-export-before-row"
        title="Exportar dados antes de excluir"
        value="JSON"
      />
      <SettingsPressRow
        description="Ações destrutivas só seguem quando a verificação de identidade está válida."
        icon="shield-refresh-outline"
        onPress={onReautenticacaoSensivel}
        testID="settings-delete-reauth-row"
        title="Status da reautenticação"
        value={reautenticacaoStatus}
      />
      <SettingsPressRow
        description="Ação destrutiva com múltiplas confirmações e reautenticação."
        danger
        icon="delete-alert-outline"
        onPress={onExcluirConta}
        testID="settings-delete-account-row"
        title="Excluir conta permanentemente"
      />
    </SettingsSection>
  );
}
