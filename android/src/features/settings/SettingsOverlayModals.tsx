import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import type { ConfirmSheetState, SettingsSheetState } from "./settingsSheetTypes";

interface AppLockModalProps {
  visible: boolean;
  deviceBiometricsEnabled: boolean;
  onUnlock: () => void;
  onLogout: () => void | Promise<void>;
}

interface SettingsSheetModalProps {
  visible: boolean;
  settingsSheet: SettingsSheetState | null;
  settingsSheetLoading: boolean;
  settingsSheetNotice: string;
  renderSettingsSheetBody: () => ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}

interface SettingsConfirmationModalProps {
  visible: boolean;
  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
  onConfirmTextChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function inferirTomNotice(mensagem: string): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
} {
  const normalizado = String(mensagem || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalizado.includes("nao foi") ||
    normalizado.includes("falha") ||
    normalizado.includes("inval") ||
    normalizado.includes("permita") ||
    normalizado.includes("indisponivel") ||
    normalizado.includes("precisa")
  ) {
    return { icon: "alert-circle-outline", color: colors.danger };
  }

  if (
    normalizado.includes("cancelad") ||
    normalizado.includes("nenhuma alteracao") ||
    normalizado.includes("conecte")
  ) {
    return { icon: "information-outline", color: colors.textSecondary };
  }

  return { icon: "check-decagram", color: colors.success };
}

export function AppLockModal({
  visible,
  deviceBiometricsEnabled,
  onUnlock,
  onLogout,
}: AppLockModalProps) {
  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={() => {}}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.appLockBackdrop}>
        <View style={styles.appLockCard}>
          <View style={styles.appLockIconShell}>
            <MaterialCommunityIcons color={colors.accent} name="shield-lock-outline" size={24} />
          </View>
          <Text style={styles.appLockTitle}>App bloqueado</Text>
          <Text style={styles.appLockText}>
            O aplicativo foi bloqueado por inatividade. Confirme sua identidade para continuar no fluxo do inspetor.
          </Text>
          <Text style={styles.appLockHint}>
            {deviceBiometricsEnabled
              ? "Biometria habilitada para desbloqueio quando disponível."
              : "Use confirmação de identidade para liberar ações protegidas."}
          </Text>
          <Pressable
            onPress={onUnlock}
            style={styles.appLockPrimaryButton}
            testID="app-lock-unlock-button"
          >
            <MaterialCommunityIcons color={colors.white} name="lock-open-variant-outline" size={18} />
            <Text style={styles.appLockPrimaryButtonText}>Desbloquear aplicativo</Text>
          </Pressable>
          <Pressable
            onPress={() => void onLogout()}
            style={styles.appLockGhostButton}
            testID="app-lock-logout-button"
          >
            <Text style={styles.appLockGhostButtonText}>Sair da conta</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsSheetModal({
  visible,
  settingsSheet,
  settingsSheetLoading,
  settingsSheetNotice,
  renderSettingsSheetBody,
  onClose,
  onConfirm,
}: SettingsSheetModalProps) {
  const noticeTone = inferirTomNotice(settingsSheetNotice);
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.activityModalBackdrop} testID="settings-sheet-modal">
        <View style={styles.activityModalCard}>
          <View style={styles.activityModalHeader}>
            <View style={styles.activityModalCopy}>
              <Text style={styles.activityModalEyebrow}>tariel.ia</Text>
              <Text style={styles.activityModalTitle}>{settingsSheet?.title}</Text>
              <Text style={styles.activityModalDescription}>{settingsSheet?.subtitle}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.activityModalClose}
              testID="settings-sheet-close-button"
            >
              <MaterialCommunityIcons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.settingsSheetContent}>
            {renderSettingsSheetBody()}
            {settingsSheetNotice ? (
              <View style={styles.settingsSheetNotice}>
                <MaterialCommunityIcons name={noticeTone.icon} size={18} color={noticeTone.color} />
                <Text style={[styles.settingsSheetNoticeText, { color: noticeTone.color }]}>{settingsSheetNotice}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.settingsSheetFooter}>
            <Pressable
              onPress={onClose}
              style={styles.settingsSheetGhostButton}
              testID="settings-sheet-footer-close-button"
            >
              <Text style={styles.settingsSheetGhostButtonText}>Fechar</Text>
            </Pressable>
            {settingsSheet?.actionLabel ? (
              <Pressable
                disabled={settingsSheetLoading}
                onPress={onConfirm}
                style={[
                  styles.settingsSheetPrimaryButton,
                  settingsSheetLoading ? styles.settingsSheetPrimaryButtonDisabled : null,
                ]}
              >
                {settingsSheetLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.settingsSheetPrimaryButtonText}>{settingsSheet.actionLabel}</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsConfirmationModal({
  visible,
  confirmSheet,
  confirmTextDraft,
  onConfirmTextChange,
  onClose,
  onConfirm,
}: SettingsConfirmationModalProps) {
  const confirmPhraseMatches =
    !confirmSheet?.confirmPhrase || confirmTextDraft.trim().toUpperCase() === confirmSheet.confirmPhrase;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.activityModalBackdrop}>
        <View style={styles.confirmSheetCard}>
          <View style={styles.confirmSheetIcon}>
            <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={colors.danger} />
          </View>
          <Text style={styles.confirmSheetTitle}>{confirmSheet?.title}</Text>
          <Text style={styles.confirmSheetText}>{confirmSheet?.description}</Text>

          {confirmSheet?.confirmPhrase ? (
            <View style={styles.settingsFieldBlockNoDivider}>
              <Text style={styles.confirmSheetHint}>
                Digite <Text style={styles.confirmSheetHintStrong}>{confirmSheet.confirmPhrase}</Text> para continuar.
              </Text>
              <TextInput
                autoCapitalize="characters"
                onChangeText={onConfirmTextChange}
                placeholder={confirmSheet.confirmPhrase}
                placeholderTextColor={colors.textSecondary}
                style={styles.settingsTextField}
                value={confirmTextDraft}
              />
            </View>
          ) : null}

          <View style={styles.settingsSheetFooter}>
            <Pressable onPress={onClose} style={styles.settingsSheetGhostButton}>
              <Text style={styles.settingsSheetGhostButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={!confirmPhraseMatches}
              onPress={onConfirm}
              style={[
                styles.confirmSheetDangerButton,
                !confirmPhraseMatches ? styles.settingsSheetPrimaryButtonDisabled : null,
              ]}
            >
              <Text style={styles.confirmSheetDangerButtonText}>{confirmSheet?.confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
