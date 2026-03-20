import { Text, View } from "react-native";

import { styles } from "../InspectorMobileApp.styles";

type StaticSheetKind = "privacy" | "updates" | "terms" | "licenses" | "legal" | "about";

interface UpdateChangelogItem {
  id: string;
  title: string;
  summary: string;
}

interface TermsSectionItem {
  id: string;
  title: string;
  body: string;
}

interface LicenseCatalogItem {
  id: string;
  name: string;
  license: string;
  source: string;
}

interface RenderStaticSettingsSheetParams {
  kind: string;
  title: string;
  appName: string;
  salvarHistoricoConversas: boolean;
  retencaoDados: string;
  appVersionLabel: string;
  appBuildLabel: string;
  appBuildChannel: string;
  appPlatformLabel: string;
  apiEnvironmentLabel: string;
  workspaceLabel: string;
  supportChannelLabel: string;
  ultimaVerificacaoAtualizacaoLabel: string;
  statusAtualizacaoApp: string;
  resumoAtualizacaoApp: string;
  updateChangelog: readonly UpdateChangelogItem[];
  termsSections: readonly TermsSectionItem[];
  licensesCatalog: readonly LicenseCatalogItem[];
}

export function renderStaticSettingsSheetBody({
  kind,
  title,
  appName,
  salvarHistoricoConversas,
  retencaoDados,
  appVersionLabel,
  appBuildLabel,
  appBuildChannel,
  appPlatformLabel,
  apiEnvironmentLabel,
  workspaceLabel,
  supportChannelLabel,
  ultimaVerificacaoAtualizacaoLabel,
  statusAtualizacaoApp,
  resumoAtualizacaoApp,
  updateChangelog,
  termsSections,
  licensesCatalog,
}: RenderStaticSettingsSheetParams) {
  if (!isStaticSheetKind(kind)) {
    return null;
  }

  if (kind === "about") {
    return (
      <View style={styles.settingsFlowStack}>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>{appName}</Text>
          <Text style={styles.settingsInfoText}>
            Build operacional do inspetor para chat, mesa, fila offline, atividade e suporte.
          </Text>
        </View>
        <View style={styles.settingsInfoGrid}>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Versão</Text>
            <Text style={styles.settingsInfoText}>{appVersionLabel}</Text>
            <Text style={styles.settingsInfoSubtle}>{appBuildLabel}</Text>
          </View>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Canal</Text>
            <Text style={styles.settingsInfoText}>{appBuildChannel}</Text>
            <Text style={styles.settingsInfoSubtle}>{appPlatformLabel}</Text>
          </View>
        </View>
        <View style={styles.settingsMiniList}>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>Ambiente da API</Text>
            <Text style={styles.settingsMiniListMeta}>{apiEnvironmentLabel}</Text>
          </View>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>Workspace atual</Text>
            <Text style={styles.settingsMiniListMeta}>{workspaceLabel}</Text>
          </View>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>Canal de suporte</Text>
            <Text style={styles.settingsMiniListMeta}>{supportChannelLabel}</Text>
          </View>
          <View style={styles.settingsMiniListItem}>
            <Text style={styles.settingsMiniListTitle}>Documentos disponíveis</Text>
            <Text style={styles.settingsMiniListMeta}>Política de privacidade, termos de uso e licenças.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (kind === "privacy") {
    return (
      <View style={styles.settingsFlowStack}>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Resumo</Text>
          <Text style={styles.settingsInfoText}>
            O app guarda apenas os dados necessários para sessão, histórico, fila offline e operação do inspetor.
            Preferências sensíveis exigem confirmação e podem ser exportadas ou removidas conforme a política do
            sistema.
          </Text>
        </View>
        <View style={styles.settingsInfoGrid}>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Histórico</Text>
            <Text style={styles.settingsInfoText}>
              {salvarHistoricoConversas ? "Salvamento ativo" : "Novas conversas não serão persistidas"}
            </Text>
          </View>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Retenção</Text>
            <Text style={styles.settingsInfoText}>{retencaoDados}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (kind === "updates") {
    return (
      <View style={styles.settingsFlowStack}>
        <View style={styles.settingsInfoGrid}>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Versão instalada</Text>
            <Text style={styles.settingsInfoText}>{appVersionLabel}</Text>
            <Text style={styles.settingsInfoSubtle}>{appBuildChannel}</Text>
          </View>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Última verificação</Text>
            <Text style={styles.settingsInfoText}>{ultimaVerificacaoAtualizacaoLabel}</Text>
            <Text style={styles.settingsInfoSubtle}>{statusAtualizacaoApp}</Text>
          </View>
        </View>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Estado atual</Text>
          <Text style={styles.settingsInfoText}>{resumoAtualizacaoApp}</Text>
        </View>
        <View style={styles.settingsMiniList}>
          {updateChangelog.map((item) => (
            <View key={item.id} style={styles.settingsMiniListItem}>
              <Text style={styles.settingsMiniListTitle}>{item.title}</Text>
              <Text style={styles.settingsMiniListMeta}>{item.summary}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (kind === "terms") {
    return (
      <View style={styles.settingsFlowStack}>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Termos de uso</Text>
          <Text style={styles.settingsInfoText}>
            Resumo operacional das regras de uso aplicadas à versão móvel do inspetor.
          </Text>
        </View>
        <View style={styles.settingsMiniList}>
          {termsSections.map((item) => (
            <View key={item.id} style={styles.settingsMiniListItem}>
              <Text style={styles.settingsMiniListTitle}>{item.title}</Text>
              <Text style={styles.settingsMiniListMeta}>{item.body}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (kind === "licenses") {
    return (
      <View style={styles.settingsFlowStack}>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Licenças de terceiros</Text>
          <Text style={styles.settingsInfoText}>
            Dependências principais usadas nesta build do aplicativo.
          </Text>
        </View>
        <View style={styles.settingsMiniList}>
          {licensesCatalog.map((item) => (
            <View key={item.id} style={styles.settingsMiniListItem}>
              <Text style={styles.settingsMiniListTitle}>
                {item.name} • {item.license}
              </Text>
              <Text style={styles.settingsMiniListMeta}>{item.source}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>{title}</Text>
        <Text style={styles.settingsInfoText}>
          Documento legal disponível nesta build para consulta rápida dentro do painel de suporte.
        </Text>
      </View>
      <View style={styles.settingsMiniList}>
        <View style={styles.settingsMiniListItem}>
          <Text style={styles.settingsMiniListTitle}>Versão ativa</Text>
          <Text style={styles.settingsMiniListMeta}>
            {appVersionLabel} • {appBuildChannel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function isStaticSheetKind(kind: string): kind is StaticSheetKind {
  return (
    kind === "privacy" ||
    kind === "updates" ||
    kind === "terms" ||
    kind === "licenses" ||
    kind === "legal" ||
    kind === "about"
  );
}
