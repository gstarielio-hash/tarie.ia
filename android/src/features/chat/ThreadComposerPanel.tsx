import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import type { MessageReferenceState } from "./types";

type ComposerAttachmentDraft =
  | {
      kind: "image";
      label: string;
      resumo: string;
      previewUri: string;
    }
  | {
      kind: "document";
      label: string;
      resumo: string;
    };

export interface ThreadComposerPanelProps {
  visible: boolean;
  keyboardVisible: boolean;
  canReopen: boolean;
  onReopen: () => void;
  vendoMesa: boolean;
  erroMesa: string;
  mensagemMesaReferenciaAtiva: MessageReferenceState | null;
  onLimparReferenciaMesaAtiva: () => void;
  anexoMesaRascunho: ComposerAttachmentDraft | null;
  onClearAnexoMesaRascunho: () => void;
  podeAbrirAnexosMesa: boolean;
  podeUsarComposerMesa: boolean;
  mensagemMesa: string;
  onSetMensagemMesa: (value: string) => void;
  placeholderMesa: string;
  podeEnviarMesa: boolean;
  onEnviarMensagemMesa: () => void;
  enviandoMesa: boolean;
  showVoiceInputAction: boolean;
  onVoiceInputPress: () => void;
  voiceInputEnabled: boolean;
  composerNotice: string;
  anexoRascunho: ComposerAttachmentDraft | null;
  onClearAnexoRascunho: () => void;
  podeAbrirAnexosChat: boolean;
  podeAcionarComposer: boolean;
  mensagem: string;
  onSetMensagem: (value: string) => void;
  placeholderComposer: string;
  podeEnviarComposer: boolean;
  onEnviarMensagem: () => void;
  enviandoMensagem: boolean;
  onAbrirSeletorAnexo: () => void;
  dynamicComposerInputStyle: StyleProp<TextStyle>;
  accentColor: string;
}

function AttachmentDraftCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachmentDraft;
  onRemove: () => void;
}) {
  return (
    <View style={styles.attachmentDraftCard}>
      <View style={styles.attachmentDraftHeader}>
        {attachment.kind === "image" ? (
          <Image
            source={{ uri: attachment.previewUri }}
            style={styles.attachmentDraftPreview}
          />
        ) : (
          <View style={styles.attachmentDraftIcon}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={18}
              color={colors.accent}
            />
          </View>
        )}
        <View style={styles.attachmentDraftCopy}>
          <Text style={styles.attachmentDraftTitle}>{attachment.label}</Text>
          <Text style={styles.attachmentDraftDescription}>
            {attachment.resumo}
          </Text>
        </View>
        <Pressable onPress={onRemove} style={styles.attachmentDraftRemove}>
          <MaterialCommunityIcons
            name="close"
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function ThreadComposerPanel({
  visible,
  keyboardVisible,
  canReopen,
  onReopen,
  vendoMesa,
  erroMesa,
  mensagemMesaReferenciaAtiva,
  onLimparReferenciaMesaAtiva,
  anexoMesaRascunho,
  onClearAnexoMesaRascunho,
  podeAbrirAnexosMesa,
  podeUsarComposerMesa,
  mensagemMesa,
  onSetMensagemMesa,
  placeholderMesa,
  podeEnviarMesa,
  onEnviarMensagemMesa,
  enviandoMesa,
  showVoiceInputAction,
  onVoiceInputPress,
  voiceInputEnabled,
  composerNotice,
  anexoRascunho,
  onClearAnexoRascunho,
  podeAbrirAnexosChat,
  podeAcionarComposer,
  mensagem,
  onSetMensagem,
  placeholderComposer,
  podeEnviarComposer,
  onEnviarMensagem,
  enviandoMensagem,
  onAbrirSeletorAnexo,
  dynamicComposerInputStyle,
  accentColor,
}: ThreadComposerPanelProps) {
  if (!visible) {
    return null;
  }

  const showComposerHeader = vendoMesa;
  const showInlineComposerNotice = Boolean(!vendoMesa && composerNotice);
  const composerTitle = podeUsarComposerMesa
    ? "Responder à mesa"
    : "Mesa em leitura";
  const composerStatusLabel = vendoMesa
    ? podeUsarComposerMesa
      ? "Resposta liberada"
      : "Modo leitura"
    : "";
  const composerStatusStyle = vendoMesa
    ? podeUsarComposerMesa
      ? styles.composerStatusBadgeAccent
      : null
    : null;
  const composerStatusTextStyle = vendoMesa
    ? podeUsarComposerMesa
      ? styles.composerStatusBadgeTextAccent
      : null
    : null;

  return (
    <View
      style={[
        styles.composerCard,
        keyboardVisible ? styles.composerCardKeyboardVisible : null,
      ]}
    >
      {showComposerHeader ? (
        <View style={styles.composerHeader}>
          <View style={styles.composerHeaderCopy}>
            <Text style={styles.composerTitle}>{composerTitle}</Text>
            {!!composerNotice ? (
              <Text style={styles.composerSubtitle}>{composerNotice}</Text>
            ) : null}
          </View>
          <View style={[styles.composerStatusBadge, composerStatusStyle]}>
            <Text
              style={[styles.composerStatusBadgeText, composerStatusTextStyle]}
            >
              {composerStatusLabel}
            </Text>
          </View>
        </View>
      ) : null}

      {canReopen || showInlineComposerNotice ? (
        <View style={styles.composerMiniActions}>
          {canReopen ? (
            <Pressable
              accessibilityLabel="Reabrir laudo"
              hitSlop={8}
              onPress={onReopen}
              style={styles.composerMiniAction}
              testID="chat-composer-reopen-icon"
            >
              <MaterialCommunityIcons
                name="history"
                size={14}
                color={colors.accent}
              />
            </Pressable>
          ) : null}
          {showInlineComposerNotice ? (
            <Pressable
              accessibilityLabel="Detalhes da configuração atual da IA"
              hitSlop={8}
              onPress={() => {
                Alert.alert("Configuração atual da IA", composerNotice);
              }}
              style={styles.composerMiniAction}
              testID="chat-composer-ai-notice-icon"
            >
              <MaterialCommunityIcons
                name="robot-outline"
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {vendoMesa ? (
        <>
          {!!erroMesa && <Text style={styles.errorText}>{erroMesa}</Text>}

          {mensagemMesaReferenciaAtiva ? (
            <View style={styles.composerReferenceCard}>
              <View style={styles.composerReferenceCopy}>
                <Text style={styles.composerReferenceTitle}>
                  Respondendo #{mensagemMesaReferenciaAtiva.id}
                </Text>
                <Text style={styles.composerReferenceText}>
                  {mensagemMesaReferenciaAtiva.texto}
                </Text>
              </View>
              <Pressable
                onPress={onLimparReferenciaMesaAtiva}
                style={styles.composerReferenceRemove}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}

          {anexoMesaRascunho ? (
            <AttachmentDraftCard
              attachment={anexoMesaRascunho}
              onRemove={onClearAnexoMesaRascunho}
            />
          ) : null}

          <View style={styles.composerRow}>
            <Pressable
              accessibilityState={{ disabled: !podeAbrirAnexosMesa }}
              onPress={() => {
                if (!podeAbrirAnexosMesa) {
                  return;
                }
                onAbrirSeletorAnexo();
              }}
              style={[
                styles.attachInsideButton,
                !podeAbrirAnexosMesa ? styles.attachButtonDisabled : null,
              ]}
              testID="mesa-attach-button"
            >
              <MaterialCommunityIcons
                name="paperclip"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
            {showVoiceInputAction ? (
              <Pressable
                accessibilityState={{ disabled: !voiceInputEnabled }}
                onPress={() => {
                  onVoiceInputPress();
                }}
                style={[
                  styles.attachInsideButton,
                  !voiceInputEnabled ? styles.attachButtonDisabled : null,
                ]}
                testID="mesa-voice-button"
              >
                <MaterialCommunityIcons
                  name={
                    voiceInputEnabled ? "microphone-outline" : "microphone-off"
                  }
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            ) : null}
            <TextInput
              editable={podeUsarComposerMesa}
              multiline
              onChangeText={onSetMensagemMesa}
              placeholder={placeholderMesa}
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.composerInput,
                dynamicComposerInputStyle,
                !podeUsarComposerMesa ? styles.composerInputDisabled : null,
              ]}
              testID="mesa-composer-input"
              value={mensagemMesa}
            />

            <Pressable
              accessibilityState={{ disabled: !podeEnviarMesa }}
              onPress={() => {
                if (!podeEnviarMesa) {
                  return;
                }
                onEnviarMensagemMesa();
              }}
              style={[
                styles.sendButton,
                { backgroundColor: accentColor },
                !podeEnviarMesa ? styles.sendButtonDisabled : null,
              ]}
              testID="mesa-send-button"
            >
              {enviandoMesa ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <MaterialCommunityIcons
                  name="send"
                  size={20}
                  color={colors.white}
                />
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {anexoRascunho ? (
            <AttachmentDraftCard
              attachment={anexoRascunho}
              onRemove={onClearAnexoRascunho}
            />
          ) : null}

          <View style={styles.composerRow}>
            <Pressable
              accessibilityState={{ disabled: !podeAbrirAnexosChat }}
              onPress={() => {
                if (!podeAbrirAnexosChat) {
                  return;
                }
                onAbrirSeletorAnexo();
              }}
              style={[
                styles.attachInsideButton,
                !podeAbrirAnexosChat ? styles.attachButtonDisabled : null,
              ]}
              testID="chat-attach-button"
            >
              <MaterialCommunityIcons
                name="paperclip"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
            {showVoiceInputAction ? (
              <Pressable
                accessibilityState={{ disabled: !voiceInputEnabled }}
                onPress={() => {
                  onVoiceInputPress();
                }}
                style={[
                  styles.attachInsideButton,
                  !voiceInputEnabled ? styles.attachButtonDisabled : null,
                ]}
                testID="chat-voice-button"
              >
                <MaterialCommunityIcons
                  name={
                    voiceInputEnabled ? "microphone-outline" : "microphone-off"
                  }
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            ) : null}
            <TextInput
              editable={podeAcionarComposer}
              multiline
              onChangeText={onSetMensagem}
              placeholder={placeholderComposer}
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.composerInput,
                dynamicComposerInputStyle,
                !podeAcionarComposer ? styles.composerInputDisabled : null,
              ]}
              testID="chat-composer-input"
              value={mensagem}
            />

            <Pressable
              accessibilityState={{ disabled: !podeEnviarComposer }}
              onPress={() => {
                if (!podeEnviarComposer) {
                  return;
                }
                onEnviarMensagem();
              }}
              style={[
                styles.sendButton,
                { backgroundColor: accentColor },
                !podeEnviarComposer ? styles.sendButtonDisabled : null,
              ]}
              testID="chat-send-button"
            >
              {enviandoMensagem ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <MaterialCommunityIcons
                  name="send"
                  size={20}
                  color={colors.white}
                />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
