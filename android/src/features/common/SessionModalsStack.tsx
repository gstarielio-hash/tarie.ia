import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";

import type { ApiHealthStatus } from "../../types/mobile";
import {
  AppLockModal,
  SettingsConfirmationModal,
  SettingsSheetModal,
} from "../settings/SettingsOverlayModals";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "../settings/settingsSheetTypes";
import type {
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import {
  ActivityCenterModal,
  AttachmentPickerModal,
  AttachmentPreviewModal,
  OfflineQueueModal,
} from "./OperationalModals";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type OfflineQueueFilter = "all" | "chat" | "mesa";

export interface SessionModalsStackFilter {
  key: OfflineQueueFilter;
  label: string;
  count: number;
}

export interface SessionModalsStackProps {
  onChooseAttachment: (option: "camera" | "galeria" | "documento") => void;
  onCloseAttachmentPicker: () => void;
  attachmentPickerVisible: boolean;

  formatarHorarioAtividade: (value: string) => string;
  monitorandoAtividade: boolean;
  notificacoes: readonly MobileActivityNotification[];
  onAbrirNotificacao: (item: MobileActivityNotification) => void;
  onCloseActivityCenter: () => void;
  activityCenterVisible: boolean;

  detalheStatusPendenciaOffline: (item: OfflinePendingMessage) => string;
  filaOfflineFiltrada: readonly OfflinePendingMessage[];
  filaOfflineOrdenadaTotal: number;
  filtroFilaOffline: OfflineQueueFilter;
  filtrosFilaOffline: readonly SessionModalsStackFilter[];
  iconePendenciaOffline: (item: OfflinePendingMessage) => IconName;
  legendaPendenciaOffline: (item: OfflinePendingMessage) => string;
  onCloseOfflineQueue: () => void;
  onRemoverItemFilaOffline: (id: string) => void;
  onRetomarItemFilaOffline: (item: OfflinePendingMessage) => void;
  onSetFiltroFilaOffline: (key: OfflineQueueFilter) => void;
  onSincronizarFilaOffline: () => void;
  onSincronizarItemFilaOffline: (item: OfflinePendingMessage) => void;
  pendenciaFilaProntaParaReenvio: (item: OfflinePendingMessage) => boolean;
  podeSincronizarFilaOffline: boolean;
  resumoFilaOfflineFiltrada: string;
  resumoPendenciaOffline: (item: OfflinePendingMessage) => string;
  rotuloStatusPendenciaOffline: (item: OfflinePendingMessage) => string;
  sincronizandoFilaOffline: boolean;
  sincronizandoItemFilaId: string;
  sincronizacaoDispositivos: boolean;
  statusApi: ApiHealthStatus;
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

export function SessionModalsStack({
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
}: SessionModalsStackProps) {
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
