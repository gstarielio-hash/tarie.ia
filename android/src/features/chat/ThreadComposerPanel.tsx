import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
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

interface MessageReferenceState {
  id: number;
  texto: string;
}

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

interface ThreadComposerPanelProps {
  visible: boolean;
  keyboardVisible: boolean;
  composerKeyboardBottomOffset: number;
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
          <Image source={{ uri: attachment.previewUri }} style={styles.attachmentDraftPreview} />
        ) : (
          <View style={styles.attachmentDraftIcon}>
            <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.accent} />
          </View>
        )}
        <View style={styles.attachmentDraftCopy}>
          <Text style={styles.attachmentDraftTitle}>{attachment.label}</Text>
          <Text style={styles.attachmentDraftDescription}>{attachment.resumo}</Text>
        </View>
        <Pressable onPress={onRemove} style={styles.attachmentDraftRemove}>
          <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export function ThreadComposerPanel({
  visible,
  keyboardVisible,
  composerKeyboardBottomOffset,
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

  return (
    <View
      style={[
        styles.composerCard,
        keyboardVisible ? styles.composerCardKeyboardVisible : null,
        keyboardVisible ? { bottom: composerKeyboardBottomOffset } : null,
      ]}
    >
      {canReopen ? (
        <Pressable onPress={onReopen} style={styles.cleanReopenAction}>
          <MaterialCommunityIcons name="history" size={16} color={colors.accent} />
          <Text style={styles.cleanReopenActionText}>Reabrir laudo</Text>
        </Pressable>
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
                <Text style={styles.composerReferenceText}>{mensagemMesaReferenciaAtiva.texto}</Text>
              </View>
              <Pressable onPress={onLimparReferenciaMesaAtiva} style={styles.composerReferenceRemove}>
                <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          {anexoMesaRascunho ? (
            <AttachmentDraftCard attachment={anexoMesaRascunho} onRemove={onClearAnexoMesaRascunho} />
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
              style={[styles.attachInsideButton, !podeAbrirAnexosMesa ? styles.attachButtonDisabled : null]}
              testID="mesa-attach-button"
            >
              <MaterialCommunityIcons name="paperclip" size={18} color={colors.textSecondary} />
            </Pressable>
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
                <MaterialCommunityIcons name="send" size={20} color={colors.white} />
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {anexoRascunho ? (
            <AttachmentDraftCard attachment={anexoRascunho} onRemove={onClearAnexoRascunho} />
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
              style={[styles.attachInsideButton, !podeAbrirAnexosChat ? styles.attachButtonDisabled : null]}
              testID="chat-attach-button"
            >
              <MaterialCommunityIcons name="paperclip" size={18} color={colors.textSecondary} />
            </Pressable>
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
                <MaterialCommunityIcons name="send" size={20} color={colors.white} />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
