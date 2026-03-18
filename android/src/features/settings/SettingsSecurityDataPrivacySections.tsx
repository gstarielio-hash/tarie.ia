import { Text, View } from "react-native";

import { DATA_RETENTION_OPTIONS } from "../InspectorMobileApp.constants";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsPressRow, SettingsSection, SettingsSwitchRow } from "./SettingsPrimitives";

type DataRetention = (typeof DATA_RETENTION_OPTIONS)[number];
type UploadSecurityTopic = "validacao" | "urls" | "bloqueios";

interface SettingsSecurityDataConversationsSectionProps {
  resumoDadosConversas: string;
  conversasOcultasTotal: number;
  salvarHistoricoConversas: boolean;
  compartilharMelhoriaIa: boolean;
  conversasVisiveisTotal: number;
  retencaoDados: DataRetention;
  backupAutomatico: boolean;
  sincronizacaoDispositivos: boolean;
  nomeAutomaticoConversas: boolean;
  fixarConversas: boolean;
  onSetSalvarHistoricoConversas: (value: boolean) => void;
  onSetCompartilharMelhoriaIa: (value: boolean) => void;
  onExportarDados: (formato: "JSON" | "PDF") => void;
  onGerenciarConversasIndividuais: () => void;
  onSetRetencaoDados: (value: DataRetention) => void;
  onApagarHistoricoConfiguracoes: () => void;
  onLimparTodasConversasConfig: () => void;
  onToggleBackupAutomatico: (value: boolean) => void;
  onToggleSincronizacaoDispositivos: (value: boolean) => void;
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
  resumoDadosConversas,
  conversasOcultasTotal,
  salvarHistoricoConversas,
  compartilharMelhoriaIa,
  conversasVisiveisTotal,
  retencaoDados,
  backupAutomatico,
  sincronizacaoDispositivos,
  nomeAutomaticoConversas,
  fixarConversas,
  onSetSalvarHistoricoConversas,
  onSetCompartilharMelhoriaIa,
  onExportarDados,
  onGerenciarConversasIndividuais,
  onSetRetencaoDados,
  onApagarHistoricoConfiguracoes,
  onLimparTodasConversasConfig,
  onToggleBackupAutomatico,
  onToggleSincronizacaoDispositivos,
  onSetNomeAutomaticoConversas,
  onSetFixarConversas,
}: SettingsSecurityDataConversationsSectionProps) {
  return (
    <SettingsSection
      icon="forum-outline"
      subtitle="Controle como conversas e dados da IA são armazenados."
      testID="settings-section-dados-conversas"
      title="Dados e conversas"
    >
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Resumo do histórico</Text>
        <Text style={styles.settingsInfoText}>
          {resumoDadosConversas} • {conversasOcultasTotal} removida{conversasOcultasTotal === 1 ? "" : "s"} do histórico local
        </Text>
      </View>
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
      <Text style={styles.securityFootnote}>
        Quando o histórico é desativado, novas conversas deixam de ser persistidas no backend assim que essa política estiver ligada.
      </Text>
    </SettingsSection>
  );
}

export function SettingsSecurityPermissionsSection({
  resumoPermissoes,
  resumoPermissoesCriticas,
  microfonePermitido,
  cameraPermitida,
  arquivosPermitidos,
  notificacoesPermitidas,
  biometriaPermitida,
  permissoesNegadasTotal,
  onGerenciarPermissao,
  onAbrirAjustesDoSistema,
  onRevisarPermissoesCriticas,
}: SettingsSecurityPermissionsSectionProps) {
  return (
    <SettingsSection
      icon="shield-key-outline"
      subtitle="Status atual de acesso ao microfone, câmera, arquivos, notificações e biometria."
      title="Permissões"
    >
      <View style={styles.settingsInfoGrid}>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Resumo</Text>
          <Text style={styles.settingsInfoText}>{resumoPermissoes}</Text>
        </View>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Uso principal</Text>
          <Text style={styles.settingsInfoText}>Anexos, voz, notificações e desbloqueio local.</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Permissões críticas</Text>
        <Text style={styles.settingsInfoText}>{resumoPermissoesCriticas}</Text>
      </View>
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
      <SettingsPressRow
        icon="fingerprint"
        onPress={() => onGerenciarPermissao("Biometria", biometriaPermitida ? "permitido" : "negado")}
        title="Biometria"
        value={biometriaPermitida ? "Permitido" : "Negado"}
      />
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
      <Text style={styles.securityFootnote}>
        Quando negada, a ação levará o usuário para as configurações do sistema com contexto de uso claro.
      </Text>
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
      <View style={styles.securityIntroCard}>
        <Text style={styles.securityIntroTitle}>Regras de upload</Text>
        <Text style={styles.securityIntroText}>
          Tipos aceitos: PDF, JPG, PNG e DOCX. Tamanho máximo por arquivo: 20 MB.
        </Text>
        <Text style={styles.securityIntroText}>
          Os arquivos são validados no backend, associados ao usuário correto e servidos apenas por autorização.
        </Text>
      </View>
      <SettingsPressRow
        icon="shield-check-outline"
        onPress={() => onDetalhesSegurancaArquivos("validacao")}
        title="Validação de tipo e tamanho"
        value="Ativa"
      />
      <SettingsPressRow
        icon="link-variant"
        onPress={() => onDetalhesSegurancaArquivos("urls")}
        title="URLs protegidas"
        value="Assinadas"
      />
      <SettingsPressRow
        icon="alert-octagon-outline"
        onPress={() => onDetalhesSegurancaArquivos("bloqueios")}
        title="Falhas e bloqueios"
        value="Com feedback"
      />
      <Text style={styles.securityFootnote}>
        O frontend nunca confia sozinho no arquivo enviado: validação, renomeação segura e controle de acesso são responsabilidade do backend.
      </Text>
    </SettingsSection>
  );
}

export function SettingsSecurityNotificationPrivacySection({
  resumoPrivacidadeNotificacoes,
  previewPrivacidadeNotificacao,
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
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Prévia atual</Text>
        <Text style={styles.settingsInfoText}>{resumoPrivacidadeNotificacoes}</Text>
      </View>
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
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Como aparece hoje</Text>
        <Text style={styles.settingsInfoText}>{previewPrivacidadeNotificacao}</Text>
        <Text style={styles.settingsInfoSubtle}>
          Esse exemplo respeita as combinações atuais de privacidade dentro do app.
        </Text>
      </View>
      <Text style={styles.securityFootnote}>
        Em modo privado, o app evita mostrar conteúdo sensível na tela bloqueada e reduz a prévia das conversas.
      </Text>
    </SettingsSection>
  );
}

export function SettingsSecurityDeleteAccountSection({
  resumoExcluirConta,
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
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Impacto da exclusão</Text>
        <Text style={styles.settingsInfoText}>{resumoExcluirConta}</Text>
      </View>
      <View style={styles.settingsMiniList}>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>O que será removido</Text>
          <Text style={styles.settingsMiniListMeta}>Conta, sessões, histórico de conversas, preferências e tokens ativos deste perfil.</Text>
        </View>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Política de recuperação</Text>
          <Text style={styles.settingsMiniListMeta}>Nesta versão do app, a exclusão é tratada como permanente e exige múltiplas confirmações.</Text>
        </View>
      </View>
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
      <Text style={styles.securityFootnote}>
        Essa ação invalidará sessões e tokens e removerá os dados conforme a política do sistema.
      </Text>
    </SettingsSection>
  );
}
