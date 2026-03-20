import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import type { MobileAttachment } from "../../types/mobile";
import { styles } from "../InspectorMobileApp.styles";
import {
  ehImagemAnexo,
  nomeExibicaoAnexo,
  tamanhoHumanoAnexo,
  urlAnexoAbsoluta,
} from "./attachmentUtils";

interface MessageAttachmentCardProps {
  attachment: MobileAttachment;
  accessToken: string | null;
  opening: boolean;
  onPress: (attachment: MobileAttachment) => void;
}

export function MessageAttachmentCard({
  attachment,
  accessToken,
  opening,
  onPress,
}: MessageAttachmentCardProps) {
  const imageAttachment = ehImagemAnexo(attachment);
  const absoluteUrl = urlAnexoAbsoluta(attachment.url);
  const disabled = !absoluteUrl || !accessToken || opening;
  const tamanho = tamanhoHumanoAnexo(attachment.tamanho_bytes);
  const titulo = nomeExibicaoAnexo(
    attachment,
    imageAttachment ? "Imagem" : "Documento",
  );

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress(attachment)}
      style={[
        styles.messageAttachmentCard,
        disabled ? styles.messageAttachmentCardDisabled : null,
      ]}
    >
      {imageAttachment && absoluteUrl && accessToken ? (
        <Image
          source={{
            uri: absoluteUrl,
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }}
          style={styles.messageAttachmentImagePreview}
        />
      ) : (
        <View style={styles.messageAttachmentIconCircle}>
          <MaterialCommunityIcons
            name={imageAttachment ? "image-outline" : "file-document-outline"}
            size={18}
            color={colors.accent}
          />
        </View>
      )}

      <View style={styles.messageAttachmentBody}>
        <Text numberOfLines={1} style={styles.messageAttachmentTitle}>
          {titulo}
        </Text>
        <Text style={styles.messageAttachmentCaption}>
          {imageAttachment ? "Imagem" : "Documento"}
          {tamanho ? ` • ${tamanho}` : ""}
        </Text>
      </View>

      <View style={styles.messageAttachmentAction}>
        {opening ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <MaterialCommunityIcons
            name={
              disabled
                ? "lock-outline"
                : imageAttachment
                  ? "image-search-outline"
                  : "download-outline"
            }
            size={18}
            color={disabled ? colors.textSecondary : colors.accent}
          />
        )}
      </View>
    </Pressable>
  );
}

interface MessageReferenceCardProps {
  messageId: number;
  preview: string;
  onPress: () => void;
  variant?: "incoming" | "outgoing";
}

export function MessageReferenceCard({
  messageId,
  preview,
  onPress,
  variant = "incoming",
}: MessageReferenceCardProps) {
  const outgoing = variant === "outgoing";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.messageReferenceCard,
        outgoing ? styles.messageReferenceCardOutgoing : null,
      ]}
    >
      <View
        style={[
          styles.messageReferenceIcon,
          outgoing ? styles.messageReferenceIconOutgoing : null,
        ]}
      >
        <MaterialCommunityIcons
          name="reply-outline"
          size={14}
          color={outgoing ? colors.white : colors.accent}
        />
      </View>
      <View style={styles.messageReferenceCopy}>
        <Text
          style={[
            styles.messageReferenceTitle,
            outgoing ? styles.messageReferenceTitleOutgoing : null,
          ]}
        >
          Referência #{messageId}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.messageReferenceText,
            outgoing ? styles.messageReferenceTextOutgoing : null,
          ]}
        >
          {preview}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="arrow-top-right"
        size={16}
        color={outgoing ? "rgba(255,255,255,0.78)" : colors.accent}
      />
    </Pressable>
  );
}
