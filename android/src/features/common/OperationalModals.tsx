import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function AttachmentPickerModal({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (option: "camera" | "galeria" | "documento") => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.activityModalBackdrop}>
        <View style={styles.activityModalCard}>
          <View style={styles.activityModalHeader}>
            <View style={styles.activityModalCopy}>
              <Text style={styles.activityModalEyebrow}>anexar</Text>
              <Text style={styles.activityModalTitle}>Escolha o anexo</Text>
              <Text style={styles.activityModalDescription}>
                Envie uma foto, uma imagem da galeria ou um documento no mesmo fluxo da conversa.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.activityModalClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.actionList}>
            <Pressable onPress={() => onChoose("camera")} style={styles.actionItem}>
              <MaterialCommunityIcons name="camera-outline" size={20} color={colors.accent} />
              <Text style={styles.actionText}>Câmera</Text>
            </Pressable>
            <Pressable onPress={() => onChoose("galeria")} style={styles.actionItem}>
              <MaterialCommunityIcons name="image-outline" size={20} color={colors.accent} />
              <Text style={styles.actionText}>Galeria</Text>
            </Pressable>
            <Pressable onPress={() => onChoose("documento")} style={styles.actionItem}>
              <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.accent} />
              <Text style={styles.actionText}>Documento</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ActivityCenterModal<TNotification extends {
  id: string;
  kind: "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta";
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  targetThread: "chat" | "mesa";
}>({
  visible,
  onClose,
  monitorandoAtividade,
  notificacoes,
  onAbrirNotificacao,
  formatarHorarioAtividade,
}: {
  visible: boolean;
  onClose: () => void;
  monitorandoAtividade: boolean;
  notificacoes: readonly TNotification[];
  onAbrirNotificacao: (item: TNotification) => void;
  formatarHorarioAtividade: (value: string) => string;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.activityModalBackdrop}>
        <View style={styles.activityModalCard}>
          <View style={styles.activityModalHeader}>
            <View style={styles.activityModalCopy}>
              <Text style={styles.activityModalEyebrow}>tariel.ia</Text>
              <Text style={styles.activityModalTitle}>Central de atividade</Text>
              <Text style={styles.activityModalDescription}>
                Alertas recentes do laudo ativo e da mesa enquanto o app estiver em uso.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.activityModalClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {monitorandoAtividade ? (
            <View style={styles.activityModalLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.activityModalLoadingText}>Atualizando atividade...</Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.activityModalList}>
            {notificacoes.length ? (
              notificacoes.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onAbrirNotificacao(item)}
                  style={[
                    styles.activityItem,
                    item.unread ? styles.activityItemUnread : null,
                  ]}
                >
                  <View style={styles.activityItemIcon}>
                    <MaterialCommunityIcons
                      name={
                        item.kind === "status"
                          ? "progress-clock"
                          : item.kind === "mesa_resolvida"
                            ? "check-decagram-outline"
                            : item.kind === "mesa_reaberta"
                              ? "alert-circle-outline"
                              : "message-text-outline"
                      }
                      size={18}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.activityItemBody}>
                    <View style={styles.activityItemTop}>
                      <Text style={styles.activityItemTitle}>{item.title}</Text>
                      <Text style={styles.activityItemTime}>{formatarHorarioAtividade(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.activityItemText}>{item.body}</Text>
                    <Text style={styles.activityItemHint}>
                      {item.targetThread === "mesa" ? "Abrir na aba Mesa" : "Abrir no Chat"}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.activityEmptyState}>
                <MaterialCommunityIcons name="bell-outline" size={26} color={colors.textSecondary} />
                <Text style={styles.activityEmptyTitle}>Nenhuma atividade recente</Text>
                <Text style={styles.activityEmptyText}>
                  Quando a mesa responder ou um laudo mudar de status, isso aparece aqui.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function OfflineQueueModal<TOfflineItem extends {
  id: string;
  channel: "chat" | "mesa";
  title: string;
  createdAt: string;
  lastError: string;
}>({
  visible,
  onClose,
  resumoFilaOfflineFiltrada,
  sincronizandoFilaOffline,
  podeSincronizarFilaOffline,
  sincronizacaoDispositivos,
  statusApi,
  onSincronizarFilaOffline,
  filtrosFilaOffline,
  filtroFilaOffline,
  onSetFiltroFilaOffline,
  filaOfflineFiltrada,
  filaOfflineOrdenadaTotal,
  sincronizandoItemFilaId,
  onSincronizarItemFilaOffline,
  onRetomarItemFilaOffline,
  onRemoverItemFilaOffline,
  formatarHorarioAtividade,
  iconePendenciaOffline,
  resumoPendenciaOffline,
  legendaPendenciaOffline,
  rotuloStatusPendenciaOffline,
  detalheStatusPendenciaOffline,
  pendenciaFilaProntaParaReenvio,
}: {
  visible: boolean;
  onClose: () => void;
  resumoFilaOfflineFiltrada: string;
  sincronizandoFilaOffline: boolean;
  podeSincronizarFilaOffline: boolean;
  sincronizacaoDispositivos: boolean;
  statusApi: string;
  onSincronizarFilaOffline: () => void;
  filtrosFilaOffline: readonly { key: string; label: string; count: number }[];
  filtroFilaOffline: string;
  onSetFiltroFilaOffline: (key: string) => void;
  filaOfflineFiltrada: readonly TOfflineItem[];
  filaOfflineOrdenadaTotal: number;
  sincronizandoItemFilaId: string;
  onSincronizarItemFilaOffline: (item: TOfflineItem) => void;
  onRetomarItemFilaOffline: (item: TOfflineItem) => void;
  onRemoverItemFilaOffline: (id: string) => void;
  formatarHorarioAtividade: (value: string) => string;
  iconePendenciaOffline: (item: TOfflineItem) => IconName;
  resumoPendenciaOffline: (item: TOfflineItem) => string;
  legendaPendenciaOffline: (item: TOfflineItem) => string;
  rotuloStatusPendenciaOffline: (item: TOfflineItem) => string;
  detalheStatusPendenciaOffline: (item: TOfflineItem) => string;
  pendenciaFilaProntaParaReenvio: (item: TOfflineItem) => boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.activityModalBackdrop}>
        <View style={styles.activityModalCard}>
          <View style={styles.activityModalHeader}>
            <View style={styles.activityModalCopy}>
              <Text style={styles.activityModalEyebrow}>tariel.ia</Text>
              <Text style={styles.activityModalTitle}>Fila offline</Text>
              <Text style={styles.activityModalDescription}>
                Envios guardados localmente para o inspetor retomar, revisar ou reenviar quando a conexão voltar.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.activityModalClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.offlineModalToolbar}>
            <Text style={styles.offlineModalToolbarText}>{resumoFilaOfflineFiltrada}</Text>
            {sincronizandoFilaOffline ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Pressable
                disabled={!podeSincronizarFilaOffline}
                onPress={onSincronizarFilaOffline}
                style={[
                  styles.offlineModalSyncButton,
                  !podeSincronizarFilaOffline ? styles.offlineModalSyncButtonDisabled : null,
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    podeSincronizarFilaOffline
                      ? "upload-outline"
                      : !sincronizacaoDispositivos
                        ? "sync-off"
                        : statusApi === "online"
                          ? "timer-sand"
                          : "cloud-off-outline"
                  }
                  size={16}
                  color={podeSincronizarFilaOffline ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.offlineModalSyncText,
                    !podeSincronizarFilaOffline ? styles.offlineModalSyncTextDisabled : null,
                  ]}
                >
                  Sincronizar
                </Text>
              </Pressable>
            )}
          </View>
          {!sincronizacaoDispositivos ? (
            <Text style={styles.offlineModalToolbarText}>
              Sincronização entre dispositivos está desativada nas configurações de dados.
            </Text>
          ) : null}

          <View style={styles.offlineModalFilters}>
            {filtrosFilaOffline.map((filtro) => {
              const ativo = filtroFilaOffline === filtro.key;
              return (
                <Pressable
                  key={filtro.key}
                  onPress={() => onSetFiltroFilaOffline(filtro.key)}
                  style={[
                    styles.offlineModalFilterChip,
                    ativo ? styles.offlineModalFilterChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.offlineModalFilterText,
                      ativo ? styles.offlineModalFilterTextActive : null,
                    ]}
                  >
                    {filtro.label}
                  </Text>
                  <View
                    style={[
                      styles.offlineModalFilterCount,
                      ativo ? styles.offlineModalFilterCountActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.offlineModalFilterCountText,
                        ativo ? styles.offlineModalFilterCountTextActive : null,
                      ]}
                    >
                      {filtro.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={styles.activityModalList}>
            {filaOfflineFiltrada.length ? (
              filaOfflineFiltrada.map((item) => (
                <View key={`offline-modal-${item.id}`} style={styles.offlineModalItem}>
                  <View style={styles.offlineModalItemTop}>
                    <View style={styles.offlineModalItemBadge}>
                      <MaterialCommunityIcons
                        name={iconePendenciaOffline(item)}
                        size={16}
                        color={item.lastError ? colors.danger : colors.accent}
                      />
                    </View>
                    <View style={styles.offlineModalItemCopy}>
                      <View style={styles.offlineModalItemHeading}>
                        <Text style={styles.offlineModalItemTitle}>
                          {item.channel === "mesa" ? "Mesa" : "Chat"} • {item.title}
                        </Text>
                        <Text style={styles.offlineModalItemTime}>{formatarHorarioAtividade(item.createdAt)}</Text>
                      </View>
                      <Text style={styles.offlineModalItemText}>{resumoPendenciaOffline(item)}</Text>
                      <Text style={styles.offlineModalItemHint}>{legendaPendenciaOffline(item)}</Text>
                      <View style={styles.offlineModalItemStatusRow}>
                        <View
                          style={[
                            styles.offlineModalItemStatusBadge,
                            item.lastError ? styles.offlineModalItemStatusBadgeError : null,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={item.lastError ? "alert-circle-outline" : "clock-outline"}
                            size={13}
                            color={item.lastError ? colors.danger : colors.accent}
                          />
                          <Text
                            style={[
                              styles.offlineModalItemStatusBadgeText,
                              item.lastError ? styles.offlineModalItemStatusBadgeTextError : null,
                            ]}
                          >
                            {rotuloStatusPendenciaOffline(item)}
                          </Text>
                        </View>
                        <Text style={styles.offlineModalItemStatusText}>{detalheStatusPendenciaOffline(item)}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.offlineModalItemActions}>
                    <Pressable
                      disabled={
                        !sincronizacaoDispositivos ||
                        statusApi !== "online" ||
                        sincronizandoFilaOffline ||
                        Boolean(sincronizandoItemFilaId)
                      }
                      onPress={() => onSincronizarItemFilaOffline(item)}
                      style={[
                        styles.offlineModalActionGhost,
                        !sincronizacaoDispositivos ||
                        statusApi !== "online" ||
                        sincronizandoFilaOffline ||
                        Boolean(sincronizandoItemFilaId)
                          ? styles.offlineModalActionGhostDisabled
                          : null,
                      ]}
                    >
                      {sincronizandoItemFilaId === item.id ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <MaterialCommunityIcons
                          name={pendenciaFilaProntaParaReenvio(item) ? "upload-outline" : "lightning-bolt-outline"}
                          size={16}
                          color={colors.accent}
                        />
                      )}
                      <Text
                        style={[
                          styles.offlineModalActionGhostText,
                          !sincronizacaoDispositivos ||
                          statusApi !== "online" ||
                          sincronizandoFilaOffline ||
                          Boolean(sincronizandoItemFilaId)
                            ? styles.offlineModalActionGhostTextDisabled
                            : null,
                        ]}
                      >
                        {pendenciaFilaProntaParaReenvio(item) ? "Enviar agora" : "Forçar agora"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onRetomarItemFilaOffline(item)}
                      style={styles.offlineModalActionPrimary}
                    >
                      <MaterialCommunityIcons name="reply-outline" size={16} color={colors.white} />
                      <Text style={styles.offlineModalActionPrimaryText}>Retomar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onRemoverItemFilaOffline(item.id)}
                      style={styles.offlineModalActionSecondary}
                    >
                      <MaterialCommunityIcons name="close" size={15} color={colors.textSecondary} />
                      <Text style={styles.offlineModalActionSecondaryText}>Remover</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.activityEmptyState}>
                <MaterialCommunityIcons
                  name={filaOfflineOrdenadaTotal ? "filter-variant" : "cloud-check-outline"}
                  size={26}
                  color={colors.textSecondary}
                />
                <Text style={styles.activityEmptyTitle}>
                  {filaOfflineOrdenadaTotal ? "Nenhuma pendência neste filtro" : "Fila offline vazia"}
                </Text>
                <Text style={styles.activityEmptyText}>
                  {filaOfflineOrdenadaTotal
                    ? "Troque entre Tudo, Chat e Mesa para localizar a pendência certa mais rápido."
                    : "Quando o app guardar um envio local, ele aparece aqui para você retomar ou sincronizar depois."}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function AttachmentPreviewModal({
  visible,
  onClose,
  title,
  uri,
  accessToken,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  uri: string;
  accessToken: string;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.attachmentModalBackdrop}>
        <View style={styles.attachmentModalCard}>
          <View style={styles.attachmentModalHeader}>
            <Text numberOfLines={1} style={styles.attachmentModalTitle}>
              {title || "Imagem anexada"}
            </Text>
            <Pressable onPress={onClose} style={styles.attachmentModalClose}>
              <MaterialCommunityIcons name="close" size={18} color={colors.white} />
            </Pressable>
          </View>

          {uri && accessToken ? (
            <Image
              resizeMode="contain"
              source={{
                uri,
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              }}
              style={styles.attachmentModalImage}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
