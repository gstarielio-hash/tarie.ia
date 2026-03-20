import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";

import {
  AppLockModal,
  SettingsConfirmationModal,
  SettingsSheetModal,
} from "../settings/SettingsOverlayModals";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "../settings/settingsSheetTypes";
import {
  ActivityCenterModal,
  AttachmentPickerModal,
  AttachmentPreviewModal,
  OfflineQueueModal,
} from "./OperationalModals";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface BaseActivityNotification {
  id: string;
  kind: "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta";
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  targetThread: "chat" | "mesa";
}

interface BaseOfflineQueueItem {
  id: string;
  channel: "chat" | "mesa";
  title: string;
  createdAt: string;
  lastError: string;
}

interface SessionModalsStackProps<
  TNotification extends BaseActivityNotification,
  TOfflineItem extends BaseOfflineQueueItem,
> {
  onChooseAttachment: (option: "camera" | "galeria" | "documento") => void;
  onCloseAttachmentPicker: () => void;
  attachmentPickerVisible: boolean;

  formatarHorarioAtividade: (value: string) => string;
  monitorandoAtividade: boolean;
  notificacoes: readonly TNotification[];
  onAbrirNotificacao: (item: TNotification) => void;
  onCloseActivityCenter: () => void;
  activityCenterVisible: boolean;

  detalheStatusPendenciaOffline: (item: TOfflineItem) => string;
  filaOfflineFiltrada: readonly TOfflineItem[];
  filaOfflineOrdenadaTotal: number;
  filtroFilaOffline: string;
  filtrosFilaOffline: readonly { key: string; label: string; count: number }[];
  iconePendenciaOffline: (item: TOfflineItem) => IconName;
  legendaPendenciaOffline: (item: TOfflineItem) => string;
  onCloseOfflineQueue: () => void;
  onRemoverItemFilaOffline: (id: string) => void;
  onRetomarItemFilaOffline: (item: TOfflineItem) => void;
  onSetFiltroFilaOffline: (key: string) => void;
  onSincronizarFilaOffline: () => void;
  onSincronizarItemFilaOffline: (item: TOfflineItem) => void;
  pendenciaFilaProntaParaReenvio: (item: TOfflineItem) => boolean;
  podeSincronizarFilaOffline: boolean;
  resumoFilaOfflineFiltrada: string;
  resumoPendenciaOffline: (item: TOfflineItem) => string;
  rotuloStatusPendenciaOffline: (item: TOfflineItem) => string;
  sincronizandoFilaOffline: boolean;
  sincronizandoItemFilaId: string;
  sincronizacaoDispositivos: boolean;
  statusApi: string;
  offlineQueueVisible: boolean;

  deviceBiometricsEnabled: boolean;
  onAppLockLogout: () => void | Promise<void>;
  onAppLockUnlock: () => void;
  appLockVisible: boolean;

  onCloseSettingsSheet: () => void;
  onConfirmSettingsSheet: () => void;
  renderSettingsSheetBody: () => ReactNode;
  settingsSheet: SettingsSheetState | null;
  settingsSheetLoading: boolean;
  settingsSheetNotice: string;
  settingsSheetVisible: boolean;

  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
  onCloseSettingsConfirmation: () => void;
  onConfirmSettingsConfirmation: () => void;
  onConfirmTextChange: (value: string) => void;
  settingsConfirmationVisible: boolean;

  attachmentPreviewAccessToken: string;
  onCloseAttachmentPreview: () => void;
  attachmentPreviewTitle: string;
  attachmentPreviewUri: string;
  attachmentPreviewVisible: boolean;
}

export function SessionModalsStack<
  TNotification extends BaseActivityNotification,
  TOfflineItem extends BaseOfflineQueueItem,
>({
  onChooseAttachment,
  onCloseAttachmentPicker,
  attachmentPickerVisible,
  formatarHorarioAtividade,
  monitorandoAtividade,
  notificacoes,
  onAbrirNotificacao,
  onCloseActivityCenter,
  activityCenterVisible,
  detalheStatusPendenciaOffline,
  filaOfflineFiltrada,
  filaOfflineOrdenadaTotal,
  filtroFilaOffline,
  filtrosFilaOffline,
  iconePendenciaOffline,
  legendaPendenciaOffline,
  onCloseOfflineQueue,
  onRemoverItemFilaOffline,
  onRetomarItemFilaOffline,
  onSetFiltroFilaOffline,
  onSincronizarFilaOffline,
  onSincronizarItemFilaOffline,
  pendenciaFilaProntaParaReenvio,
  podeSincronizarFilaOffline,
  resumoFilaOfflineFiltrada,
  resumoPendenciaOffline,
  rotuloStatusPendenciaOffline,
  sincronizandoFilaOffline,
  sincronizandoItemFilaId,
  sincronizacaoDispositivos,
  statusApi,
  offlineQueueVisible,
  deviceBiometricsEnabled,
  onAppLockLogout,
  onAppLockUnlock,
  appLockVisible,
  onCloseSettingsSheet,
  onConfirmSettingsSheet,
  renderSettingsSheetBody,
  settingsSheet,
  settingsSheetLoading,
  settingsSheetNotice,
  settingsSheetVisible,
  confirmSheet,
  confirmTextDraft,
  onCloseSettingsConfirmation,
  onConfirmSettingsConfirmation,
  onConfirmTextChange,
  settingsConfirmationVisible,
  attachmentPreviewAccessToken,
  onCloseAttachmentPreview,
  attachmentPreviewTitle,
  attachmentPreviewUri,
  attachmentPreviewVisible,
}: SessionModalsStackProps<TNotification, TOfflineItem>) {
  return (
    <>
      <AttachmentPickerModal
        onChoose={onChooseAttachment}
        onClose={onCloseAttachmentPicker}
        visible={attachmentPickerVisible}
      />

      <ActivityCenterModal
        formatarHorarioAtividade={formatarHorarioAtividade}
        monitorandoAtividade={monitorandoAtividade}
        notificacoes={notificacoes}
        onAbrirNotificacao={onAbrirNotificacao}
        onClose={onCloseActivityCenter}
        visible={activityCenterVisible}
      />

      <OfflineQueueModal
        detalheStatusPendenciaOffline={detalheStatusPendenciaOffline}
        filaOfflineFiltrada={filaOfflineFiltrada}
        filaOfflineOrdenadaTotal={filaOfflineOrdenadaTotal}
        filtroFilaOffline={filtroFilaOffline}
        filtrosFilaOffline={filtrosFilaOffline}
        formatarHorarioAtividade={formatarHorarioAtividade}
        iconePendenciaOffline={iconePendenciaOffline}
        legendaPendenciaOffline={legendaPendenciaOffline}
        onClose={onCloseOfflineQueue}
        onRemoverItemFilaOffline={onRemoverItemFilaOffline}
        onRetomarItemFilaOffline={onRetomarItemFilaOffline}
        onSetFiltroFilaOffline={onSetFiltroFilaOffline}
        onSincronizarFilaOffline={onSincronizarFilaOffline}
        onSincronizarItemFilaOffline={onSincronizarItemFilaOffline}
        pendenciaFilaProntaParaReenvio={pendenciaFilaProntaParaReenvio}
        podeSincronizarFilaOffline={podeSincronizarFilaOffline}
        resumoFilaOfflineFiltrada={resumoFilaOfflineFiltrada}
        resumoPendenciaOffline={resumoPendenciaOffline}
        rotuloStatusPendenciaOffline={rotuloStatusPendenciaOffline}
        sincronizandoFilaOffline={sincronizandoFilaOffline}
        sincronizandoItemFilaId={sincronizandoItemFilaId}
        sincronizacaoDispositivos={sincronizacaoDispositivos}
        statusApi={statusApi}
        visible={offlineQueueVisible}
      />

      <AppLockModal
        deviceBiometricsEnabled={deviceBiometricsEnabled}
        onLogout={onAppLockLogout}
        onUnlock={onAppLockUnlock}
        visible={appLockVisible}
      />

      <SettingsSheetModal
        onClose={onCloseSettingsSheet}
        onConfirm={onConfirmSettingsSheet}
        renderSettingsSheetBody={renderSettingsSheetBody}
        settingsSheet={settingsSheet}
        settingsSheetLoading={settingsSheetLoading}
        settingsSheetNotice={settingsSheetNotice}
        visible={settingsSheetVisible}
      />

      <SettingsConfirmationModal
        confirmSheet={confirmSheet}
        confirmTextDraft={confirmTextDraft}
        onClose={onCloseSettingsConfirmation}
        onConfirm={onConfirmSettingsConfirmation}
        onConfirmTextChange={onConfirmTextChange}
        visible={settingsConfirmationVisible}
      />

      <AttachmentPreviewModal
        accessToken={attachmentPreviewAccessToken}
        onClose={onCloseAttachmentPreview}
        title={attachmentPreviewTitle}
        uri={attachmentPreviewUri}
        visible={attachmentPreviewVisible}
      />
    </>
  );
}
