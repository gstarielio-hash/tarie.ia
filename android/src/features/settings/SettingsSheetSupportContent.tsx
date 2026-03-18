import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, Text, TextInput, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsTextField } from "./SettingsPrimitives";

interface HelpArticleItem {
  id: string;
  title: string;
  category: string;
  estimatedRead: string;
  summary: string;
  body: string;
}

interface SupportQueueSnapshotItem {
  kind: "bug" | "feedback";
  body: string;
  status: string;
  createdAt: string;
  attachmentLabel?: string;
}

interface SessionDeviceSummary {
  title: string;
}

type BugAttachmentDraft =
  | {
      kind: "image";
      previewUri: string;
      label: string;
      resumo: string;
    }
  | {
      kind: "document";
      nomeDocumento: string;
    }
  | null;

export function SettingsHelpSheetContent({
  buscaAjuda,
  onBuscaAjudaChange,
  resumoSuporteApp,
  emailAtualConta,
  emailLogin,
  resumoFilaSuporteLocal,
  ultimoTicketSuporte,
  resumoAtualizacaoApp,
  artigosAjudaFiltrados,
  artigoAjudaExpandidoId,
  onAlternarArtigoAjuda,
  formatarHorarioAtividade,
}: {
  buscaAjuda: string;
  onBuscaAjudaChange: (value: string) => void;
  resumoSuporteApp: string;
  emailAtualConta: string;
  emailLogin: string;
  resumoFilaSuporteLocal: string;
  ultimoTicketSuporte: SupportQueueSnapshotItem | null;
  resumoAtualizacaoApp: string;
  artigosAjudaFiltrados: readonly HelpArticleItem[];
  artigoAjudaExpandidoId: string;
  onAlternarArtigoAjuda: (articleId: string) => void;
  formatarHorarioAtividade: (iso: string) => string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <SettingsTextField
        icon="magnify"
        onChangeText={onBuscaAjudaChange}
        placeholder="Buscar por mesa, offline, segurança..."
        title="Buscar na ajuda"
        value={buscaAjuda}
      />
      <View style={styles.settingsInfoGrid}>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Canal do app</Text>
          <Text style={styles.settingsInfoText}>{resumoSuporteApp}</Text>
        </View>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Contato de retorno</Text>
          <Text style={styles.settingsInfoText}>{emailAtualConta || emailLogin || "Sem email definido"}</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Suporte local</Text>
        <Text style={styles.settingsInfoText}>{resumoFilaSuporteLocal}</Text>
        {ultimoTicketSuporte ? (
          <Text style={styles.settingsInfoSubtle}>
            Último item: {ultimoTicketSuporte.kind === "bug" ? "Bug" : "Feedback"} •{" "}
            {formatarHorarioAtividade(ultimoTicketSuporte.createdAt)}
          </Text>
        ) : null}
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Atualizações</Text>
        <Text style={styles.settingsInfoText}>{resumoAtualizacaoApp}</Text>
      </View>
      {artigosAjudaFiltrados.length ? (
        <View style={styles.settingsMiniList}>
          {artigosAjudaFiltrados.map((article) => {
            const expandido = artigoAjudaExpandidoId === article.id;
            return (
              <Pressable
                key={article.id}
                onPress={() => onAlternarArtigoAjuda(article.id)}
                style={styles.settingsMiniListItem}
              >
                <View style={styles.settingsHelpArticleHeader}>
                  <View style={styles.settingsHelpArticleCopy}>
                    <Text style={styles.settingsMiniListTitle}>{article.title}</Text>
                    <Text style={styles.settingsMiniListMeta}>
                      {article.category} • {article.estimatedRead}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    color={colors.textSecondary}
                    name={expandido ? "chevron-up" : "chevron-down"}
                    size={20}
                  />
                </View>
                <Text style={styles.settingsMiniListMeta}>{article.summary}</Text>
                {expandido ? <Text style={styles.settingsHelpArticleBody}>{article.body}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Nenhum artigo encontrado</Text>
          <Text style={styles.settingsInfoText}>
            Tente buscar por mesa, segurança, offline ou inspeção para localizar o guia certo.
          </Text>
        </View>
      )}
    </View>
  );
}

export function SettingsBugSheetContent({
  resumoSuporteApp,
  sessaoAtual,
  statusApi,
  resumoFilaSuporteLocal,
  bugEmailDraft,
  onBugEmailDraftChange,
  bugDescriptionDraft,
  onBugDescriptionDraftChange,
  bugAttachmentDraft,
  onSelectScreenshot,
  onRemoveScreenshot,
  ultimoTicketSuporte,
  formatarHorarioAtividade,
}: {
  resumoSuporteApp: string;
  sessaoAtual: SessionDeviceSummary | null;
  statusApi: string;
  resumoFilaSuporteLocal: string;
  bugEmailDraft: string;
  onBugEmailDraftChange: (value: string) => void;
  bugDescriptionDraft: string;
  onBugDescriptionDraftChange: (value: string) => void;
  bugAttachmentDraft: BugAttachmentDraft;
  onSelectScreenshot: () => void;
  onRemoveScreenshot: () => void;
  ultimoTicketSuporte: SupportQueueSnapshotItem | null;
  formatarHorarioAtividade: (iso: string) => string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Contexto do diagnóstico</Text>
        <Text style={styles.settingsInfoText}>
          {`${resumoSuporteApp} • ${sessaoAtual?.title || "Dispositivo atual"} • ${statusApi === "online" ? "Conectado" : "Sem conexão"}`}
        </Text>
        <Text style={styles.settingsInfoSubtle}>{resumoFilaSuporteLocal}</Text>
      </View>
      <SettingsTextField
        icon="email-outline"
        keyboardType="email-address"
        onChangeText={onBugEmailDraftChange}
        placeholder="seuemail@empresa.com"
        title="Email para retorno"
        value={bugEmailDraft}
      />
      <View style={styles.settingsFieldBlockNoDivider}>
        <View style={styles.settingsFieldLabelRow}>
          <View style={styles.settingsRowIcon}>
            <MaterialCommunityIcons name="bug-outline" size={18} color={colors.accent} />
          </View>
          <Text style={styles.settingsRowTitle}>Descrição do problema</Text>
        </View>
        <TextInput
          multiline
          onChangeText={onBugDescriptionDraftChange}
          placeholder="Explique o que aconteceu, em qual tela e como reproduzir."
          placeholderTextColor={colors.textSecondary}
          style={styles.settingsTextArea}
          value={bugDescriptionDraft}
        />
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Anexo de screenshot</Text>
        {bugAttachmentDraft?.kind === "image" ? (
          <View style={styles.securityProviderMain}>
            <Image source={{ uri: bugAttachmentDraft.previewUri }} style={styles.settingsInlineHeroMark} />
            <View style={styles.securityProviderCopy}>
              <Text style={styles.settingsMiniListTitle}>{bugAttachmentDraft.label}</Text>
              <Text style={styles.settingsMiniListMeta}>{bugAttachmentDraft.resumo}</Text>
            </View>
          </View>
        ) : bugAttachmentDraft?.kind === "document" ? (
          <Text style={styles.settingsInfoText}>Documento anexado: {bugAttachmentDraft.nomeDocumento}</Text>
        ) : (
          <Text style={styles.settingsInfoText}>
            Anexe um screenshot para facilitar a reprodução do problema pela equipe.
          </Text>
        )}
        <View style={styles.securitySessionActions}>
          <Pressable onPress={onSelectScreenshot} style={styles.securitySessionActionButton}>
            <Text style={styles.securitySessionActionText}>Selecionar screenshot</Text>
          </Pressable>
          {bugAttachmentDraft ? (
            <Pressable
              onPress={onRemoveScreenshot}
              style={[styles.securityProviderActionButton, styles.securityProviderActionButtonDanger]}
            >
              <Text style={[styles.securityProviderActionText, styles.securityProviderActionTextDanger]}>
                Remover anexo
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {ultimoTicketSuporte?.kind === "bug" ? (
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Último bug salvo</Text>
          <Text style={styles.settingsInfoText}>{ultimoTicketSuporte.body}</Text>
          <Text style={styles.settingsInfoSubtle}>
            {ultimoTicketSuporte.status} • {formatarHorarioAtividade(ultimoTicketSuporte.createdAt)}
          </Text>
          {ultimoTicketSuporte.attachmentLabel ? (
            <Text style={styles.settingsInfoSubtle}>Anexo: {ultimoTicketSuporte.attachmentLabel}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SettingsFeedbackSheetContent({
  resumoFilaSuporteLocal,
  feedbackDraft,
  onFeedbackDraftChange,
  ultimoTicketSuporte,
  formatarHorarioAtividade,
}: {
  resumoFilaSuporteLocal: string;
  feedbackDraft: string;
  onFeedbackDraftChange: (value: string) => void;
  ultimoTicketSuporte: SupportQueueSnapshotItem | null;
  formatarHorarioAtividade: (iso: string) => string;
}) {
  return (
    <View style={styles.settingsFlowStack}>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Você está avaliando</Text>
        <Text style={styles.settingsInfoText}>
          Chat, Mesa, Histórico, fila offline e engrenagem do app do inspetor.
        </Text>
        <Text style={styles.settingsInfoSubtle}>{resumoFilaSuporteLocal}</Text>
      </View>
      <View style={styles.settingsFieldBlockNoDivider}>
        <View style={styles.settingsFieldLabelRow}>
          <View style={styles.settingsRowIcon}>
            <MaterialCommunityIcons name="message-draw" size={18} color={colors.accent} />
          </View>
          <Text style={styles.settingsRowTitle}>Sugestão para a Tariel.ia</Text>
        </View>
        <TextInput
          multiline
          onChangeText={onFeedbackDraftChange}
          placeholder="Conte o que você mudaria, melhoraria ou adicionaria no app."
          placeholderTextColor={colors.textSecondary}
          style={styles.settingsTextArea}
          value={feedbackDraft}
        />
      </View>
      {ultimoTicketSuporte?.kind === "feedback" ? (
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Último feedback salvo</Text>
          <Text style={styles.settingsInfoText}>{ultimoTicketSuporte.body}</Text>
          <Text style={styles.settingsInfoSubtle}>
            {ultimoTicketSuporte.status} • {formatarHorarioAtividade(ultimoTicketSuporte.createdAt)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
