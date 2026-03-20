import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { RefObject } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  AssistantCitationList,
  AssistantMessageContent,
} from "../../components/AssistantRichMessage";
import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../theme/tokens";
import type { MobileAttachment, MobileChatMessage, MobileMesaMessage } from "../../types/mobile";
import { styles } from "../InspectorMobileApp.styles";
import { MessageAttachmentCard, MessageReferenceCard } from "./MessageCards";

interface ThreadConversationPaneProps {
  vendoMesa: boolean;
  carregandoMesa: boolean;
  mensagensMesa: MobileMesaMessage[];
  mesaDisponivel: boolean;
  scrollRef: RefObject<ScrollView | null>;
  keyboardVisible: boolean;
  threadKeyboardPaddingBottom: number;
  nomeUsuarioExibicao: string;
  mensagensVisiveis: MobileChatMessage[];
  obterResumoReferenciaMensagem: (
    referenciaId: number | null,
    mensagensVisiveis: MobileChatMessage[],
    mensagensMesa: MobileMesaMessage[],
  ) => string;
  onAbrirReferenciaNoChat: (id: number) => void;
  sessionAccessToken: string | null;
  onAbrirAnexo: (attachment: MobileAttachment) => void;
  anexoAbrindoChave: string;
  toAttachmentKey: (attachment: MobileAttachment, fallback: string) => string;
  conversaPermiteEdicao: boolean;
  onDefinirReferenciaMesaAtiva: (item: MobileMesaMessage) => void;
  accentColor: string;
  carregandoConversa: boolean;
  conversaVazia: boolean;
  mensagemChatDestacadaId: number | null;
  onRegistrarLayoutMensagemChat: (id: number | null, y: number) => void;
  dynamicMessageBubbleStyle: StyleProp<ViewStyle>;
  dynamicMessageTextStyle: StyleProp<TextStyle>;
  enviandoMensagem: boolean;
  brandMarkSource: ImageSourcePropType;
}

export function ThreadConversationPane({
  vendoMesa,
  carregandoMesa,
  mensagensMesa,
  mesaDisponivel,
  scrollRef,
  keyboardVisible,
  threadKeyboardPaddingBottom,
  nomeUsuarioExibicao,
  mensagensVisiveis,
  obterResumoReferenciaMensagem,
  onAbrirReferenciaNoChat,
  sessionAccessToken,
  onAbrirAnexo,
  anexoAbrindoChave,
  toAttachmentKey,
  conversaPermiteEdicao,
  onDefinirReferenciaMesaAtiva,
  accentColor,
  carregandoConversa,
  conversaVazia,
  mensagemChatDestacadaId,
  onRegistrarLayoutMensagemChat,
  dynamicMessageBubbleStyle,
  dynamicMessageTextStyle,
  enviandoMensagem,
  brandMarkSource,
}: ThreadConversationPaneProps) {
  if (vendoMesa) {
    if (carregandoMesa && !mensagensMesa.length) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Abrindo a conversa com a mesa...</Text>
        </View>
      );
    }

    if (!mesaDisponivel) {
      return (
        <View
          style={[
            styles.threadEmptyState,
            keyboardVisible ? styles.threadEmptyStateKeyboardVisible : null,
          ]}
        >
          <EmptyState
            compact
            description="Envie o primeiro registro no chat para liberar este espaço."
            eyebrow="Mesa"
            icon="clipboard-clock-outline"
            tone="accent"
            title="Mesa disponível após o primeiro laudo"
          />
        </View>
      );
    }

    return (
      <ScrollView
        ref={scrollRef}
        style={styles.threadScroll}
        contentContainerStyle={[
          styles.threadContent,
          keyboardVisible ? styles.threadContentKeyboard : null,
          keyboardVisible ? { paddingBottom: threadKeyboardPaddingBottom } : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {mensagensMesa.length ? (
          mensagensMesa.map((item, index) => {
            const mensagemEhUsuario = item.tipo === "humano_insp";
            const mensagemEhMesa = item.tipo === "humano_eng";
            const nomeAutor = mensagemEhUsuario ? nomeUsuarioExibicao : "Mesa";
            const referenciaId = Number(item.referencia_mensagem_id || 0) || null;
            const referenciaPreview = obterResumoReferenciaMensagem(
              referenciaId,
              mensagensVisiveis,
              mensagensMesa,
            );

            return (
              <View
                key={`${item.id}-${index}`}
                style={[
                  styles.messageRow,
                  mensagemEhUsuario ? styles.messageRowOutgoing : styles.messageRowIncoming,
                ]}
              >
                {mensagemEhUsuario ? (
                  <View
                    style={[
                      styles.messageBubble,
                      styles.messageBubbleOutgoing,
                      dynamicMessageBubbleStyle,
                    ]}
                  >
                    <Text style={[styles.messageAuthor, styles.messageAuthorOutgoing]}>{nomeAutor}</Text>
                    {referenciaId ? (
                      <MessageReferenceCard
                        messageId={referenciaId}
                        onPress={() => onAbrirReferenciaNoChat(referenciaId)}
                        preview={referenciaPreview}
                        variant="outgoing"
                      />
                    ) : null}
                    <Text style={[styles.messageText, styles.messageTextOutgoing, dynamicMessageTextStyle]}>
                      {item.texto}
                    </Text>
                    {item.anexos?.length ? (
                      <View style={styles.messageAttachments}>
                        {item.anexos.map((anexo, anexoIndex) => {
                          return (
                            <MessageAttachmentCard
                              key={`${item.id}-anexo-${anexoIndex}`}
                              accessToken={sessionAccessToken}
                              attachment={anexo}
                              onPress={onAbrirAnexo}
                              opening={anexoAbrindoChave === toAttachmentKey(anexo, `${item.id}-anexo-${anexoIndex}`)}
                            />
                          );
                        })}
                      </View>
                    ) : null}
                    <Text style={[styles.messageMeta, styles.messageMetaOutgoing]}>
                      {item.data}
                      {item.resolvida_em_label ? ` • resolvida em ${item.resolvida_em_label}` : ""}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.messageIncomingCluster}>
                    <View style={[styles.messageAvatar, styles.messageAvatarMesa]}>
                      <MaterialCommunityIcons color={colors.accent} name="clipboard-text-outline" size={16} />
                    </View>
                    <View
                      style={[
                        styles.messageBubble,
                        styles.messageBubbleIncomingShell,
                        mensagemEhMesa ? styles.messageBubbleEngineering : styles.messageBubbleIncoming,
                      ]}
                    >
                      <View style={styles.messageHeaderRow}>
                        <Text style={styles.messageAuthor}>{nomeAutor}</Text>
                        <View
                          style={[
                            styles.messageStatusBadge,
                            item.resolvida_em_label
                              ? styles.messageStatusBadgeSuccess
                              : styles.messageStatusBadgeAccent,
                          ]}
                        >
                          <Text
                            style={[
                              styles.messageStatusBadgeText,
                              item.resolvida_em_label
                                ? styles.messageStatusBadgeTextSuccess
                                : styles.messageStatusBadgeTextAccent,
                            ]}
                          >
                            {item.resolvida_em_label ? "Resolvida" : "Mesa ativa"}
                          </Text>
                        </View>
                      </View>
                      {referenciaId ? (
                        <MessageReferenceCard
                          messageId={referenciaId}
                          onPress={() => onAbrirReferenciaNoChat(referenciaId)}
                          preview={referenciaPreview}
                        />
                      ) : null}
                      <Text style={[styles.messageText, dynamicMessageTextStyle]}>{item.texto}</Text>
                      {item.anexos?.length ? (
                        <View style={styles.messageAttachments}>
                          {item.anexos.map((anexo, anexoIndex) => {
                            return (
                              <MessageAttachmentCard
                                key={`${item.id}-anexo-${anexoIndex}`}
                                accessToken={sessionAccessToken}
                                attachment={anexo}
                                onPress={onAbrirAnexo}
                                opening={anexoAbrindoChave === toAttachmentKey(anexo, `${item.id}-anexo-${anexoIndex}`)}
                              />
                            );
                          })}
                        </View>
                      ) : null}
                      {conversaPermiteEdicao ? (
                        <View style={styles.messageActionRow}>
                          <Pressable
                            onPress={() => onDefinirReferenciaMesaAtiva(item)}
                            style={styles.messageActionButton}
                          >
                            <MaterialCommunityIcons name="reply-outline" size={15} color={colors.accent} />
                            <Text style={styles.messageActionText}>Responder nesta mensagem</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      <Text style={styles.messageMeta}>
                        {item.data}
                        {item.resolvida_em_label ? ` • resolvida em ${item.resolvida_em_label}` : ""}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View
            style={[
              styles.threadEmptyState,
              keyboardVisible ? styles.threadEmptyStateKeyboardVisible : null,
            ]}
          >
            <EmptyState
              compact
              description="Quando a mesa responder, os retornos aparecem aqui."
              eyebrow="Mesa"
              icon="message-reply-text-outline"
              title="Nenhum retorno técnico"
            />
          </View>
        )}
      </ScrollView>
    );
  }

  if (carregandoConversa) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Carregando a conversa do inspetor...</Text>
      </View>
    );
  }

  if (conversaVazia) {
    return (
      <View
        style={[
          styles.threadEmptyState,
          keyboardVisible ? styles.threadEmptyStateKeyboardVisible : null,
        ]}
      >
        <EmptyState
          compact
          icon="message-processing-outline"
        />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.threadScroll}
      contentContainerStyle={[
        styles.threadContent,
        keyboardVisible ? styles.threadContentKeyboard : null,
        keyboardVisible ? { paddingBottom: threadKeyboardPaddingBottom } : null,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {mensagensVisiveis.map((item, index) => {
        const mensagemEhUsuario = item.papel === "usuario";
        const mensagemEhEngenharia = item.papel === "engenheiro";
        const mensagemEhAssistente = item.papel === "assistente";
        const nomeAutor = mensagemEhUsuario
          ? nomeUsuarioExibicao
          : mensagemEhEngenharia
            ? "Mesa"
            : "Tariel.ia";
        const referenciaId = Number(item.referencia_mensagem_id || 0) || null;
        const referenciaPreview = obterResumoReferenciaMensagem(
          referenciaId,
          mensagensVisiveis,
          mensagensMesa,
        );
        const mensagemDestacada = Boolean(item.id && item.id === mensagemChatDestacadaId);

        return (
          <View
            key={`${item.id ?? "placeholder"}-${index}`}
            onLayout={(event) => onRegistrarLayoutMensagemChat(item.id, event.nativeEvent.layout.y)}
            style={[
              styles.messageRow,
              mensagemEhUsuario ? styles.messageRowOutgoing : styles.messageRowIncoming,
            ]}
          >
            {mensagemEhUsuario ? (
              <View
                style={[
                  styles.messageBubble,
                  styles.messageBubbleOutgoing,
                  mensagemDestacada ? styles.messageBubbleReferenced : null,
                ]}
              >
                <Text style={[styles.messageAuthor, styles.messageAuthorOutgoing]}>{nomeAutor}</Text>
                {referenciaId ? (
                  <MessageReferenceCard
                    messageId={referenciaId}
                    onPress={() => onAbrirReferenciaNoChat(referenciaId)}
                    preview={referenciaPreview}
                    variant="outgoing"
                  />
                ) : null}
                <Text style={[styles.messageText, styles.messageTextOutgoing, dynamicMessageTextStyle]}>
                  {item.texto === "[imagem]" ? "Imagem enviada" : item.texto}
                </Text>
                {item.anexos?.length ? (
                  <View style={styles.messageAttachments}>
                    {item.anexos.map((anexo, anexoIndex) => {
                      return (
                        <MessageAttachmentCard
                          key={`${item.id ?? "msg"}-anexo-${anexoIndex}`}
                          accessToken={sessionAccessToken}
                          attachment={anexo}
                          onPress={onAbrirAnexo}
                          opening={
                            anexoAbrindoChave ===
                            toAttachmentKey(anexo, `${item.id ?? "msg"}-anexo-${anexoIndex}`)
                          }
                        />
                      );
                    })}
                  </View>
                ) : null}
                {item.citacoes?.length ? (
                  <Text style={[styles.messageMeta, styles.messageMetaOutgoing]}>
                    {item.citacoes.length} referência{item.citacoes.length > 1 ? "s" : ""} anexada
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.messageIncomingCluster}>
                {mensagemEhEngenharia ? (
                  <View style={[styles.messageAvatar, styles.messageAvatarEngineering]}>
                    <MaterialCommunityIcons color={colors.accent} name="clipboard-check-outline" size={16} />
                  </View>
                ) : (
                  <Image source={brandMarkSource} style={styles.messageAvatarBrand} />
                )}
                <View
                  style={[
                    styles.messageBubble,
                    styles.messageBubbleIncomingShell,
                    mensagemEhEngenharia ? styles.messageBubbleEngineering : styles.messageBubbleIncoming,
                    mensagemDestacada ? styles.messageBubbleReferenced : null,
                    dynamicMessageBubbleStyle,
                  ]}
                >
                  <View style={styles.messageHeaderRow}>
                    <Text style={styles.messageAuthor}>{nomeAutor}</Text>
                    {mensagemEhEngenharia ? (
                      <View style={[styles.messageStatusBadge, styles.messageStatusBadgeAccent]}>
                        <Text style={[styles.messageStatusBadgeText, styles.messageStatusBadgeTextAccent]}>
                          Mesa
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {referenciaId ? (
                    <MessageReferenceCard
                      messageId={referenciaId}
                      onPress={() => onAbrirReferenciaNoChat(referenciaId)}
                      preview={referenciaPreview}
                    />
                  ) : null}
                  {mensagemEhAssistente ? (
                    <AssistantMessageContent
                      text={item.texto === "[imagem]" ? "Imagem enviada" : item.texto}
                      textStyle={[styles.messageText, dynamicMessageTextStyle]}
                    />
                  ) : (
                    <Text style={[styles.messageText, dynamicMessageTextStyle]}>
                      {item.texto === "[imagem]" ? "Imagem enviada" : item.texto}
                    </Text>
                  )}
                  {item.anexos?.length ? (
                    <View style={styles.messageAttachments}>
                      {item.anexos.map((anexo, anexoIndex) => {
                        return (
                          <MessageAttachmentCard
                            key={`${item.id ?? "msg"}-anexo-${anexoIndex}`}
                            accessToken={sessionAccessToken}
                            attachment={anexo}
                            onPress={onAbrirAnexo}
                            opening={
                              anexoAbrindoChave ===
                              toAttachmentKey(anexo, `${item.id ?? "msg"}-anexo-${anexoIndex}`)
                            }
                          />
                        );
                      })}
                    </View>
                  ) : null}
                  {mensagemEhAssistente ? (
                    <AssistantCitationList citations={item.citacoes} />
                  ) : item.citacoes?.length ? (
                    <Text style={styles.messageMeta}>
                      {item.citacoes.length} referência{item.citacoes.length > 1 ? "s" : ""} anexada
                    </Text>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        );
      })}

      {enviandoMensagem ? (
        <View style={styles.typingRow}>
          <View style={styles.typingBubble}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.typingText}>Tariel.ia está respondendo...</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
