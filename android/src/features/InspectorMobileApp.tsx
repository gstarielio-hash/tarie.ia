import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  API_BASE_URL,
  carregarBootstrapMobile,
  carregarLaudosMobile,
  carregarMensagensLaudo,
  carregarMensagensMesaMobile,
  carregarStatusLaudo,
  enviarAnexoMesaMobile,
  enviarMensagemMesaMobile,
  enviarMensagemChatMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
  obterUrlLoginSocialMobile,
  obterUrlRecuperacaoSenhaMobile,
  pingApi,
  reabrirLaudoMobile,
  uploadDocumentoChatMobile,
} from "../config/api";
import {
  listarEventosObservabilidade,
  registrarEventoObservabilidade,
  resumirEventosObservabilidade,
} from "../config/observability";
import {
  AssistantCitationList,
  AssistantMessageContent,
} from "../components/AssistantRichMessage";
import { colors, spacing } from "../theme/tokens";
import type {
  ApiHealthStatus,
  MobileAttachment,
  MobileBootstrapResponse,
  MobileChatMessage,
  MobileChatMode,
  MobileChatSendResult,
  MobileEstadoLaudo,
  MobileLaudoCard,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
  MobileMesaMessage,
} from "../types/mobile";
import {
  ACCENT_OPTIONS,
  AI_MODEL_OPTIONS,
  APP_BUILD_CHANNEL,
  APP_LANGUAGE_OPTIONS,
  APP_PREFERENCES_FILE,
  APP_VERSION_LABEL,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  EMAIL_KEY,
  FONT_SIZE_OPTIONS,
  HELP_CENTER_ARTICLES,
  HISTORY_DRAWER_FILTERS,
  HISTORY_PANEL_CLOSED_X,
  LOCK_TIMEOUT_OPTIONS,
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_FILE,
  NOTIFICATION_SOUND_OPTIONS,
  OFFLINE_QUEUE_FILE,
  PANEL_ANIMATION_DURATION,
  PANEL_CLOSE_SWIPE_THRESHOLD,
  PANEL_EDGE_GESTURE_WIDTH,
  PANEL_OPEN_SWIPE_THRESHOLD,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  READ_CACHE_FILE,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  SCREEN_WIDTH,
  SECURITY_EVENT_FILTERS,
  SETTINGS_DRAWER_FILTERS,
  SETTINGS_PANEL_CLOSED_X,
  TARIEL_APP_MARK,
  TEMPERATURE_STEPS,
  THEME_OPTIONS,
  TOKEN_KEY,
  TWO_FACTOR_METHOD_OPTIONS,
  UPDATE_CHANGELOG,
} from "./InspectorMobileApp.constants";
import { styles } from "./InspectorMobileApp.styles";

function BrandIntroMark({
  compact = false,
  title,
  brandColor = colors.accent,
}: {
  compact?: boolean;
  title?: string;
  brandColor?: string;
}) {
  return (
    <View style={compact ? styles.brandStageCompact : styles.threadEmptyBrandStage}>
      <View style={compact ? styles.brandHaloCompact : styles.threadEmptyBrandHalo} />
      <Image source={TARIEL_APP_MARK} style={compact ? styles.brandMarkCompact : styles.threadEmptyBrandMark} />
      <Text style={[compact ? styles.brandLabelCompact : styles.threadEmptyBrand, { color: brandColor }]}>TARIEL.IA</Text>
      {title ? <Text style={styles.threadEmptyTitle}>{title}</Text> : null}
    </View>
  );
}

function BrandLaunchOverlay({
  onDone,
  visible,
  animationsEnabled = true,
  accentColor = colors.accent,
}: {
  onDone: () => void;
  visible: boolean;
  animationsEnabled?: boolean;
  accentColor?: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const halo = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!animationsEnabled) {
      opacity.setValue(1);
      scale.setValue(1);
      halo.setValue(1);
      const timeout = setTimeout(() => onDone(), 180);
      return () => clearTimeout(timeout);
    }

    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.04,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    sequence.start(({ finished }) => {
      if (finished) {
        onDone();
      }
    });

    return () => sequence.stop();
  }, [animationsEnabled, halo, onDone, opacity, scale, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.launchOverlay}>
      <LinearGradient colors={["rgba(248,243,237,0.96)", "rgba(252,253,252,0.98)"]} style={styles.launchOverlayGradient}>
        <Animated.View
          style={[
            styles.launchOverlayInner,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <Animated.View style={[styles.launchOverlayHalo, { transform: [{ scale: halo }] }]} />
          <Image source={TARIEL_APP_MARK} style={styles.launchOverlayMark} />
          <Text style={styles.launchOverlayBrand}>TARIEL.IA</Text>
          <Text style={[styles.launchOverlaySubtitle, { color: accentColor }]}>Inspetor</Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.settingsSection} testID={testID}>
      <View style={styles.settingsSectionHeader}>
        <View style={styles.settingsSectionIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsSectionCopy}>
          <Text style={styles.settingsSectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.settingsSectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

function SettingsGroupLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.settingsGroupLabel}>
      <Text style={styles.settingsGroupEyebrow}>{title}</Text>
      {description ? <Text style={styles.settingsGroupDescription}>{description}</Text> : null}
    </View>
  );
}

function SettingsPressRow({
  icon,
  title,
  value,
  description,
  onPress,
  danger = false,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  danger?: boolean;
  testID?: string;
}) {
  const toneColor = danger ? colors.danger : colors.textPrimary;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.settingsRow, danger ? styles.settingsRowDanger : null]}
      testID={testID}
    >
      <View style={[styles.settingsRowIcon, danger ? styles.settingsRowIconDanger : null]}>
        <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.settingsRowTitle, danger ? styles.settingsRowTitleDanger : null]}>{title}</Text>
        {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
      </View>
      <View style={styles.settingsRowMeta}>
        {value ? <Text style={[styles.settingsRowValue, danger ? { color: colors.danger } : null]}>{value}</Text> : null}
        {onPress ? (
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={danger ? colors.danger : colors.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function SettingsSwitchRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.settingsRow} testID={testID}>
      <View style={styles.settingsRowIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
      </View>
      <Switch
        ios_backgroundColor="#E8DDD1"
        onValueChange={onValueChange}
        thumbColor={colors.white}
        trackColor={{ false: "#DDD1C4", true: colors.accentSoft }}
        value={value}
      />
    </View>
  );
}

function SettingsSegmentedRow<T extends string>({
  icon,
  title,
  description,
  options,
  value,
  onChange,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  return (
    <View style={styles.settingsBlockRow} testID={testID}>
      <View style={styles.settingsBlockHeader}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
          {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
        </View>
      </View>
      <View style={styles.settingsSegmentedControl}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={`${title}-${option}`}
              onPress={() => onChange(option)}
              style={[styles.settingsSegmentPill, active ? styles.settingsSegmentPillActive : null]}
            >
              <Text style={[styles.settingsSegmentText, active ? styles.settingsSegmentTextActive : null]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingsScaleRow({
  title,
  icon,
  description,
  value,
  values,
  onChange,
  minLabel,
  maxLabel,
  testID,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  description?: string;
  value: number;
  values: readonly number[];
  onChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  testID?: string;
}) {
  return (
    <View style={styles.settingsBlockRow} testID={testID}>
      <View style={styles.settingsBlockHeader}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
          {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
        </View>
        <Text style={styles.settingsScaleValue}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.settingsScaleTrack}>
        {values.map((step) => {
          const active = step <= value;
          const selected = step === value;
          return (
            <Pressable
              key={`${title}-${step}`}
              onPress={() => onChange(step)}
              style={[styles.settingsScaleStep, active ? styles.settingsScaleStepActive : null]}
            >
              <View style={[styles.settingsScaleDot, selected ? styles.settingsScaleDotActive : null]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.settingsScaleLabels}>
        <Text style={styles.settingsScaleLabel}>{minLabel}</Text>
        <Text style={styles.settingsScaleLabel}>{maxLabel}</Text>
      </View>
    </View>
  );
}

function SettingsTextField({
  icon,
  title,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  testID?: string;
}) {
  return (
    <View style={styles.settingsFieldBlock} testID={testID}>
      <View style={styles.settingsFieldLabelRow}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <Text style={styles.settingsRowTitle}>{title}</Text>
      </View>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.settingsTextField}
        testID={testID ? `${testID}-input` : undefined}
        value={value}
      />
    </View>
  );
}

function SettingsStatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "success" | "muted" | "danger" | "accent";
}) {
  return (
    <View
      style={[
        styles.settingsStatusPill,
        tone === "success"
          ? styles.settingsStatusPillSuccess
          : tone === "danger"
            ? styles.settingsStatusPillDanger
            : tone === "accent"
              ? styles.settingsStatusPillAccent
              : null,
      ]}
    >
      <Text
        style={[
          styles.settingsStatusPillText,
          tone === "success"
            ? styles.settingsStatusPillTextSuccess
            : tone === "danger"
              ? styles.settingsStatusPillTextDanger
              : tone === "accent"
                ? styles.settingsStatusPillTextAccent
                : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SettingsOverviewCard({
  icon,
  title,
  description,
  badge,
  onPress,
  tone = "muted",
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  badge: string;
  onPress: () => void;
  tone?: "muted" | "accent" | "success" | "danger";
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.settingsOverviewCard,
        tone === "accent"
          ? styles.settingsOverviewCardAccent
          : tone === "success"
            ? styles.settingsOverviewCardSuccess
            : tone === "danger"
              ? styles.settingsOverviewCardDanger
              : null,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.settingsOverviewIcon,
          tone === "accent"
            ? styles.settingsOverviewIconAccent
            : tone === "success"
              ? styles.settingsOverviewIconSuccess
              : tone === "danger"
                ? styles.settingsOverviewIconDanger
                : null,
        ]}
      >
        <MaterialCommunityIcons
          color={
            tone === "accent"
              ? colors.accent
              : tone === "success"
                ? colors.success
                : tone === "danger"
                  ? colors.danger
                  : colors.textSecondary
          }
          name={icon}
          size={20}
        />
      </View>
      <View style={styles.settingsOverviewCopy}>
        <View style={styles.settingsOverviewHeading}>
          <Text style={styles.settingsOverviewTitle}>{title}</Text>
          <SettingsStatusPill
            label={badge}
            tone={tone === "muted" ? "accent" : tone}
          />
        </View>
        <Text style={styles.settingsOverviewDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons color={colors.textSecondary} name="chevron-right" size={18} />
    </Pressable>
  );
}

function SecurityProviderCard({
  provider,
  onToggle,
  testID,
}: {
  provider: ConnectedProvider;
  onToggle: (provider: ConnectedProvider) => void;
  testID?: string;
}) {
  const iconName =
    provider.id === "google" ? "google" : provider.id === "apple" ? "apple" : "microsoft-windows";
  const iconColor = provider.id === "google" ? "#DB4437" : provider.id === "apple" ? colors.textPrimary : "#2563EB";

  return (
    <View style={styles.securityProviderCard} testID={testID}>
      <View style={styles.securityProviderMain}>
        <View style={styles.securityProviderIconShell}>
          <MaterialCommunityIcons color={iconColor} name={iconName} size={22} />
        </View>
      <View style={styles.securityProviderCopy}>
        <View style={styles.securityProviderHeading}>
          <Text style={styles.securityProviderTitle}>{provider.label}</Text>
          <SettingsStatusPill
            label={provider.connected ? "Conectado" : "Não conectado"}
            tone={provider.connected ? "success" : "muted"}
          />
        </View>
        <Text style={styles.securityProviderMeta}>
          {provider.connected && provider.email ? provider.email : "Nenhum email vinculado"}
        </Text>
      </View>
    </View>
      <Pressable
        onPress={() => onToggle(provider)}
        style={[
          styles.securityProviderActionButton,
          provider.connected ? styles.securityProviderActionButtonDanger : null,
        ]}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text
          style={[
            styles.securityProviderActionText,
            provider.connected ? styles.securityProviderActionTextDanger : null,
          ]}
        >
          {provider.connected ? "Desconectar" : "Conectar"}
        </Text>
      </Pressable>
    </View>
  );
}

function SecuritySessionCard({
  item,
  onClose,
  onReview,
  testID,
}: {
  item: SessionDevice;
  onClose: (item: SessionDevice) => void;
  onReview: (item: SessionDevice) => void;
  testID?: string;
}) {
  return (
    <View style={styles.securitySessionCard} testID={testID}>
      <View style={styles.securitySessionTop}>
        <View style={styles.securitySessionCopy}>
          <View style={styles.securitySessionHeading}>
            <Text style={styles.securitySessionTitle}>{item.title}</Text>
            {item.current ? (
              <SettingsStatusPill label="Sessão atual" tone="accent" />
            ) : item.suspicious ? (
              <SettingsStatusPill label="Atividade incomum" tone="danger" />
            ) : null}
          </View>
          <Text style={styles.securitySessionMeta}>{item.meta}</Text>
          <Text style={styles.securitySessionMeta}>{item.location}</Text>
          <Text style={styles.securitySessionMeta}>Último acesso: {item.lastSeen}</Text>
        </View>
      </View>
      <View style={styles.securitySessionActions}>
        <Pressable
          onPress={() => onReview(item)}
          style={[
            styles.securitySessionActionButton,
            item.suspicious ? styles.securitySessionReviewButtonDanger : styles.securitySessionReviewButton,
          ]}
          testID={testID ? `${testID}-review` : undefined}
        >
          <Text
            style={[
              styles.securitySessionActionText,
              item.suspicious ? styles.securitySessionReviewButtonTextDanger : styles.securitySessionReviewButtonText,
            ]}
          >
            {item.suspicious ? "Marcar segura" : "Sinalizar"}
          </Text>
        </Pressable>
        <Pressable
          disabled={item.current}
          onPress={() => onClose(item)}
          style={[styles.securitySessionActionButton, item.current ? styles.securitySessionActionButtonDisabled : null]}
          testID={testID ? `${testID}-close` : undefined}
        >
          <Text style={styles.securitySessionActionText}>{item.current ? "Em uso" : "Encerrar sessão"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SecurityEventCard({ item }: { item: SecurityEventItem }) {
  return (
    <View style={styles.securityEventCard}>
      <View style={styles.securityEventTop}>
        <Text style={styles.securityEventTitle}>{item.title}</Text>
        {item.critical ? <SettingsStatusPill label="Crítico" tone="danger" /> : null}
      </View>
      <Text style={styles.securityEventMeta}>{item.meta}</Text>
      <Text style={styles.securityEventStatus}>{item.status}</Text>
    </View>
  );
}

interface MobileSessionState {
  accessToken: string;
  bootstrap: MobileBootstrapResponse;
}

interface ChatState {
  laudoId: number | null;
  estado: MobileEstadoLaudo | string;
  statusCard: string;
  permiteEdicao: boolean;
  permiteReabrir: boolean;
  laudoCard: MobileLaudoCard | null;
  modo: MobileChatMode | string;
  mensagens: MobileChatMessage[];
}

type ActiveThread = "chat" | "mesa";
type OfflineQueueFilter = "all" | "chat" | "mesa";
type HistoryDrawerFilter = (typeof HISTORY_DRAWER_FILTERS)[number]["key"];
type ThreadContextChipTone = "accent" | "success" | "danger" | "muted";

interface ThreadContextChipItem {
  key: string;
  label: string;
  tone: ThreadContextChipTone;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

type ComposerAttachment =
  | {
      kind: "image";
      label: string;
      resumo: string;
      dadosImagem: string;
      previewUri: string;
      fileUri: string;
      mimeType: string;
    }
  | {
      kind: "document";
      label: string;
      resumo: string;
      textoDocumento: string;
      nomeDocumento: string;
      chars: number;
      truncado: boolean;
      fileUri: string;
      mimeType: string;
    };

interface AttachmentPreviewState {
  titulo: string;
  uri: string;
}

interface MessageReferenceState {
  id: number;
  texto: string;
}

interface OfflinePendingMessage {
  id: string;
  channel: "chat" | "mesa";
  laudoId: number | null;
  text: string;
  createdAt: string;
  title: string;
  attachment: ComposerAttachment | null;
  referenceMessageId: number | null;
  attempts: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
}

interface MobileActivityNotification {
  id: string;
  kind: "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta";
  laudoId: number | null;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  targetThread: ActiveThread;
}

interface MobileReadCache {
  bootstrap: MobileBootstrapResponse | null;
  laudos: MobileLaudoCard[];
  conversaAtual: ChatState | null;
  conversasPorLaudo: Record<string, ChatState>;
  mesaPorLaudo: Record<string, MobileMesaMessage[]>;
  chatDrafts: Record<string, string>;
  mesaDrafts: Record<string, string>;
  chatAttachmentDrafts: Record<string, ComposerAttachment>;
  mesaAttachmentDrafts: Record<string, ComposerAttachment>;
  updatedAt: string;
}

type ConnectedProviderId = "google" | "apple" | "microsoft";
type SecurityEventFilter = (typeof SECURITY_EVENT_FILTERS)[number];
type SettingsDrawerFilter = (typeof SETTINGS_DRAWER_FILTERS)[number]["key"];
type SettingsSectionKey =
  | "prioridades"
  | "conta"
  | "preferenciasIa"
  | "aparencia"
  | "notificacoes"
  | "contasConectadas"
  | "sessoes"
  | "twofa"
  | "protecaoDispositivo"
  | "verificacaoIdentidade"
  | "atividadeSeguranca"
  | "dadosConversas"
  | "permissoes"
  | "segurancaArquivos"
  | "privacidadeNotificacoes"
  | "excluirConta"
  | "recursosAvancados"
  | "sistema"
  | "suporte";
type SettingsDrawerPage =
  | "overview"
  | "prioridades"
  | "contaAcesso"
  | "experiencia"
  | "seguranca"
  | "sistemaSuporte";

interface ConnectedProvider {
  id: ConnectedProviderId;
  label: string;
  email: string;
  connected: boolean;
  requiresReauth: boolean;
}

interface SessionDevice {
  id: string;
  title: string;
  meta: string;
  location: string;
  lastSeen: string;
  current: boolean;
  suspicious?: boolean;
}

interface SecurityEventItem {
  id: string;
  title: string;
  meta: string;
  status: string;
  type: "login" | "provider" | "2fa" | "data" | "session";
  critical?: boolean;
}

interface SupportQueueItem {
  id: string;
  kind: "bug" | "feedback";
  title: string;
  body: string;
  email: string;
  createdAt: string;
  status: string;
}

interface AppPreferencesState {
  perfilNome: string;
  perfilExibicao: string;
  perfilFotoUri: string;
  perfilFotoHint: string;
  laudosFixadosIds: number[];
  historicoOcultoIds: number[];
  planoAtual: (typeof PLAN_OPTIONS)[number];
  cartaoAtual: (typeof PAYMENT_CARD_OPTIONS)[number];
  modeloIa: (typeof AI_MODEL_OPTIONS)[number];
  estiloResposta: (typeof RESPONSE_STYLE_OPTIONS)[number];
  idiomaResposta: (typeof RESPONSE_LANGUAGE_OPTIONS)[number];
  memoriaIa: boolean;
  aprendizadoIa: boolean;
  tomConversa: (typeof CONVERSATION_TONE_OPTIONS)[number];
  temperaturaIa: number;
  temaApp: (typeof THEME_OPTIONS)[number];
  tamanhoFonte: (typeof FONT_SIZE_OPTIONS)[number];
  densidadeInterface: (typeof DENSITY_OPTIONS)[number];
  corDestaque: (typeof ACCENT_OPTIONS)[number];
  animacoesAtivas: boolean;
  notificaRespostas: boolean;
  notificaPush: boolean;
  somNotificacao: (typeof NOTIFICATION_SOUND_OPTIONS)[number];
  vibracaoAtiva: boolean;
  emailsAtivos: boolean;
  salvarHistoricoConversas: boolean;
  compartilharMelhoriaIa: boolean;
  backupAutomatico: boolean;
  sincronizacaoDispositivos: boolean;
  nomeAutomaticoConversas: boolean;
  fixarConversas: boolean;
  entradaPorVoz: boolean;
  respostaPorVoz: boolean;
  uploadArquivosAtivo: boolean;
  economiaDados: boolean;
  usoBateria: (typeof BATTERY_OPTIONS)[number];
  idiomaApp: (typeof APP_LANGUAGE_OPTIONS)[number];
  regiaoApp: (typeof REGION_OPTIONS)[number];
  provedoresConectados: ConnectedProvider[];
  sessoesAtivas: SessionDevice[];
  twoFactorEnabled: boolean;
  twoFactorMethod: (typeof TWO_FACTOR_METHOD_OPTIONS)[number];
  recoveryCodesEnabled: boolean;
  deviceBiometricsEnabled: boolean;
  requireAuthOnOpen: boolean;
  hideInMultitask: boolean;
  lockTimeout: (typeof LOCK_TIMEOUT_OPTIONS)[number];
  retencaoDados: (typeof DATA_RETENTION_OPTIONS)[number];
  codigosRecuperacao: string[];
  reautenticacaoStatus: string;
  reautenticacaoExpiraEm: string;
  eventosSeguranca: SecurityEventItem[];
  mostrarConteudoNotificacao: boolean;
  ocultarConteudoBloqueado: boolean;
  mostrarSomenteNovaMensagem: boolean;
  microfonePermitido: boolean;
  cameraPermitida: boolean;
  arquivosPermitidos: boolean;
  notificacoesPermitidas: boolean;
  biometriaPermitida: boolean;
  filaSuporteLocal: SupportQueueItem[];
  ultimaVerificacaoAtualizacao: string;
  statusAtualizacaoApp: string;
}

type SettingsSheetKind =
  | "photo"
  | "email"
  | "password"
  | "reauth"
  | "plan"
  | "billing"
  | "payments"
  | "help"
  | "bug"
  | "feedback"
  | "legal"
  | "privacy"
  | "integrations"
  | "plugins"
  | "updates";

interface SettingsSheetState {
  kind: SettingsSheetKind;
  title: string;
  subtitle: string;
  actionLabel?: string;
}

type ConfirmSheetKind =
  | "clearHistory"
  | "clearConversations"
  | "deleteAccount"
  | "provider"
  | "security"
  | "session"
  | "sessionCurrent"
  | "sessionOthers";

interface ConfirmSheetState {
  kind: ConfirmSheetKind;
  title: string;
  description: string;
  confirmLabel: string;
  confirmPhrase?: string;
  onConfirm?: () => void;
}

const CACHE_LEITURA_VAZIO: MobileReadCache = {
  bootstrap: null,
  laudos: [],
  conversaAtual: null,
  conversasPorLaudo: {},
  mesaPorLaudo: {},
  chatDrafts: {},
  mesaDrafts: {},
  chatAttachmentDrafts: {},
  mesaAttachmentDrafts: {},
  updatedAt: "",
};

interface HistorySection {
  key: string;
  title: string;
  items: MobileLaudoCard[];
}

const historySectionOrder = ["today", "yesterday", "week", "older"] as const;

function nextOptionValue<T extends string>(current: T, options: readonly T[]): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

function filtrarThreadContextChips(items: Array<ThreadContextChipItem | null>): ThreadContextChipItem[] {
  return items.filter((item): item is ThreadContextChipItem => item !== null);
}

function normalizarTextoBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function startOfDay(date: Date): number {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.getTime();
}

function getHistorySectionKey(dataIso: string, referencia = new Date()): (typeof historySectionOrder)[number] {
  const alvo = new Date(dataIso);
  if (Number.isNaN(alvo.getTime())) {
    return "older";
  }

  const diffDays = Math.floor((startOfDay(referencia) - startOfDay(alvo)) / 86_400_000);

  if (diffDays <= 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return "week";
  }
  return "older";
}

function getHistorySectionLabel(key: (typeof historySectionOrder)[number]): string {
  switch (key) {
    case "today":
      return "Hoje";
    case "yesterday":
      return "Ontem";
    case "week":
      return "Esta semana";
    default:
      return "Mais antigos";
  }
}

function buildHistorySections(items: MobileLaudoCard[]): HistorySection[] {
  const fixados = items.filter((item) => item.pinado);
  const restantes = items.filter((item) => !item.pinado);
  const buckets = new Map<(typeof historySectionOrder)[number], MobileLaudoCard[]>();
  for (const item of restantes) {
    const key = getHistorySectionKey(item.data_iso);
    const current = buckets.get(key) || [];
    current.push(item);
    buckets.set(key, current);
  }

  const secoesCronologicas = historySectionOrder
    .map((key) => ({
      key,
      title: getHistorySectionLabel(key),
      items: buckets.get(key) || [],
    }))
    .filter((section) => section.items.length > 0);

  return fixados.length
    ? [{ key: "pinned", title: "Fixadas", items: fixados }, ...secoesCronologicas]
    : secoesCronologicas;
}

function aplicarPreferenciasLaudos(
  itens: MobileLaudoCard[],
  fixadosIds: number[],
  ocultosIds: number[],
): MobileLaudoCard[] {
  const ocultos = new Set(ocultosIds);
  const fixados = new Set(fixadosIds);

  return itens
    .filter((item) => !ocultos.has(item.id))
    .map((item) => ({
      ...item,
      pinado: fixados.has(item.id),
    }));
}

function atualizarResumoLaudoAtual<T extends {
  estado: MobileEstadoLaudo | string;
  permite_edicao: boolean;
  permite_reabrir: boolean;
  laudo_card: MobileLaudoCard | null;
  modo?: MobileChatMode | string;
}>(
  estadoAtual: ChatState | null,
  payload: T,
): ChatState | null {
  if (!estadoAtual) {
    return estadoAtual;
  }

  return {
    ...estadoAtual,
    estado: payload.estado,
    statusCard: payload.laudo_card?.status_card || estadoAtual.statusCard,
    permiteEdicao: Boolean(payload.permite_edicao),
    permiteReabrir: Boolean(payload.permite_reabrir),
    laudoCard: payload.laudo_card || estadoAtual.laudoCard,
    modo: normalizarModoChat(payload.modo, normalizarModoChat(estadoAtual.modo)),
  };
}

async function obterItemSeguro(chave: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(chave);
  } catch (error) {
    console.warn(`Falha ao ler SecureStore (${chave})`, error);
    return null;
  }
}

async function salvarItemSeguro(chave: string, valor: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(chave, valor);
  } catch (error) {
    console.warn(`Falha ao salvar SecureStore (${chave})`, error);
  }
}

async function removerItemSeguro(chave: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(chave);
  } catch (error) {
    console.warn(`Falha ao remover SecureStore (${chave})`, error);
  }
}

async function lerFilaOfflineLocal(): Promise<OfflinePendingMessage[]> {
  try {
    const valor = await FileSystem.readAsStringAsync(OFFLINE_QUEUE_FILE);
    const payload = JSON.parse(valor);
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const registro = item as Record<string, unknown>;
        const channel: OfflinePendingMessage["channel"] = registro.channel === "mesa" ? "mesa" : "chat";
        return {
          id: String(registro.id || ""),
          channel,
          laudoId: typeof registro.laudoId === "number" ? registro.laudoId : null,
          text: String(registro.text || "").trim(),
          createdAt: String(registro.createdAt || ""),
          title: String(registro.title || "").trim() || "Mensagem pendente",
          attachment: normalizarComposerAttachment(registro.attachment),
          referenceMessageId: typeof registro.referenceMessageId === "number" ? registro.referenceMessageId : null,
          attempts: typeof registro.attempts === "number" ? Math.max(0, registro.attempts) : 0,
          lastAttemptAt: String(registro.lastAttemptAt || ""),
          lastError: String(registro.lastError || "").trim(),
          nextRetryAt: String(registro.nextRetryAt || ""),
        };
      })
      .filter((item) => item.id && (item.text || item.attachment));
  } catch {
    return [];
  }
}

async function salvarFilaOfflineLocal(fila: OfflinePendingMessage[]): Promise<void> {
  try {
    if (!fila.length) {
      await FileSystem.deleteAsync(OFFLINE_QUEUE_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(OFFLINE_QUEUE_FILE, JSON.stringify(fila));
  } catch (error) {
    console.warn("Falha ao salvar fila offline local.", error);
  }
}

async function lerNotificacoesLocais(): Promise<MobileActivityNotification[]> {
  try {
    const valor = await FileSystem.readAsStringAsync(NOTIFICATIONS_FILE);
    const payload = JSON.parse(valor);
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const registro = item as Record<string, unknown>;
        return {
          id: String(registro.id || ""),
          kind:
            registro.kind === "mesa_nova" ||
            registro.kind === "mesa_resolvida" ||
            registro.kind === "mesa_reaberta"
              ? registro.kind
              : "status",
          laudoId: typeof registro.laudoId === "number" ? registro.laudoId : null,
          title: String(registro.title || "").trim() || "Atividade do inspetor",
          body: String(registro.body || "").trim(),
          createdAt: String(registro.createdAt || "") || new Date().toISOString(),
          unread: Boolean(registro.unread),
          targetThread: registro.targetThread === "mesa" ? "mesa" : "chat",
        } as MobileActivityNotification;
      })
      .filter((item) => item.id && item.title);
  } catch {
    return [];
  }
}

async function salvarNotificacoesLocais(notificacoes: MobileActivityNotification[]): Promise<void> {
  try {
    if (!notificacoes.length) {
      await FileSystem.deleteAsync(NOTIFICATIONS_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(NOTIFICATIONS_FILE, JSON.stringify(notificacoes));
  } catch (error) {
    console.warn("Falha ao salvar a central de atividade local.", error);
  }
}

function chaveCacheLaudo(laudoId: number | null): string {
  return laudoId ? `laudo:${laudoId}` : "rascunho";
}

function chaveRascunho(thread: ActiveThread, laudoId: number | null): string {
  return `${thread}:${chaveCacheLaudo(laudoId)}`;
}

function normalizarComposerAttachment(payload: unknown): ComposerAttachment | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const registro = payload as Record<string, unknown>;
  if (registro.kind === "image") {
    const dadosImagem = typeof registro.dadosImagem === "string" ? registro.dadosImagem : "";
    const previewUri = typeof registro.previewUri === "string" ? registro.previewUri : "";
    const fileUri = typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType = typeof registro.mimeType === "string" ? registro.mimeType : "image/jpeg";
    const label = typeof registro.label === "string" ? registro.label : "";
    const resumo = typeof registro.resumo === "string" ? registro.resumo : "";
    if (!dadosImagem || !previewUri || !fileUri || !label) {
      return null;
    }
    return {
      kind: "image",
      dadosImagem,
      previewUri,
      fileUri,
      mimeType,
      label,
      resumo,
    };
  }

  if (registro.kind === "document") {
    const label = typeof registro.label === "string" ? registro.label : "";
    const resumo = typeof registro.resumo === "string" ? registro.resumo : "";
    const textoDocumento = typeof registro.textoDocumento === "string" ? registro.textoDocumento : "";
    const nomeDocumento = typeof registro.nomeDocumento === "string" ? registro.nomeDocumento : "";
    const fileUri = typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType = typeof registro.mimeType === "string" ? registro.mimeType : "application/octet-stream";
    if (!label || !nomeDocumento || !fileUri) {
      return null;
    }
    return {
      kind: "document",
      label,
      resumo,
      textoDocumento,
      nomeDocumento,
      chars: typeof registro.chars === "number" ? registro.chars : 0,
      truncado: Boolean(registro.truncado),
      fileUri,
      mimeType,
    };
  }

  return null;
}

function assinaturaAnexoRascunho(anexo: ComposerAttachment | null): string {
  return JSON.stringify(anexo ?? null);
}

function duplicarComposerAttachment(anexo: ComposerAttachment | null): ComposerAttachment | null {
  if (!anexo) {
    return null;
  }
  return anexo.kind === "image" ? { ...anexo } : { ...anexo };
}

function resumoPendenciaOffline(item: Pick<OfflinePendingMessage, "text" | "attachment">): string {
  if (item.text.trim()) {
    return item.text.trim();
  }
  return textoFallbackAnexo(item.attachment);
}

function iconePendenciaOffline(item: OfflinePendingMessage): keyof typeof MaterialCommunityIcons.glyphMap {
  if (item.channel === "mesa") {
    return item.attachment ? "paperclip" : "clipboard-text-outline";
  }
  if (item.attachment?.kind === "image") {
    return "image-outline";
  }
  if (item.attachment?.kind === "document") {
    return "file-document-outline";
  }
  return "message-processing-outline";
}

function legendaPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.attachment?.kind === "image") {
    return "Imagem pronta para reenvio";
  }
  if (item.attachment?.kind === "document") {
    return "Documento pronto para reenvio";
  }
  return "Texto pendente para reenviar";
}

function resumirErroPendenciaOffline(erro: string): string {
  const texto = erro.trim();
  if (!texto) {
    return "";
  }
  return texto.length > 72 ? `${texto.slice(0, 69).trimEnd()}...` : texto;
}

function calcularBackoffPendenciaOfflineMs(tentativas: number): number {
  if (tentativas <= 1) {
    return 30_000;
  }
  if (tentativas === 2) {
    return 120_000;
  }
  if (tentativas === 3) {
    return 300_000;
  }
  return 600_000;
}

function pendenciaFilaProntaParaReenvio(item: OfflinePendingMessage, referencia = Date.now()): boolean {
  if (!item.nextRetryAt) {
    return true;
  }
  const proximaTentativa = new Date(item.nextRetryAt).getTime();
  if (Number.isNaN(proximaTentativa)) {
    return true;
  }
  return proximaTentativa <= referencia;
}

function detalheBackoffPendenciaOffline(item: OfflinePendingMessage): string {
  if (!item.nextRetryAt) {
    return "";
  }
  const proximaTentativa = new Date(item.nextRetryAt);
  if (Number.isNaN(proximaTentativa.getTime())) {
    return "";
  }
  return `Próxima tentativa após ${formatarHorarioAtividade(item.nextRetryAt)}`;
}

function prioridadePendenciaOffline(item: OfflinePendingMessage): number {
  if (item.lastError) {
    return 0;
  }
  if (pendenciaFilaProntaParaReenvio(item)) {
    return 1;
  }
  return 2;
}

function rotuloStatusPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.lastError) {
    return "Com falha";
  }
  if (item.lastAttemptAt) {
    return "Tentado";
  }
  return "Pendente";
}

function detalheStatusPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.lastError) {
    const tentativas = item.attempts <= 1 ? "1 tentativa" : `${item.attempts} tentativas`;
    const backoff = detalheBackoffPendenciaOffline(item);
    return `${tentativas} · ${resumirErroPendenciaOffline(item.lastError)}${backoff ? ` · ${backoff}` : ""}`;
  }
  if (item.lastAttemptAt) {
    return `Última tentativa em ${formatarHorarioAtividade(item.lastAttemptAt)}`;
  }
  return "Aguardando a primeira tentativa de reenvio";
}

function criarItemFilaOffline(params: {
  channel: OfflinePendingMessage["channel"];
  laudoId: number | null;
  text: string;
  title: string;
  attachment?: ComposerAttachment | null;
  referenceMessageId?: number | null;
}): OfflinePendingMessage {
  return {
    id: `${params.channel}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    channel: params.channel,
    laudoId: params.laudoId,
    text: params.text.trim(),
    createdAt: new Date().toISOString(),
    title: params.title.trim() || "Mensagem pendente",
    attachment: duplicarComposerAttachment(params.attachment || null),
    referenceMessageId: Number(params.referenceMessageId || 0) || null,
    attempts: 0,
    lastAttemptAt: "",
    lastError: "",
    nextRetryAt: "",
  };
}

function normalizarCacheLeitura(payload: unknown): MobileReadCache {
  if (!payload || typeof payload !== "object") {
    return CACHE_LEITURA_VAZIO;
  }

  const registro = payload as Record<string, unknown>;
  const laudos = Array.isArray(registro.laudos) ? (registro.laudos as MobileLaudoCard[]) : [];
  const conversaAtual =
    registro.conversaAtual && typeof registro.conversaAtual === "object"
      ? (registro.conversaAtual as ChatState)
      : null;

  const conversasPorLaudo =
    registro.conversasPorLaudo && typeof registro.conversasPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(registro.conversasPorLaudo as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            valor && typeof valor === "object" ? (valor as ChatState) : criarConversaNova(),
          ]),
        )
      : {};

  const mesaPorLaudo =
    registro.mesaPorLaudo && typeof registro.mesaPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaPorLaudo as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            Array.isArray(valor) ? (valor as MobileMesaMessage[]) : [],
          ]),
        )
      : {};

  const chatDrafts =
    registro.chatDrafts && typeof registro.chatDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.chatDrafts as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            typeof valor === "string" ? valor : "",
          ]),
        )
      : {};

  const mesaDrafts =
    registro.mesaDrafts && typeof registro.mesaDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaDrafts as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            typeof valor === "string" ? valor : "",
          ]),
        )
      : {};

  const chatAttachmentDrafts =
    registro.chatAttachmentDrafts && typeof registro.chatAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.chatAttachmentDrafts as Record<string, unknown>)
            .map(([chave, valor]) => [chave, normalizarComposerAttachment(valor)])
            .filter(([, valor]) => Boolean(valor)),
        )
      : {};

  const mesaAttachmentDrafts =
    registro.mesaAttachmentDrafts && typeof registro.mesaAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaAttachmentDrafts as Record<string, unknown>)
            .map(([chave, valor]) => [chave, normalizarComposerAttachment(valor)])
            .filter(([, valor]) => Boolean(valor)),
        )
      : {};

  return {
    bootstrap:
      registro.bootstrap && typeof registro.bootstrap === "object"
        ? (registro.bootstrap as MobileBootstrapResponse)
        : null,
    laudos,
    conversaAtual,
    conversasPorLaudo,
    mesaPorLaudo,
    chatDrafts,
    mesaDrafts,
    chatAttachmentDrafts: chatAttachmentDrafts as Record<string, ComposerAttachment>,
    mesaAttachmentDrafts: mesaAttachmentDrafts as Record<string, ComposerAttachment>,
    updatedAt: typeof registro.updatedAt === "string" ? registro.updatedAt : "",
  };
}

async function lerCacheLeituraLocal(): Promise<MobileReadCache> {
  try {
    const valor = await FileSystem.readAsStringAsync(READ_CACHE_FILE);
    return normalizarCacheLeitura(JSON.parse(valor));
  } catch {
    return CACHE_LEITURA_VAZIO;
  }
}

async function salvarCacheLeituraLocal(cache: MobileReadCache): Promise<void> {
  try {
    const temConteudo =
      Boolean(cache.bootstrap) ||
      Boolean(cache.conversaAtual) ||
      cache.laudos.length > 0 ||
      Object.keys(cache.conversasPorLaudo).length > 0 ||
      Object.keys(cache.mesaPorLaudo).length > 0 ||
      Object.keys(cache.chatDrafts).length > 0 ||
      Object.keys(cache.mesaDrafts).length > 0 ||
      Object.keys(cache.chatAttachmentDrafts).length > 0 ||
      Object.keys(cache.mesaAttachmentDrafts).length > 0;

    if (!temConteudo) {
      await FileSystem.deleteAsync(READ_CACHE_FILE, { idempotent: true });
      return;
    }

    await FileSystem.writeAsStringAsync(READ_CACHE_FILE, JSON.stringify(cache));
  } catch (error) {
    console.warn("Falha ao salvar o cache de leitura local.", error);
  }
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function ehOpcaoValida<T extends readonly string[]>(valor: unknown, opcoes: T): valor is T[number] {
  return typeof valor === "string" && (opcoes as readonly string[]).includes(valor);
}

function normalizarProviderConectado(payload: unknown): ConnectedProvider | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  if (payload.id !== "google" && payload.id !== "apple" && payload.id !== "microsoft") {
    return null;
  }
  return {
    id: payload.id,
    label: typeof payload.label === "string" && payload.label.trim() ? payload.label : payload.id,
    email: typeof payload.email === "string" ? payload.email : "",
    connected: Boolean(payload.connected),
    requiresReauth: payload.requiresReauth !== false,
  };
}

function normalizarSessaoAtiva(payload: unknown): SessionDevice | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    meta: typeof payload.meta === "string" ? payload.meta : "",
    location: typeof payload.location === "string" ? payload.location : "",
    lastSeen: typeof payload.lastSeen === "string" ? payload.lastSeen : "",
    current: Boolean(payload.current),
    suspicious: Boolean(payload.suspicious),
  };
}

function normalizarEventoSeguranca(payload: unknown): SecurityEventItem | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  if (
    payload.type !== "login" &&
    payload.type !== "provider" &&
    payload.type !== "2fa" &&
    payload.type !== "data" &&
    payload.type !== "session"
  ) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    meta: typeof payload.meta === "string" ? payload.meta : "",
    status: typeof payload.status === "string" ? payload.status : "",
    type: payload.type,
    critical: Boolean(payload.critical),
  };
}

function normalizarItemSuporte(payload: unknown): SupportQueueItem | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  if (!id || !title || !body) {
    return null;
  }
  return {
    id,
    kind: payload.kind === "feedback" ? "feedback" : "bug",
    title,
    body,
    email: typeof payload.email === "string" ? payload.email : "",
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString(),
    status: typeof payload.status === "string" && payload.status.trim() ? payload.status : "Na fila",
  };
}

async function lerPreferenciasLocais(): Promise<Record<string, unknown>> {
  try {
    const valor = await FileSystem.readAsStringAsync(APP_PREFERENCES_FILE);
    const payload = JSON.parse(valor);
    return ehRegistro(payload) ? payload : {};
  } catch {
    return {};
  }
}

async function salvarPreferenciasLocais(preferencias: AppPreferencesState): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(APP_PREFERENCES_FILE, JSON.stringify(preferencias));
  } catch (error) {
    console.warn("Falha ao salvar as preferências locais do app.", error);
  }
}

function limparCachePorPrivacidade(cache: MobileReadCache): MobileReadCache {
  return {
    ...CACHE_LEITURA_VAZIO,
    bootstrap: cache.bootstrap,
    updatedAt: new Date().toISOString(),
  };
}

function serializarPayloadExportacao(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

async function compartilharTextoExportado(params: {
  extension: "json" | "txt";
  content: string;
  prefixo: string;
}): Promise<boolean> {
  try {
    const baseDir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}tariel-exports`;
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const uri = `${baseDir}/${params.prefixo}-${carimbo}.${params.extension}`;
    await FileSystem.writeAsStringAsync(uri, params.content);
    const podeCompartilhar = await Sharing.isAvailableAsync();
    if (podeCompartilhar) {
      await Sharing.shareAsync(uri, {
        dialogTitle: "Exportar dados do Tariel Inspetor",
        mimeType: params.extension === "json" ? "application/json" : "text/plain",
      });
    }
    return true;
  } catch (error) {
    console.warn("Falha ao exportar dados do app.", error);
    return false;
  }
}

function obterIntervaloMonitoramentoMs(
  economiaDados: boolean,
  usoBateria: (typeof BATTERY_OPTIONS)[number],
): number {
  if (economiaDados || usoBateria === "Econômico") {
    return 60_000;
  }
  if (usoBateria === "Otimizado") {
    return 40_000;
  }
  return 25_000;
}

const MAX_LAUDOS_MONITORADOS_MESA = 6;

function obterEscalaFonte(tamanho: (typeof FONT_SIZE_OPTIONS)[number]): number {
  if (tamanho === "pequeno") {
    return 0.94;
  }
  if (tamanho === "grande") {
    return 1.08;
  }
  return 1;
}

function obterEscalaDensidade(densidade: (typeof DENSITY_OPTIONS)[number]): number {
  return densidade === "compacta" ? 0.9 : 1;
}

function obterNomeCurto(nomeCompleto: string): string {
  return (nomeCompleto || "").trim().split(/\s+/)[0] || "Inspetor";
}

function montarHistoricoParaEnvio(
  mensagens: MobileChatMessage[],
): Array<{ papel: "usuario" | "assistente"; texto: string }> {
  return mensagens
    .filter(
      (mensagem) =>
        (mensagem.papel === "usuario" || mensagem.papel === "assistente") &&
        typeof mensagem.texto === "string" &&
        mensagem.texto.trim(),
    )
    .slice(-20)
    .map((mensagem) => ({
      papel: mensagem.papel === "usuario" ? "usuario" : "assistente",
      texto: mensagem.texto.trim(),
    }));
}

function normalizarModoChat(modo: unknown, fallback: MobileChatMode = "detalhado"): MobileChatMode {
  const valor = String(modo || "").trim().toLowerCase();
  if (valor === "curto") {
    return "curto";
  }
  if (valor === "deep_research" || valor === "deepresearch") {
    return "deep_research";
  }
  if (valor === "detalhado") {
    return "detalhado";
  }
  return fallback;
}

function inferirSetorConversa(conversa: ChatState | null | undefined): string {
  const tipoTemplate = String(conversa?.laudoCard?.tipo_template || "")
    .trim()
    .toLowerCase();

  switch (tipoTemplate) {
    case "rti":
    case "nr10_rti":
      return "rti";
    case "nr12":
    case "nr12_maquinas":
    case "nr12maquinas":
      return "nr12";
    case "nr13":
    case "nr13_caldeira":
      return "nr13";
    case "spda":
    case "pie":
    case "avcb":
    case "loto":
    case "nr10":
    case "nr35":
      return tipoTemplate;
    case "cbmgo":
      return "avcb";
    default:
      return "geral";
  }
}

function extrairModoConversaDasMensagens(mensagens: MobileChatMessage[]): MobileChatMode {
  for (let index = mensagens.length - 1; index >= 0; index -= 1) {
    const mensagem = mensagens[index];
    if (typeof mensagem?.modo === "string" && mensagem.modo.trim()) {
      return normalizarModoChat(mensagem.modo);
    }
  }
  return "detalhado";
}

function criarMensagemAssistenteServidor(resposta: MobileChatSendResult): MobileChatMessage | null {
  const texto = resposta.assistantText.trim();
  if (!texto) {
    return null;
  }

  return {
    id: Date.now() + 1,
    papel: "assistente",
    texto,
    tipo: "assistant",
    modo: normalizarModoChat(resposta.modo),
    citacoes: resposta.citacoes.length ? resposta.citacoes : undefined,
    confianca_ia: resposta.confiancaIa || undefined,
  };
}

function normalizarConversa(
  payload: MobileLaudoStatusResponse | MobileLaudoMensagensResponse,
): ChatState {
  const mensagens = "itens" in payload ? payload.itens : [];
  return {
    laudoId: payload.laudo_id ?? null,
    estado: payload.estado,
    statusCard: payload.status_card || "aberto",
    permiteEdicao: Boolean(payload.permite_edicao),
    permiteReabrir: Boolean(payload.permite_reabrir),
    laudoCard: payload.laudo_card || null,
    modo: normalizarModoChat(payload.modo, extrairModoConversaDasMensagens(mensagens)),
    mensagens,
  };
}

function criarConversaNova(): ChatState {
  return {
    laudoId: null,
    estado: "sem_relatorio",
    statusCard: "aberto",
    permiteEdicao: true,
    permiteReabrir: false,
    laudoCard: null,
    modo: "detalhado",
    mensagens: [],
  };
}

function obterTonsStatusLaudo(statusCard: string): { fundo: string; texto: string } {
  const mapa: Record<string, { fundo: string; texto: string }> = {
    aberto: { fundo: "#E8F4EC", texto: "#1F7A4C" },
    aguardando: { fundo: "#EEF2F6", texto: "#3D556F" },
    ajustes: { fundo: "#FFF0E5", texto: "#B85A11" },
    aprovado: { fundo: "#EAF7F1", texto: "#187048" },
  };

  return mapa[statusCard] || { fundo: "#EEF2F6", texto: "#3D556F" };
}

function textoFallbackAnexo(anexo: ComposerAttachment | null): string {
  if (!anexo) {
    return "";
  }
  if (anexo.kind === "image") {
    return "Imagem enviada";
  }
  return `Documento: ${anexo.nomeDocumento}`;
}

function nomeExibicaoAnexo(
  item:
    | MobileAttachment
    | {
        nome_original?: unknown;
        nome?: unknown;
        nome_arquivo?: unknown;
        label?: unknown;
      },
  fallback = "Anexo",
): string {
  const candidatos = [
    item.nome_original,
    item.nome,
    item.nome_arquivo,
    item.label,
  ];
  for (const valor of candidatos) {
    if (typeof valor === "string" && valor.trim()) {
      return valor.trim();
    }
  }
  return fallback;
}

function nomeArquivoSeguro(nome: string, fallback: string): string {
  const base = String(nome || "").trim();
  const semSeparadores = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return semSeparadores || fallback;
}

function inferirExtensaoAnexo(anexo: MobileAttachment): string {
  const nome = nomeExibicaoAnexo(anexo, "anexo").toLowerCase();
  const correspondencias = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".pdf",
    ".docx",
    ".doc",
  ];

  for (const extensao of correspondencias) {
    if (nome.endsWith(extensao)) {
      return extensao;
    }
  }

  const mime = String(anexo.mime_type || "").toLowerCase();
  if (mime.includes("png")) {
    return ".png";
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return ".jpg";
  }
  if (mime.includes("webp")) {
    return ".webp";
  }
  if (mime.includes("pdf")) {
    return ".pdf";
  }
  if (mime.includes("wordprocessingml") || mime.includes("docx")) {
    return ".docx";
  }
  if (mime.includes("msword")) {
    return ".doc";
  }
  return "";
}

function tamanhoHumanoAnexo(bytes: number | undefined): string {
  const valor = Number(bytes || 0);
  if (!Number.isFinite(valor) || valor <= 0) {
    return "";
  }
  if (valor < 1024) {
    return `${valor} B`;
  }
  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

function urlAnexoAbsoluta(url: string | undefined): string | null {
  const valor = String(url || "").trim();
  if (!valor) {
    return null;
  }
  if (/^https?:\/\//i.test(valor)) {
    return valor;
  }
  return `${API_BASE_URL}${valor.startsWith("/") ? "" : "/"}${valor}`;
}

function ehImagemAnexo(anexo: MobileAttachment): boolean {
  if (typeof anexo.eh_imagem === "boolean") {
    return anexo.eh_imagem;
  }
  const categoria = String(anexo.categoria || "").toLowerCase();
  const mime = String(anexo.mime_type || "").toLowerCase();
  return categoria === "imagem" || categoria === "image" || mime.startsWith("image/");
}

function chaveAnexo(anexo: MobileAttachment, fallback: string): string {
  const partes = [
    anexo.id,
    anexo.url,
    anexo.nome,
    anexo.nome_original,
    anexo.label,
  ]
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean);

  return partes.join(":") || fallback;
}

function erroSugereModoOffline(erro: unknown): boolean {
  const texto = String(erro instanceof Error ? erro.message : erro || "")
    .trim()
    .toLowerCase();
  if (!texto) {
    return false;
  }

  return [
    "network request failed",
    "network",
    "offline",
    "internet",
    "connection",
    "conex",
    "fetch",
    "timeout",
    "timed out",
  ].some((trecho) => texto.includes(trecho));
}

function assinaturaStatusLaudo(item: MobileLaudoCard): string {
  return [
    item.status_card,
    item.status_revisao,
    item.status_card_label,
    item.permite_reabrir ? "1" : "0",
    item.permite_edicao ? "1" : "0",
  ].join("|");
}

function assinaturaMensagemMesa(item: MobileMesaMessage): string {
  return [
    item.id,
    item.lida ? "1" : "0",
    item.resolvida_em || "",
    item.texto || "",
  ].join("|");
}

function resumoMensagemAtividade(texto: string, fallback: string): string {
  const valor = String(texto || "").trim().replace(/\s+/g, " ");
  if (!valor) {
    return fallback;
  }
  return valor.length > 120 ? `${valor.slice(0, 117)}...` : valor;
}

function obterResumoReferenciaMensagem(
  referenciaId: number | null | undefined,
  mensagensChat: MobileChatMessage[],
  mensagensMesa: MobileMesaMessage[],
): string {
  const alvo = Number(referenciaId || 0) || null;
  if (!alvo) {
    return "";
  }

  const mensagemChat = mensagensChat.find((item) => Number(item.id || 0) === alvo);
  if (mensagemChat?.texto?.trim()) {
    return resumoMensagemAtividade(mensagemChat.texto, `Mensagem #${alvo}`);
  }

  const mensagemMesa = mensagensMesa.find((item) => Number(item.id || 0) === alvo);
  if (mensagemMesa?.texto?.trim()) {
    return resumoMensagemAtividade(mensagemMesa.texto, `Mensagem #${alvo}`);
  }

  return `Mensagem #${alvo}`;
}

function formatarTipoTemplateLaudo(value: string | null | undefined): string {
  const texto = String(value || "").trim();
  if (!texto) {
    return "Laudo padrão";
  }

  return texto
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(" ");
}

function criarNotificacaoStatusLaudo(item: MobileLaudoCard): MobileActivityNotification {
  const mapaTitulo: Record<string, string> = {
    aprovado: "Laudo aprovado",
    ajustes: "Mesa pediu ajustes",
    aguardando: "Laudo em análise da mesa",
    aberto: "Laudo voltou ao fluxo",
  };
  const mapaDescricao: Record<string, string> = {
    aprovado: `${item.titulo} foi aprovado e já pode seguir como concluído.`,
    ajustes: `${item.titulo} recebeu ajustes e pede sua atenção no app.`,
    aguardando: `${item.titulo} foi enviado para a mesa avaliadora.`,
    aberto: `${item.titulo} voltou ao fluxo ativo do inspetor.`,
  };

  return {
    id: `status:${item.id}:${assinaturaStatusLaudo(item)}`,
    kind: "status",
    laudoId: item.id,
    title: mapaTitulo[item.status_card] || "Status do laudo atualizado",
    body: mapaDescricao[item.status_card] || `${item.titulo} mudou para ${item.status_card_label}.`,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: item.status_card === "ajustes" ? "mesa" : "chat",
  };
}

function criarNotificacaoMesa(
  kind: MobileActivityNotification["kind"],
  mensagemMesa: MobileMesaMessage,
  tituloLaudo: string,
): MobileActivityNotification {
  const mapaTitulo: Record<MobileActivityNotification["kind"], string> = {
    status: "Atividade da mesa",
    mesa_nova: "Nova mensagem da mesa",
    mesa_resolvida: "Pendência marcada como resolvida",
    mesa_reaberta: "Pendência reaberta pela mesa",
  };
  const fallback =
    kind === "mesa_resolvida"
      ? "A mesa marcou uma pendência como resolvida."
      : kind === "mesa_reaberta"
        ? "A mesa reabriu uma pendência para novo ajuste."
        : "A mesa enviou uma nova atualização.";

  return {
    id:
      kind === "mesa_nova"
        ? `mesa:${mensagemMesa.id}`
        : `mesa:${mensagemMesa.id}:${kind}:${mensagemMesa.resolvida_em || "aberta"}`,
    kind,
    laudoId: mensagemMesa.laudo_id,
    title: mapaTitulo[kind],
    body: `${tituloLaudo}: ${resumoMensagemAtividade(mensagemMesa.texto, fallback)}`,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: "mesa",
  };
}

function selecionarLaudosParaMonitoramentoMesa(params: {
  laudos: MobileLaudoCard[];
  laudoAtivoId: number | null;
}): number[] {
  const ids: number[] = [];

  if (params.laudoAtivoId) {
    ids.push(params.laudoAtivoId);
  }

  for (const item of params.laudos) {
    if (ids.length >= MAX_LAUDOS_MONITORADOS_MESA) {
      break;
    }
    if (ids.includes(item.id)) {
      continue;
    }
    if (item.status_card === "ajustes" || item.status_card === "aguardando") {
      ids.push(item.id);
    }
  }

  return ids;
}

function mapearStatusLaudoVisual(statusCard: string) {
  switch (statusCard) {
    case "aprovado":
      return {
        tone: "success" as const,
        icon: "check-decagram-outline" as const,
      };
    case "ajustes":
      return {
        tone: "danger" as const,
        icon: "alert-circle-outline" as const,
      };
    case "aguardando":
      return {
        tone: "accent" as const,
        icon: "clipboard-clock-outline" as const,
      };
    default:
      return {
        tone: "muted" as const,
        icon: "file-document-outline" as const,
      };
  }
}

function formatarHorarioAtividade(dataIso: string): string {
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) {
    return "agora";
  }
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reautenticacaoAindaValida(dataIso: string): boolean {
  if (!dataIso) {
    return false;
  }
  const data = new Date(dataIso);
  return !Number.isNaN(data.getTime()) && data.getTime() > Date.now();
}

function formatarStatusReautenticacao(dataIso: string): string {
  if (!reautenticacaoAindaValida(dataIso)) {
    return "Não confirmada";
  }

  const data = new Date(dataIso);
  return `Confirmada até ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

interface MessageAttachmentCardProps {
  attachment: MobileAttachment;
  accessToken: string | null;
  opening: boolean;
  onPress: (attachment: MobileAttachment) => void;
}

function MessageAttachmentCard({
  attachment,
  accessToken,
  opening,
  onPress,
}: MessageAttachmentCardProps) {
  const imageAttachment = ehImagemAnexo(attachment);
  const absoluteUrl = urlAnexoAbsoluta(attachment.url);
  const disabled = !absoluteUrl || !accessToken || opening;
  const tamanho = tamanhoHumanoAnexo(attachment.tamanho_bytes);
  const titulo = nomeExibicaoAnexo(attachment, imageAttachment ? "Imagem" : "Documento");

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress(attachment)}
      style={[styles.messageAttachmentCard, disabled ? styles.messageAttachmentCardDisabled : null]}
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
            name={disabled ? "lock-outline" : imageAttachment ? "image-search-outline" : "download-outline"}
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

function MessageReferenceCard({
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

function montarAnexoImagem(
  asset: ImagePicker.ImagePickerAsset,
  resumo: string,
): ComposerAttachment {
  if (!asset.base64) {
    throw new Error("Não foi possível preparar a imagem selecionada.");
  }

  const mimeType = (asset.mimeType || "image/jpeg").replace("image/jpg", "image/jpeg");
  const nomeArquivo =
    asset.fileName?.trim() ||
    `evidencia-${Date.now()}.${mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"}`;

  return {
    kind: "image",
    label: nomeArquivo,
    resumo,
    dadosImagem: `data:${mimeType};base64,${asset.base64}`,
    previewUri: asset.uri,
    fileUri: asset.uri,
    mimeType,
  };
}

function montarAnexoDocumentoLocal(
  asset: DocumentPicker.DocumentPickerAsset,
  resumo: string,
): ComposerAttachment {
  return {
    kind: "document",
    label: asset.name,
    resumo,
    textoDocumento: "",
    nomeDocumento: asset.name,
    chars: 0,
    truncado: false,
    fileUri: asset.uri,
    mimeType: asset.mimeType || "application/octet-stream",
  };
}

function montarAnexoDocumentoMesa(asset: DocumentPicker.DocumentPickerAsset): ComposerAttachment {
  return montarAnexoDocumentoLocal(asset, "Documento pronto para seguir direto para a mesa avaliadora.");
}

export function InspectorMobileApp() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [statusApi, setStatusApi] = useState<ApiHealthStatus>("checking");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [session, setSession] = useState<MobileSessionState | null>(null);
  const [conversa, setConversa] = useState<ChatState | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<ActiveThread>("chat");
  const [laudosDisponiveis, setLaudosDisponiveis] = useState<MobileLaudoCard[]>([]);
  const [carregandoLaudos, setCarregandoLaudos] = useState(false);
  const [erroLaudos, setErroLaudos] = useState("");
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [sincronizandoConversa, setSincronizandoConversa] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [anexoRascunho, setAnexoRascunho] = useState<ComposerAttachment | null>(null);
  const [erroConversa, setErroConversa] = useState("");
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [preparandoAnexo, setPreparandoAnexo] = useState(false);
  const [mensagensMesa, setMensagensMesa] = useState<MobileMesaMessage[]>([]);
  const [erroMesa, setErroMesa] = useState("");
  const [mensagemMesa, setMensagemMesa] = useState("");
  const [anexoMesaRascunho, setAnexoMesaRascunho] = useState<ComposerAttachment | null>(null);
  const [mensagemMesaReferenciaAtiva, setMensagemMesaReferenciaAtiva] = useState<MessageReferenceState | null>(null);
  const [carregandoMesa, setCarregandoMesa] = useState(false);
  const [sincronizandoMesa, setSincronizandoMesa] = useState(false);
  const [enviandoMesa, setEnviandoMesa] = useState(false);
  const [laudoMesaCarregado, setLaudoMesaCarregado] = useState<number | null>(null);
  const [anexoAbrindoChave, setAnexoAbrindoChave] = useState("");
  const [previewAnexoImagem, setPreviewAnexoImagem] = useState<AttachmentPreviewState | null>(null);
  const [mensagemChatDestacadaId, setMensagemChatDestacadaId] = useState<number | null>(null);
  const [layoutMensagensChatVersao, setLayoutMensagensChatVersao] = useState(0);
  const [filaOffline, setFilaOffline] = useState<OfflinePendingMessage[]>([]);
  const [sincronizandoFilaOffline, setSincronizandoFilaOffline] = useState(false);
  const [sincronizandoItemFilaId, setSincronizandoItemFilaId] = useState("");
  const [notificacoes, setNotificacoes] = useState<MobileActivityNotification[]>([]);
  const [cacheLeitura, setCacheLeitura] = useState<MobileReadCache>(CACHE_LEITURA_VAZIO);
  const [usandoCacheOffline, setUsandoCacheOffline] = useState(false);
  const [centralAtividadeAberta, setCentralAtividadeAberta] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [filtroHistorico, setFiltroHistorico] = useState<HistoryDrawerFilter>("todos");
  const [filaOfflineAberta, setFilaOfflineAberta] = useState(false);
  const [configuracoesAberta, setConfiguracoesAberta] = useState(false);
  const [anexosAberto, setAnexosAberto] = useState(false);
  const [introVisivel, setIntroVisivel] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [filtroFilaOffline, setFiltroFilaOffline] = useState<OfflineQueueFilter>("all");
  const [monitorandoAtividade, setMonitorandoAtividade] = useState(false);
  const [perfilNome, setPerfilNome] = useState("");
  const [perfilExibicao, setPerfilExibicao] = useState("");
  const [perfilFotoUri, setPerfilFotoUri] = useState("");
  const [perfilFotoHint, setPerfilFotoHint] = useState("Toque para atualizar");
  const [laudosFixadosIds, setLaudosFixadosIds] = useState<number[]>([]);
  const [historicoOcultoIds, setHistoricoOcultoIds] = useState<number[]>([]);
  const [emailAtualConta, setEmailAtualConta] = useState("");
  const [novoEmailDraft, setNovoEmailDraft] = useState("");
  const [senhaAtualDraft, setSenhaAtualDraft] = useState("");
  const [novaSenhaDraft, setNovaSenhaDraft] = useState("");
  const [confirmarSenhaDraft, setConfirmarSenhaDraft] = useState("");
  const [planoAtual, setPlanoAtual] = useState<(typeof PLAN_OPTIONS)[number]>("Pro");
  const [cartaoAtual, setCartaoAtual] = useState<(typeof PAYMENT_CARD_OPTIONS)[number]>("Visa final 4242");
  const [modeloIa, setModeloIa] = useState<(typeof AI_MODEL_OPTIONS)[number]>("equilibrado");
  const [estiloResposta, setEstiloResposta] = useState<(typeof RESPONSE_STYLE_OPTIONS)[number]>("detalhado");
  const [idiomaResposta, setIdiomaResposta] = useState<(typeof RESPONSE_LANGUAGE_OPTIONS)[number]>("Português");
  const [memoriaIa, setMemoriaIa] = useState(true);
  const [aprendizadoIa, setAprendizadoIa] = useState(false);
  const [tomConversa, setTomConversa] = useState<(typeof CONVERSATION_TONE_OPTIONS)[number]>("técnico");
  const [temperaturaIa, setTemperaturaIa] = useState<number>(0.4);
  const [temaApp, setTemaApp] = useState<(typeof THEME_OPTIONS)[number]>("claro");
  const [tamanhoFonte, setTamanhoFonte] = useState<(typeof FONT_SIZE_OPTIONS)[number]>("médio");
  const [densidadeInterface, setDensidadeInterface] = useState<(typeof DENSITY_OPTIONS)[number]>("confortável");
  const [corDestaque, setCorDestaque] = useState<(typeof ACCENT_OPTIONS)[number]>("laranja");
  const [animacoesAtivas, setAnimacoesAtivas] = useState(true);
  const [notificaRespostas, setNotificaRespostas] = useState(true);
  const [notificaPush, setNotificaPush] = useState(true);
  const [somNotificacao, setSomNotificacao] = useState<(typeof NOTIFICATION_SOUND_OPTIONS)[number]>("Ping");
  const [vibracaoAtiva, setVibracaoAtiva] = useState(true);
  const [emailsAtivos, setEmailsAtivos] = useState(false);
  const [salvarHistoricoConversas, setSalvarHistoricoConversas] = useState(true);
  const [compartilharMelhoriaIa, setCompartilharMelhoriaIa] = useState(false);
  const [backupAutomatico, setBackupAutomatico] = useState(true);
  const [sincronizacaoDispositivos, setSincronizacaoDispositivos] = useState(true);
  const [nomeAutomaticoConversas, setNomeAutomaticoConversas] = useState(true);
  const [fixarConversas, setFixarConversas] = useState(true);
  const [entradaPorVoz, setEntradaPorVoz] = useState(false);
  const [respostaPorVoz, setRespostaPorVoz] = useState(false);
  const [uploadArquivosAtivo, setUploadArquivosAtivo] = useState(true);
  const [economiaDados, setEconomiaDados] = useState(false);
  const [usoBateria, setUsoBateria] = useState<(typeof BATTERY_OPTIONS)[number]>("Otimizado");
  const [idiomaApp, setIdiomaApp] = useState<(typeof APP_LANGUAGE_OPTIONS)[number]>("Português");
  const [regiaoApp, setRegiaoApp] = useState<(typeof REGION_OPTIONS)[number]>("Brasil");
  const [provedoresConectados, setProvedoresConectados] = useState<ConnectedProvider[]>([
    { id: "google", label: "Google", email: "", connected: false, requiresReauth: true },
    { id: "apple", label: "Apple", email: "", connected: false, requiresReauth: true },
    { id: "microsoft", label: "Microsoft", email: "", connected: true, requiresReauth: true },
  ]);
  const [sessoesAtivas, setSessoesAtivas] = useState<SessionDevice[]>([
    {
      id: "current-device",
      title: "Pixel 7a • Android 14",
      meta: "Tariel Inspetor • App móvel",
      location: "Este dispositivo",
      lastSeen: "Agora",
      current: true,
    },
    {
      id: "chrome-office",
      title: "Chrome • Windows 11",
      meta: "Portal do inspetor",
      location: "São Paulo, BR",
      lastSeen: "Hoje às 09:41",
      current: false,
    },
    {
      id: "tablet-review",
      title: "Galaxy Tab • Android",
      meta: "Teste interno",
      location: "Campinas, BR",
      lastSeen: "Ontem às 18:12",
      current: false,
      suspicious: true,
    },
  ]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<(typeof TWO_FACTOR_METHOD_OPTIONS)[number]>("App autenticador");
  const [recoveryCodesEnabled, setRecoveryCodesEnabled] = useState(true);
  const [deviceBiometricsEnabled, setDeviceBiometricsEnabled] = useState(true);
  const [requireAuthOnOpen, setRequireAuthOnOpen] = useState(true);
  const [hideInMultitask, setHideInMultitask] = useState(true);
  const [lockTimeout, setLockTimeout] = useState<(typeof LOCK_TIMEOUT_OPTIONS)[number]>("1 minuto");
  const [retencaoDados, setRetencaoDados] = useState<(typeof DATA_RETENTION_OPTIONS)[number]>("90 dias");
  const [codigo2FA, setCodigo2FA] = useState("");
  const [codigosRecuperacao, setCodigosRecuperacao] = useState<string[]>([]);
  const [reautenticacaoStatus, setReautenticacaoStatus] = useState("Não confirmada");
  const [reautenticacaoExpiraEm, setReautenticacaoExpiraEm] = useState("");
  const [reauthReason, setReauthReason] = useState(
    "Confirme sua identidade para liberar ações críticas no app do inspetor.",
  );
  const [filtroEventosSeguranca, setFiltroEventosSeguranca] = useState<SecurityEventFilter>("todos");
  const [eventosSeguranca, setEventosSeguranca] = useState<SecurityEventItem[]>([
    {
      id: "sec-1",
      title: "Novo login autorizado",
      meta: "Pixel 7a • São Paulo, BR",
      status: "Hoje às 12:07",
      type: "login",
    },
    {
      id: "sec-2",
      title: "Conta Microsoft conectada",
      meta: "Conta corporativa vinculada",
      status: "Ontem às 18:41",
      type: "provider",
    },
    {
      id: "sec-3",
      title: "Tentativa sensível pendente de reautenticação",
      meta: "Exportação de dados solicitada",
      status: "Hoje às 10:18",
      type: "data",
      critical: true,
    },
  ]);
  const [mostrarConteudoNotificacao, setMostrarConteudoNotificacao] = useState(false);
  const [ocultarConteudoBloqueado, setOcultarConteudoBloqueado] = useState(true);
  const [mostrarSomenteNovaMensagem, setMostrarSomenteNovaMensagem] = useState(true);
  const [buscaAjuda, setBuscaAjuda] = useState("");
  const [artigoAjudaExpandidoId, setArtigoAjudaExpandidoId] = useState<string>(HELP_CENTER_ARTICLES[0]?.id ?? "");
  const [filaSuporteLocal, setFilaSuporteLocal] = useState<SupportQueueItem[]>([]);
  const [ultimaVerificacaoAtualizacao, setUltimaVerificacaoAtualizacao] = useState("");
  const [statusAtualizacaoApp, setStatusAtualizacaoApp] = useState("Nenhuma verificação recente");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [bugDescriptionDraft, setBugDescriptionDraft] = useState("");
  const [bugEmailDraft, setBugEmailDraft] = useState("");
  const [buscaConfiguracoes, setBuscaConfiguracoes] = useState("");
  const filtroConfiguracoes: SettingsDrawerFilter = "todos";
  const [settingsDrawerPage, setSettingsDrawerPage] = useState<SettingsDrawerPage>("overview");
  const [settingsDrawerSection, setSettingsDrawerSection] = useState<SettingsSectionKey | "all">("all");
  const [settingsSheet, setSettingsSheet] = useState<SettingsSheetState | null>(null);
  const [settingsSheetLoading, setSettingsSheetLoading] = useState(false);
  const [settingsSheetNotice, setSettingsSheetNotice] = useState("");
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(null);
  const [confirmTextDraft, setConfirmTextDraft] = useState("");
  const [microfonePermitido, setMicrofonePermitido] = useState(true);
  const [cameraPermitida, setCameraPermitida] = useState(true);
  const [arquivosPermitidos, setArquivosPermitidos] = useState(true);
  const [notificacoesPermitidas, setNotificacoesPermitidas] = useState(true);
  const [biometriaPermitida, setBiometriaPermitida] = useState(true);
  const scrollRef = useRef<ScrollView | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const senhaInputRef = useRef<TextInput | null>(null);
  const chatMessageOffsetsRef = useRef<Record<number, number>>({});
  const chatHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusSnapshotRef = useRef<Record<number, string>>({});
  const mesaSnapshotRef = useRef<Record<number, Record<number, string>>>({});
  const pendingSensitiveActionRef = useRef<(() => void) | null>(null);
  const chatDraftKeyRef = useRef("");
  const mesaDraftKeyRef = useRef("");
  const chatAttachmentDraftKeyRef = useRef("");
  const mesaAttachmentDraftKeyRef = useRef("");
  const historicoDrawerX = useRef(new Animated.Value(HISTORY_PANEL_CLOSED_X)).current;
  const configuracoesDrawerX = useRef(new Animated.Value(SETTINGS_PANEL_CLOSED_X)).current;
  const drawerOverlayOpacity = useRef(new Animated.Value(0)).current;
  const historicoAbertoRef = useRef(false);
  const configuracoesAbertaRef = useRef(false);

  function limparReferenciaMesaAtiva() {
    setMensagemMesaReferenciaAtiva(null);
  }

  function definirReferenciaMesaAtiva(mensagemAtual: MobileMesaMessage) {
    const referenciaId = Number(mensagemAtual.id || 0) || null;
    if (!referenciaId) {
      limparReferenciaMesaAtiva();
      return;
    }

    setMensagemMesaReferenciaAtiva({
      id: referenciaId,
      texto: resumoMensagemAtividade(mensagemAtual.texto, `Mensagem #${referenciaId}`),
    });
  }

  function registrarLayoutMensagemChat(mensagemId: number | null, offsetY: number) {
    const alvo = Number(mensagemId || 0) || null;
    if (!alvo) {
      return;
    }

    if (chatMessageOffsetsRef.current[alvo] === offsetY) {
      return;
    }

    chatMessageOffsetsRef.current[alvo] = offsetY;
    setLayoutMensagensChatVersao((estadoAtual) => estadoAtual + 1);
  }

  async function abrirReferenciaNoChat(referenciaId: number | null | undefined) {
    const alvo = Number(referenciaId || 0) || null;
    if (!alvo) {
      return;
    }

    if (!conversa?.mensagens.some((item) => Number(item.id || 0) === alvo) && session && conversa?.laudoId) {
      await abrirLaudoPorId(session.accessToken, conversa.laudoId);
    }

    setAbaAtiva("chat");
    setMensagemChatDestacadaId(alvo);
  }

  function aplicarPreferenciasLocais(preferencias: Record<string, unknown>) {
    if (typeof preferencias.perfilNome === "string") {
      setPerfilNome(preferencias.perfilNome);
    }
    if (typeof preferencias.perfilExibicao === "string") {
      setPerfilExibicao(preferencias.perfilExibicao);
    }
    if (typeof preferencias.perfilFotoUri === "string") {
      setPerfilFotoUri(preferencias.perfilFotoUri);
    }
    if (typeof preferencias.perfilFotoHint === "string") {
      setPerfilFotoHint(preferencias.perfilFotoHint);
    }
    if (Array.isArray(preferencias.laudosFixadosIds)) {
      setLaudosFixadosIds(
        preferencias.laudosFixadosIds.filter((item): item is number => typeof item === "number"),
      );
    }
    if (Array.isArray(preferencias.historicoOcultoIds)) {
      setHistoricoOcultoIds(
        preferencias.historicoOcultoIds.filter((item): item is number => typeof item === "number"),
      );
    }
    if (ehOpcaoValida(preferencias.planoAtual, PLAN_OPTIONS)) {
      setPlanoAtual(preferencias.planoAtual);
    }
    if (ehOpcaoValida(preferencias.cartaoAtual, PAYMENT_CARD_OPTIONS)) {
      setCartaoAtual(preferencias.cartaoAtual);
    }
    if (ehOpcaoValida(preferencias.modeloIa, AI_MODEL_OPTIONS)) {
      setModeloIa(preferencias.modeloIa);
    }
    if (ehOpcaoValida(preferencias.estiloResposta, RESPONSE_STYLE_OPTIONS)) {
      setEstiloResposta(preferencias.estiloResposta);
    }
    if (ehOpcaoValida(preferencias.idiomaResposta, RESPONSE_LANGUAGE_OPTIONS)) {
      setIdiomaResposta(preferencias.idiomaResposta);
    }
    if (typeof preferencias.memoriaIa === "boolean") {
      setMemoriaIa(preferencias.memoriaIa);
    }
    if (typeof preferencias.aprendizadoIa === "boolean") {
      setAprendizadoIa(preferencias.aprendizadoIa);
    }
    if (ehOpcaoValida(preferencias.tomConversa, CONVERSATION_TONE_OPTIONS)) {
      setTomConversa(preferencias.tomConversa);
    }
    if (typeof preferencias.temperaturaIa === "number" && !Number.isNaN(preferencias.temperaturaIa)) {
      setTemperaturaIa(Math.max(0, Math.min(1, preferencias.temperaturaIa)));
    }
    if (ehOpcaoValida(preferencias.temaApp, THEME_OPTIONS)) {
      setTemaApp(preferencias.temaApp);
    }
    if (ehOpcaoValida(preferencias.tamanhoFonte, FONT_SIZE_OPTIONS)) {
      setTamanhoFonte(preferencias.tamanhoFonte);
    }
    if (ehOpcaoValida(preferencias.densidadeInterface, DENSITY_OPTIONS)) {
      setDensidadeInterface(preferencias.densidadeInterface);
    }
    if (ehOpcaoValida(preferencias.corDestaque, ACCENT_OPTIONS)) {
      setCorDestaque(preferencias.corDestaque);
    }
    if (typeof preferencias.animacoesAtivas === "boolean") {
      setAnimacoesAtivas(preferencias.animacoesAtivas);
    }
    if (typeof preferencias.notificaRespostas === "boolean") {
      setNotificaRespostas(preferencias.notificaRespostas);
    }
    if (typeof preferencias.notificaPush === "boolean") {
      setNotificaPush(preferencias.notificaPush);
    }
    if (ehOpcaoValida(preferencias.somNotificacao, NOTIFICATION_SOUND_OPTIONS)) {
      setSomNotificacao(preferencias.somNotificacao);
    }
    if (typeof preferencias.vibracaoAtiva === "boolean") {
      setVibracaoAtiva(preferencias.vibracaoAtiva);
    }
    if (typeof preferencias.emailsAtivos === "boolean") {
      setEmailsAtivos(preferencias.emailsAtivos);
    }
    if (typeof preferencias.salvarHistoricoConversas === "boolean") {
      setSalvarHistoricoConversas(preferencias.salvarHistoricoConversas);
    }
    if (typeof preferencias.compartilharMelhoriaIa === "boolean") {
      setCompartilharMelhoriaIa(preferencias.compartilharMelhoriaIa);
    }
    if (typeof preferencias.backupAutomatico === "boolean") {
      setBackupAutomatico(preferencias.backupAutomatico);
    }
    if (typeof preferencias.sincronizacaoDispositivos === "boolean") {
      setSincronizacaoDispositivos(preferencias.sincronizacaoDispositivos);
    }
    if (typeof preferencias.nomeAutomaticoConversas === "boolean") {
      setNomeAutomaticoConversas(preferencias.nomeAutomaticoConversas);
    }
    if (typeof preferencias.fixarConversas === "boolean") {
      setFixarConversas(preferencias.fixarConversas);
    }
    if (typeof preferencias.entradaPorVoz === "boolean") {
      setEntradaPorVoz(preferencias.entradaPorVoz);
    }
    if (typeof preferencias.respostaPorVoz === "boolean") {
      setRespostaPorVoz(preferencias.respostaPorVoz);
    }
    if (typeof preferencias.uploadArquivosAtivo === "boolean") {
      setUploadArquivosAtivo(preferencias.uploadArquivosAtivo);
    }
    if (typeof preferencias.economiaDados === "boolean") {
      setEconomiaDados(preferencias.economiaDados);
    }
    if (ehOpcaoValida(preferencias.usoBateria, BATTERY_OPTIONS)) {
      setUsoBateria(preferencias.usoBateria);
    }
    if (ehOpcaoValida(preferencias.idiomaApp, APP_LANGUAGE_OPTIONS)) {
      setIdiomaApp(preferencias.idiomaApp);
    }
    if (ehOpcaoValida(preferencias.regiaoApp, REGION_OPTIONS)) {
      setRegiaoApp(preferencias.regiaoApp);
    }
    if (Array.isArray(preferencias.provedoresConectados)) {
      const provedores = preferencias.provedoresConectados
        .map((item) => normalizarProviderConectado(item))
        .filter((item): item is ConnectedProvider => Boolean(item));
      if (provedores.length) {
        setProvedoresConectados(provedores);
      }
    }
    if (Array.isArray(preferencias.sessoesAtivas)) {
      const sessoes = preferencias.sessoesAtivas
        .map((item) => normalizarSessaoAtiva(item))
        .filter((item): item is SessionDevice => Boolean(item));
      if (sessoes.length) {
        setSessoesAtivas(sessoes);
      }
    }
    if (typeof preferencias.twoFactorEnabled === "boolean") {
      setTwoFactorEnabled(preferencias.twoFactorEnabled);
    }
    if (ehOpcaoValida(preferencias.twoFactorMethod, TWO_FACTOR_METHOD_OPTIONS)) {
      setTwoFactorMethod(preferencias.twoFactorMethod);
    }
    if (typeof preferencias.recoveryCodesEnabled === "boolean") {
      setRecoveryCodesEnabled(preferencias.recoveryCodesEnabled);
    }
    if (typeof preferencias.deviceBiometricsEnabled === "boolean") {
      setDeviceBiometricsEnabled(preferencias.deviceBiometricsEnabled);
    }
    if (typeof preferencias.requireAuthOnOpen === "boolean") {
      setRequireAuthOnOpen(preferencias.requireAuthOnOpen);
    }
    if (typeof preferencias.hideInMultitask === "boolean") {
      setHideInMultitask(preferencias.hideInMultitask);
    }
    if (ehOpcaoValida(preferencias.lockTimeout, LOCK_TIMEOUT_OPTIONS)) {
      setLockTimeout(preferencias.lockTimeout);
    }
    if (ehOpcaoValida(preferencias.retencaoDados, DATA_RETENTION_OPTIONS)) {
      setRetencaoDados(preferencias.retencaoDados);
    }
    if (Array.isArray(preferencias.codigosRecuperacao)) {
      setCodigosRecuperacao(
        preferencias.codigosRecuperacao.filter((item): item is string => typeof item === "string" && Boolean(item.trim())),
      );
    }
    if (typeof preferencias.reautenticacaoExpiraEm === "string") {
      if (reautenticacaoAindaValida(preferencias.reautenticacaoExpiraEm)) {
        setReautenticacaoExpiraEm(preferencias.reautenticacaoExpiraEm);
        setReautenticacaoStatus(formatarStatusReautenticacao(preferencias.reautenticacaoExpiraEm));
      } else {
        setReautenticacaoExpiraEm("");
        setReautenticacaoStatus("Não confirmada");
      }
    }
    if (typeof preferencias.reautenticacaoStatus === "string") {
      if (!reautenticacaoAindaValida(typeof preferencias.reautenticacaoExpiraEm === "string" ? preferencias.reautenticacaoExpiraEm : "")) {
        setReautenticacaoStatus(preferencias.reautenticacaoStatus);
      }
    }
    if (Array.isArray(preferencias.eventosSeguranca)) {
      const eventos = preferencias.eventosSeguranca
        .map((item) => normalizarEventoSeguranca(item))
        .filter((item): item is SecurityEventItem => Boolean(item));
      if (eventos.length) {
        setEventosSeguranca(eventos);
      }
    }
    if (typeof preferencias.mostrarConteudoNotificacao === "boolean") {
      setMostrarConteudoNotificacao(preferencias.mostrarConteudoNotificacao);
    }
    if (typeof preferencias.ocultarConteudoBloqueado === "boolean") {
      setOcultarConteudoBloqueado(preferencias.ocultarConteudoBloqueado);
    }
    if (typeof preferencias.mostrarSomenteNovaMensagem === "boolean") {
      setMostrarSomenteNovaMensagem(preferencias.mostrarSomenteNovaMensagem);
    }
    if (typeof preferencias.microfonePermitido === "boolean") {
      setMicrofonePermitido(preferencias.microfonePermitido);
    }
    if (typeof preferencias.cameraPermitida === "boolean") {
      setCameraPermitida(preferencias.cameraPermitida);
    }
    if (typeof preferencias.arquivosPermitidos === "boolean") {
      setArquivosPermitidos(preferencias.arquivosPermitidos);
    }
    if (typeof preferencias.notificacoesPermitidas === "boolean") {
      setNotificacoesPermitidas(preferencias.notificacoesPermitidas);
    }
    if (typeof preferencias.biometriaPermitida === "boolean") {
      setBiometriaPermitida(preferencias.biometriaPermitida);
    }
    if (Array.isArray(preferencias.filaSuporteLocal)) {
      setFilaSuporteLocal(
        preferencias.filaSuporteLocal
          .map((item) => normalizarItemSuporte(item))
          .filter((item): item is SupportQueueItem => Boolean(item)),
      );
    }
    if (typeof preferencias.ultimaVerificacaoAtualizacao === "string") {
      setUltimaVerificacaoAtualizacao(preferencias.ultimaVerificacaoAtualizacao);
    }
    if (typeof preferencias.statusAtualizacaoApp === "string") {
      setStatusAtualizacaoApp(preferencias.statusAtualizacaoApp);
    }
  }

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    historicoAbertoRef.current = historicoAberto;
  }, [historicoAberto]);

  useEffect(() => {
    configuracoesAbertaRef.current = configuracoesAberta;
  }, [configuracoesAberta]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setPerfilNome((estadoAtual) => estadoAtual || session.bootstrap.usuario.nome_completo || "");
    setPerfilExibicao((estadoAtual) => estadoAtual || obterNomeCurto(session.bootstrap.usuario.nome_completo || ""));
    setEmailAtualConta((estadoAtual) => estadoAtual || session.bootstrap.usuario.email || email);
    setProvedoresConectados((estadoAtual) =>
      estadoAtual.map((provider) =>
        provider.connected && !provider.email && session.bootstrap.usuario.email
          ? { ...provider, email: session.bootstrap.usuario.email }
          : provider,
      ),
    );
  }, [email, session]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarFilaOfflineLocal(filaOffline);
  }, [carregando, filaOffline]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarNotificacoesLocais(notificacoes);
  }, [carregando, notificacoes]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarCacheLeituraLocal(
      salvarHistoricoConversas ? cacheLeitura : limparCachePorPrivacidade(cacheLeitura),
    );
  }, [cacheLeitura, carregando, salvarHistoricoConversas]);

  useEffect(() => {
    if (carregando || salvarHistoricoConversas) {
      return;
    }

    setCacheLeitura((estadoAtual) => {
      const possuiHistorico =
        Boolean(estadoAtual.conversaAtual) ||
        estadoAtual.laudos.length > 0 ||
        Object.keys(estadoAtual.conversasPorLaudo).length > 0 ||
        Object.keys(estadoAtual.mesaPorLaudo).length > 0 ||
        Object.keys(estadoAtual.chatDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaDrafts).length > 0 ||
        Object.keys(estadoAtual.chatAttachmentDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaAttachmentDrafts).length > 0;

      if (!possuiHistorico) {
        return estadoAtual;
      }

      return limparCachePorPrivacidade(estadoAtual);
    });
  }, [carregando, salvarHistoricoConversas]);

  useEffect(() => {
    if (carregando) {
      return;
    }

    void salvarPreferenciasLocais({
      perfilNome,
      perfilExibicao,
      perfilFotoUri,
      perfilFotoHint,
      laudosFixadosIds,
      historicoOcultoIds,
      planoAtual,
      cartaoAtual,
      modeloIa,
      estiloResposta,
      idiomaResposta,
      memoriaIa,
      aprendizadoIa,
      tomConversa,
      temperaturaIa,
      temaApp,
      tamanhoFonte,
      densidadeInterface,
      corDestaque,
      animacoesAtivas,
      notificaRespostas,
      notificaPush,
      somNotificacao,
      vibracaoAtiva,
      emailsAtivos,
      salvarHistoricoConversas,
      compartilharMelhoriaIa,
      backupAutomatico,
      sincronizacaoDispositivos,
      nomeAutomaticoConversas,
      fixarConversas,
      entradaPorVoz,
      respostaPorVoz,
      uploadArquivosAtivo,
      economiaDados,
      usoBateria,
      idiomaApp,
      regiaoApp,
      provedoresConectados,
      sessoesAtivas,
      twoFactorEnabled,
      twoFactorMethod,
      recoveryCodesEnabled,
      deviceBiometricsEnabled,
      requireAuthOnOpen,
      hideInMultitask,
      lockTimeout,
      retencaoDados,
      codigosRecuperacao,
      reautenticacaoStatus,
      reautenticacaoExpiraEm,
      eventosSeguranca,
      mostrarConteudoNotificacao,
      ocultarConteudoBloqueado,
      mostrarSomenteNovaMensagem,
      microfonePermitido,
      cameraPermitida,
      arquivosPermitidos,
      notificacoesPermitidas,
      biometriaPermitida,
      filaSuporteLocal,
      ultimaVerificacaoAtualizacao,
      statusAtualizacaoApp,
    });
  }, [
    animacoesAtivas,
    arquivosPermitidos,
    aprendizadoIa,
    backupAutomatico,
    biometriaPermitida,
    cameraPermitida,
    carregando,
    cartaoAtual,
    codigosRecuperacao,
    compartilharMelhoriaIa,
    corDestaque,
    densidadeInterface,
    deviceBiometricsEnabled,
    economiaDados,
    emailsAtivos,
    entradaPorVoz,
    estiloResposta,
    eventosSeguranca,
    fixarConversas,
    hideInMultitask,
    idiomaApp,
    idiomaResposta,
    lockTimeout,
    memoriaIa,
    microfonePermitido,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarSomenteNovaMensagem,
    nomeAutomaticoConversas,
    notificaPush,
    notificaRespostas,
    notificacoesPermitidas,
    ocultarConteudoBloqueado,
    perfilExibicao,
    perfilFotoUri,
    perfilFotoHint,
    perfilNome,
    laudosFixadosIds,
    historicoOcultoIds,
    planoAtual,
    provedoresConectados,
    reautenticacaoExpiraEm,
    reautenticacaoStatus,
    recoveryCodesEnabled,
    regiaoApp,
    requireAuthOnOpen,
    respostaPorVoz,
    retencaoDados,
    salvarHistoricoConversas,
    sessoesAtivas,
    sincronizacaoDispositivos,
    somNotificacao,
    tamanhoFonte,
    temperaturaIa,
    temaApp,
    tomConversa,
    twoFactorEnabled,
    twoFactorMethod,
    uploadArquivosAtivo,
    usoBateria,
    vibracaoAtiva,
    filaSuporteLocal,
    statusAtualizacaoApp,
    ultimaVerificacaoAtualizacao,
  ]);

  useEffect(() => {
    if (!reautenticacaoExpiraEm) {
      if (reautenticacaoStatus !== "Não confirmada") {
        setReautenticacaoStatus("Não confirmada");
      }
      return;
    }

    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
      return;
    }

    setReautenticacaoStatus(formatarStatusReautenticacao(reautenticacaoExpiraEm));
    const timeout = setTimeout(() => {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
    }, Math.max(0, new Date(reautenticacaoExpiraEm).getTime() - Date.now()));

    return () => clearTimeout(timeout);
  }, [reautenticacaoExpiraEm, reautenticacaoStatus]);

  useEffect(() => {
    if (!session) {
      chatDraftKeyRef.current = "";
      mesaDraftKeyRef.current = "";
      chatAttachmentDraftKeyRef.current = "";
      mesaAttachmentDraftKeyRef.current = "";
      if (carregando) {
        return;
      }
      setConversa(null);
      setMensagem("");
      setErroConversa("");
      setAbaAtiva("chat");
      setLaudosDisponiveis([]);
      setErroLaudos("");
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setMensagemMesaReferenciaAtiva(null);
      setLaudoMesaCarregado(null);
      setAnexoAbrindoChave("");
      setPreviewAnexoImagem(null);
      setMensagemChatDestacadaId(null);
      setLayoutMensagensChatVersao(0);
      chatMessageOffsetsRef.current = {};
      setUsandoCacheOffline(false);
      setCentralAtividadeAberta(false);
      setHistoricoAberto(false);
      setConfiguracoesAberta(false);
      setMonitorandoAtividade(false);
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
      drawerOverlayOpacity.setValue(0);
      statusSnapshotRef.current = {};
      mesaSnapshotRef.current = {};
      return;
    }

    void carregarConversaAtual(session.accessToken);
    void carregarListaLaudos(session.accessToken);
  }, [session]);

  useEffect(() => {
    chatMessageOffsetsRef.current = {};
    setLayoutMensagensChatVersao(0);
    setMensagemChatDestacadaId(null);
    setMensagemMesaReferenciaAtiva(null);
  }, [conversa?.laudoId]);

  useEffect(() => {
    if (abaAtiva !== "chat" || !mensagemChatDestacadaId) {
      return;
    }

    const offsetY = chatMessageOffsetsRef.current[mensagemChatDestacadaId];
    if (typeof offsetY !== "number") {
      return;
    }

    const scrollTimeout = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(offsetY - 112, 0),
        animated: true,
      });
    }, 120);

    if (chatHighlightTimeoutRef.current) {
      clearTimeout(chatHighlightTimeoutRef.current);
    }
    chatHighlightTimeoutRef.current = setTimeout(() => {
      setMensagemChatDestacadaId((estadoAtual) =>
        estadoAtual === mensagemChatDestacadaId ? null : estadoAtual,
      );
      chatHighlightTimeoutRef.current = null;
    }, 1800);

    return () => clearTimeout(scrollTimeout);
  }, [abaAtiva, conversa?.mensagens.length, layoutMensagensChatVersao, mensagemChatDestacadaId]);

  useEffect(() => {
    return () => {
      if (chatHighlightTimeoutRef.current) {
        clearTimeout(chatHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const chatKey = chaveRascunho("chat", conversa?.laudoId ?? null);
    if (chatDraftKeyRef.current !== chatKey) {
      chatDraftKeyRef.current = chatKey;
      setMensagem(cacheLeitura.chatDrafts[chatKey] || "");
    }
    if (chatAttachmentDraftKeyRef.current !== chatKey) {
      chatAttachmentDraftKeyRef.current = chatKey;
      setAnexoRascunho(cacheLeitura.chatAttachmentDrafts[chatKey] || null);
    }

    const mesaKey = chaveRascunho("mesa", conversa?.laudoId ?? null);
    if (mesaDraftKeyRef.current !== mesaKey) {
      mesaDraftKeyRef.current = mesaKey;
      setMensagemMesa(cacheLeitura.mesaDrafts[mesaKey] || "");
    }
    if (mesaAttachmentDraftKeyRef.current !== mesaKey) {
      mesaAttachmentDraftKeyRef.current = mesaKey;
      setAnexoMesaRascunho(cacheLeitura.mesaAttachmentDrafts[mesaKey] || null);
    }
  }, [
    cacheLeitura.chatAttachmentDrafts,
    cacheLeitura.chatDrafts,
    cacheLeitura.mesaAttachmentDrafts,
    cacheLeitura.mesaDrafts,
    conversa?.laudoId,
    session,
  ]);

  useEffect(() => {
    if (carregando || !session) {
      return;
    }

    const chave = chaveRascunho("chat", conversa?.laudoId ?? null);
    setCacheLeitura((estadoAtual) => {
      const proximoValor = mensagem;
      const atual = estadoAtual.chatDrafts[chave] || "";
      if (atual === proximoValor) {
        return estadoAtual;
      }

      const chatDrafts = { ...estadoAtual.chatDrafts };
      if (proximoValor.trim()) {
        chatDrafts[chave] = proximoValor;
      } else {
        delete chatDrafts[chave];
      }

      return {
        ...estadoAtual,
        chatDrafts,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [carregando, conversa?.laudoId, mensagem, session]);

  useEffect(() => {
    if (carregando || !session) {
      return;
    }

    const chave = chaveRascunho("mesa", conversa?.laudoId ?? null);
    setCacheLeitura((estadoAtual) => {
      const proximoValor = mensagemMesa;
      const atual = estadoAtual.mesaDrafts[chave] || "";
      if (atual === proximoValor) {
        return estadoAtual;
      }

      const mesaDrafts = { ...estadoAtual.mesaDrafts };
      if (proximoValor.trim()) {
        mesaDrafts[chave] = proximoValor;
      } else {
        delete mesaDrafts[chave];
      }

      return {
        ...estadoAtual,
        mesaDrafts,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [carregando, conversa?.laudoId, mensagemMesa, session]);

  useEffect(() => {
    if (carregando || !session) {
      return;
    }

    const chave = chaveRascunho("chat", conversa?.laudoId ?? null);
    setCacheLeitura((estadoAtual) => {
      const atual = estadoAtual.chatAttachmentDrafts[chave] || null;
      if (assinaturaAnexoRascunho(atual) === assinaturaAnexoRascunho(anexoRascunho)) {
        return estadoAtual;
      }

      const chatAttachmentDrafts = { ...estadoAtual.chatAttachmentDrafts };
      if (anexoRascunho) {
        chatAttachmentDrafts[chave] = anexoRascunho;
      } else {
        delete chatAttachmentDrafts[chave];
      }

      return {
        ...estadoAtual,
        chatAttachmentDrafts,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [anexoRascunho, carregando, conversa?.laudoId, session]);

  useEffect(() => {
    if (carregando || !session) {
      return;
    }

    const chave = chaveRascunho("mesa", conversa?.laudoId ?? null);
    setCacheLeitura((estadoAtual) => {
      const atual = estadoAtual.mesaAttachmentDrafts[chave] || null;
      if (assinaturaAnexoRascunho(atual) === assinaturaAnexoRascunho(anexoMesaRascunho)) {
        return estadoAtual;
      }

      const mesaAttachmentDrafts = { ...estadoAtual.mesaAttachmentDrafts };
      if (anexoMesaRascunho) {
        mesaAttachmentDrafts[chave] = anexoMesaRascunho;
      } else {
        delete mesaAttachmentDrafts[chave];
      }

      return {
        ...estadoAtual,
        mesaAttachmentDrafts,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [anexoMesaRascunho, carregando, conversa?.laudoId, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!conversa?.laudoId) {
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setLaudoMesaCarregado(null);
      return;
    }

    if (abaAtiva === "mesa" && laudoMesaCarregado !== conversa.laudoId) {
      void carregarMesaAtual(session.accessToken, conversa.laudoId);
    }
  }, [abaAtiva, conversa?.laudoId, laudoMesaCarregado, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timeout);
  }, [abaAtiva, conversa?.mensagens.length, mensagensMesa.length, session]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session || keyboardHeight <= 0) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timeout);
  }, [keyboardHeight, session]);

  useEffect(() => {
    if (!session || statusApi !== "online" || !filaOffline.length || sincronizandoFilaOffline) {
      return;
    }

    if (!filaOffline.some((item) => pendenciaFilaProntaParaReenvio(item))) {
      return;
    }

    void sincronizarFilaOffline(session.accessToken, true);
  }, [filaOffline, session, sincronizandoFilaOffline, statusApi]);

  useEffect(() => {
    if (!session || statusApi !== "online" || sincronizandoFilaOffline || !filaOffline.length) {
      return;
    }

    const proximaPendente = filaOffline
      .map((item) => {
        const proximaTentativa = item.nextRetryAt ? new Date(item.nextRetryAt).getTime() : Number.NaN;
        return {
          id: item.id,
          timestamp: proximaTentativa,
        };
      })
      .filter((item) => !Number.isNaN(item.timestamp) && item.timestamp > Date.now())
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!proximaPendente) {
      return;
    }

    const esperaMs = Math.max(500, proximaPendente.timestamp - Date.now());
    const timeout = setTimeout(() => {
      void sincronizarFilaOffline(session.accessToken, true);
    }, esperaMs);

    return () => clearTimeout(timeout);
  }, [filaOffline, session, sincronizandoFilaOffline, statusApi]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const statusAtual: Record<number, string> = {};
    for (const item of laudosDisponiveis) {
      statusAtual[item.id] = assinaturaStatusLaudo(item);
    }
    statusSnapshotRef.current = statusAtual;
  }, [laudosDisponiveis, session]);

  useEffect(() => {
    if (!session || !conversa?.laudoId || laudoMesaCarregado !== conversa.laudoId) {
      return;
    }

    mesaSnapshotRef.current[conversa.laudoId] = Object.fromEntries(
      mensagensMesa.map((item) => [item.id, assinaturaMensagemMesa(item)]),
    );
  }, [conversa?.laudoId, laudoMesaCarregado, mensagensMesa, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const intervaloMonitoramentoMs = obterIntervaloMonitoramentoMs(economiaDados, usoBateria);
    let cancelado = false;
    const intervalo = setInterval(() => {
      if (cancelado) {
        return;
      }

      if (statusApi === "offline") {
        void (async () => {
          const online = await pingApi();
          if (!online || cancelado) {
            return;
          }
          setStatusApi("online");
          await handleRefresh();
        })();
        return;
      }

      void monitorarAtividade(session.accessToken);
    }, intervaloMonitoramentoMs);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [conversa?.laudoId, economiaDados, session, statusApi, usoBateria]);

  async function bootstrapApp() {
    setCarregando(true);
    setErro("");

    const [online, savedEmail, savedToken, filaLocal, notificacoesLocais, cacheLocal, preferenciasLocais] = await Promise.all([
      pingApi(),
      obterItemSeguro(EMAIL_KEY),
      obterItemSeguro(TOKEN_KEY),
      lerFilaOfflineLocal(),
      lerNotificacoesLocais(),
      lerCacheLeituraLocal(),
      lerPreferenciasLocais(),
    ]);

    setStatusApi(online ? "online" : "offline");
    if (savedEmail) {
      setEmail(savedEmail);
    }
    aplicarPreferenciasLocais(preferenciasLocais);
    setFilaOffline(filaLocal);
    setNotificacoes(notificacoesLocais);
    setCacheLeitura(
      preferenciasLocais.salvarHistoricoConversas === false ? limparCachePorPrivacidade(cacheLocal) : cacheLocal,
    );

    if (savedToken) {
      try {
        const bootstrap = await carregarBootstrapMobile(savedToken);
        setUsandoCacheOffline(false);
        setCacheLeitura((estadoAtual) => ({
          ...estadoAtual,
          bootstrap,
          updatedAt: new Date().toISOString(),
        }));
        setSession({ accessToken: savedToken, bootstrap });
      } catch (error) {
        const erroOffline = !online || erroSugereModoOffline(error);
        if (erroOffline && cacheLocal.bootstrap) {
          const conversaCache = cacheLocal.conversaAtual;
          const mesaCache = conversaCache?.laudoId
            ? cacheLocal.mesaPorLaudo[chaveCacheLaudo(conversaCache.laudoId)] || []
            : [];
          const laudosCache = aplicarPreferenciasLaudos(
            cacheLocal.laudos,
            Array.isArray(preferenciasLocais.laudosFixadosIds) ? preferenciasLocais.laudosFixadosIds : [],
            Array.isArray(preferenciasLocais.historicoOcultoIds) ? preferenciasLocais.historicoOcultoIds : [],
          );

          setSession({ accessToken: savedToken, bootstrap: cacheLocal.bootstrap });
          setLaudosDisponiveis(laudosCache);
          setConversa(conversaCache);
          setMensagensMesa(mesaCache);
          setLaudoMesaCarregado(conversaCache?.laudoId ?? null);
          setUsandoCacheOffline(true);
          if (!laudosCache.length) {
            setErroLaudos("Sem internet. Nenhum laudo salvo localmente ainda.");
          }
        } else if (!erroOffline) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      }
    }
    setCarregando(false);
  }

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha para entrar no app.");
      return;
    }

    setEntrando(true);
    setErro("");

    try {
      const login = await loginInspectorMobile(email, senha, lembrar);
      const bootstrap = await carregarBootstrapMobile(login.access_token);

      if (lembrar) {
        await Promise.all([
          salvarItemSeguro(TOKEN_KEY, login.access_token),
          salvarItemSeguro(EMAIL_KEY, email.trim()),
        ]);
      } else {
        await Promise.all([
          removerItemSeguro(TOKEN_KEY),
          removerItemSeguro(EMAIL_KEY),
        ]);
      }

      setSenha("");
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        bootstrap,
        updatedAt: new Date().toISOString(),
      }));
      setSession({ accessToken: login.access_token, bootstrap });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao autenticar no app.";
      setErro(message);
    } finally {
      setEntrando(false);
    }
  }

  async function handleRefresh() {
    const online = await pingApi();
    setStatusApi(online ? "online" : "offline");

    if (session) {
      if (online && filaOffline.some((item) => pendenciaFilaProntaParaReenvio(item))) {
        await sincronizarFilaOffline(session.accessToken, true);
      }
      await carregarListaLaudos(session.accessToken, true);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      const laudoAtual = proximaConversa?.laudoId ?? conversa?.laudoId ?? null;
      if (abaAtiva === "mesa" && laudoAtual) {
        await carregarMesaAtual(session.accessToken, laudoAtual, true);
      }
      if (online) {
        setUsandoCacheOffline(false);
      }
    }
  }

  async function handleLogout() {
    try {
      if (session) {
        await logoutInspectorMobile(session.accessToken);
      }
    } catch {
      // Mantém a saída local mesmo se o backend já tiver expirado o token.
    } finally {
      await removerItemSeguro(TOKEN_KEY);
      setCacheLeitura(CACHE_LEITURA_VAZIO);
      setSession(null);
      setConversa(null);
      setMensagem("");
      setAnexoRascunho(null);
      setSenha("");
      setAbaAtiva("chat");
      setLaudosDisponiveis([]);
      setErroLaudos("");
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setFilaOffline([]);
      setLaudoMesaCarregado(null);
      setNotificacoes([]);
      setAnexoAbrindoChave("");
      setPreviewAnexoImagem(null);
    }
  }

  async function carregarConversaAtual(accessToken: string, silencioso = false): Promise<ChatState | null> {
    if (silencioso) {
      setSincronizandoConversa(true);
    } else {
      setCarregandoConversa(true);
    }
    setErroConversa("");

    try {
      const status = await carregarStatusLaudo(accessToken);
      let proximaConversa = normalizarConversa(status);

      if (status.laudo_id) {
        const historico = await carregarMensagensLaudo(accessToken, status.laudo_id);
        proximaConversa = normalizarConversa(historico);
      }

      setConversa(proximaConversa);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [chaveCacheLaudo(proximaConversa.laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      if (proximaConversa.laudoId !== laudoMesaCarregado) {
        setMensagensMesa([]);
        setErroMesa("");
        setMensagemMesa("");
        setLaudoMesaCarregado(null);
      }
      return proximaConversa;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar a conversa do inspetor.";
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      const cacheKey = chaveCacheLaudo(conversa?.laudoId ?? null);
      const conversaCache = cacheLeitura.conversasPorLaudo[cacheKey] || cacheLeitura.conversaAtual;
      if (emModoOffline && conversaCache) {
        setConversa(conversaCache);
        setUsandoCacheOffline(true);
        setErroConversa("");
        return conversaCache;
      }
      setErroConversa(message);
      return null;
    } finally {
      setCarregandoConversa(false);
      setSincronizandoConversa(false);
    }
  }

  async function carregarListaLaudos(accessToken: string, silencioso = false): Promise<MobileLaudoCard[]> {
    if (!silencioso) {
      setCarregandoLaudos(true);
    }
    setErroLaudos("");

    try {
      const payload = await carregarLaudosMobile(accessToken);
      const laudosNormalizados = aplicarPreferenciasLaudos(payload.itens || [], laudosFixadosIds, historicoOcultoIds);
      setLaudosDisponiveis(laudosNormalizados);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        laudos: laudosNormalizados,
        updatedAt: new Date().toISOString(),
      }));
      return laudosNormalizados;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os laudos do inspetor.";
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && cacheLeitura.laudos.length) {
        const laudosCache = aplicarPreferenciasLaudos(cacheLeitura.laudos, laudosFixadosIds, historicoOcultoIds);
        setLaudosDisponiveis(laudosCache);
        setUsandoCacheOffline(true);
        setErroLaudos("");
        return laudosCache;
      }
      setErroLaudos(message);
      return [];
    } finally {
      setCarregandoLaudos(false);
    }
  }

  async function carregarMesaAtual(accessToken: string, laudoId: number, silencioso = false) {
    if (silencioso) {
      setSincronizandoMesa(true);
    } else {
      setCarregandoMesa(true);
    }
    setErroMesa("");

    try {
      const payload = await carregarMensagensMesaMobile(accessToken, laudoId);
      setMensagensMesa(payload.itens || []);
      setLaudoMesaCarregado(laudoId);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        mesaPorLaudo: {
          ...estadoAtual.mesaPorLaudo,
          [chaveCacheLaudo(laudoId)]: payload.itens || [],
        },
        updatedAt: new Date().toISOString(),
      }));
      setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir a conversa da mesa.";
      const mesaCache = cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || [];
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && mesaCache.length) {
        setMensagensMesa(mesaCache);
        setLaudoMesaCarregado(laudoId);
        setUsandoCacheOffline(true);
        setErroMesa("");
        return;
      }
      setErroMesa(message);
    } finally {
      setCarregandoMesa(false);
      setSincronizandoMesa(false);
    }
  }

  async function handleAbrirAnexo(anexo: MobileAttachment) {
    if (!session) {
      return;
    }

    const absoluteUrl = urlAnexoAbsoluta(anexo.url);
    if (!absoluteUrl) {
      Alert.alert("Anexo", "Esse anexo ainda não está disponível para abertura no app.");
      return;
    }

    if (ehImagemAnexo(anexo)) {
      setPreviewAnexoImagem({
        titulo: nomeExibicaoAnexo(anexo, "Imagem"),
        uri: absoluteUrl,
      });
      return;
    }

    const key = chaveAnexo(anexo, "anexo");
    setAnexoAbrindoChave(key);

    try {
      const baseDir = `${FileSystem.cacheDirectory || ""}tariel-anexos`;
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

      const extensao = inferirExtensaoAnexo(anexo);
      const nomeBase = nomeArquivoSeguro(nomeExibicaoAnexo(anexo, "anexo"), `anexo${extensao}`);
      const nomeFinal = extensao && !nomeBase.toLowerCase().endsWith(extensao.toLowerCase()) ? `${nomeBase}${extensao}` : nomeBase;
      const destino = `${baseDir}/${Date.now()}-${nomeFinal}`;

      const resultado = await FileSystem.downloadAsync(absoluteUrl, destino, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      const sharingDisponivel = await Sharing.isAvailableAsync();
      if (!sharingDisponivel) {
        Alert.alert("Anexo pronto", `Arquivo salvo em ${resultado.uri}`);
        return;
      }

      await Sharing.shareAsync(resultado.uri, {
        mimeType: anexo.mime_type || undefined,
        dialogTitle: `Abrir ${nomeExibicaoAnexo(anexo, "anexo")}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o anexo no app.";
      Alert.alert("Anexo", message);
    } finally {
      setAnexoAbrindoChave((estadoAtual) => (estadoAtual === key ? "" : estadoAtual));
    }
  }

  function removerItemFilaOffline(id: string) {
    setFilaOffline((estadoAtual) => estadoAtual.filter((item) => item.id !== id));
  }

  function atualizarItemFilaOffline(
    id: string,
    atualizacao: Partial<Pick<OfflinePendingMessage, "attempts" | "lastAttemptAt" | "lastError" | "nextRetryAt">>,
  ) {
    setFilaOffline((estadoAtual) =>
      estadoAtual.map((item) =>
        item.id === id
          ? {
              ...item,
              ...atualizacao,
            }
          : item,
      ),
    );
  }

  async function handleRetomarItemFilaOffline(item: OfflinePendingMessage) {
    if (!session) {
      return;
    }

    try {
      setFilaOfflineAberta(false);
      setErroConversa("");
      setErroMesa("");

      if (item.channel === "chat") {
        setAbaAtiva("chat");
        if (item.laudoId) {
          await abrirLaudoPorId(session.accessToken, item.laudoId);
        } else {
          await handleSelecionarLaudo(null);
        }
        setMensagem(item.text);
        setAnexoRascunho(duplicarComposerAttachment(item.attachment));
      } else {
        if (!item.laudoId) {
          removerItemFilaOffline(item.id);
          return;
        }
        await abrirLaudoPorId(session.accessToken, item.laudoId);
        setAbaAtiva("mesa");
        await carregarMesaAtual(session.accessToken, item.laudoId, true);
        setMensagemMesa(item.text);
        setAnexoMesaRascunho(duplicarComposerAttachment(item.attachment));
        if (item.referenceMessageId) {
          setMensagemMesaReferenciaAtiva({
            id: item.referenceMessageId,
            texto: obterResumoReferenciaMensagem(
              item.referenceMessageId,
              conversa?.mensagens || [],
              mensagensMesa,
            ),
          });
        }
      }

      removerItemFilaOffline(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível retomar essa pendência local.";
      if (item.channel === "mesa") {
        setErroMesa(message);
      } else {
        setErroConversa(message);
      }
    }
  }

  async function enviarPendenciaOffline(
    accessToken: string,
    item: OfflinePendingMessage,
    laudoSequencial: number | null,
  ): Promise<number | null> {
    if (item.channel === "mesa") {
      if (!item.laudoId) {
        return laudoSequencial;
      }

      if (item.attachment) {
        await enviarAnexoMesaMobile(accessToken, item.laudoId, {
          uri: item.attachment.fileUri,
          nome: item.attachment.kind === "document" ? item.attachment.nomeDocumento : item.attachment.label,
          mimeType: item.attachment.mimeType,
          texto: item.text,
          referenciaMensagemId: item.referenceMessageId,
        });
      } else {
        await enviarMensagemMesaMobile(accessToken, item.laudoId, item.text, item.referenceMessageId);
      }
      return laudoSequencial;
    }

    const laudoIdAtual = item.laudoId ?? laudoSequencial;
    let dadosImagem = "";
    let textoDocumento = "";
    let nomeDocumento = "";

    if (item.attachment?.kind === "image") {
      dadosImagem = item.attachment.dadosImagem;
    } else if (item.attachment?.kind === "document") {
      if (item.attachment.textoDocumento) {
        textoDocumento = item.attachment.textoDocumento;
        nomeDocumento = item.attachment.nomeDocumento;
      } else {
        const documento = await uploadDocumentoChatMobile(accessToken, {
          uri: item.attachment.fileUri,
          nome: item.attachment.nomeDocumento,
          mimeType: item.attachment.mimeType,
        });
        textoDocumento = documento.texto;
        nomeDocumento = documento.nome;
      }
    }

    const resposta = await enviarMensagemChatMobile(accessToken, {
      mensagem: item.text,
      dadosImagem,
      setor: conversa?.laudoId && conversa.laudoId === laudoIdAtual ? inferirSetorConversa(conversa) : "geral",
      textoDocumento,
      nomeDocumento,
      laudoId: laudoIdAtual,
      modo: normalizarModoChat(conversa?.modo),
      historico:
        conversa?.laudoId && conversa.laudoId === laudoIdAtual
          ? montarHistoricoParaEnvio(conversa.mensagens)
          : [],
    });
    return resposta.laudoId ?? laudoSequencial;
  }

  async function sincronizarItemFilaOffline(item: OfflinePendingMessage) {
    if (!session || sincronizandoFilaOffline || sincronizandoItemFilaId) {
      return;
    }

    setErroConversa("");
    setErroMesa("");
    setSincronizandoItemFilaId(item.id);
    const tentativaEm = new Date().toISOString();
    const proximaTentativa = item.attempts + 1;
    atualizarItemFilaOffline(item.id, {
      attempts: proximaTentativa,
      lastAttemptAt: tentativaEm,
      lastError: "",
      nextRetryAt: "",
    });

    try {
      const laudoResultado = await enviarPendenciaOffline(session.accessToken, item, null);
      removerItemFilaOffline(item.id);
      await carregarListaLaudos(session.accessToken, true);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      const laudoAtual = item.laudoId ?? laudoResultado ?? proximaConversa?.laudoId ?? null;
      if ((item.channel === "mesa" || abaAtiva === "mesa") && laudoAtual) {
        await carregarMesaAtual(session.accessToken, laudoAtual, true);
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_item_sync",
        ok: true,
        count: 1,
        detail: `${item.channel}_attempt_${proximaTentativa}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reenviar essa pendência.";
      const proximaTentativaEm = new Date(Date.now() + calcularBackoffPendenciaOfflineMs(proximaTentativa)).toISOString();
      atualizarItemFilaOffline(item.id, {
        attempts: proximaTentativa,
        lastAttemptAt: tentativaEm,
        lastError: message,
        nextRetryAt: proximaTentativaEm,
      });
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_item_sync",
        ok: false,
        count: 1,
        detail: message,
      });
      if (erroSugereModoOffline(error)) {
        setStatusApi("offline");
      }
      if (item.channel === "mesa") {
        setErroMesa(message);
      } else {
        setErroConversa(message);
      }
    } finally {
      setSincronizandoItemFilaId("");
    }
  }

  async function sincronizarFilaOffline(accessToken: string, silencioso = false) {
    if (!filaOffline.length || sincronizandoFilaOffline) {
      return;
    }

    if (!silencioso) {
      setErroConversa("");
      setErroMesa("");
    }
    setSincronizandoFilaOffline(true);

    let restante = [...filaOffline];
    let laudoSequencial: number | null = null;
    const referencia = Date.now();
    let itensTentados = 0;
    let itensSincronizados = 0;

    try {
      for (const item of [...restante]) {
        if (item.channel === "mesa" && !item.laudoId) {
          removerItemFilaOffline(item.id);
          restante = restante.filter((registro) => registro.id !== item.id);
          continue;
        }

        if (!pendenciaFilaProntaParaReenvio(item, referencia)) {
          continue;
        }
        itensTentados += 1;

        const tentativaEm = new Date().toISOString();
        const proximaTentativa = item.attempts + 1;
        atualizarItemFilaOffline(item.id, {
          attempts: proximaTentativa,
          lastAttemptAt: tentativaEm,
          lastError: "",
          nextRetryAt: "",
        });

        try {
          laudoSequencial = await enviarPendenciaOffline(accessToken, item, laudoSequencial);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível sincronizar a fila local.";
          const proximaTentativaEm = new Date(Date.now() + calcularBackoffPendenciaOfflineMs(proximaTentativa)).toISOString();
          atualizarItemFilaOffline(item.id, {
            attempts: proximaTentativa,
            lastAttemptAt: tentativaEm,
            lastError: message,
            nextRetryAt: proximaTentativaEm,
          });
          throw error;
        }

        removerItemFilaOffline(item.id);
        restante = restante.filter((registro) => registro.id !== item.id);
        itensSincronizados += 1;
      }

      await carregarListaLaudos(accessToken, true);
      const proximaConversa = await carregarConversaAtual(accessToken, true);
      const laudoAtual = proximaConversa?.laudoId ?? laudoSequencial ?? null;
      if (abaAtiva === "mesa" && laudoAtual) {
        await carregarMesaAtual(accessToken, laudoAtual, true);
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: true,
        count: itensSincronizados,
        detail: `${itensSincronizados}/${itensTentados}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar a fila local.";
      setErroConversa(message);
      setErroMesa(message);
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: false,
        count: itensSincronizados,
        detail: message,
      });
      if (erroSugereModoOffline(error)) {
        setStatusApi("offline");
      }
    } finally {
      setSincronizandoFilaOffline(false);
    }
  }

  function registrarNotificacoes(novas: MobileActivityNotification[]) {
    if (!novas.length) {
      return;
    }

    if (!notificacoesPermitidas || !notificaPush) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_blocked",
        ok: false,
        count: novas.length,
        detail: !notificacoesPermitidas ? "permission_denied" : "push_disabled",
      });
      return;
    }

    const novasFiltradas = notificaRespostas
      ? novas
      : novas.filter((item) => item.kind === "status");
    if (!novasFiltradas.length) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_filtered",
        ok: true,
        count: novas.length,
        detail: "responses_disabled",
      });
      return;
    }

    const novasNormalizadas = novasFiltradas.map((item) => {
      let body = item.body;
      if (mostrarSomenteNovaMensagem) {
        body = "Nova mensagem";
      } else if (!mostrarConteudoNotificacao || ocultarConteudoBloqueado) {
        body = item.kind === "status" ? "Há uma atualização no laudo." : "Há uma nova interação na conversa.";
      }

      return {
        ...item,
        body,
      };
    });

    setNotificacoes((estadoAtual) => {
      const mapa = new Map(estadoAtual.map((item) => [item.id, item]));
      for (const item of novasNormalizadas) {
        if (!mapa.has(item.id)) {
          mapa.set(item.id, item);
        }
      }

      return Array.from(mapa.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_NOTIFICATIONS);
    });
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_dispatch",
      ok: true,
      count: novasNormalizadas.length,
      detail: mostrarSomenteNovaMensagem ? "preview_hidden" : "preview_visible",
    });
  }

  function marcarCentralAtividadeComoLida() {
    setNotificacoes((estadoAtual) =>
      estadoAtual.map((item) => (item.unread ? { ...item, unread: false } : item)),
    );
  }

  function animarPainelLateral(
    valor: Animated.Value,
    toValue: number,
    onEnd?: () => void,
  ) {
    Animated.timing(valor, {
      toValue,
      duration: PANEL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onEnd) {
        onEnd();
      }
    });
  }

  function fecharHistorico(options?: { limparBusca?: boolean; manterOverlay?: boolean }) {
    if (!historicoAbertoRef.current) {
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
      if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    animarPainelLateral(historicoDrawerX, HISTORY_PANEL_CLOSED_X, () => {
      setHistoricoAberto(false);
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
    });

    if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharConfiguracoes(options?: { manterOverlay?: boolean }) {
    if (!configuracoesAbertaRef.current) {
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
      setSettingsDrawerPage("overview");
      setSettingsDrawerSection("all");
      if (!options?.manterOverlay && !historicoAbertoRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    animarPainelLateral(configuracoesDrawerX, SETTINGS_PANEL_CLOSED_X, () => {
      setConfiguracoesAberta(false);
      setSettingsDrawerPage("overview");
      setSettingsDrawerSection("all");
    });

    if (!options?.manterOverlay && !historicoAbertoRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharPaineisLaterais() {
    if (historicoAbertoRef.current) {
      fecharHistorico({ limparBusca: true, manterOverlay: configuracoesAbertaRef.current });
    }
    if (configuracoesAbertaRef.current) {
      fecharConfiguracoes({ manterOverlay: historicoAbertoRef.current });
    }
  }

  function abrirHistorico() {
    if (configuracoesAbertaRef.current) {
      setConfiguracoesAberta(false);
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
    }
    setHistoricoAberto(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(historicoDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function abrirConfiguracoes() {
    if (historicoAbertoRef.current) {
      setHistoricoAberto(false);
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
    }
    setSettingsDrawerPage("overview");
    setSettingsDrawerSection("all");
    setConfiguracoesAberta(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(configuracoesDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handleAbrirCentralAtividade() {
    setCentralAtividadeAberta(true);
    marcarCentralAtividadeComoLida();
  }

  function handleAbrirConfiguracoes() {
    if (configuracoesAbertaRef.current) {
      fecharConfiguracoes();
      return;
    }
    abrirConfiguracoes();
  }

  function handleAbrirPaginaConfiguracoes(page: SettingsDrawerPage, section: SettingsSectionKey | "all" = "all") {
    setSettingsDrawerPage(page);
    setSettingsDrawerSection(section);
  }

  function handleVoltarResumoConfiguracoes() {
    if (settingsDrawerSection !== "all") {
      setSettingsDrawerSection("all");
      return;
    }
    setSettingsDrawerPage("overview");
  }

  function registrarEventoSegurancaLocal(evento: Omit<SecurityEventItem, "id">) {
    setEventosSeguranca((estadoAtual) => [
      {
        id: `security-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        ...evento,
      },
      ...estadoAtual,
    ].slice(0, 20));
  }

  function abrirSheetConfiguracao(config: SettingsSheetState) {
    setSettingsSheetNotice("");
    setSettingsSheetLoading(false);
    setSettingsSheet(config);
  }

  function fecharSheetConfiguracao() {
    setSettingsSheet(null);
    setSettingsSheetLoading(false);
    setSettingsSheetNotice("");
  }

  function abrirConfirmacaoConfiguracao(config: ConfirmSheetState) {
    setConfirmTextDraft("");
    setConfirmSheet(config);
  }

  function fecharConfirmacaoConfiguracao() {
    setConfirmTextDraft("");
    setConfirmSheet(null);
  }

  function notificarConfiguracaoConcluida(mensagem: string) {
    setSettingsSheetNotice(mensagem);
  }

  function abrirFluxoReautenticacao(motivo: string, onSuccess?: () => void) {
    pendingSensitiveActionRef.current = onSuccess || null;
    setReauthReason(motivo);
    abrirSheetConfiguracao({
      kind: "reauth",
      title: "Confirmar identidade",
      subtitle: "Antes de continuar, valide a identidade do inspetor para proteger ações sensíveis.",
      actionLabel: "Confirmar agora",
    });
  }

  function executarComReautenticacao(motivo: string, onSuccess: () => void) {
    if (reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      onSuccess();
      return;
    }
    abrirFluxoReautenticacao(motivo, onSuccess);
  }

  async function handleConfirmarSettingsSheet() {
    if (!settingsSheet) {
      return;
    }

    setSettingsSheetLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 420));

    switch (settingsSheet.kind) {
      case "reauth": {
        const expiracao = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const status = formatarStatusReautenticacao(expiracao);
        setReautenticacaoExpiraEm(expiracao);
        setReautenticacaoStatus(status);
        registrarEventoSegurancaLocal({
          title: "Reautenticação concluída",
          meta: "Janela temporária liberada para ações sensíveis",
          status: "Agora",
          type: "login",
        });
        const pendingAction = pendingSensitiveActionRef.current;
        pendingSensitiveActionRef.current = null;
        if (pendingAction) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Identidade confirmada. O fluxo protegido será liberado agora.");
          setTimeout(() => {
            fecharSheetConfiguracao();
            pendingAction();
          }, 180);
          return;
        }
        notificarConfiguracaoConcluida("Identidade confirmada. Ações sensíveis ficam liberadas por 15 minutos.");
        break;
      }
      case "photo":
        try {
          const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permissao.granted && permissao.accessPrivileges !== "limited") {
            setSettingsSheetLoading(false);
            setSettingsSheetNotice("Permita acesso às imagens para atualizar a foto de perfil.");
            return;
          }

          const resultado = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

          if (resultado.canceled || !resultado.assets?.length) {
            setSettingsSheetLoading(false);
            setSettingsSheetNotice("Seleção cancelada. Escolha uma imagem para atualizar o perfil.");
            return;
          }

          const asset = resultado.assets[0];
          setPerfilFotoUri(asset.uri);
          setPerfilFotoHint("Foto atualizada neste dispositivo");
          notificarConfiguracaoConcluida("Foto aplicada localmente ao perfil do inspetor.");
        } catch (error) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice(
            error instanceof Error ? error.message : "Não foi possível atualizar a foto agora.",
          );
          return;
        }
        break;
      case "plan": {
        const proximoPlano = nextOptionValue(planoAtual, PLAN_OPTIONS);
        setPlanoAtual(proximoPlano);
        registrarEventoSegurancaLocal({
          title: "Plano ajustado no app",
          meta: `Plano selecionado: ${proximoPlano}`,
          status: "Agora",
          type: "data",
        });
        notificarConfiguracaoConcluida(`Plano atualizado para ${proximoPlano}. O resumo da assinatura já reflete essa mudança neste dispositivo.`);
        break;
      }
      case "billing": {
        const proximoCartao = nextOptionValue(cartaoAtual, PAYMENT_CARD_OPTIONS);
        setCartaoAtual(proximoCartao);
        registrarEventoSegurancaLocal({
          title: "Método de pagamento atualizado",
          meta: `Cartão configurado: ${proximoCartao}`,
          status: "Agora",
          type: "data",
        });
        notificarConfiguracaoConcluida(`Método de pagamento atualizado para ${proximoCartao}.`);
        break;
      }
      case "email":
        if (!novoEmailDraft.trim() || !novoEmailDraft.includes("@")) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Digite um email válido para solicitar a confirmação.");
          return;
        }
        setEmailAtualConta(novoEmailDraft.trim());
        registrarEventoSegurancaLocal({
          title: "Alteração de email iniciada",
          meta: `Confirmação enviada para ${novoEmailDraft.trim()}`,
          status: "Agora",
          type: "data",
        });
        notificarConfiguracaoConcluida("Solicitação registrada. Confirme o novo endereço para concluir a troca de email quando a validação estiver disponível.");
        break;
      case "password":
        if (!senhaAtualDraft || !novaSenhaDraft || !confirmarSenhaDraft) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Preencha senha atual, nova senha e confirmação.");
          return;
        }
        if (novaSenhaDraft !== confirmarSenhaDraft) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("A nova senha e a confirmação precisam ser iguais.");
          return;
        }
        registrarEventoSegurancaLocal({
          title: "Troca de senha iniciada",
          meta: "Reautenticação local concluída",
          status: "Agora",
          type: "session",
          critical: true,
        });
        setSenhaAtualDraft("");
        setNovaSenhaDraft("");
        setConfirmarSenhaDraft("");
        notificarConfiguracaoConcluida("Nova senha validada no app. A confirmação completa seguirá a política de segurança da conta vinculada.");
        break;
      case "bug":
        if (!bugDescriptionDraft.trim()) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Descreva o problema antes de enviar.");
          return;
        }
        {
          const item: SupportQueueItem = {
            id: `support-${Date.now()}`,
            kind: "bug",
            title: "Relato de bug do inspetor",
            body: bugDescriptionDraft.trim(),
            email: bugEmailDraft.trim() || emailAtualConta || email || "",
            createdAt: new Date().toISOString(),
            status: "Na fila local",
          };
          setFilaSuporteLocal((estadoAtual) => [item, ...estadoAtual].slice(0, 12));
          registrarEventoSegurancaLocal({
            title: "Relato de bug registrado",
            meta: `${item.status} • ${item.email || "Sem email de retorno"}`,
            status: "Agora",
            type: "data",
          });
          notificarConfiguracaoConcluida(`Bug salvo na fila local da Tariel.ia com protocolo ${item.id.slice(-6).toUpperCase()}.`);
        }
        setBugDescriptionDraft("");
        setBugEmailDraft("");
        break;
      case "feedback":
        if (!feedbackDraft.trim()) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Escreva uma sugestão antes de enviar.");
          return;
        }
        {
          const item: SupportQueueItem = {
            id: `support-${Date.now()}`,
            kind: "feedback",
            title: "Sugestão do inspetor",
            body: feedbackDraft.trim(),
            email: emailAtualConta || email || "",
            createdAt: new Date().toISOString(),
            status: "Aguardando triagem",
          };
          setFilaSuporteLocal((estadoAtual) => [item, ...estadoAtual].slice(0, 12));
          registrarEventoSegurancaLocal({
            title: "Feedback registrado",
            meta: `${item.status} • canal interno`,
            status: "Agora",
            type: "data",
          });
          notificarConfiguracaoConcluida("Sugestão salva na fila local. Obrigado por ajudar a evoluir o app.");
        }
        setFeedbackDraft("");
        break;
      case "updates":
        {
          const agora = new Date().toISOString();
        const statusAtual =
            statusApi === "online"
              ? "Verificação concluída. Nenhuma atualização obrigatória foi encontrada agora."
              : "Sem conexão no momento. Mantendo o último status local conhecido.";
          setUltimaVerificacaoAtualizacao(agora);
          setStatusAtualizacaoApp(statusAtual);
          registrarEventoSegurancaLocal({
            title: "Atualizações verificadas",
            meta: statusAtual,
            status: "Agora",
            type: "session",
          });
          notificarConfiguracaoConcluida(statusAtual);
        }
        break;
      default:
        notificarConfiguracaoConcluida("Ajuste salvo no app. Você pode continuar com a próxima revisão quando quiser.");
        break;
    }

    setSettingsSheetLoading(false);
  }

  function handleConfirmarAcaoCritica() {
    if (!confirmSheet) {
      return;
    }

    if (confirmSheet.confirmPhrase && confirmTextDraft.trim().toUpperCase() !== confirmSheet.confirmPhrase.toUpperCase()) {
      return;
    }

    const customOnConfirm = confirmSheet.onConfirm;

    switch (confirmSheet.kind) {
      case "clearHistory":
        registrarEventoSegurancaLocal({
          title: "Histórico apagado",
          meta: "Limpeza local acionada pelo usuário",
          status: "Agora",
          type: "data",
          critical: true,
        });
        setConversa(criarConversaNova());
        setMensagensMesa([]);
        setMensagem("");
        setMensagemMesa("");
        setAnexoRascunho(null);
        setAnexoMesaRascunho(null);
        setPreviewAnexoImagem(null);
        setBuscaHistorico("");
        setCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
        break;
      case "clearConversations":
        registrarEventoSegurancaLocal({
          title: "Conversas removidas",
          meta: "Todas as conversas locais foram limpas",
          status: "Agora",
          type: "data",
          critical: true,
        });
        setLaudosDisponiveis([]);
        setConversa(criarConversaNova());
        setMensagensMesa([]);
        setMensagem("");
        setMensagemMesa("");
        setAnexoRascunho(null);
        setAnexoMesaRascunho(null);
        setPreviewAnexoImagem(null);
        setBuscaHistorico("");
        setNotificacoes([]);
        setCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
        break;
      case "deleteAccount":
        registrarEventoSegurancaLocal({
          title: "Exclusão de conta iniciada",
          meta: "Reautenticação obrigatória pendente",
          status: "Agora",
          type: "data",
          critical: true,
        });
        break;
      case "provider":
      case "security":
      case "session":
      case "sessionCurrent":
      case "sessionOthers":
        customOnConfirm?.();
        break;
    }

    fecharConfirmacaoConfiguracao();
  }

  function handleUploadFotoPerfil() {
    abrirSheetConfiguracao({
      kind: "photo",
      title: "Foto de perfil",
      subtitle: "Atualize a imagem usada na conta e no chat do inspetor.",
      actionLabel: "Escolher foto",
    });
  }

  function handleAlterarEmail() {
    setNovoEmailDraft(emailAtualConta || email);
    abrirSheetConfiguracao({
      kind: "email",
      title: "Alterar email",
      subtitle: "Atualize o email principal e envie uma confirmação para validar o acesso.",
      actionLabel: "Solicitar confirmação",
    });
  }

  function handleAlterarSenha() {
    setSenhaAtualDraft("");
    setNovaSenhaDraft("");
    setConfirmarSenhaDraft("");
    abrirSheetConfiguracao({
      kind: "password",
      title: "Alterar senha",
      subtitle: "Confirme sua senha atual e defina uma nova credencial para o aplicativo.",
      actionLabel: "Salvar nova senha",
    });
  }

  function handleGerenciarPlano() {
    abrirSheetConfiguracao({
      kind: "plan",
      title: "Plano e assinatura",
      subtitle: "Revise benefícios do plano atual e prepare a próxima mudança de assinatura do inspetor.",
      actionLabel: "Trocar plano",
    });
  }

  function handleHistoricoPagamentos() {
    abrirSheetConfiguracao({
      kind: "payments",
      title: "Histórico de pagamentos",
      subtitle: "Resumo financeiro da assinatura do inspetor e das últimas cobranças.",
    });
  }

  function handleGerenciarPagamento() {
    abrirSheetConfiguracao({
      kind: "billing",
      title: "Gerenciar pagamento",
      subtitle: "Atualize o cartão cadastrado e deixe o método de cobrança pronto para a próxima renovação.",
      actionLabel: "Atualizar cartão",
    });
  }

  async function handleExportarDados(formato: "JSON" | "PDF" | "TXT") {
    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      abrirFluxoReautenticacao(`Confirme sua identidade para exportar os dados do inspetor em ${formato}.`, () => {
        void handleExportarDados(formato);
      });
      return;
    }

    registrarEventoSegurancaLocal({
      title: "Exportação de dados solicitada",
      meta: `Formato ${formato} com verificação adicional pendente`,
      status: "Agora",
      type: "data",
      critical: true,
    });
    if (formato === "PDF") {
      abrirSheetConfiguracao({
        kind: "privacy",
        title: `Exportar em ${formato}`,
        subtitle: `Revise o conteúdo desta exportação em ${formato} antes de gerar o arquivo final para compartilhar.`,
      });
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        nome: perfilNome || perfilExibicao || "Inspetor Tariel",
        exibicao: perfilExibicao || perfilNome || "Inspetor",
        email: emailAtualConta || email || "",
        plano: planoAtual,
      },
      settings: {
        modeloIa,
        estiloResposta,
        idiomaResposta,
        temaApp,
        tamanhoFonte,
        densidadeInterface,
        corDestaque,
        memoriaIa,
        aprendizadoIa,
        economiaDados,
        usoBateria,
        notificacoes: {
          push: notificaPush,
          respostas: notificaRespostas,
          email: emailsAtivos,
          vibracao: vibracaoAtiva,
          preview: mostrarConteudoNotificacao,
          somenteNovaMensagem: mostrarSomenteNovaMensagem,
        },
        privacidade: {
          salvarHistoricoConversas,
          compartilharMelhoriaIa,
          retencaoDados,
          ocultarConteudoBloqueado,
        },
      },
      laudos: laudosDisponiveis.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        status: item.status_card_label,
        atualizadoEm: item.data_iso,
      })),
      notifications: notificacoes.map((item) => ({
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        unread: item.unread,
      })),
      securityEvents: eventosSeguranca,
    };

    const conteudo =
      formato === "JSON"
        ? serializarPayloadExportacao(payload)
        : [
            "Tariel Inspetor - Exportação de dados",
            `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
            "",
            `Conta: ${payload.account.nome}`,
            `Email: ${payload.account.email}`,
            `Plano: ${payload.account.plano}`,
            "",
            `Laudos sincronizados: ${payload.laudos.length}`,
            `Notificações locais: ${payload.notifications.length}`,
            `Eventos de segurança: ${payload.securityEvents.length}`,
            "",
            "Preferências principais:",
            `- Modelo IA: ${payload.settings.modeloIa}`,
            `- Estilo: ${payload.settings.estiloResposta}`,
            `- Tema: ${payload.settings.temaApp}`,
            `- Cor de destaque: ${payload.settings.corDestaque}`,
            `- Histórico salvo: ${payload.settings.privacidade.salvarHistoricoConversas ? "sim" : "não"}`,
          ].join("\n");

    const exportado = await compartilharTextoExportado({
      extension: formato === "JSON" ? "json" : "txt",
      content: conteudo,
      prefixo: `tariel-inspetor-${formato.toLowerCase()}`,
    });
    if (exportado) {
      registrarEventoSegurancaLocal({
        title: "Dados exportados",
        meta: `Arquivo ${formato} gerado localmente`,
        status: "Agora",
        type: "data",
      });
      return;
    }
    abrirSheetConfiguracao({
      kind: "privacy",
      title: `Exportar em ${formato}`,
      subtitle: `O histórico já está organizado para exportação em ${formato} assim que esse formato estiver habilitado para a sua conta.`,
    });
  }

  function handleApagarHistoricoConfiguracoes() {
    executarComReautenticacao("Confirme sua identidade para apagar o histórico salvo neste dispositivo.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "clearHistory",
        title: "Apagar histórico",
        description: "Remove o histórico salvo localmente neste app. Você poderá sincronizar novamente depois.",
        confirmLabel: "Apagar histórico",
      });
    });
  }

  function handleLimparTodasConversasConfig() {
    executarComReautenticacao("Confirme sua identidade para excluir todas as conversas locais do inspetor.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "clearConversations",
        title: "Limpar conversas",
        description: "Limpa a lista local de conversas do app. O backend poderá sincronizar tudo de novo depois.",
        confirmLabel: "Limpar conversas",
      });
    });
  }

  function handleIntegracoesExternas() {
    abrirSheetConfiguracao({
      kind: "integrations",
      title: "Integrações",
      subtitle: "Conecte serviços externos ao fluxo do inspetor sem sair do app.",
    });
  }

  function handlePluginsIa() {
    abrirSheetConfiguracao({
      kind: "plugins",
      title: "Plugins da IA",
      subtitle: "Ative ferramentas extras para tornar a assistência do inspetor mais operacional.",
    });
  }

  function handlePermissoes() {
    abrirSheetConfiguracao({
      kind: "privacy",
      title: "Permissões",
      subtitle: "Câmera, microfone e arquivos serão gerenciados aqui quando a camada nativa completa for conectada ao sistema.",
    });
  }

  function handlePoliticaPrivacidade() {
    abrirSheetConfiguracao({
      kind: "privacy",
      title: "Política de privacidade",
      subtitle: "Veja como a Tariel.ia trata dados, histórico e retenção das conversas.",
    });
  }

  function handleVerificarAtualizacoes() {
    abrirSheetConfiguracao({
      kind: "updates",
      title: "Verificar atualizações",
      subtitle: "Consulte a versão atual, o canal do app e o status de disponibilidade de novas builds.",
      actionLabel: "Verificar agora",
    });
  }

  function handleCentralAjuda() {
    setBuscaAjuda("");
    setArtigoAjudaExpandidoId(HELP_CENTER_ARTICLES[0]?.id ?? "");
    abrirSheetConfiguracao({
      kind: "help",
      title: "Central de ajuda",
      subtitle: "Acesse artigos, respostas rápidas e atalhos para suporte do inspetor.",
    });
  }

  function handleReportarProblema() {
    setBugDescriptionDraft("");
    setBugEmailDraft(emailAtualConta || email);
    abrirSheetConfiguracao({
      kind: "bug",
      title: "Reportar problema",
      subtitle: "Descreva o bug encontrado e envie o contexto para a equipe da Tariel.ia.",
      actionLabel: "Enviar relato",
    });
  }

  function handleEnviarFeedback() {
    setFeedbackDraft("");
    abrirSheetConfiguracao({
      kind: "feedback",
      title: "Enviar feedback",
      subtitle: "Compartilhe ideias, melhorias e sugestões para a próxima evolução do app.",
      actionLabel: "Enviar feedback",
    });
  }

  function handleAlternarArtigoAjuda(articleId: string) {
    setArtigoAjudaExpandidoId((estadoAtual) => (estadoAtual === articleId ? "" : articleId));
  }

  async function handleExportarDiagnosticoApp() {
    const eventosObservabilidade = await listarEventosObservabilidade(80);
    const resumoObservabilidade = resumirEventosObservabilidade(eventosObservabilidade);
    const payload = [
      "Tariel Inspetor - Diagnóstico local",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `Build: ${APP_VERSION_LABEL} (${APP_BUILD_CHANNEL})`,
      `API: ${statusApi === "online" ? "online" : "offline"}`,
      `Conta: ${perfilNome || perfilExibicao || "Inspetor"}`,
      `Email: ${emailAtualConta || email || "Sem email"}`,
      `Sessão atual: ${sessaoAtual?.title || "Dispositivo atual"}`,
      `Fila offline: ${filaOffline.length} item(ns)`,
      `Fila de suporte: ${filaSuporteLocal.length} item(ns)`,
      `Observabilidade: ${resumoObservabilidade.total} evento(s) / ${resumoObservabilidade.failures} falha(s)`,
      `Observabilidade (último evento): ${resumoObservabilidade.latestAt ? formatarHorarioAtividade(resumoObservabilidade.latestAt) : "nenhum"}`,
      `Observabilidade (latência média): ${resumoObservabilidade.averageDurationMs} ms`,
      `Observabilidade (por tipo): api=${resumoObservabilidade.byKind.api}, fila=${resumoObservabilidade.byKind.offline_queue}, atividade=${resumoObservabilidade.byKind.activity_monitor}, push=${resumoObservabilidade.byKind.push}`,
      `Observabilidade (falhas por tipo): api=${resumoObservabilidade.failuresByKind.api}, fila=${resumoObservabilidade.failuresByKind.offline_queue}, atividade=${resumoObservabilidade.failuresByKind.activity_monitor}, push=${resumoObservabilidade.failuresByKind.push}`,
      `Última verificação de atualização: ${ultimaVerificacaoAtualizacao ? formatarHorarioAtividade(ultimaVerificacaoAtualizacao) : "nunca"}`,
      `Status da atualização: ${statusAtualizacaoApp}`,
      `Permissões: ${[microfonePermitido ? "microfone" : "", cameraPermitida ? "câmera" : "", arquivosPermitidos ? "arquivos" : "", notificacoesPermitidas ? "notificações" : "", biometriaPermitida ? "biometria" : ""].filter(Boolean).join(", ") || "nenhuma ativa"}`,
      "",
      "Eventos recentes de segurança:",
      ...eventosSeguranca.slice(0, 5).map((item) => `- ${item.title} • ${item.status} • ${item.meta}`),
    ].join("\n");

    const exportado = await compartilharTextoExportado({
      extension: "txt",
      content: payload,
      prefixo: "tariel-inspetor-diagnostico",
    });
    if (exportado) {
      registrarEventoSegurancaLocal({
        title: "Diagnóstico exportado",
        meta: "Pacote textual compartilhado pelo fluxo de suporte",
        status: "Agora",
        type: "data",
      });
      return;
    }
    setSettingsSheetNotice("Não foi possível compartilhar o diagnóstico agora.");
  }

  function handleLimparFilaSuporteLocal() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Limpar fila local de suporte",
      description: "Remove os relatos de bug e feedback guardados apenas neste dispositivo. O histórico de segurança permanece intacto.",
      confirmLabel: "Limpar fila",
      onConfirm: () => {
        setFilaSuporteLocal([]);
        registrarEventoSegurancaLocal({
          title: "Fila local de suporte limpa",
          meta: "Relatos locais removidos pelo usuário",
          status: "Agora",
          type: "data",
        });
      },
    });
  }

  function handleTermosUso() {
    abrirSheetConfiguracao({
      kind: "legal",
      title: "Termos de uso",
      subtitle: "Resumo das condições de uso do app do inspetor e das responsabilidades do usuário.",
    });
  }

  function handleLicencas() {
    abrirSheetConfiguracao({
      kind: "legal",
      title: "Licenças",
      subtitle: "Bibliotecas, dependências e componentes utilizados nesta build do aplicativo.",
    });
  }

  function handleExcluirConta() {
    executarComReautenticacao("Confirme sua identidade para excluir a conta e invalidar todas as sessões do app.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "deleteAccount",
        title: "Excluir conta",
        description: "Essa ação é permanente, invalida sessões e remove os dados conforme a política do sistema. Digite EXCLUIR para continuar.",
        confirmLabel: "Excluir permanentemente",
        confirmPhrase: "EXCLUIR",
      });
    });
  }

  function handleToggleProviderConnection(provider: ConnectedProvider) {
    const conectados = provedoresConectados.filter((item) => item.connected).length;
    if (provider.connected) {
      if (conectados <= 1) {
        abrirConfirmacaoConfiguracao({
          kind: "provider",
          title: "Último método de acesso",
          description: "Cadastre outro provedor ou mantenha um método adicional válido antes de desconectar este acesso.",
          confirmLabel: "Entendi",
        });
        return;
      }

      executarComReautenticacao(`Confirme sua identidade para desconectar ${provider.label} desta conta.`, () => {
        abrirConfirmacaoConfiguracao({
          kind: "provider",
          title: `Desconectar ${provider.label}`,
          description: provider.requiresReauth
            ? `Confirme a desconexão do provedor ${provider.label}. Para ações sensíveis, a reautenticação será exigida.`
            : `Confirme a desconexão do provedor ${provider.label}.`,
          confirmLabel: "Desconectar",
          onConfirm: () => {
            setProvedoresConectados((estadoAtual) =>
              estadoAtual.map((item) =>
                item.id === provider.id ? { ...item, connected: false, email: "" } : item,
              ),
            );
            registrarEventoSegurancaLocal({
              title: `${provider.label} desconectado`,
              meta: "Evento de segurança registrado na conta do inspetor",
              status: "Agora",
              type: "provider",
              critical: true,
            });
          },
        });
      });
      return;
    }

    executarComReautenticacao(`Confirme sua identidade para vincular ${provider.label} à conta do inspetor.`, () => {
      setProvedoresConectados((estadoAtual) =>
        estadoAtual.map((item) =>
          item.id === provider.id ? { ...item, connected: true, email: emailAtualConta || email } : item,
        ),
      );
      registrarEventoSegurancaLocal({
        title: `${provider.label} conectado`,
        meta: emailAtualConta || email || "Conta corporativa vinculada",
        status: "Agora",
        type: "provider",
      });
    });
  }

  function handleEncerrarSessao(item: SessionDevice) {
    abrirConfirmacaoConfiguracao({
      kind: "session",
      title: "Encerrar sessão",
      description: `Deseja encerrar a sessão em ${item.title}?`,
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => sessao.id !== item.id));
        registrarEventoSegurancaLocal({
          title: "Sessão encerrada",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
        });
      },
    });
  }

  function handleRevisarSessao(item: SessionDevice) {
    const vaiMarcarComoSuspeita = !item.suspicious;
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: vaiMarcarComoSuspeita ? "Sinalizar atividade incomum" : "Marcar sessão como segura",
      description: vaiMarcarComoSuspeita
        ? `Deseja sinalizar ${item.title} como atividade incomum para revisão posterior?`
        : `Deseja remover o alerta de risco da sessão em ${item.title}?`,
      confirmLabel: vaiMarcarComoSuspeita ? "Sinalizar" : "Marcar segura",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.map((sessao) =>
            sessao.id === item.id ? { ...sessao, suspicious: vaiMarcarComoSuspeita } : sessao,
          ),
        );
        registrarEventoSegurancaLocal({
          title: vaiMarcarComoSuspeita ? "Sessão sinalizada como incomum" : "Sessão marcada como segura",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
          critical: vaiMarcarComoSuspeita,
        });
      },
    });
  }

  function handleEncerrarOutrasSessoes() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionOthers",
      title: "Encerrar todas as outras",
      description: "Deseja encerrar todas as outras sessões ativas do inspetor?",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => sessao.current));
        registrarEventoSegurancaLocal({
          title: "Outras sessões encerradas",
          meta: "Sessões antigas invalidadas no dispositivo atual",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleEncerrarSessaoAtual() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionCurrent",
      title: "Encerrar esta sessão",
      description: "Deseja sair deste dispositivo agora? O token atual será invalidado e você precisará entrar novamente.",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Sessão atual encerrada",
          meta: "Logout acionado a partir do dispositivo em uso",
          status: "Agora",
          type: "session",
          critical: true,
        });
        fecharConfiguracoes();
        void handleLogout();
      },
    });
  }

  function handleEncerrarSessoesSuspeitas() {
    const sessoesSuspeitas = sessoesAtivas.filter((item) => item.suspicious);
    if (!sessoesSuspeitas.length) {
      abrirConfirmacaoConfiguracao({
        kind: "security",
        title: "Nenhuma sessão suspeita",
        description: "No momento não existe nenhuma sessão marcada como suspeita para encerrar.",
        confirmLabel: "Entendi",
      });
      return;
    }

    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Encerrar sessões suspeitas",
      description: `Vamos encerrar ${sessoesSuspeitas.length} sessão(ões) marcadas como suspeitas e manter somente as confiáveis.`,
      confirmLabel: "Encerrar suspeitas",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => !sessao.suspicious));
        registrarEventoSegurancaLocal({
          title: "Sessões suspeitas encerradas",
          meta: `${sessoesSuspeitas.length} sessão(ões) removidas após revisão`,
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleConectarProximoProvedorDisponivel() {
    const proximoProvider = provedoresConectados.find((item) => !item.connected) || null;
    if (!proximoProvider) {
      abrirConfirmacaoConfiguracao({
        kind: "provider",
        title: "Todos os provedores já estão vinculados",
        description: "Google, Apple e Microsoft já estão conectados nesta conta do inspetor.",
        confirmLabel: "Entendi",
      });
      return;
    }

    handleToggleProviderConnection(proximoProvider);
  }

  async function handleCompartilharCodigosRecuperacao() {
    if (!codigosRecuperacao.length) {
      setSettingsSheetNotice("Gere os códigos primeiro para compartilhar ou salvar com segurança.");
      return;
    }

    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      abrirFluxoReautenticacao(
        "Confirme sua identidade para exportar os códigos de recuperação da verificação em duas etapas.",
        () => {
          void handleCompartilharCodigosRecuperacao();
        },
      );
      return;
    }

    const conteudo = [
      "Tariel Inspetor • Códigos de recuperação",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      ...codigosRecuperacao,
      "",
      "Guarde estes códigos em local seguro. Cada código deve ser usado apenas uma vez.",
    ].join("\n");

    const compartilhado = await compartilharTextoExportado({
      extension: "txt",
      content: conteudo,
      prefixo: "tariel-recovery-codes",
    });

    if (compartilhado) {
      registrarEventoSegurancaLocal({
        title: "Códigos de recuperação exportados",
        meta: "Exportação local concluída com reautenticação válida",
        status: "Agora",
        type: "2fa",
        critical: true,
      });
      setSettingsSheetNotice("Códigos compartilhados. Salve-os em um local seguro.");
      return;
    }

    setSettingsSheetNotice("Não foi possível exportar os códigos agora. Tente novamente em alguns segundos.");
  }

  function handleReautenticacaoSensivel() {
    abrirFluxoReautenticacao(
      "Confirme a identidade do inspetor para liberar exportação, exclusão de dados, 2FA e mudanças sensíveis na conta.",
    );
  }

  function handleMudarMetodo2FA(value: (typeof TWO_FACTOR_METHOD_OPTIONS)[number]) {
    if (value === twoFactorMethod) {
      return;
    }
    setTwoFactorMethod(value);
    registrarEventoSegurancaLocal({
      title: "Método preferido de 2FA atualizado",
      meta: `Novo método preferido: ${value}`,
      status: "Agora",
      type: "2fa",
      critical: twoFactorEnabled,
    });
  }

  function handleToggle2FA() {
    const proximoEstado = !twoFactorEnabled;
    executarComReautenticacao(
      proximoEstado
        ? "Confirme sua identidade para ativar a verificação em duas etapas."
        : "Confirme sua identidade para desativar a verificação em duas etapas.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "security",
          title: proximoEstado ? "Ativar verificação em duas etapas" : "Desativar verificação em duas etapas",
          description: proximoEstado
            ? "A ativação será registrada no histórico de segurança e passa a proteger ações críticas."
            : "A desativação da 2FA exige confirmação forte e ficará registrada no histórico de segurança.",
          confirmLabel: proximoEstado ? "Ativar" : "Desativar",
          onConfirm: () => {
            setTwoFactorEnabled(proximoEstado);
            registrarEventoSegurancaLocal({
              title: proximoEstado ? "2FA ativada" : "2FA desativada",
              meta: `Método preferido: ${twoFactorMethod}`,
              status: "Agora",
              type: "2fa",
              critical: !proximoEstado,
            });
          },
        });
      },
    );
  }

  function handleGerarCodigosRecuperacao() {
    executarComReautenticacao("Confirme sua identidade para gerar novos códigos de recuperação.", () => {
      const novosCodigos = Array.from({ length: 6 }, (_, index) => `TG-${index + 1}${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
      setCodigosRecuperacao(novosCodigos);
      registrarEventoSegurancaLocal({
        title: "Códigos de recuperação gerados",
        meta: "Exibidos uma única vez ao usuário",
        status: "Agora",
        type: "2fa",
      });
      abrirSheetConfiguracao({
        kind: "reauth",
        title: "Códigos de recuperação",
        subtitle: "Os novos códigos já foram gerados e aparecem na seção de 2FA. Salve-os em local seguro antes de sair.",
      });
    });
  }

  function handleConfirmarCodigo2FA() {
    if (codigo2FA.trim().length < 6) {
      Alert.alert("Código inválido", "Digite um código válido para concluir a configuração da verificação em duas etapas.");
      return;
    }

    registrarEventoSegurancaLocal({
      title: "Código 2FA confirmado",
      meta: `Método validado: ${twoFactorMethod}`,
      status: "Agora",
      type: "2fa",
    });
    Alert.alert("Código confirmado", "A verificação em duas etapas foi confirmada no app.");
    setCodigo2FA("");
  }

  function handleGerenciarPermissao(nome: string, status: string) {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: `Gerenciar ${nome}`,
      description: `${nome} está com status "${status}". Vamos abrir as configurações do sistema para ajustar essa permissão com segurança.`,
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: `Permissão revisada: ${nome}`,
          meta: `Status atual ${status}. Ajustes do sistema foram abertos pelo usuário.`,
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleAbrirAjustesDoSistema(contexto: string) {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Abrir ajustes do sistema",
      description: `Vamos abrir as configurações do Android para revisar ${contexto}.`,
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Ajustes do sistema abertos",
          meta: `Fluxo acionado a partir de ${contexto}`,
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleToggleNotificaPush(value: boolean) {
    if (!value) {
      setNotificaPush(false);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "disabled",
      });
      return;
    }

    if (notificacoesPermitidas) {
      setNotificaPush(true);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "enabled",
      });
      return;
    }

    setNotificaPush(false);
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_toggle",
      ok: false,
      detail: "permission_denied",
    });
    Alert.alert(
      "Permissão necessária",
      "Ative as notificações do sistema para habilitar alertas push no app.",
      [
        { text: "Agora não", style: "cancel" },
        {
          text: "Abrir ajustes",
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
    );
  }

  function handleToggleMostrarConteudoNotificacao(value: boolean) {
    setMostrarConteudoNotificacao(value);
    if (value) {
      setMostrarSomenteNovaMensagem(false);
    }
    registrarEventoSegurancaLocal({
      title: "Prévia de notificação atualizada",
      meta: value
        ? "Conteúdo das mensagens pode aparecer quando o sistema permitir."
        : "Conteúdo textual das mensagens ficou oculto nas notificações.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleOcultarConteudoBloqueado(value: boolean) {
    setOcultarConteudoBloqueado(value);
    registrarEventoSegurancaLocal({
      title: "Privacidade na tela bloqueada atualizada",
      meta: value
        ? "Conteúdo sensível oculto na tela bloqueada."
        : "O app permite prévias fora da tela bloqueada, conforme o sistema.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleMostrarSomenteNovaMensagem(value: boolean) {
    setMostrarSomenteNovaMensagem(value);
    if (value) {
      setMostrarConteudoNotificacao(false);
      setOcultarConteudoBloqueado(true);
    }
    registrarEventoSegurancaLocal({
      title: "Modo privado de notificação atualizado",
      meta: value
        ? 'As notificações exibem apenas "Nova mensagem".'
        : "O app voltou a permitir outros níveis de prévia.",
      status: "Agora",
      type: "data",
    });
  }

  function handleRevisarPermissoesCriticas() {
    const faltando = [
      !cameraPermitida ? "câmera" : "",
      !arquivosPermitidos ? "arquivos" : "",
      !notificacoesPermitidas ? "notificações" : "",
    ].filter(Boolean);
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Revisar permissões críticas",
      description: faltando.length
        ? `Ainda faltam ${faltando.join(", ")} para o app operar melhor em campo. Vamos abrir os ajustes do Android.`
        : "As permissões críticas já estão liberadas. Você ainda pode revisar tudo nos ajustes do Android.",
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Revisão de permissões críticas",
          meta: faltando.length ? `Pendentes: ${faltando.join(", ")}` : "Todas as permissões críticas já estavam liberadas",
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleExportarAntesDeExcluirConta() {
    executarComReautenticacao("Confirme sua identidade para exportar os dados antes da exclusão permanente da conta.", () => {
      void handleExportarDados("JSON");
    });
  }

  function handleReportarAtividadeSuspeita() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Reportar atividade suspeita",
      description: "Esse evento será marcado como crítico no histórico de segurança do inspetor e usado para revisão posterior.",
      confirmLabel: "Reportar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Atividade suspeita reportada",
          meta: "O usuário sinalizou uma ocorrência no histórico de segurança",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleAbrirSeletorAnexo() {
    if (!uploadArquivosAtivo) {
      Alert.alert(
        "Uploads desativados",
        "O envio de arquivos está desligado nas preferências do app. Reative em Configurações > Recursos avançados.",
      );
      return;
    }
    if (!arquivosPermitidos) {
      Alert.alert(
        "Arquivos bloqueados",
        "O acesso a arquivos foi desativado neste dispositivo. Ajuste isso em Configurações > Permissões.",
      );
      return;
    }
    setAnexosAberto(true);
  }

  async function handleEscolherAnexo(opcao: "camera" | "galeria" | "documento") {
    setAnexosAberto(false);
    if (!uploadArquivosAtivo) {
      return;
    }
    if (opcao === "camera" && !cameraPermitida) {
      Alert.alert("Câmera indisponível", "Ative a câmera em Configurações > Permissões para anexar fotos.");
      return;
    }
    if (opcao !== "camera" && !arquivosPermitidos) {
      Alert.alert("Arquivos indisponíveis", "Ative o acesso a arquivos em Configurações > Permissões.");
      return;
    }
    if (opcao === "camera") {
      await handleCapturarImagem();
      return;
    }
    if (opcao === "galeria") {
      await handleSelecionarImagem();
      return;
    }
    await handleSelecionarDocumento();
  }

  function handleAbrirHistorico() {
    if (historicoAbertoRef.current) {
      fecharHistorico({ limparBusca: true });
      return;
    }
    abrirHistorico();
  }

  function handleGerenciarConversasIndividuais() {
    fecharConfiguracoes();
    setTimeout(() => {
      abrirHistorico();
    }, 180);
  }

  function atualizarLaudosLocais(transform: (itens: MobileLaudoCard[]) => MobileLaudoCard[]) {
    setLaudosDisponiveis((estadoAtual) => {
      const proximosLaudos = transform(estadoAtual);
      setCacheLeitura((cacheAtual) => ({
        ...cacheAtual,
        laudos: transform(cacheAtual.laudos),
        updatedAt: new Date().toISOString(),
      }));
      return proximosLaudos;
    });
  }

  function handleAlternarFixadoHistorico(card: MobileLaudoCard) {
    const vaiFixar = !card.pinado;
    setLaudosFixadosIds((estadoAtual) =>
      vaiFixar ? Array.from(new Set([...estadoAtual, card.id])) : estadoAtual.filter((item) => item !== card.id),
    );
    atualizarLaudosLocais((itens) =>
      itens.map((item) => (item.id === card.id ? { ...item, pinado: vaiFixar } : item)),
    );
  }

  function handleExcluirConversaHistorico(card: MobileLaudoCard) {
    executarComReautenticacao(`Confirme sua identidade para remover ${card.titulo} do histórico deste app.`, () => {
      abrirConfirmacaoConfiguracao({
        kind: "security",
        title: "Remover do histórico",
        description: `A conversa "${card.titulo}" será removida localmente do histórico do inspetor neste dispositivo.`,
        confirmLabel: "Remover",
        onConfirm: () => {
          setHistoricoOcultoIds((estadoAtual) => Array.from(new Set([...estadoAtual, card.id])));
          setLaudosFixadosIds((estadoAtual) => estadoAtual.filter((item) => item !== card.id));
          atualizarLaudosLocais((itens) => itens.filter((item) => item.id !== card.id));
          setCacheLeitura((estadoAtual) => {
            const chave = chaveCacheLaudo(card.id);
            const { [chave]: _chatRemovido, ...restoConversas } = estadoAtual.conversasPorLaudo;
            const { [chave]: _mesaRemovida, ...restoMesa } = estadoAtual.mesaPorLaudo;
            return {
              ...estadoAtual,
              laudos: estadoAtual.laudos.filter((item) => item.id !== card.id),
              conversasPorLaudo: restoConversas,
              mesaPorLaudo: restoMesa,
              updatedAt: new Date().toISOString(),
            };
          });
          setNotificacoes((estadoAtual) => estadoAtual.filter((item) => item.laudoId !== card.id));
          if (conversa?.laudoId === card.id) {
            setConversa(criarConversaNova());
            setMensagensMesa([]);
            setMensagem("");
            setMensagemMesa("");
            setAnexoRascunho(null);
            setAnexoMesaRascunho(null);
            setErroMesa("");
            setErroConversa("");
            setLaudoMesaCarregado(null);
          }
        },
      });
    });
  }

  async function handleSelecionarHistorico(card: MobileLaudoCard | null) {
    fecharHistorico({ limparBusca: true });
    setAbaAtiva("chat");
    await handleSelecionarLaudo(card);
  }

  async function tentarAbrirUrlExterna(url: string): Promise<boolean> {
    const target = String(url || "").trim();
    if (!target) {
      return false;
    }
    try {
      const supported = await Linking.canOpenURL(target);
      if (!supported) {
        return false;
      }
      await Linking.openURL(target);
      return true;
    } catch {
      return false;
    }
  }

  function handleEsqueciSenha() {
    const url = obterUrlRecuperacaoSenhaMobile(email);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        Alert.alert(
          "Recuperação de senha",
          "Não foi possível abrir o fluxo agora. Tente novamente em instantes ou contate o administrador da sua empresa.",
        );
      }
    })();
  }

  function handleLoginSocial(provider: "Google" | "Microsoft") {
    const url = obterUrlLoginSocialMobile(provider);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        Alert.alert(
          `${provider} indisponível`,
          `Não foi possível abrir o login com ${provider} agora. Use email e senha enquanto o acesso externo é normalizado.`,
        );
      }
    })();
  }

  const historyEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 <= PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_OPEN_SWIPE_THRESHOLD) {
          handleAbrirHistorico();
        }
      },
    }),
  ).current;

  const settingsEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 >= SCREEN_WIDTH - PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_OPEN_SWIPE_THRESHOLD) {
          handleAbrirConfiguracoes();
        }
      },
    }),
  ).current;

  const historyDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        historicoAbertoRef.current &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharHistorico({ limparBusca: true });
        }
      },
    }),
  ).current;

  const settingsDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        configuracoesAbertaRef.current &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharConfiguracoes();
        }
      },
    }),
  ).current;

  async function abrirLaudoPorId(accessToken: string, laudoId: number) {
    setErroConversa("");
    setErroMesa("");
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    limparReferenciaMesaAtiva();
    setCarregandoConversa(true);

    try {
      const historico = await carregarMensagensLaudo(accessToken, laudoId);
      const proximaConversa = normalizarConversa(historico);
      setConversa(proximaConversa);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [chaveCacheLaudo(laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      setMensagensMesa([]);
      setLaudoMesaCarregado(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o laudo selecionado.";
      const conversaCache = cacheLeitura.conversasPorLaudo[chaveCacheLaudo(laudoId)];
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && conversaCache) {
        setConversa(conversaCache);
        setMensagensMesa(cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || []);
        setLaudoMesaCarregado((cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || []).length ? laudoId : null);
        setUsandoCacheOffline(true);
        return;
      }
      setErroConversa(message);
    } finally {
      setCarregandoConversa(false);
    }
  }

  async function handleAbrirNotificacao(item: MobileActivityNotification) {
    if (!session) {
      return;
    }

    setCentralAtividadeAberta(false);
    setNotificacoes((estadoAtual) =>
      estadoAtual.map((registro) =>
        registro.id === item.id && registro.unread ? { ...registro, unread: false } : registro,
      ),
    );

    if (!item.laudoId) {
      return;
    }

    await abrirLaudoPorId(session.accessToken, item.laudoId);
    setAbaAtiva(item.targetThread);

    if (item.targetThread === "mesa") {
      await carregarMesaAtual(session.accessToken, item.laudoId, true);
    }
  }

  async function monitorarAtividade(accessToken: string) {
    if (monitorandoAtividade) {
      return;
    }

    setMonitorandoAtividade(true);
    const monitoramentoIniciadoEm = Date.now();

    try {
      const payloadLaudos = await carregarLaudosMobile(accessToken);
      const proximosLaudos = payloadLaudos.itens || [];
      const snapshotAnterior = statusSnapshotRef.current;
      const snapshotNovo: Record<number, string> = {};
      const novasNotificacoes: MobileActivityNotification[] = [];

      for (const item of proximosLaudos) {
        const assinatura = assinaturaStatusLaudo(item);
        snapshotNovo[item.id] = assinatura;

        if (snapshotAnterior[item.id] && snapshotAnterior[item.id] !== assinatura) {
          novasNotificacoes.push(criarNotificacaoStatusLaudo(item));
        }
      }

      statusSnapshotRef.current = snapshotNovo;
      setLaudosDisponiveis(proximosLaudos);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        laudos: proximosLaudos,
        updatedAt: new Date().toISOString(),
      }));
      setErroLaudos("");

      const laudoMonitorado = conversa?.laudoId ?? null;
      const laudosMonitoradosMesa = selecionarLaudosParaMonitoramentoMesa({
        laudos: proximosLaudos,
        laudoAtivoId: laudoMonitorado,
      });
      if (laudosMonitoradosMesa.length) {
        const resultadosMesa = await Promise.allSettled(
          laudosMonitoradosMesa.map(async (laudoId) => ({
            laudoId,
            payload: await carregarMensagensMesaMobile(accessToken, laudoId),
          })),
        );
        const cacheMesaAtualizado: Record<string, MobileMesaMessage[]> = {};
        const titulosLaudos = new Map(proximosLaudos.map((item) => [item.id, item.titulo]));

        for (const resultado of resultadosMesa) {
          if (resultado.status !== "fulfilled") {
            continue;
          }

          const { laudoId, payload } = resultado.value;
          const itensMesa = payload.itens || [];
          const snapshotMesaAnterior = mesaSnapshotRef.current[laudoId] || {};
          const snapshotMesaNovo: Record<number, string> = {};
          const tituloLaudo =
            titulosLaudos.get(laudoId) ||
            (laudoMonitorado === laudoId ? conversa?.laudoCard?.titulo || "" : "") ||
            `Laudo #${laudoId}`;
          const mesaPossuiaSnapshot = Object.keys(snapshotMesaAnterior).length > 0;

          for (const item of itensMesa) {
            const assinatura = assinaturaMensagemMesa(item);
            snapshotMesaNovo[item.id] = assinatura;
            const assinaturaAntiga = snapshotMesaAnterior[item.id];

            if (!mesaPossuiaSnapshot) {
              continue;
            }

            if (!assinaturaAntiga) {
              const veioDaMesa = item.remetente_id !== session?.bootstrap.usuario.id;
              if (veioDaMesa) {
                novasNotificacoes.push(criarNotificacaoMesa("mesa_nova", item, tituloLaudo));
              }
              continue;
            }

            const estavaResolvida = assinaturaAntiga.split("|")[1] || "";
            const estaResolvida = item.resolvida_em || "";
            if (!estavaResolvida && estaResolvida) {
              novasNotificacoes.push(criarNotificacaoMesa("mesa_resolvida", item, tituloLaudo));
            } else if (estavaResolvida && !estaResolvida) {
              novasNotificacoes.push(criarNotificacaoMesa("mesa_reaberta", item, tituloLaudo));
            }
          }

          mesaSnapshotRef.current[laudoId] = snapshotMesaNovo;
          cacheMesaAtualizado[chaveCacheLaudo(laudoId)] = itensMesa;

          if (laudoMonitorado === laudoId) {
            setMensagensMesa(itensMesa);
            setLaudoMesaCarregado(laudoId);
            setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, payload));
          }
        }

        if (Object.keys(cacheMesaAtualizado).length) {
          setCacheLeitura((estadoAtual) => ({
            ...estadoAtual,
            mesaPorLaudo: {
              ...estadoAtual.mesaPorLaudo,
              ...cacheMesaAtualizado,
            },
            updatedAt: new Date().toISOString(),
          }));
        }
      }

      registrarNotificacoes(novasNotificacoes);
      setStatusApi("online");
      void registrarEventoObservabilidade({
        kind: "activity_monitor",
        name: "activity_cycle",
        ok: true,
        durationMs: Date.now() - monitoramentoIniciadoEm,
        count: novasNotificacoes.length,
        detail: `laudos_${proximosLaudos.length}`,
      });
    } catch (error) {
      if (erroSugereModoOffline(error)) {
        setStatusApi("offline");
        void registrarEventoObservabilidade({
          kind: "activity_monitor",
          name: "activity_cycle",
          ok: false,
          durationMs: Date.now() - monitoramentoIniciadoEm,
          detail: "offline",
        });
        return;
      }

      const message = error instanceof Error ? error.message : "Não foi possível monitorar a atividade do inspetor.";
      setErroConversa((estadoAtual) => estadoAtual || message);
      void registrarEventoObservabilidade({
        kind: "activity_monitor",
        name: "activity_cycle",
        ok: false,
        durationMs: Date.now() - monitoramentoIniciadoEm,
        detail: message,
      });
    } finally {
      setMonitorandoAtividade(false);
    }
  }

  async function handleSelecionarLaudo(card: MobileLaudoCard | null) {
    if (!session) {
      return;
    }

    setErroConversa("");
    setErroMesa("");
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    setAbaAtiva("chat");

    if (!card) {
      setConversa(criarConversaNova());
      setMensagensMesa([]);
      setLaudoMesaCarregado(null);
      return;
    }

    await abrirLaudoPorId(session.accessToken, card.id);
  }

  async function handleReabrir() {
    if (!session || !conversa?.laudoId) {
      return;
    }

    try {
      await reabrirLaudoMobile(session.accessToken, conversa.laudoId);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      await carregarListaLaudos(session.accessToken, true);
      if (abaAtiva === "mesa" && proximaConversa?.laudoId) {
        await carregarMesaAtual(session.accessToken, proximaConversa.laudoId, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reabrir o laudo.";
      Alert.alert("Reabrir laudo", message);
    }
  }

  async function handleSelecionarImagem() {
    if (!session || preparandoAnexo || !uploadArquivosAtivo || !arquivosPermitidos) {
      return;
    }

    try {
      setPreparandoAnexo(true);
      setErroConversa("");

      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted && permissao.accessPrivileges !== "limited") {
        Alert.alert("Biblioteca de imagens", "Permita acesso às imagens para anexar evidências no chat.");
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        base64: true,
        quality: 0.72,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      const anexo = montarAnexoImagem(
        asset,
        abaAtiva === "mesa"
          ? "Imagem pronta para seguir direto para a mesa avaliadora."
          : "Imagem pronta para seguir com a mensagem do inspetor.",
      );

      if (abaAtiva === "mesa") {
        setAnexoMesaRascunho(anexo);
      } else {
        setAnexoRascunho(anexo);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível selecionar a imagem.";
      Alert.alert("Imagem", message);
    } finally {
      setPreparandoAnexo(false);
    }
  }

  async function handleCapturarImagem() {
    if (!session || preparandoAnexo || !uploadArquivosAtivo || !cameraPermitida) {
      return;
    }

    try {
      setPreparandoAnexo(true);
      setErroConversa("");

      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert("Câmera", "Permita acesso à câmera para registrar evidências pelo app.");
        return;
      }

      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        base64: true,
        quality: 0.72,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      const anexo = montarAnexoImagem(
        asset,
        abaAtiva === "mesa"
          ? "Foto capturada no app e pronta para seguir para a mesa."
          : "Foto capturada no app e pronta para seguir com a conversa.",
      );

      if (abaAtiva === "mesa") {
        setAnexoMesaRascunho(anexo);
      } else {
        setAnexoRascunho(anexo);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível usar a câmera agora.";
      Alert.alert("Câmera", message);
    } finally {
      setPreparandoAnexo(false);
    }
  }

  async function handleSelecionarDocumento() {
    if (!session || preparandoAnexo || !uploadArquivosAtivo || !arquivosPermitidos) {
      return;
    }

    try {
      setPreparandoAnexo(true);
      setErroConversa("");

      const resultado = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      if (abaAtiva === "mesa") {
        setAnexoMesaRascunho(montarAnexoDocumentoMesa(asset));
        return;
      }

      try {
        const documento = await uploadDocumentoChatMobile(session.accessToken, {
          uri: asset.uri,
          nome: asset.name,
          mimeType: asset.mimeType,
        });

        setAnexoRascunho({
          kind: "document",
          label: documento.nome,
          resumo: documento.truncado
            ? `Documento convertido com corte de segurança em ${documento.chars} caracteres.`
            : `Documento convertido com ${documento.chars} caracteres prontos para a IA.`,
          textoDocumento: documento.texto,
          nomeDocumento: documento.nome,
          chars: documento.chars,
          truncado: documento.truncado,
          fileUri: asset.uri,
          mimeType: asset.mimeType || "application/octet-stream",
        });
      } catch (error) {
        if (statusApi === "offline" || erroSugereModoOffline(error)) {
          setAnexoRascunho(
            montarAnexoDocumentoLocal(
              asset,
              "Documento salvo localmente e pronto para conversão assim que a conexão voltar.",
            ),
          );
          setErroConversa("Documento salvo no rascunho. Ele será convertido quando você enviar com internet.");
          setStatusApi("offline");
          return;
        }
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível preparar o documento.";
      Alert.alert("Documento", message);
    } finally {
      setPreparandoAnexo(false);
    }
  }

  async function handleEnviarMensagem() {
    const texto = mensagem.trim();
    const anexoAtual = anexoRascunho;

    if ((!texto && !anexoAtual) || !session) {
      return;
    }

    if (conversa && !conversa.permiteEdicao) {
      return;
    }

    const textoExibicao = texto || textoFallbackAnexo(anexoAtual);
    const snapshotConversa = conversa;
    const modoAtivo = normalizarModoChat(snapshotConversa?.modo);
    const setorAtivo = inferirSetorConversa(snapshotConversa);

    const mensagemOtimista: MobileChatMessage = {
      id: Date.now(),
      papel: "usuario",
      texto: textoExibicao,
      tipo: "user",
      modo: modoAtivo,
      anexos: anexoAtual ? [{ label: anexoAtual.label, categoria: anexoAtual.kind }] : undefined,
    };

    setMensagem("");
    setAnexoRascunho(null);
    setErroConversa("");
    setEnviandoMensagem(true);
    setConversa((estadoAtual) => ({
      laudoId: estadoAtual?.laudoId || null,
      estado: estadoAtual?.estado || "sem_relatorio",
      statusCard: estadoAtual?.statusCard || "aberto",
      permiteEdicao: estadoAtual?.permiteEdicao ?? true,
      permiteReabrir: estadoAtual?.permiteReabrir ?? false,
      laudoCard: estadoAtual?.laudoCard || null,
      modo: normalizarModoChat(estadoAtual?.modo, modoAtivo),
      mensagens: [...(estadoAtual?.mensagens || []), mensagemOtimista],
    }));

    try {
      let dadosImagem = "";
      let textoDocumento = "";
      let nomeDocumento = "";

      if (anexoAtual?.kind === "image") {
        dadosImagem = anexoAtual.dadosImagem;
      } else if (anexoAtual?.kind === "document") {
        if (anexoAtual.textoDocumento) {
          textoDocumento = anexoAtual.textoDocumento;
          nomeDocumento = anexoAtual.nomeDocumento;
        } else {
          const documento = await uploadDocumentoChatMobile(session.accessToken, {
            uri: anexoAtual.fileUri,
            nome: anexoAtual.nomeDocumento,
            mimeType: anexoAtual.mimeType,
          });
          textoDocumento = documento.texto;
          nomeDocumento = documento.nome;
        }
      }

      const respostaChat = await enviarMensagemChatMobile(session.accessToken, {
        mensagem: texto,
        dadosImagem,
        setor: setorAtivo,
        textoDocumento,
        nomeDocumento,
        laudoId: snapshotConversa?.laudoId ?? null,
        modo: modoAtivo,
        historico: montarHistoricoParaEnvio([...(snapshotConversa?.mensagens || []), mensagemOtimista]),
      });
      const mensagemAssistenteServidor = criarMensagemAssistenteServidor(respostaChat);
      setConversa((estadoAtual) => {
        const base = estadoAtual || criarConversaNova();
        return {
          ...base,
          laudoId: respostaChat.laudoId ?? base.laudoId,
          statusCard: respostaChat.laudoCard?.status_card || base.statusCard,
          laudoCard: respostaChat.laudoCard || base.laudoCard,
          modo: normalizarModoChat(respostaChat.modo, normalizarModoChat(base.modo)),
          mensagens: mensagemAssistenteServidor
            ? [...base.mensagens, mensagemAssistenteServidor]
            : base.mensagens,
        };
      });
      await carregarConversaAtual(session.accessToken, true);
      await carregarListaLaudos(session.accessToken, true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar a mensagem do inspetor.";
      const podeEnfileirar = Boolean((texto.trim() || anexoAtual) && (statusApi === "offline" || erroSugereModoOffline(error)));

      setConversa(snapshotConversa);
      if (podeEnfileirar) {
        const itemFila = criarItemFilaOffline({
          channel: "chat",
          laudoId: snapshotConversa?.laudoId ?? null,
          text: texto,
          title: snapshotConversa?.laudoCard?.titulo || "Nova inspeção",
          attachment: anexoAtual,
        });
        setFilaOffline((estadoAtual) => [
          ...estadoAtual,
          itemFila,
        ]);
        void registrarEventoObservabilidade({
          kind: "offline_queue",
          name: "offline_queue_enqueue",
          ok: true,
          count: 1,
          detail: "chat",
        });
        setErroConversa("Sem conexão estável. O envio foi guardado na fila local.");
        setStatusApi("offline");
      } else {
        setMensagem(texto);
        setAnexoRascunho(anexoAtual);
        setErroConversa(message);
      }
    } finally {
      setEnviandoMensagem(false);
    }
  }

  async function handleEnviarMensagemMesa() {
    const texto = mensagemMesa.trim();
    const anexoAtual = anexoMesaRascunho;
    const referenciaMensagemId = Number(mensagemMesaReferenciaAtiva?.id || 0) || null;
    if ((!texto && !anexoAtual) || !session || !conversa?.laudoId || !conversa.permiteEdicao) {
      return;
    }

    const textoExibicao = texto || textoFallbackAnexo(anexoAtual);
    const mensagemOtimista: MobileMesaMessage = {
      id: Date.now(),
      laudo_id: conversa.laudoId,
      tipo: "humano_insp",
      texto: textoExibicao,
      remetente_id: session.bootstrap.usuario.id,
      data: "Agora",
      lida: true,
      resolvida_em: "",
      resolvida_em_label: "",
      resolvida_por_nome: "",
      referencia_mensagem_id: referenciaMensagemId || undefined,
      anexos: anexoAtual ? [{ label: anexoAtual.label, categoria: anexoAtual.kind }] : undefined,
    };
    const snapshotMesa = mensagensMesa;

    setMensagemMesa("");
    setAnexoMesaRascunho(null);
    setErroMesa("");
    setEnviandoMesa(true);
    setMensagensMesa((estadoAtual) => [...estadoAtual, mensagemOtimista]);

    try {
      const resposta = anexoAtual
        ? await enviarAnexoMesaMobile(session.accessToken, conversa.laudoId, {
            uri: anexoAtual.fileUri,
            nome: anexoAtual.kind === "document" ? anexoAtual.nomeDocumento : anexoAtual.label,
            mimeType: anexoAtual.mimeType,
            texto,
            referenciaMensagemId,
          })
        : await enviarMensagemMesaMobile(session.accessToken, conversa.laudoId, texto, referenciaMensagemId);
      setMensagensMesa((estadoAtual) => {
        const semOtimista = estadoAtual.filter((item) => item.id !== mensagemOtimista.id);
        return [...semOtimista, resposta.mensagem];
      });
      setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, resposta));
      limparReferenciaMesaAtiva();
      setLaudoMesaCarregado(conversa.laudoId);
      await carregarListaLaudos(session.accessToken, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível responder à mesa.";
      const podeEnfileirar = Boolean((texto.trim() || anexoAtual) && (statusApi === "offline" || erroSugereModoOffline(error)));

      setMensagensMesa(snapshotMesa);
      if (podeEnfileirar) {
        const itemFila = criarItemFilaOffline({
          channel: "mesa",
          laudoId: conversa.laudoId,
          text: texto,
          title: conversa.laudoCard?.titulo || `Laudo #${conversa.laudoId}`,
          attachment: anexoAtual,
          referenceMessageId: referenciaMensagemId,
        });
        setFilaOffline((estadoAtual) => [
          ...estadoAtual,
          itemFila,
        ]);
        void registrarEventoObservabilidade({
          kind: "offline_queue",
          name: "offline_queue_enqueue",
          ok: true,
          count: 1,
          detail: "mesa",
        });
        setErroMesa("Sem conexão estável. O envio para a mesa ficou guardado na fila local.");
        setStatusApi("offline");
      } else {
        setMensagemMesa(texto);
        setAnexoMesaRascunho(anexoAtual);
        setErroMesa(message);
      }
    } finally {
      setEnviandoMesa(false);
    }
  }

  function renderSettingsSheetBody() {
    if (!settingsSheet) {
      return null;
    }

    switch (settingsSheet.kind) {
      case "reauth":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInlineHero}>
              <Image source={TARIEL_APP_MARK} style={styles.settingsInlineHeroMark} />
              <View style={styles.settingsInlineHeroCopy}>
                <Text style={styles.settingsInlineHeroTitle}>Janela temporária de confiança</Text>
                <Text style={styles.settingsInlineHeroText}>
                  {reauthReason}
                </Text>
              </View>
            </View>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Métodos disponíveis</Text>
              <Text style={styles.settingsInfoText}>
                {provedoresConectados
                  .filter((item) => item.connected)
                  .map((item) => item.label)
                  .join(" • ") || "Conta corporativa"}
              </Text>
            </View>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Status atual</Text>
              <Text style={styles.settingsInfoText}>{formatarStatusReautenticacao(reautenticacaoExpiraEm)}</Text>
            </View>
          </View>
        );
      case "photo":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInlineHero}>
              <Image source={perfilFotoUri ? { uri: perfilFotoUri } : TARIEL_APP_MARK} style={styles.settingsInlineHeroMark} />
              <View style={styles.settingsInlineHeroCopy}>
                <Text style={styles.settingsInlineHeroTitle}>Foto de perfil do inspetor</Text>
                <Text style={styles.settingsInlineHeroText}>
                  A identidade visual do usuário aparece na conta, no histórico e nos fluxos de suporte.
                </Text>
              </View>
            </View>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Status atual</Text>
              <Text style={styles.settingsInfoText}>{perfilFotoHint}</Text>
            </View>
          </View>
        );
      case "plan":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Plano atual</Text>
              <Text style={styles.settingsInfoText}>{planoAtual}</Text>
            </View>
            <View style={styles.settingsMiniList}>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Operação em campo</Text>
                <Text style={styles.settingsMiniListMeta}>Chat, mesa, fila offline e histórico sincronizado do inspetor.</Text>
              </View>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Segurança e privacidade</Text>
                <Text style={styles.settingsMiniListMeta}>Reautenticação sensível, eventos de segurança e proteção local do dispositivo.</Text>
              </View>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Próximo passo</Text>
                <Text style={styles.settingsMiniListMeta}>Ao confirmar, o app troca para a próxima opção de plano disponível nesta conta.</Text>
              </View>
            </View>
          </View>
        );
      case "billing":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Cartão cadastrado</Text>
              <Text style={styles.settingsInfoText}>{cartaoAtual}</Text>
            </View>
            <View style={styles.settingsMiniList}>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Cobrança protegida</Text>
                <Text style={styles.settingsMiniListMeta}>O método de pagamento é apenas referenciado no app, nunca exposto por completo.</Text>
              </View>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Próxima atualização</Text>
                <Text style={styles.settingsMiniListMeta}>Ao confirmar, o app troca para a próxima forma de pagamento cadastrada neste perfil.</Text>
              </View>
            </View>
          </View>
        );
      case "email":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Email atual</Text>
              <Text style={styles.settingsInfoText}>{emailAtualConta || email || "Sem email cadastrado"}</Text>
            </View>
            <SettingsTextField
              icon="email-edit-outline"
              keyboardType="email-address"
              onChangeText={setNovoEmailDraft}
              placeholder="novoemail@empresa.com"
              title="Novo email"
              value={novoEmailDraft}
            />
          </View>
        );
      case "password":
        return (
          <View style={styles.settingsFlowStack}>
            <SettingsTextField
              icon="lock-check-outline"
              onChangeText={setSenhaAtualDraft}
              placeholder="Senha atual"
              title="Senha atual"
              value={senhaAtualDraft}
            />
            <SettingsTextField
              icon="lock-plus-outline"
              onChangeText={setNovaSenhaDraft}
              placeholder="Nova senha"
              title="Nova senha"
              value={novaSenhaDraft}
            />
            <SettingsTextField
              icon="shield-check-outline"
              onChangeText={setConfirmarSenhaDraft}
              placeholder="Confirmar nova senha"
              title="Confirmar senha"
              value={confirmarSenhaDraft}
            />
          </View>
        );
      case "payments":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Últimos lançamentos</Text>
              <View style={styles.settingsMiniList}>
                <View style={styles.settingsMiniListItem}>
                  <Text style={styles.settingsMiniListTitle}>Plano Pro • Fevereiro</Text>
                  <Text style={styles.settingsMiniListMeta}>Pago em 05/03 • Visa final 4242</Text>
                </View>
                <View style={styles.settingsMiniListItem}>
                  <Text style={styles.settingsMiniListTitle}>Plano Pro • Janeiro</Text>
                  <Text style={styles.settingsMiniListMeta}>Pago em 05/02 • Visa final 4242</Text>
                </View>
              </View>
            </View>
          </View>
        );
      case "help":
        return (
          <View style={styles.settingsFlowStack}>
            <SettingsTextField
              icon="magnify"
              onChangeText={setBuscaAjuda}
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
                <Text style={styles.settingsInfoText}>{emailAtualConta || email || "Sem email definido"}</Text>
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
                      onPress={() => handleAlternarArtigoAjuda(article.id)}
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
      case "bug":
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
              onChangeText={setBugEmailDraft}
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
                onChangeText={setBugDescriptionDraft}
                placeholder="Explique o que aconteceu, em qual tela e como reproduzir."
                placeholderTextColor={colors.textSecondary}
                style={styles.settingsTextArea}
                value={bugDescriptionDraft}
              />
            </View>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Anexo de screenshot</Text>
              <Text style={styles.settingsInfoText}>Você poderá complementar esse relato com imagem assim que o anexo for liberado nesse fluxo de suporte.</Text>
            </View>
            {ultimoTicketSuporte?.kind === "bug" ? (
              <View style={styles.settingsInfoCard}>
                <Text style={styles.settingsInfoTitle}>Último bug salvo</Text>
                <Text style={styles.settingsInfoText}>{ultimoTicketSuporte.body}</Text>
                <Text style={styles.settingsInfoSubtle}>
                  {ultimoTicketSuporte.status} • {formatarHorarioAtividade(ultimoTicketSuporte.createdAt)}
                </Text>
              </View>
            ) : null}
          </View>
        );
      case "feedback":
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
                onChangeText={setFeedbackDraft}
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
      case "privacy":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Resumo</Text>
              <Text style={styles.settingsInfoText}>
                O app guarda apenas os dados necessários para sessão, histórico, fila offline e operação do inspetor. Preferências sensíveis exigem confirmação e podem ser exportadas ou removidas conforme a política do sistema.
              </Text>
            </View>
            <View style={styles.settingsInfoGrid}>
              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                <Text style={styles.settingsInfoTitle}>Histórico</Text>
                <Text style={styles.settingsInfoText}>{salvarHistoricoConversas ? "Salvamento ativo" : "Novas conversas não serão persistidas"}</Text>
              </View>
              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                <Text style={styles.settingsInfoTitle}>Retenção</Text>
                <Text style={styles.settingsInfoText}>{retencaoDados}</Text>
              </View>
            </View>
          </View>
        );
      case "integrations":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsMiniList}>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Google Drive</Text>
                <Text style={styles.settingsMiniListMeta}>Enviar documentos e evidências para o fluxo do laudo.</Text>
              </View>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Slack</Text>
                <Text style={styles.settingsMiniListMeta}>Receber avisos de mesa, reabertura e pendências críticas.</Text>
              </View>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Notion</Text>
                <Text style={styles.settingsMiniListMeta}>Levar resumos estruturados da inspeção para a base operacional.</Text>
              </View>
            </View>
          </View>
        );
      case "plugins":
        return (
          <View style={styles.settingsFlowStack}>
            <SettingsSwitchRow
              icon="wrench-cog-outline"
              onValueChange={setUploadArquivosAtivo}
              title="Análise assistida de anexos"
              value={uploadArquivosAtivo}
            />
            <SettingsSwitchRow
              icon="text-box-search-outline"
              onValueChange={setNomeAutomaticoConversas}
              title="Títulos automáticos de conversa"
              value={nomeAutomaticoConversas}
            />
          </View>
        );
      case "updates":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoGrid}>
              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                <Text style={styles.settingsInfoTitle}>Versão instalada</Text>
                <Text style={styles.settingsInfoText}>{APP_VERSION_LABEL}</Text>
                <Text style={styles.settingsInfoSubtle}>{APP_BUILD_CHANNEL}</Text>
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
              {UPDATE_CHANGELOG.map((item) => (
                <View key={item.id} style={styles.settingsMiniListItem}>
                  <Text style={styles.settingsMiniListTitle}>{item.title}</Text>
                  <Text style={styles.settingsMiniListMeta}>{item.summary}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      case "legal":
        return (
          <View style={styles.settingsFlowStack}>
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>{settingsSheet.title}</Text>
              <Text style={styles.settingsInfoText}>
                Este conteúdo já está reservado dentro do app e será preenchido com o documento oficial na etapa de publicação e revisão jurídica.
              </Text>
            </View>
            <View style={styles.settingsMiniList}>
              <View style={styles.settingsMiniListItem}>
                <Text style={styles.settingsMiniListTitle}>Escopo atual</Text>
                <Text style={styles.settingsMiniListMeta}>Versão do inspetor com foco em operação, segurança e suporte no uso em campo.</Text>
              </View>
            </View>
          </View>
        );
    }
  }

  const conversaAtiva = conversa;
  const vendoMesa = abaAtiva === "mesa";
  const mensagensVisiveis = conversaAtiva?.mensagens || [];
  const mesaDisponivel = Boolean(conversaAtiva?.laudoId);
  const mesaTemMensagens = Boolean(mensagensMesa.length);
  const previewChatLiberado = Boolean(
    conversaAtiva && (!conversaAtiva.laudoId || (!conversaAtiva.permiteEdicao && !conversaAtiva.mensagens.length)),
  );
  const podeEditarConversa = conversaAtiva ? conversaAtiva.permiteEdicao || previewChatLiberado : true;
  const placeholderComposer = conversaAtiva?.permiteReabrir && !previewChatLiberado
    ? "Reabra o laudo para continuar."
    : conversaAtiva && !podeEditarConversa
      ? "Laudo em modo leitura."
      : anexoRascunho
        ? "Adicione contexto opcional para acompanhar o anexo..."
        : "Escreva sua mensagem de inspeção...";
  const placeholderMesa = !mesaTemMensagens
    ? "Aguardando retorno da mesa."
    : conversaAtiva?.permiteReabrir
      ? "Reabra o laudo para responder à mesa."
      : conversaAtiva && !conversaAtiva.permiteEdicao
        ? "Laudo em modo leitura."
        : "Escreva uma resposta objetiva para a mesa...";
  const podeAcionarComposer =
    podeEditarConversa && !enviandoMensagem && !carregandoConversa && !preparandoAnexo;
  const podeEnviarComposer = Boolean((mensagem.trim() || anexoRascunho) && podeAcionarComposer);
  const podeUsarComposerMesa =
    Boolean(mesaTemMensagens && conversaAtiva?.permiteEdicao) && !enviandoMesa && !carregandoMesa;
  const podeEnviarMesa = Boolean((mensagemMesa.trim() || anexoMesaRascunho) && podeUsarComposerMesa);
  const fontScale = obterEscalaFonte(tamanhoFonte);
  const densityScale = obterEscalaDensidade(densidadeInterface);
  const accentColor =
    corDestaque === "azul"
      ? "#3366FF"
      : corDestaque === "roxo"
        ? "#7C4DFF"
        : corDestaque === "personalizado"
          ? "#008F7A"
          : colors.accent;
  const podeAbrirAnexosChat = podeAcionarComposer && uploadArquivosAtivo && arquivosPermitidos;
  const podeAbrirAnexosMesa = podeUsarComposerMesa && uploadArquivosAtivo && arquivosPermitidos;
  const dynamicComposerInputStyle = {
    fontSize: 16 * fontScale,
    lineHeight: 22 * fontScale,
    minHeight: 52 * densityScale,
    paddingVertical: Math.max(10, 12 * densityScale),
  };
  const dynamicMessageTextStyle = {
    fontSize: 15 * fontScale,
    lineHeight: 24 * fontScale,
  };
  const dynamicMessageBubbleStyle = {
    paddingHorizontal: 16 * densityScale,
    paddingVertical: 14 * densityScale,
  };
  const laudoSelecionadoId = conversaAtiva?.laudoId ?? null;
  const filaOfflineOrdenada = [...filaOffline].sort((a, b) => {
    const prioridade = prioridadePendenciaOffline(a) - prioridadePendenciaOffline(b);
    if (prioridade !== 0) {
      return prioridade;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const totalFilaOfflineFalha = filaOfflineOrdenada.filter((item) => Boolean(item.lastError)).length;
  const totalFilaOfflinePronta = filaOfflineOrdenada.filter((item) => pendenciaFilaProntaParaReenvio(item)).length;
  const totalFilaOfflineEmEspera = filaOfflineOrdenada.length - totalFilaOfflinePronta - totalFilaOfflineFalha;
  const totalFilaOfflineChat = filaOfflineOrdenada.filter((item) => item.channel === "chat").length;
  const totalFilaOfflineMesa = filaOfflineOrdenada.filter((item) => item.channel === "mesa").length;
  const filtrosFilaOffline: { key: OfflineQueueFilter; label: string; count: number }[] = [
    { key: "all", label: "Tudo", count: filaOfflineOrdenada.length },
    { key: "chat", label: "Chat", count: totalFilaOfflineChat },
    { key: "mesa", label: "Mesa", count: totalFilaOfflineMesa },
  ];
  const filaOfflineFiltrada =
    filtroFilaOffline === "all"
      ? filaOfflineOrdenada
      : filaOfflineOrdenada.filter((item) => item.channel === filtroFilaOffline);
  const chipsResumoFilaOffline = [
    { key: "falha", label: "Falha", count: totalFilaOfflineFalha, tone: "danger" as const },
    { key: "pronta", label: "Prontas", count: totalFilaOfflinePronta, tone: "accent" as const },
    { key: "espera", label: "Backoff", count: totalFilaOfflineEmEspera, tone: "muted" as const },
  ].filter((item) => item.count > 0);
  const conversaVazia = !vendoMesa && !conversaAtiva?.laudoId && !(conversaAtiva?.mensagens.length);
  const termoHistorico = buscaHistorico.trim().toLowerCase();
  const historicoFiltrado = [...laudosDisponiveis]
    .sort((a, b) => new Date(b.data_iso).getTime() - new Date(a.data_iso).getTime())
    .filter((item) => {
      if (!termoHistorico) {
        return true;
      }
      const alvo = `${item.titulo} ${item.preview} ${item.status_card_label} ${item.id}`.toLowerCase();
      return alvo.includes(termoHistorico);
    });
  const nomeUsuarioExibicao = perfilExibicao.trim() || perfilNome.trim() || "Você";
  const perfilNomeCompleto = perfilNome.trim() || "Inspetor Tariel";
  const perfilExibicaoLabel = perfilExibicao.trim() || perfilNomeCompleto;
  const contaEmailLabel = emailAtualConta || email || "Sem email cadastrado";
  const provedoresConectadosTotal = provedoresConectados.filter((item) => item.connected).length;
  const provedoresDisponiveisTotal = provedoresConectados.filter((item) => !item.connected).length;
  const existeProvedorDisponivel = provedoresDisponiveisTotal > 0;
  const provedorPrimario =
    provedoresConectados.find((item) => item.connected)?.label || "Email e senha";
  const ultimoEventoProvedor =
    eventosSeguranca.find((item) => item.type === "provider")?.status || "Sem vínculo recente";
  const ultimoEventoSessao =
    eventosSeguranca.find((item) => item.type === "session" || item.type === "login")?.status || "Sem revisão recente";
  const sessaoAtual = sessoesAtivas.find((item) => item.current) || null;
  const outrasSessoesAtivas = sessoesAtivas.filter((item) => !item.current);
  const sessoesSuspeitasTotal = sessoesAtivas.filter((item) => item.suspicious).length;
  const conversasFixadasTotal = laudosDisponiveis.filter((item) => item.pinado).length;
  const conversasVisiveisTotal = laudosDisponiveis.length;
  const conversasOcultasTotal = historicoOcultoIds.length;
  const agoraReferenciaHistorico = Date.now();
  const totalHistoricoRecentes = laudosDisponiveis.filter((item) => {
    const timestamp = new Date(item.data_iso).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    return agoraReferenciaHistorico - timestamp <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const historicoBase = historicoFiltrado.filter((item) => {
    if (filtroHistorico === "fixadas") {
      return item.pinado;
    }
    if (filtroHistorico === "recentes") {
      const timestamp = new Date(item.data_iso).getTime();
      return !Number.isNaN(timestamp) && agoraReferenciaHistorico - timestamp <= 7 * 24 * 60 * 60 * 1000;
    }
    return true;
  });
  const historicoAgrupadoFinal = buildHistorySections(
    fixarConversas
      ? [...historicoBase].sort((a, b) => Number(b.pinado) - Number(a.pinado))
      : historicoBase,
  );
  const filtrosHistoricoComContagem = HISTORY_DRAWER_FILTERS.map((item) => ({
    ...item,
    count:
      item.key === "fixadas"
        ? conversasFixadasTotal
        : item.key === "recentes"
          ? totalHistoricoRecentes
          : conversasVisiveisTotal,
  }));
  const resumoHistoricoDrawer = filtroHistorico === "fixadas"
    ? `${conversasFixadasTotal} conversa${conversasFixadasTotal === 1 ? "" : "s"} fixada${conversasFixadasTotal === 1 ? "" : "s"}`
    : filtroHistorico === "recentes"
      ? `${totalHistoricoRecentes} conversa${totalHistoricoRecentes === 1 ? "" : "s"} recente${totalHistoricoRecentes === 1 ? "" : "s"}`
      : `${conversasVisiveisTotal} conversa${conversasVisiveisTotal === 1 ? "" : "s"} visíve${conversasVisiveisTotal === 1 ? "l" : "is"}`;
  const historicoVazioTitulo = buscaHistorico.trim()
    ? "Nada encontrado"
    : filtroHistorico === "fixadas"
      ? "Nenhuma conversa fixada"
      : filtroHistorico === "recentes"
        ? "Sem conversas recentes"
        : "Histórico vazio";
  const historicoVazioTexto = buscaHistorico.trim()
    ? "Tente outro termo ou limpe a busca para ver mais laudos."
    : filtroHistorico === "fixadas"
      ? "Fixe laudos importantes para encontrá-los mais rápido aqui."
      : filtroHistorico === "recentes"
        ? "Assim que novas inspeções forem abertas, elas aparecem nesta faixa."
        : "Inicie um novo laudo para o histórico começar a aparecer aqui.";
  const tipoTemplateAtivoLabel = formatarTipoTemplateLaudo(conversaAtiva?.laudoCard?.tipo_template);
  const resumoMetodosConta =
    provedoresConectadosTotal > 0
      ? `${provedoresConectadosTotal} método${provedoresConectadosTotal > 1 ? "s" : ""} conectado${provedoresConectadosTotal > 1 ? "s" : ""}`
      : "Somente credencial principal";
  const resumoAlertaMetodosConta =
    provedoresConectadosTotal <= 1
      ? "Cadastre outro método antes de remover o acesso atual."
      : `${provedoresDisponiveisTotal} provedor(es) ainda podem ser vinculados a esta conta.`;
  const resumoSessaoAtual = sessaoAtual
    ? `${sessaoAtual.title} • ${sessaoAtual.location}`
    : "Nenhuma sessão ativa identificada";
  const resumoBlindagemSessoes = sessoesSuspeitasTotal
    ? `${sessoesSuspeitasTotal} sessão(ões) marcadas como suspeitas pedem revisão imediata.`
    : "Nenhuma sessão suspeita no momento. O acesso está consistente entre os dispositivos.";
  const resumoDadosConversas = salvarHistoricoConversas
    ? `${conversasVisiveisTotal} conversa${conversasVisiveisTotal === 1 ? "" : "s"} visíve${conversasVisiveisTotal === 1 ? "l" : "is"} • ${conversasFixadasTotal} fixada${conversasFixadasTotal === 1 ? "" : "s"}`
    : "Histórico desativado para novas conversas";
  const resumo2FAStatus = twoFactorEnabled ? `${twoFactorMethod} ativo` : "Proteção adicional desativada";
  const resumo2FAFootnote = twoFactorEnabled
    ? `A conta exige ${twoFactorMethod} para ações sensíveis e logins protegidos.`
    : "Ative o 2FA para elevar a proteção da conta e reduzir risco de acesso indevido.";
  const resumoCodigosRecuperacao = recoveryCodesEnabled
    ? codigosRecuperacao.length
      ? `${codigosRecuperacao.length} códigos gerados`
      : "Pronto para gerar códigos"
    : "Códigos desativados";
  const permissoesNegadasTotal = [
    microfonePermitido,
    cameraPermitida,
    arquivosPermitidos,
    notificacoesPermitidas,
    biometriaPermitida,
  ].filter((item) => !item).length;
  const permissoesAtivasTotal = [
    microfonePermitido,
    cameraPermitida,
    arquivosPermitidos,
    notificacoesPermitidas,
    biometriaPermitida,
  ].filter(Boolean).length;
  const resumoPermissoes = `${permissoesAtivasTotal} de 5 permissões liberadas`;
  const resumoPermissoesCriticas = permissoesNegadasTotal
    ? `${permissoesNegadasTotal} permissão(ões) ainda precisam de revisão`
    : "Todas as permissões principais já estão liberadas";
  const resumoPrivacidadeNotificacoes = mostrarSomenteNovaMensagem
    ? 'Somente "Nova mensagem" aparece nas notificações.'
    : ocultarConteudoBloqueado
      ? "Prévia bloqueada na tela bloqueada."
      : mostrarConteudoNotificacao
        ? "Prévia completa habilitada quando o sistema permitir."
        : "Notificações com prévia reduzida.";
  const previewPrivacidadeNotificacao = mostrarSomenteNovaMensagem
    ? "Tariel.ia • Nova mensagem"
    : !mostrarConteudoNotificacao || ocultarConteudoBloqueado
      ? "Tariel.ia • Mensagem protegida"
      : "Tariel.ia • Laudo 204 precisa de revisão da mesa";
  const resumoExcluirConta = `${sessoesAtivas.length} sessões serão invalidadas • ${conversasVisiveisTotal} conversas visíveis nesta conta`;
  const resumoSuporteApp = `${APP_VERSION_LABEL} • ${APP_BUILD_CHANNEL}`;
  const ultimaVerificacaoAtualizacaoLabel = ultimaVerificacaoAtualizacao
    ? formatarHorarioAtividade(ultimaVerificacaoAtualizacao)
    : "Nunca verificado";
  const resumoAtualizacaoApp = ultimaVerificacaoAtualizacao
    ? `${ultimaVerificacaoAtualizacaoLabel} • ${statusAtualizacaoApp}`
    : statusAtualizacaoApp;
  const artigosAjudaFiltrados = HELP_CENTER_ARTICLES.filter((article) => {
    const termo = buscaAjuda.trim().toLowerCase();
    if (!termo) {
      return true;
    }
    const alvo = `${article.title} ${article.category} ${article.summary} ${article.body}`.toLowerCase();
    return alvo.includes(termo);
  });
  const ultimoTicketSuporte = filaSuporteLocal[0] || null;
  const ticketsBugTotal = filaSuporteLocal.filter((item) => item.kind === "bug").length;
  const ticketsFeedbackTotal = filaSuporteLocal.filter((item) => item.kind === "feedback").length;
  const resumoFilaSuporteLocal = filaSuporteLocal.length
    ? `${filaSuporteLocal.length} item(ns) locais • ${ticketsBugTotal} bug(s) • ${ticketsFeedbackTotal} feedback(s)`
    : "Sem itens na fila local";
  const temPrioridadesConfiguracao =
    !twoFactorEnabled ||
    provedoresConectadosTotal <= 1 ||
    permissoesNegadasTotal > 0 ||
    sessoesSuspeitasTotal > 0;
  const eventosSegurancaFiltrados = eventosSeguranca.filter((item) => {
    if (filtroEventosSeguranca === "todos") {
      return true;
    }
    if (filtroEventosSeguranca === "críticos") {
      return item.critical;
    }
    return item.type === "login" || item.type === "session";
  });
  const resumoFilaOffline =
    !filaOfflineOrdenada.length
      ? ""
      : filaOfflineOrdenada.length === 1
        ? `1 envio pendente${statusApi === "offline" ? " aguardando conexão" : totalFilaOfflinePronta ? " pronto para reenviar" : " em backoff"}`
        : `${filaOfflineOrdenada.length} envios pendentes${statusApi === "offline" ? " aguardando conexão" : totalFilaOfflineFalha ? ` (${totalFilaOfflineFalha} com falha)` : totalFilaOfflineEmEspera && totalFilaOfflinePronta ? ` (${totalFilaOfflinePronta} prontos, ${totalFilaOfflineEmEspera} em backoff)` : totalFilaOfflinePronta ? " prontos para reenviar" : " em backoff"}`;
  const resumoFilaOfflineFiltrada =
    filtroFilaOffline === "all"
      ? resumoFilaOffline
      : filaOfflineFiltrada.length
        ? `${filaOfflineFiltrada.length} pendência${filaOfflineFiltrada.length > 1 ? "s" : ""} ${filaOfflineFiltrada.length > 1 ? "visíveis" : "visível"} em ${filtroFilaOffline === "chat" ? "Chat" : "Mesa"}`
        : `Nenhuma pendência em ${filtroFilaOffline === "chat" ? "Chat" : "Mesa"}`;
  const podeSincronizarFilaOffline = statusApi === "online" && totalFilaOfflinePronta > 0;
  const notificacoesNaoLidas = notificacoes.filter((item) => item.unread).length;
  const buscaConfiguracoesNormalizada = normalizarTextoBusca(buscaConfiguracoes);
  const catalogoSecoesConfiguracao = [
    { key: "prioridades", group: "prioridades", terms: ["acoes prioritarias 2fa metodo de acesso permissoes criticas sessoes suspeitas atualizacoes"] },
    { key: "conta", group: "acesso", terms: [`conta perfil email senha plano assinatura pagamento logout excluir ${perfilNomeCompleto} ${contaEmailLabel}`] },
    { key: "preferenciasIa", group: "experiencia", terms: [`preferencias ia modelo estilo resposta idioma memoria aprendizado tom temperatura ${modeloIa} ${estiloResposta} ${idiomaResposta}`] },
    { key: "aparencia", group: "experiencia", terms: [`aparencia tema fonte densidade cor destaque animacoes ${temaApp} ${tamanhoFonte} ${densidadeInterface} ${corDestaque}`] },
    { key: "notificacoes", group: "experiencia", terms: [`notificacoes push respostas som vibracao emails ${somNotificacao}`] },
    { key: "contasConectadas", group: "seguranca", terms: [`contas conectadas google apple microsoft metodo principal vinculo provedor ${provedorPrimario}`] },
    { key: "sessoes", group: "seguranca", terms: [`sessoes dispositivos login atividade suspeita revisar encerrar ${resumoSessaoAtual} ${resumoBlindagemSessoes}`] },
    { key: "twofa", group: "seguranca", terms: [`verificacao em duas etapas 2fa autenticador email codigos recuperacao ${resumo2FAStatus}`] },
    { key: "protecaoDispositivo", group: "seguranca", terms: [`protecao no dispositivo biometria bloqueio local multitarefa ${lockTimeout}`] },
    { key: "verificacaoIdentidade", group: "seguranca", terms: [`verificacao de identidade reautenticacao acoes sensiveis ${reautenticacaoStatus}`] },
    { key: "atividadeSeguranca", group: "seguranca", terms: [`atividade de seguranca eventos logins provedores 2fa exportacao historico ${eventosSeguranca.length}`] },
    { key: "dadosConversas", group: "seguranca", terms: [`dados e conversas historico exportar apagar retencao backup sincronizacao ${resumoDadosConversas}`] },
    { key: "permissoes", group: "seguranca", terms: [`permissoes microfone camera arquivos notificacoes biometria ${resumoPermissoes}`] },
    { key: "segurancaArquivos", group: "seguranca", terms: ["seguranca de arquivos upload pdf imagem docx urls assinadas validacao tamanho"] },
    { key: "privacidadeNotificacoes", group: "seguranca", terms: [`privacidade em notificacoes previa tela bloqueada nova mensagem ${resumoPrivacidadeNotificacoes}`] },
    { key: "excluirConta", group: "seguranca", terms: [`excluir conta apagamento remocao permanente exportar dados ${resumoExcluirConta}`] },
    { key: "recursosAvancados", group: "sistema", terms: ["recursos avancados voz plugins integracoes google drive slack notion upload arquivos"] },
    { key: "sistema", group: "sistema", terms: [`sistema idioma regiao bateria versao atualizacoes atividade fila offline ${APP_VERSION_LABEL} ${APP_BUILD_CHANNEL}`] },
    { key: "suporte", group: "sistema", terms: [`suporte ajuda feedback bug licencas termos diagnostico atualizacoes ${resumoFilaSuporteLocal}`] },
  ] as const;
  const secoesConfiguracaoVisiveis = catalogoSecoesConfiguracao.filter((section) => {
    if (filtroConfiguracoes !== "todos" && filtroConfiguracoes !== section.group) {
      return false;
    }
    if (!buscaConfiguracoesNormalizada) {
      return true;
    }
    const alvo = normalizarTextoBusca(section.terms.join(" "));
    return alvo.includes(buscaConfiguracoesNormalizada);
  });
  const secoesConfiguracaoVisiveisSet = new Set(secoesConfiguracaoVisiveis.map((item) => item.key));
  const mostrarSecaoConfiguracao = (key: (typeof catalogoSecoesConfiguracao)[number]["key"]) =>
    secoesConfiguracaoVisiveisSet.has(key);
  const mostrarGrupoContaAcesso = mostrarSecaoConfiguracao("conta");
  const mostrarGrupoExperiencia =
    mostrarSecaoConfiguracao("preferenciasIa") ||
    mostrarSecaoConfiguracao("aparencia") ||
    mostrarSecaoConfiguracao("notificacoes");
  const mostrarGrupoSeguranca =
    mostrarSecaoConfiguracao("contasConectadas") ||
    mostrarSecaoConfiguracao("sessoes") ||
    mostrarSecaoConfiguracao("twofa") ||
    mostrarSecaoConfiguracao("protecaoDispositivo") ||
    mostrarSecaoConfiguracao("verificacaoIdentidade") ||
    mostrarSecaoConfiguracao("atividadeSeguranca") ||
    mostrarSecaoConfiguracao("dadosConversas") ||
    mostrarSecaoConfiguracao("permissoes") ||
    mostrarSecaoConfiguracao("segurancaArquivos") ||
    mostrarSecaoConfiguracao("privacidadeNotificacoes") ||
    mostrarSecaoConfiguracao("excluirConta");
  const mostrarGrupoSistema =
    mostrarSecaoConfiguracao("recursosAvancados") ||
    mostrarSecaoConfiguracao("sistema") ||
    mostrarSecaoConfiguracao("suporte");
  const totalSecoesConfiguracaoVisiveis = secoesConfiguracaoVisiveis.length;
  const totalSecoesContaAcesso = secoesConfiguracaoVisiveis.filter((item) => item.group === "acesso").length;
  const totalSecoesExperiencia = secoesConfiguracaoVisiveis.filter((item) => item.group === "experiencia").length;
  const totalSecoesSeguranca = secoesConfiguracaoVisiveis.filter((item) => item.group === "seguranca").length;
  const totalSecoesSistema = secoesConfiguracaoVisiveis.filter((item) => item.group === "sistema").length;
  const totalPrioridadesAbertas = [
    !twoFactorEnabled,
    provedoresConectadosTotal <= 1,
    permissoesNegadasTotal > 0,
    sessoesSuspeitasTotal > 0,
    true,
  ].filter(Boolean).length;
  const resumoBuscaConfiguracoes = !buscaConfiguracoesNormalizada && filtroConfiguracoes === "todos"
    ? ""
    : totalSecoesConfiguracaoVisiveis
      ? `${totalSecoesConfiguracaoVisiveis} bloco${totalSecoesConfiguracaoVisiveis > 1 ? "s" : ""} correspondente${totalSecoesConfiguracaoVisiveis > 1 ? "s" : ""}`
      : "Nenhum bloco encontrado";
  const settingsDrawerInOverview = settingsDrawerPage === "overview";
  const settingsDrawerShowingSearchResults = settingsDrawerInOverview && Boolean(buscaConfiguracoesNormalizada);
  const settingsDrawerShowingOverviewCards = settingsDrawerInOverview && !settingsDrawerShowingSearchResults;
  const keyboardVisible = keyboardHeight > 0;
  const keyboardAvoidingBehavior = Platform.OS === "ios" ? "padding" : undefined;
  const loginKeyboardVerticalOffset = Platform.OS === "ios" ? 18 : 0;
  const chatKeyboardVerticalOffset = Platform.OS === "ios" ? 8 : 0;
  const loginKeyboardBottomPadding =
    Platform.OS === "android" && keyboardVisible
      ? Math.max(spacing.xxl, keyboardHeight + spacing.xl)
      : keyboardVisible
        ? spacing.xl
        : spacing.xxl;
  const composerKeyboardBottomOffset =
    Platform.OS === "android" && keyboardVisible
      ? Math.max(spacing.sm, keyboardHeight + spacing.xs)
      : 0;
  const threadKeyboardPaddingBottom = keyboardVisible ? Math.max(220, keyboardHeight + 72) : spacing.md;
  const settingsDrawerMatchesPage = (page: Exclude<SettingsDrawerPage, "overview">) =>
    settingsDrawerPage === page || settingsDrawerShowingSearchResults;
  const settingsDrawerSectionMeta: Record<
    SettingsSectionKey,
    { title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
  > = {
    prioridades: {
      title: "Ações prioritárias",
      subtitle: "O que merece atenção primeiro nesta conta do inspetor.",
      icon: "flash-outline",
    },
    conta: {
      title: "Conta",
      subtitle: "Informações da conta e assinatura do inspetor.",
      icon: "account-circle-outline",
    },
    preferenciasIa: {
      title: "Preferências da IA",
      subtitle: "Escolha modelo, idioma, tom e nível de criatividade.",
      icon: "robot-outline",
    },
    aparencia: {
      title: "Aparência",
      subtitle: "Tema, densidade, fonte e cor de destaque do aplicativo.",
      icon: "palette-outline",
    },
    notificacoes: {
      title: "Notificações",
      subtitle: "Alertas, push, som, vibração e emails.",
      icon: "bell-outline",
    },
    contasConectadas: {
      title: "Contas conectadas",
      subtitle: "Google, Apple e Microsoft vinculados ao acesso.",
      icon: "account-outline",
    },
    sessoes: {
      title: "Sessões e dispositivos",
      subtitle: "Dispositivos ativos, atividade suspeita e logout remoto.",
      icon: "devices",
    },
    twofa: {
      title: "Verificação em duas etapas",
      subtitle: "2FA, método preferido e códigos de recuperação.",
      icon: "shield-key-outline",
    },
    protecaoDispositivo: {
      title: "Proteção no dispositivo",
      subtitle: "Biometria, bloqueio local e proteção em multitarefa.",
      icon: "cellphone-lock",
    },
    verificacaoIdentidade: {
      title: "Verificação de identidade",
      subtitle: "Reautenticação para ações sensíveis no app.",
      icon: "shield-account-outline",
    },
    atividadeSeguranca: {
      title: "Atividade de segurança",
      subtitle: "Eventos críticos, logins e ações sensíveis recentes.",
      icon: "history",
    },
    dadosConversas: {
      title: "Dados e conversas",
      subtitle: "Histórico, retenção, exportação e exclusão de conversas.",
      icon: "database-outline",
    },
    permissoes: {
      title: "Permissões",
      subtitle: "Câmera, arquivos, microfone, notificações e biometria.",
      icon: "shield-sync-outline",
    },
    segurancaArquivos: {
      title: "Segurança de arquivos enviados",
      subtitle: "Formatos, limites, validação e proteção dos uploads.",
      icon: "file-lock-outline",
    },
    privacidadeNotificacoes: {
      title: "Privacidade em notificações",
      subtitle: "Controle o quanto aparece das mensagens nas prévias.",
      icon: "bell-cog-outline",
    },
    excluirConta: {
      title: "Excluir conta",
      subtitle: "Área crítica para remoção permanente da conta.",
      icon: "alert-outline",
    },
    recursosAvancados: {
      title: "Recursos avançados",
      subtitle: "Entrada por voz, integrações e plugins do app.",
      icon: "flask-outline",
    },
    sistema: {
      title: "Sistema",
      subtitle: "Idioma, região, bateria, versão e manutenção do app.",
      icon: "cellphone-cog",
    },
    suporte: {
      title: "Suporte",
      subtitle: "Ajuda, feedback, diagnóstico e documentos do aplicativo.",
      icon: "lifebuoy",
    },
  };
  const settingsDrawerPageMeta: Record<
    Exclude<SettingsDrawerPage, "overview">,
    { title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; sections: SettingsSectionKey[] }
  > = {
    prioridades: {
      title: "Ações prioritárias",
      subtitle: "O que merece atenção primeiro nesta conta do inspetor.",
      icon: "flash-outline",
      sections: ["prioridades"],
    },
    contaAcesso: {
      title: "Conta e acesso",
      subtitle: "Perfil, assinatura, email, senha e métodos de acesso da conta.",
      icon: "account-circle-outline",
      sections: ["conta"],
    },
    experiencia: {
      title: "Experiência do app",
      subtitle: "Preferências da IA, aparência e notificações do aplicativo.",
      icon: "palette-outline",
      sections: ["preferenciasIa", "aparencia", "notificacoes"],
    },
    seguranca: {
      title: "Segurança e privacidade",
      subtitle: "Sessões, 2FA, permissões, dados e proteção do dispositivo.",
      icon: "shield-lock-outline",
      sections: [
        "contasConectadas",
        "sessoes",
        "twofa",
        "protecaoDispositivo",
        "verificacaoIdentidade",
        "atividadeSeguranca",
        "dadosConversas",
        "permissoes",
        "segurancaArquivos",
        "privacidadeNotificacoes",
        "excluirConta",
      ],
    },
    sistemaSuporte: {
      title: "Sistema e suporte",
      subtitle: "Recursos avançados, manutenção do app e canais de ajuda.",
      icon: "cellphone-cog",
      sections: ["recursosAvancados", "sistema", "suporte"],
    },
  };
  const settingsDrawerPageSections = settingsDrawerInOverview
    ? []
    : settingsDrawerPageMeta[settingsDrawerPage].sections.filter((item) => mostrarSecaoConfiguracao(item));
  const settingsDrawerSectionMenuAtiva =
    !settingsDrawerInOverview && settingsDrawerSection === "all" && settingsDrawerPageSections.length > 1;
  const settingsDrawerCurrentSectionMeta =
    !settingsDrawerInOverview && settingsDrawerSection !== "all"
      ? settingsDrawerSectionMeta[settingsDrawerSection]
      : null;
  const settingsDrawerTitle = settingsDrawerInOverview
    ? "Configurações"
    : settingsDrawerCurrentSectionMeta
      ? settingsDrawerCurrentSectionMeta.title
      : settingsDrawerPageMeta[settingsDrawerPage].title;
  const settingsDrawerSubtitle = settingsDrawerInOverview
    ? "Ajuste o app e acesse as ações rápidas do inspetor em um só lugar."
    : settingsDrawerCurrentSectionMeta
      ? settingsDrawerCurrentSectionMeta.subtitle
      : settingsDrawerPageMeta[settingsDrawerPage].subtitle;
  const settingsDrawerMatchesSection = (page: Exclude<SettingsDrawerPage, "overview">, section: SettingsSectionKey) =>
    settingsDrawerMatchesPage(page) &&
    mostrarSecaoConfiguracao(section) &&
    !settingsDrawerSectionMenuAtiva &&
    (settingsDrawerSection === "all" || settingsDrawerSection === section);
  const notificacoesMesaLaudoAtual = notificacoes.filter(
    (item) => item.unread && item.targetThread === "mesa" && item.laudoId === laudoSelecionadoId,
  ).length;
  const ultimaNotificacao = notificacoes[0] || null;
  const algumPainelLateralAberto = historicoAberto || configuracoesAberta;
  const statusVisualLaudo = mapearStatusLaudoVisual(conversaAtiva?.laudoCard?.status_card || conversaAtiva?.statusCard || "aberto");
  const laudoContextTitle = conversaAtiva?.laudoCard?.titulo || (conversaAtiva?.laudoId ? `Laudo #${conversaAtiva.laudoId}` : "Nova inspeção");
  const laudoContextDescription = vendoMesa
    ? !mesaDisponivel
      ? "A mesa é habilitada quando existir um laudo ativo para análise."
      : mesaTemMensagens
        ? conversaAtiva?.permiteEdicao
          ? "Responda de forma objetiva e mantenha aqui somente os retornos técnicos da avaliação."
          : "Acompanhe os retornos técnicos da mesa enquanto o laudo estiver em modo leitura."
        : "Quando a mesa enviar um retorno técnico, ele aparece aqui sem misturar com o chat principal."
    : conversaAtiva?.laudoId
      ? conversaAtiva?.permiteReabrir
        ? "O laudo está em modo leitura. Reabra quando precisar complementar evidências ou contexto."
        : "Descreva local, achado e impacto. A Tariel organiza o registro enquanto você segue em campo."
      : "Comece pelo local e pelo achado principal. A primeira mensagem já abre a nova inspeção.";
  const threadSpotlight = vendoMesa
    ? !mesaDisponivel
      ? { label: "Sem laudo", tone: "muted" as const, icon: "clipboard-clock-outline" as const }
      : mesaTemMensagens
        ? conversaAtiva?.permiteEdicao
          ? { label: "Mesa ativa", tone: "accent" as const, icon: "message-reply-text-outline" as const }
          : { label: "Modo leitura", tone: "muted" as const, icon: "lock-outline" as const }
        : { label: "Sem retorno", tone: "muted" as const, icon: "clock-outline" as const }
    : conversaAtiva?.laudoId
      ? conversaAtiva?.permiteReabrir
        ? { label: "Modo leitura", tone: "muted" as const, icon: "lock-outline" as const }
        : { label: "Laudo ativo", tone: "success" as const, icon: "check-decagram-outline" as const }
      : { label: "Nova inspeção", tone: "success" as const, icon: "plus-circle-outline" as const };
  const mostrarContextoThread = vendoMesa || Boolean(conversaAtiva?.laudoId) || Boolean(resumoFilaOffline);
  const chipsContextoThread = filtrarThreadContextChips(
    vendoMesa
      ? [
          mesaDisponivel
            ? {
                key: "status",
                label: conversaAtiva?.laudoCard?.status_card_label || "Mesa ativa",
                tone: "accent" as const,
                icon: "clipboard-text-outline" as const,
              }
            : null,
          mesaTemMensagens
            ? {
                key: "mensagens",
                label: `${mensagensMesa.length} retorno${mensagensMesa.length === 1 ? "" : "s"}`,
                tone: "muted" as const,
                icon: "message-reply-text-outline" as const,
              }
            : {
                key: "aguardando",
                label: "Aguardando retorno",
                tone: "muted" as const,
                icon: "clock-outline" as const,
              },
          mesaDisponivel
            ? {
                key: "template",
                label: tipoTemplateAtivoLabel,
                tone: "muted" as const,
                icon: "shape-outline" as const,
              }
            : null,
          mesaDisponivel
            ? {
                key: "modo",
                label: conversaAtiva?.permiteEdicao ? "Resposta liberada" : "Modo leitura",
                tone: conversaAtiva?.permiteEdicao ? ("success" as const) : ("muted" as const),
                icon: conversaAtiva?.permiteEdicao ? ("pencil-outline" as const) : ("lock-outline" as const),
              }
            : null,
          notificacoesMesaLaudoAtual
            ? {
                key: "naolidas",
                label: `${notificacoesMesaLaudoAtual} nova${notificacoesMesaLaudoAtual === 1 ? "" : "s"}`,
                tone: "danger" as const,
                icon: "bell-ring-outline" as const,
              }
            : null,
        ]
      : [
          conversaAtiva?.laudoId
            ? {
                key: "status",
                label: conversaAtiva?.laudoCard?.status_card_label || "Em andamento",
                tone: "accent" as const,
                icon: "file-document-edit-outline" as const,
              }
            : {
                key: "nova",
                label: "Pronta para iniciar",
                tone: "success" as const,
                icon: "plus-circle-outline" as const,
              },
          conversaAtiva?.laudoId
            ? {
                key: "template",
                label: tipoTemplateAtivoLabel,
                tone: "muted" as const,
                icon: "shape-outline" as const,
              }
            : null,
          conversaAtiva?.permiteReabrir
            ? {
                key: "reabrir",
                label: "Reabra para editar",
                tone: "danger" as const,
                icon: "history" as const,
              }
            : null,
          resumoFilaOffline
            ? {
                key: "offline",
                label: resumoFilaOffline,
                tone: statusApi === "offline" ? "danger" as const : "muted" as const,
                icon: statusApi === "offline" ? "cloud-off-outline" as const : "cloud-upload-outline" as const,
              }
            : null,
        ],
  );
  const threadInsights = conversaAtiva?.laudoCard
    ? vendoMesa
      ? [
          {
            key: "status",
            label: "Status",
            value: conversaAtiva.laudoCard.status_card_label,
            detail: conversaAtiva.permiteEdicao ? "Resposta liberada no app" : "Acompanhamento em modo leitura",
            tone: statusVisualLaudo.tone,
            icon: statusVisualLaudo.icon,
          },
          {
            key: "retornos",
            label: "Mesa",
            value: mesaTemMensagens ? `${mensagensMesa.length} retorno${mensagensMesa.length === 1 ? "" : "s"}` : "Sem retorno",
            detail: mesaTemMensagens ? "Use esta aba só para tratativas da avaliação." : "Os pedidos da engenharia aparecem aqui.",
            tone: mesaTemMensagens ? ("accent" as const) : ("muted" as const),
            icon: mesaTemMensagens ? ("message-reply-text-outline" as const) : ("clock-outline" as const),
          },
        ]
      : [
          {
            key: "status",
            label: "Status",
            value: conversaAtiva.laudoCard.status_card_label,
            detail: conversaAtiva.permiteReabrir ? "Reabra quando precisar complementar." : "Fluxo ativo do inspetor.",
            tone: statusVisualLaudo.tone,
            icon: statusVisualLaudo.icon,
          },
          {
            key: "ultima",
            label: "Última atividade",
            value: conversaAtiva.laudoCard.hora_br || conversaAtiva.laudoCard.data_br,
            detail: [conversaAtiva.laudoCard.data_br, conversaAtiva.laudoCard.tipo_template].filter(Boolean).join(" • "),
            tone: "muted" as const,
            icon: "calendar-clock-outline" as const,
          },
        ]
    : [];

  if (session) {
    return (
      <LinearGradient colors={[colors.surfaceSoft, colors.surface]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={keyboardAvoidingBehavior}
            keyboardVerticalOffset={chatKeyboardVerticalOffset}
          >
            <View style={styles.chatLayout}>
              <View style={styles.chatHeader}>
                <View style={styles.cleanHeaderTopRow}>
                  <Pressable
                    hitSlop={12}
                    onPress={handleAbrirHistorico}
                    style={styles.cleanNavButton}
                    testID="open-history-button"
                  >
                    <MaterialCommunityIcons name="history" size={22} color={colors.textPrimary} />
                  </Pressable>
                  <View style={styles.cleanHeaderSpacer} />
                  <Pressable
                    hitSlop={12}
                    onPress={handleAbrirConfiguracoes}
                    style={styles.cleanNavButton}
                    testID="open-settings-button"
                  >
                    <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textPrimary} />
                    {(notificacoesNaoLidas || filaOfflineOrdenada.length) ? (
                      <View style={styles.cleanNavBadge}>
                        <Text style={styles.cleanNavBadgeText}>
                          {Math.min(notificacoesNaoLidas + filaOfflineOrdenada.length, 9)}
                          {notificacoesNaoLidas + filaOfflineOrdenada.length > 9 ? "+" : ""}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>

              </View>

              <View style={[styles.chatPanel, keyboardVisible ? styles.chatPanelKeyboardVisible : null]}>
                <View style={styles.cleanTabShell}>
                  <View style={styles.threadTabs}>
                    <Pressable
                      onPress={() => setAbaAtiva("chat")}
                      style={[styles.threadTab, !vendoMesa ? styles.threadTabActive : null]}
                      testID="chat-tab-button"
                    >
                      <MaterialCommunityIcons
                        name="message-processing-outline"
                        size={16}
                        color={!vendoMesa ? colors.white : colors.textSecondary}
                      />
                      <Text style={[styles.threadTabText, !vendoMesa ? styles.threadTabTextActive : null]}>
                        Chat
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setAbaAtiva("mesa")}
                      style={[styles.threadTab, vendoMesa ? styles.threadTabActive : null]}
                      testID="mesa-tab-button"
                    >
                      <MaterialCommunityIcons
                        name="clipboard-text-outline"
                        size={16}
                        color={vendoMesa ? colors.white : colors.textSecondary}
                      />
                      <Text style={[styles.threadTabText, vendoMesa ? styles.threadTabTextActive : null]}>
                        Mesa
                      </Text>
                      {notificacoesMesaLaudoAtual ? (
                        <View style={[styles.threadTabBadge, vendoMesa ? styles.threadTabBadgeActive : null]}>
                          <Text style={[styles.threadTabBadgeText, vendoMesa ? styles.threadTabBadgeTextActive : null]}>
                            {notificacoesMesaLaudoAtual > 9 ? "9+" : notificacoesMesaLaudoAtual}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                </View>

                {!!erroLaudos && <Text style={styles.errorText}>{erroLaudos}</Text>}

                {!!erroConversa && <Text style={styles.errorText}>{erroConversa}</Text>}

                <View style={[styles.threadBody, keyboardVisible ? styles.threadBodyKeyboardVisible : null]}>
                  {mostrarContextoThread ? (
                    <View style={styles.threadHeaderCard}>
                      <View style={styles.threadHeaderTop}>
                        <View style={styles.threadHeaderCopy}>
                          <Text style={styles.threadEyebrow}>{vendoMesa ? "mesa avaliadora" : "chat do inspetor"}</Text>
                          <Text style={styles.threadTitle}>{laudoContextTitle}</Text>
                          <Text style={styles.threadDescription}>{laudoContextDescription}</Text>
                        </View>
                        <View
                          style={[
                            styles.threadSpotlightBadge,
                            threadSpotlight.tone === "accent"
                              ? styles.threadSpotlightBadgeAccent
                              : threadSpotlight.tone === "success"
                                ? styles.threadSpotlightBadgeSuccess
                                : null,
                          ]}
                        >
                          <MaterialCommunityIcons
                            color={
                              threadSpotlight.tone === "accent"
                                ? colors.accent
                                : threadSpotlight.tone === "success"
                                  ? colors.success
                                  : colors.textSecondary
                            }
                            name={threadSpotlight.icon}
                            size={14}
                          />
                          <Text
                            style={[
                              styles.threadSpotlightText,
                              threadSpotlight.tone === "accent"
                                ? styles.threadSpotlightTextAccent
                                : threadSpotlight.tone === "success"
                                  ? styles.threadSpotlightTextSuccess
                                  : null,
                            ]}
                          >
                            {threadSpotlight.label}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.threadContextChips}>
                        {chipsContextoThread.map((item) => (
                          <View
                            key={item.key}
                            style={[
                              styles.threadContextChip,
                              item.tone === "accent"
                                ? styles.threadContextChipAccent
                                : item.tone === "success"
                                  ? styles.threadContextChipSuccess
                                  : item.tone === "danger"
                                    ? styles.threadContextChipDanger
                                    : null,
                            ]}
                          >
                            <MaterialCommunityIcons
                              color={
                                item.tone === "accent"
                                  ? colors.accent
                                  : item.tone === "success"
                                    ? colors.success
                                    : item.tone === "danger"
                                      ? colors.danger
                                      : colors.textSecondary
                              }
                              name={item.icon}
                              size={14}
                            />
                            <Text
                              style={[
                                styles.threadContextChipText,
                                item.tone === "accent"
                                  ? styles.threadContextChipTextAccent
                                  : item.tone === "success"
                                    ? styles.threadContextChipTextSuccess
                                    : item.tone === "danger"
                                      ? styles.threadContextChipTextDanger
                                      : null,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                      {threadInsights.length ? (
                        <View style={styles.threadInsightGrid}>
                          {threadInsights.map((item) => (
                            <View
                              key={item.key}
                              style={[
                                styles.threadInsightCard,
                                item.tone === "accent"
                                  ? styles.threadInsightCardAccent
                                  : item.tone === "success"
                                    ? styles.threadInsightCardSuccess
                                    : item.tone === "danger"
                                      ? styles.threadInsightCardDanger
                                      : null,
                              ]}
                            >
                              <View
                                style={[
                                  styles.threadInsightIcon,
                                  item.tone === "accent"
                                    ? styles.threadInsightIconAccent
                                    : item.tone === "success"
                                      ? styles.threadInsightIconSuccess
                                      : item.tone === "danger"
                                        ? styles.threadInsightIconDanger
                                        : null,
                                ]}
                              >
                                <MaterialCommunityIcons
                                  color={
                                    item.tone === "accent"
                                      ? colors.accent
                                      : item.tone === "success"
                                        ? colors.success
                                        : item.tone === "danger"
                                          ? colors.danger
                                          : colors.textSecondary
                                  }
                                  name={item.icon}
                                  size={18}
                                />
                              </View>
                              <View style={styles.threadInsightCopy}>
                                <Text style={styles.threadInsightLabel}>{item.label}</Text>
                                <Text style={styles.threadInsightValue}>{item.value}</Text>
                                <Text style={styles.threadInsightDetail}>{item.detail}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {vendoMesa ? (
                    carregandoMesa && !mensagensMesa.length ? (
                      <View style={styles.loadingState}>
                        <ActivityIndicator size="large" color={colors.accent} />
                        <Text style={styles.loadingText}>Abrindo a conversa com a mesa...</Text>
                      </View>
                    ) : !mesaDisponivel ? (
                      <View style={styles.threadEmptyState}>
                        <BrandIntroMark brandColor={accentColor} />
                      </View>
                    ) : (
                      <ScrollView
                        ref={scrollRef}
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
                                    <Text style={[styles.messageAuthor, styles.messageAuthorOutgoing]}>
                                      {nomeAutor}
                                    </Text>
                                    {referenciaId ? (
                                      <MessageReferenceCard
                                        messageId={referenciaId}
                                        onPress={() => void abrirReferenciaNoChat(referenciaId)}
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
                                              accessToken={session?.accessToken || null}
                                              attachment={anexo}
                                              onPress={handleAbrirAnexo}
                                              opening={anexoAbrindoChave === chaveAnexo(anexo, `${item.id}-anexo-${anexoIndex}`)}
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
                                      <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={colors.accent} />
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
                                            item.resolvida_em_label ? styles.messageStatusBadgeSuccess : styles.messageStatusBadgeAccent,
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
                                          onPress={() => void abrirReferenciaNoChat(referenciaId)}
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
                                                accessToken={session?.accessToken || null}
                                                attachment={anexo}
                                                onPress={handleAbrirAnexo}
                                                opening={anexoAbrindoChave === chaveAnexo(anexo, `${item.id}-anexo-${anexoIndex}`)}
                                              />
                                            );
                                          })}
                                        </View>
                                      ) : null}
                                      {conversaAtiva?.permiteEdicao ? (
                                        <View style={styles.messageActionRow}>
                                          <Pressable
                                            onPress={() => definirReferenciaMesaAtiva(item)}
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
                          <View style={styles.threadEmptyState}>
                            <BrandIntroMark brandColor={accentColor} />
                          </View>
                        )}
                      </ScrollView>
                    )
                  ) : carregandoConversa && !conversaAtiva ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator size="large" color={colors.accent} />
                      <Text style={styles.loadingText}>Carregando a conversa do inspetor...</Text>
                    </View>
                  ) : conversaVazia ? (
                    <View style={styles.threadEmptyState}>
                      <BrandIntroMark brandColor={accentColor} />
                    </View>
                  ) : (
                    <ScrollView
                      ref={scrollRef}
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
                            onLayout={(event) =>
                              registrarLayoutMensagemChat(item.id, event.nativeEvent.layout.y)
                            }
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
                                    <Text style={[styles.messageAuthor, styles.messageAuthorOutgoing]}>
                                      {nomeAutor}
                                    </Text>
                                    {referenciaId ? (
                                      <MessageReferenceCard
                                        messageId={referenciaId}
                                        onPress={() => void abrirReferenciaNoChat(referenciaId)}
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
                                          accessToken={session?.accessToken || null}
                                          attachment={anexo}
                                          onPress={handleAbrirAnexo}
                                          opening={anexoAbrindoChave === chaveAnexo(anexo, `${item.id ?? "msg"}-anexo-${anexoIndex}`)}
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
                                    <MaterialCommunityIcons
                                      name="clipboard-check-outline"
                                      size={16}
                                      color={colors.accent}
                                    />
                                  </View>
                                ) : (
                                  <Image source={TARIEL_APP_MARK} style={styles.messageAvatarBrand} />
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
                                              Revisão
                                            </Text>
                                          </View>
                                        ) : null}
                                      </View>
                                      {referenciaId ? (
                                        <MessageReferenceCard
                                          messageId={referenciaId}
                                          onPress={() => void abrirReferenciaNoChat(referenciaId)}
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
                                            accessToken={session?.accessToken || null}
                                            attachment={anexo}
                                            onPress={handleAbrirAnexo}
                                            opening={anexoAbrindoChave === chaveAnexo(anexo, `${item.id ?? "msg"}-anexo-${anexoIndex}`)}
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
                            <ActivityIndicator size="small" color={colors.accent} />
                            <Text style={styles.typingText}>Tariel.ia está respondendo...</Text>
                          </View>
                        </View>
                      ) : null}
                    </ScrollView>
                  )}
                </View>

                {!vendoMesa || mesaTemMensagens ? (
                  <View
                    style={[
                      styles.composerCard,
                      keyboardVisible ? styles.composerCardKeyboardVisible : null,
                      keyboardVisible ? { bottom: composerKeyboardBottomOffset } : null,
                    ]}
                  >
                    {conversaAtiva?.permiteReabrir ? (
                      <Pressable onPress={handleReabrir} style={styles.cleanReopenAction}>
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
                              <Text style={styles.composerReferenceText}>
                                {mensagemMesaReferenciaAtiva.texto}
                              </Text>
                            </View>
                            <Pressable onPress={limparReferenciaMesaAtiva} style={styles.composerReferenceRemove}>
                              <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
                            </Pressable>
                          </View>
                        ) : null}

                        {anexoMesaRascunho ? (
                          <View style={styles.attachmentDraftCard}>
                            <View style={styles.attachmentDraftHeader}>
                              {anexoMesaRascunho.kind === "image" ? (
                                <Image source={{ uri: anexoMesaRascunho.previewUri }} style={styles.attachmentDraftPreview} />
                              ) : (
                                <View style={styles.attachmentDraftIcon}>
                                  <MaterialCommunityIcons name="file-document-outline" size={18} color={colors.accent} />
                                </View>
                              )}
                              <View style={styles.attachmentDraftCopy}>
                                <Text style={styles.attachmentDraftTitle}>{anexoMesaRascunho.label}</Text>
                                <Text style={styles.attachmentDraftDescription}>{anexoMesaRascunho.resumo}</Text>
                              </View>
                              <Pressable onPress={() => setAnexoMesaRascunho(null)} style={styles.attachmentDraftRemove}>
                                <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
                              </Pressable>
                            </View>
                          </View>
                        ) : null}

                        <View style={styles.composerRow}>
                          <Pressable
                            disabled={!podeAbrirAnexosMesa}
                            onPress={handleAbrirSeletorAnexo}
                            style={[styles.attachInsideButton, !podeAbrirAnexosMesa ? styles.attachButtonDisabled : null]}
                            testID="mesa-attach-button"
                          >
                            <MaterialCommunityIcons name="paperclip" size={18} color={colors.textSecondary} />
                          </Pressable>
                          <TextInput
                            editable={podeUsarComposerMesa}
                            multiline
                            onChangeText={setMensagemMesa}
                            placeholder={placeholderMesa}
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.composerInput, dynamicComposerInputStyle, !podeUsarComposerMesa ? styles.composerInputDisabled : null]}
                            testID="mesa-composer-input"
                            value={mensagemMesa}
                          />

                          <Pressable
                            disabled={!podeEnviarMesa}
                            onPress={handleEnviarMensagemMesa}
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
                          <View style={styles.attachmentDraftCard}>
                            <View style={styles.attachmentDraftHeader}>
                              {anexoRascunho.kind === "image" ? (
                                <Image source={{ uri: anexoRascunho.previewUri }} style={styles.attachmentDraftPreview} />
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
                                <Text style={styles.attachmentDraftTitle}>{anexoRascunho.label}</Text>
                                <Text style={styles.attachmentDraftDescription}>{anexoRascunho.resumo}</Text>
                              </View>
                              <Pressable onPress={() => setAnexoRascunho(null)} style={styles.attachmentDraftRemove}>
                                <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
                              </Pressable>
                            </View>
                          </View>
                        ) : null}

                        <View style={styles.composerRow}>
                          <Pressable
                            disabled={!podeAbrirAnexosChat}
                            onPress={handleAbrirSeletorAnexo}
                            style={[styles.attachInsideButton, !podeAbrirAnexosChat ? styles.attachButtonDisabled : null]}
                            testID="chat-attach-button"
                          >
                            <MaterialCommunityIcons name="paperclip" size={18} color={colors.textSecondary} />
                          </Pressable>
                          <TextInput
                            editable={podeAcionarComposer}
                            multiline
                            onChangeText={setMensagem}
                            placeholder={placeholderComposer}
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.composerInput, dynamicComposerInputStyle, !podeAcionarComposer ? styles.composerInputDisabled : null]}
                            testID="chat-composer-input"
                            value={mensagem}
                          />

                          <Pressable
                            disabled={!podeEnviarComposer}
                            onPress={handleEnviarMensagem}
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
                ) : null}
              </View>
            </View>

            <Modal
              animationType="fade"
              onRequestClose={() => setAnexosAberto(false)}
              transparent
              visible={anexosAberto}
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
                    <Pressable onPress={() => setAnexosAberto(false)} style={styles.activityModalClose}>
                      <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
                    </Pressable>
                  </View>

                  <View style={styles.actionList}>
                    <Pressable onPress={() => void handleEscolherAnexo("camera")} style={styles.actionItem}>
                      <MaterialCommunityIcons name="camera-outline" size={20} color={colors.accent} />
                      <Text style={styles.actionText}>Câmera</Text>
                    </Pressable>
                    <Pressable onPress={() => void handleEscolherAnexo("galeria")} style={styles.actionItem}>
                      <MaterialCommunityIcons name="image-outline" size={20} color={colors.accent} />
                      <Text style={styles.actionText}>Galeria</Text>
                    </Pressable>
                    <Pressable onPress={() => void handleEscolherAnexo("documento")} style={styles.actionItem}>
                      <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.accent} />
                      <Text style={styles.actionText}>Documento</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

            <View pointerEvents="box-none" style={styles.sidePanelLayer}>
              {!algumPainelLateralAberto ? (
                <>
                  <View
                    {...historyEdgePanResponder.panHandlers}
                    style={[styles.sidePanelEdgeHitbox, styles.sidePanelEdgeHitboxLeft]}
                  />
                  <View
                    {...settingsEdgePanResponder.panHandlers}
                    style={[styles.sidePanelEdgeHitbox, styles.sidePanelEdgeHitboxRight]}
                  />
                </>
              ) : null}
            </View>

            <Modal
              animationType="none"
              hardwareAccelerated
              onRequestClose={fecharPaineisLaterais}
              presentationStyle="overFullScreen"
              statusBarTranslucent
              transparent
              visible={algumPainelLateralAberto}
            >
              <View pointerEvents="box-none" style={styles.sidePanelModalRoot}>
                <Animated.View
                  pointerEvents="box-none"
                  style={[styles.sidePanelScrim, { opacity: drawerOverlayOpacity }]}
                >
                  <Pressable onPress={fecharPaineisLaterais} style={styles.sidePanelScrimPressable} />
                </Animated.View>

                {historicoAberto ? (
                  <Animated.View
                    {...historyDrawerPanResponder.panHandlers}
                    style={[
                      styles.sidePanelDrawer,
                      styles.sidePanelDrawerLeft,
                      { transform: [{ translateX: historicoDrawerX }] },
                    ]}
                    testID="history-drawer"
                  >
                    <View style={styles.sidePanelHeader}>
                      <View style={styles.sidePanelCopy}>
                        <View style={styles.historyBrandRow}>
                          <Image source={TARIEL_APP_MARK} style={styles.historyBrandIcon} />
                          <Text style={styles.historyBrandEyebrow}>tariel.ia</Text>
                        </View>
                        <Text style={styles.sidePanelTitle}>Histórico</Text>
                        <Text style={styles.sidePanelDescription}>
                          Retome laudos recentes e volte para o ponto certo da conversa.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => fecharHistorico({ limparBusca: true })}
                        style={styles.sidePanelCloseButton}
                        testID="close-history-drawer-button"
                      >
                        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textPrimary} />
                      </Pressable>
                    </View>

                    <View style={styles.historySearchShell}>
                      <MaterialCommunityIcons name="magnify" size={20} color={colors.textSecondary} />
                      <TextInput
                        onChangeText={setBuscaHistorico}
                        placeholder="Buscar conversas..."
                        placeholderTextColor={colors.textSecondary}
                        style={styles.historySearchInput}
                        testID="history-search-input"
                        value={buscaHistorico}
                      />
                    </View>

                    <View style={styles.historySummaryCard}>
                      <View style={styles.historySummaryMetrics}>
                        <View style={styles.historySummaryMetric}>
                          <Text style={styles.historySummaryMetricValue}>{conversasVisiveisTotal}</Text>
                          <Text style={styles.historySummaryMetricLabel}>Visíveis</Text>
                        </View>
                        <View style={styles.historySummaryMetric}>
                          <Text style={styles.historySummaryMetricValue}>{conversasFixadasTotal}</Text>
                          <Text style={styles.historySummaryMetricLabel}>Fixadas</Text>
                        </View>
                        <View style={styles.historySummaryMetric}>
                          <Text style={styles.historySummaryMetricValue}>{conversasOcultasTotal}</Text>
                          <Text style={styles.historySummaryMetricLabel}>Ocultas</Text>
                        </View>
                      </View>
                      <Text style={styles.historySummaryText}>{resumoHistoricoDrawer}</Text>
                    </View>

                    <View style={styles.historyFilterRow}>
                      {filtrosHistoricoComContagem.map((item) => {
                        const ativo = filtroHistorico === item.key;
                        return (
                          <Pressable
                            key={item.key}
                            onPress={() => setFiltroHistorico(item.key)}
                            style={[styles.historyFilterChip, ativo ? styles.historyFilterChipActive : null]}
                            testID={`history-filter-${item.key}`}
                          >
                            <Text style={[styles.historyFilterChipText, ativo ? styles.historyFilterChipTextActive : null]}>
                              {item.label}
                            </Text>
                            <View style={[styles.historyFilterCount, ativo ? styles.historyFilterCountActive : null]}>
                              <Text
                                style={[
                                  styles.historyFilterCountText,
                                  ativo ? styles.historyFilterCountTextActive : null,
                                ]}
                              >
                                {item.count}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>

                    <ScrollView contentContainerStyle={styles.historySections}>
                      {historicoAgrupadoFinal.length ? (
                        historicoAgrupadoFinal.map((section, sectionIndex) => (
                          <View key={section.key} style={styles.historySection}>
                            <View style={styles.historySectionHeader}>
                              <Text style={styles.historySectionTitle}>{section.title}</Text>
                              <View style={styles.historySectionCountBadge}>
                                <Text style={styles.historySectionCountText}>{section.items.length}</Text>
                              </View>
                            </View>
                            <View style={styles.historySectionItems}>
                              {section.items.map((item, itemIndex) => {
                                const ativo = item.id === laudoSelecionadoId;
                                const isFirstHistoryItem = sectionIndex === 0 && itemIndex === 0;
                                const templateLabel = formatarTipoTemplateLaudo(item.tipo_template);
                                const modoLaudoLabel = item.permite_edicao
                                  ? "Editável"
                                  : item.permite_reabrir
                                    ? "Reabrir"
                                    : "Leitura";
                                return (
                                  <View key={`history-${section.key}-${item.id}`} style={styles.historyItemShell}>
                                    <Pressable
                                      onPress={() => void handleSelecionarHistorico(item)}
                                      style={[
                                        styles.historyItem,
                                        styles.historyItemPrimary,
                                        ativo ? styles.historyItemActive : null,
                                      ]}
                                      testID={isFirstHistoryItem ? "history-first-item-button" : `history-item-${item.id}`}
                                    >
                                      <View style={[styles.historyItemIcon, ativo ? styles.historyItemIconActive : null]}>
                                        <Image source={TARIEL_APP_MARK} style={styles.historyItemBrandIcon} />
                                      </View>
                                      <View style={styles.historyItemCopy}>
                                        <View style={styles.historyItemHeading}>
                                          <Text
                                            numberOfLines={1}
                                            style={[
                                              styles.historyItemTitle,
                                              ativo ? styles.historyItemTitleActive : null,
                                            ]}
                                          >
                                            {item.titulo}
                                          </Text>
                                          <Text
                                            style={[
                                              styles.historyItemTime,
                                              ativo ? styles.historyItemTimeActive : null,
                                            ]}
                                          >
                                            {formatarHorarioAtividade(item.data_iso)}
                                          </Text>
                                        </View>
                                        <View style={styles.historyItemMetaRow}>
                                          <View
                                            style={[
                                              styles.historyItemStatus,
                                              item.status_card === "ajustes"
                                                ? styles.historyItemStatusDanger
                                                : item.status_card === "aprovado"
                                                  ? styles.historyItemStatusSuccess
                                                  : item.status_card === "aguardando"
                                                    ? styles.historyItemStatusAccent
                                                    : null,
                                              ativo ? styles.historyItemStatusActive : null,
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.historyItemStatusText,
                                                item.status_card === "ajustes"
                                                  ? styles.historyItemStatusTextDanger
                                                  : item.status_card === "aprovado"
                                                    ? styles.historyItemStatusTextSuccess
                                                    : item.status_card === "aguardando"
                                                      ? styles.historyItemStatusTextAccent
                                                      : null,
                                                ativo ? styles.historyItemStatusTextActive : null,
                                              ]}
                                            >
                                              {item.status_card_label}
                                            </Text>
                                          </View>
                                          {item.pinado ? (
                                            <View style={[styles.historyItemPinnedTag, ativo ? styles.historyItemPinnedTagActive : null]}>
                                              <MaterialCommunityIcons
                                                color={ativo ? colors.white : colors.accent}
                                                name="pin"
                                                size={12}
                                              />
                                              <Text
                                                style={[
                                                  styles.historyItemPinnedTagText,
                                                  ativo ? styles.historyItemPinnedTagTextActive : null,
                                                ]}
                                              >
                                                Fixada
                                              </Text>
                                            </View>
                                          ) : null}
                                        </View>
                                        <View style={styles.historyItemMetaRow}>
                                          <View style={[styles.historyItemInfoTag, ativo ? styles.historyItemInfoTagActive : null]}>
                                            <MaterialCommunityIcons
                                              color={ativo ? colors.white : colors.textSecondary}
                                              name="shape-outline"
                                              size={12}
                                            />
                                            <Text
                                              style={[
                                                styles.historyItemInfoTagText,
                                                ativo ? styles.historyItemInfoTagTextActive : null,
                                              ]}
                                            >
                                              {templateLabel}
                                            </Text>
                                          </View>
                                          <View
                                            style={[
                                              styles.historyItemInfoTag,
                                              item.permite_edicao ? styles.historyItemInfoTagEditable : null,
                                              ativo ? styles.historyItemInfoTagActive : null,
                                            ]}
                                          >
                                            <MaterialCommunityIcons
                                              color={
                                                ativo
                                                  ? colors.white
                                                  : item.permite_edicao
                                                    ? colors.success
                                                    : colors.textSecondary
                                              }
                                              name={item.permite_edicao ? "pencil-outline" : "lock-outline"}
                                              size={12}
                                            />
                                            <Text
                                              style={[
                                                styles.historyItemInfoTagText,
                                                item.permite_edicao ? styles.historyItemInfoTagTextEditable : null,
                                                ativo ? styles.historyItemInfoTagTextActive : null,
                                              ]}
                                            >
                                              {modoLaudoLabel}
                                            </Text>
                                          </View>
                                        </View>
                                        <Text
                                          numberOfLines={2}
                                          style={[
                                            styles.historyItemPreview,
                                            ativo ? styles.historyItemPreviewActive : null,
                                          ]}
                                        >
                                          {item.preview || "Sem resumo recente"}
                                        </Text>
                                      </View>
                                      <MaterialCommunityIcons
                                        name="chevron-right"
                                        size={18}
                                        color={ativo ? "rgba(255,255,255,0.78)" : colors.textSecondary}
                                      />
                                    </Pressable>

                                    <View style={styles.historyItemActions}>
                                      <Pressable
                                        accessibilityLabel={item.pinado ? "Desafixar conversa" : "Fixar conversa"}
                                        onPress={() => handleAlternarFixadoHistorico(item)}
                                        style={[
                                          styles.historyItemActionButton,
                                          item.pinado ? styles.historyItemActionButtonPinned : null,
                                        ]}
                                        testID={isFirstHistoryItem ? "history-first-item-pin-button" : `history-item-pin-${item.id}`}
                                      >
                                        <MaterialCommunityIcons
                                          name={item.pinado ? "pin-off-outline" : "pin-outline"}
                                          size={18}
                                          color={item.pinado ? colors.white : colors.accent}
                                        />
                                      </Pressable>
                                      <Pressable
                                        accessibilityLabel="Remover conversa do histórico"
                                        onPress={() => handleExcluirConversaHistorico(item)}
                                        style={[styles.historyItemActionButton, styles.historyItemActionButtonDanger]}
                                        testID={isFirstHistoryItem ? "history-first-item-delete-button" : `history-item-delete-${item.id}`}
                                      >
                                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B85A4A" />
                                      </Pressable>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={styles.historyEmptyState}>
                          <Image source={TARIEL_APP_MARK} style={styles.historyEmptyBrand} />
                          <Text style={styles.historyEmptyTitle}>{historicoVazioTitulo}</Text>
                          <Text style={styles.historyEmptyText}>{historicoVazioTexto}</Text>
                        </View>
                      )}
                    </ScrollView>
                  </Animated.View>
                ) : null}

                {configuracoesAberta ? (
                  <Animated.View
                    {...settingsDrawerPanResponder.panHandlers}
                    style={[
                      styles.sidePanelDrawer,
                      styles.sidePanelDrawerRight,
                      { transform: [{ translateX: configuracoesDrawerX }] },
                    ]}
                    testID="settings-drawer"
                  >
                    <View style={styles.sidePanelHeader}>
                      <View style={styles.sidePanelCopy}>
                        <Text style={styles.activityModalEyebrow}>tariel.ia</Text>
                        <Text style={styles.sidePanelTitle}>{settingsDrawerTitle}</Text>
                        <Text style={styles.sidePanelDescription}>{settingsDrawerSubtitle}</Text>
                      </View>
                      <Pressable
                        onPress={settingsDrawerInOverview ? () => fecharConfiguracoes() : handleVoltarResumoConfiguracoes}
                        style={styles.sidePanelCloseButton}
                        testID={settingsDrawerInOverview ? "close-settings-drawer-button" : "settings-drawer-back-button"}
                      >
                        <MaterialCommunityIcons
                          name={settingsDrawerInOverview ? "chevron-right" : "chevron-left"}
                          size={22}
                          color={colors.textPrimary}
                        />
                      </Pressable>
                    </View>

                    <ScrollView
                      contentContainerStyle={styles.settingsDrawerContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {settingsDrawerInOverview ? (
                        <View style={styles.settingsSummaryCard}>
                          <View style={styles.settingsSummaryTop}>
                            <Image source={perfilFotoUri ? { uri: perfilFotoUri } : TARIEL_APP_MARK} style={styles.settingsSummaryMark} />
                            <View style={styles.settingsSummaryCopy}>
                              <Text style={styles.settingsSummaryEyebrow}>conta ativa</Text>
                              <Text style={styles.settingsSummaryName}>{perfilExibicaoLabel}</Text>
                              <Text style={styles.settingsSummaryMeta}>{contaEmailLabel}</Text>
                            </View>
                          </View>
                          <View style={styles.settingsSummaryChips}>
                            <SettingsStatusPill label={planoAtual} tone="accent" />
                            <SettingsStatusPill
                              label={twoFactorEnabled ? "2FA ativo" : "2FA pendente"}
                              tone={twoFactorEnabled ? "success" : "muted"}
                            />
                            <SettingsStatusPill
                              label={sessoesAtivas.some((item) => item.suspicious) ? "Atenção" : "Seguro"}
                              tone={sessoesAtivas.some((item) => item.suspicious) ? "danger" : "success"}
                            />
                          </View>
                        </View>
                      ) : null}

                      {settingsDrawerInOverview ? (
                        <View style={styles.settingsSearchShell}>
                          <MaterialCommunityIcons color={colors.textSecondary} name="magnify" size={18} />
                          <TextInput
                            onChangeText={setBuscaConfiguracoes}
                            placeholder="Buscar conta, segurança, permissões..."
                            placeholderTextColor={colors.textSecondary}
                            style={styles.settingsSearchInput}
                            testID="settings-search-input"
                            value={buscaConfiguracoes}
                          />
                          {buscaConfiguracoes ? (
                            <Pressable onPress={() => setBuscaConfiguracoes("")} style={styles.settingsSearchClearButton}>
                              <MaterialCommunityIcons color={colors.textSecondary} name="close" size={16} />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}

                        {settingsDrawerShowingSearchResults && resumoBuscaConfiguracoes ? (
                          <Text style={styles.settingsFilterSummary}>{resumoBuscaConfiguracoes}</Text>
                        ) : null}

                        {settingsDrawerShowingOverviewCards ? (
                          <View style={styles.settingsOverviewGrid}>
                            {mostrarSecaoConfiguracao("prioridades") ? (
                              <SettingsOverviewCard
                                badge={`${totalPrioridadesAbertas}`}
                                description="2FA, método extra de acesso, permissões críticas e sessões pedindo atenção."
                                icon="flash-outline"
                                onPress={() => handleAbrirPaginaConfiguracoes("prioridades")}
                                testID="settings-overview-prioridades"
                                title="Ações prioritárias"
                                tone={temPrioridadesConfiguracao ? "danger" : "success"}
                              />
                            ) : null}
                            {mostrarGrupoContaAcesso ? (
                              <SettingsOverviewCard
                                badge={`${totalSecoesContaAcesso}`}
                                description="Perfil, assinatura, email, senha e a conta principal do inspetor."
                                icon="account-circle-outline"
                                onPress={() => handleAbrirPaginaConfiguracoes("contaAcesso")}
                                testID="settings-overview-conta-acesso"
                                title="Conta e acesso"
                                tone="accent"
                              />
                            ) : null}
                            {mostrarGrupoExperiencia ? (
                              <SettingsOverviewCard
                                badge={`${totalSecoesExperiencia}`}
                                description="IA, aparência, densidade visual e comportamento das notificações."
                                icon="palette-outline"
                                onPress={() => handleAbrirPaginaConfiguracoes("experiencia")}
                                testID="settings-overview-experiencia"
                                title="Experiência do app"
                                tone="muted"
                              />
                            ) : null}
                            {mostrarGrupoSeguranca ? (
                              <SettingsOverviewCard
                                badge={`${totalSecoesSeguranca}`}
                                description="Contas conectadas, sessões, 2FA, permissões, dados e proteção do dispositivo."
                                icon="shield-lock-outline"
                                onPress={() => handleAbrirPaginaConfiguracoes("seguranca")}
                                testID="settings-overview-seguranca"
                                title="Segurança e privacidade"
                                tone={sessoesSuspeitasTotal > 0 || !twoFactorEnabled ? "danger" : "success"}
                              />
                            ) : null}
                            {mostrarGrupoSistema ? (
                              <SettingsOverviewCard
                                badge={`${totalSecoesSistema}`}
                                description="Recursos avançados, manutenção do app e canais de ajuda."
                                icon="cellphone-cog"
                                onPress={() => handleAbrirPaginaConfiguracoes("sistemaSuporte")}
                                testID="settings-overview-sistema-suporte"
                                title="Sistema e suporte"
                                tone="muted"
                              />
                            ) : null}
                          </View>
                        ) : null}

                        {!settingsDrawerInOverview && settingsDrawerSectionMenuAtiva ? (
                          <SettingsSection
                            icon={settingsDrawerPageMeta[settingsDrawerPage].icon}
                            subtitle="Escolha o bloco que você quer ajustar agora para evitar um scroll grande."
                            title={settingsDrawerPageMeta[settingsDrawerPage].title}
                          >
                            {settingsDrawerPageSections.map((sectionKey) => {
                              const meta = settingsDrawerSectionMeta[sectionKey];
                              return (
                                <SettingsPressRow
                                  key={sectionKey}
                                  description={meta.subtitle}
                                  icon={meta.icon}
                                  onPress={() => setSettingsDrawerSection(sectionKey)}
                                  testID={`settings-section-link-${sectionKey}`}
                                  title={meta.title}
                                  value="Abrir"
                                />
                              );
                            })}
                          </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("prioridades", "prioridades") ? (
                        <SettingsSection
                          icon="flash-outline"
                          subtitle="O que merece atenção primeiro nesta conta do inspetor."
                          testID="settings-section-prioridades"
                          title="Ações prioritárias"
                        >
                          {temPrioridadesConfiguracao ? (
                            <>
                              {!twoFactorEnabled ? (
                                <SettingsPressRow
                                  description="Ative proteção extra antes de depender apenas do email e senha."
                                  icon="shield-star-outline"
                                  onPress={handleToggle2FA}
                                  testID="settings-priority-enable-twofa-row"
                                  title="Ativar verificação em duas etapas"
                                  value="Recomendado"
                                />
                              ) : null}
                              {provedoresConectadosTotal <= 1 ? (
                                <SettingsPressRow
                                  description="Cadastre outro método para não ficar preso a uma única forma de acesso."
                                  icon="account-plus-outline"
                                  onPress={handleConectarProximoProvedorDisponivel}
                                  title="Adicionar outro método de acesso"
                                  value={existeProvedorDisponivel ? "Disponível" : "Revisar"}
                                />
                              ) : null}
                              {permissoesNegadasTotal > 0 ? (
                                <SettingsPressRow
                                  description="Câmera, arquivos e notificações melhoram o uso do inspetor em campo."
                                  icon="shield-sync-outline"
                                  onPress={handleRevisarPermissoesCriticas}
                                  title="Revisar permissões críticas"
                                  value={`${permissoesNegadasTotal} pendente(s)`}
                                />
                              ) : null}
                              {sessoesSuspeitasTotal > 0 ? (
                                <SettingsPressRow
                                  danger
                                  description="Existem sessões marcadas como incomuns e prontas para revisão."
                                  icon="shield-alert-outline"
                                  onPress={handleEncerrarSessoesSuspeitas}
                                  title="Encerrar sessões suspeitas"
                                  value={`${sessoesSuspeitasTotal} alerta(s)`}
                                />
                              ) : null}
                              <SettingsPressRow
                                description="Confira o estado da build e as últimas mudanças do app."
                                icon="refresh-circle"
                                onPress={handleVerificarAtualizacoes}
                                title="Verificar atualizações"
                                value={ultimaVerificacaoAtualizacaoLabel}
                              />
                            </>
                          ) : (
                            <View style={styles.settingsInfoCard}>
                              <Text style={styles.settingsInfoTitle}>Tudo em dia</Text>
                              <Text style={styles.settingsInfoText}>
                                A conta já está com 2FA, múltiplos métodos de acesso, permissões críticas e sessões sob controle.
                              </Text>
                            </View>
                          )}
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesPage("contaAcesso") && !settingsDrawerSectionMenuAtiva && mostrarGrupoContaAcesso ? (
                          <SettingsGroupLabel
                            description="Perfil, acesso e sessões ligadas à sua conta."
                            title="Conta e acesso"
                          />
                        ) : null}
                        {settingsDrawerMatchesSection("contaAcesso", "conta") ? (
                        <SettingsSection
                          icon="account-circle-outline"
                          subtitle="Informações da conta e assinatura do inspetor."
                          testID="settings-section-conta"
                          title="Conta"
                        >
                          <View style={styles.settingsInfoGrid}>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Identidade</Text>
                              <Text style={styles.settingsInfoText}>{perfilNomeCompleto}</Text>
                              <Text style={styles.settingsInfoSubtle}>{perfilExibicaoLabel} no chat</Text>
                            </View>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Acesso principal</Text>
                              <Text style={styles.settingsInfoText}>{provedorPrimario}</Text>
                              <Text style={styles.settingsInfoSubtle}>{contaEmailLabel}</Text>
                            </View>
                          </View>
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Resumo da conta</Text>
                            <Text style={styles.settingsInfoText}>
                              {resumoMetodosConta} • {planoAtual} • {reautenticacaoStatus}
                            </Text>
                          </View>
                          <SettingsPressRow
                            description={perfilFotoHint}
                            icon="camera-plus-outline"
                            onPress={handleUploadFotoPerfil}
                            testID="settings-account-photo-row"
                            title="Foto de perfil"
                            value={perfilFotoUri ? "Atualizada" : "Upload"}
                          />
                          <SettingsTextField
                            icon="account-outline"
                            onChangeText={setPerfilNome}
                            placeholder="Nome completo"
                            testID="settings-account-name-field"
                            title="Nome do usuário"
                            value={perfilNome}
                          />
                          <SettingsTextField
                            icon="badge-account-outline"
                            onChangeText={setPerfilExibicao}
                            placeholder="Nome exibido no chat"
                            testID="settings-account-display-name-field"
                            title="Nome de exibição"
                            value={perfilExibicao}
                          />
                          <SettingsPressRow
                            description="Confirmado por email"
                            icon="email-outline"
                            onPress={handleAlterarEmail}
                            testID="settings-account-email-row"
                            title="Email"
                            value={contaEmailLabel}
                          />
                          <SettingsPressRow
                            description="Senha atual, nova senha e confirmação"
                            icon="lock-outline"
                            onPress={handleAlterarSenha}
                            testID="settings-account-password-row"
                            title="Alterar senha"
                          />
                          <SettingsPressRow
                            description="Benefícios do plano e opções de upgrade"
                            icon="star-circle-outline"
                            onPress={handleGerenciarPlano}
                            testID="settings-account-plan-row"
                            title="Plano / Assinatura"
                            value={planoAtual}
                          />
                          <SettingsPressRow
                            description="Cobranças e faturas anteriores"
                            icon="receipt-text-outline"
                            onPress={handleHistoricoPagamentos}
                            title="Histórico de pagamentos"
                          />
                          <SettingsPressRow
                            description="Cartão cadastrado e método de pagamento"
                            icon="credit-card-outline"
                            onPress={handleGerenciarPagamento}
                            testID="settings-account-billing-row"
                            title="Gerenciar pagamento"
                            value={cartaoAtual}
                          />
                          <SettingsPressRow
                            icon="logout-variant"
                            onPress={() => {
                              fecharConfiguracoes();
                              void handleLogout();
                            }}
                            testID="settings-account-logout-row"
                            title="Sair da conta"
                          />
                          <SettingsPressRow
                            description="Exclusão permanente com confirmação dupla"
                            danger
                            icon="delete-alert-outline"
                            onPress={handleExcluirConta}
                            testID="settings-account-delete-row"
                            title="Excluir conta"
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesPage("experiencia") && !settingsDrawerSectionMenuAtiva && mostrarGrupoExperiencia ? (
                          <SettingsGroupLabel
                            description="Comportamento da IA, aparência e alertas do aplicativo."
                            title="Experiência do app"
                          />
                        ) : null}
                        {settingsDrawerMatchesSection("experiencia", "preferenciasIa") ? (
                        <SettingsSection
                          icon="robot-outline"
                          subtitle="Ajuste o comportamento da inteligência artificial nas conversas."
                          title="Preferências da IA"
                        >
                          <SettingsPressRow
                            icon="brain"
                            onPress={() => setModeloIa((value) => nextOptionValue(value, AI_MODEL_OPTIONS))}
                            title="Modelo de IA"
                            value={modeloIa}
                          />
                          <SettingsPressRow
                            icon="message-text-outline"
                            onPress={() =>
                              setEstiloResposta((value) => nextOptionValue(value, RESPONSE_STYLE_OPTIONS))
                            }
                            title="Estilo de resposta"
                            value={estiloResposta}
                          />
                          <SettingsPressRow
                            icon="translate"
                            onPress={() =>
                              setIdiomaResposta((value) => nextOptionValue(value, RESPONSE_LANGUAGE_OPTIONS))
                            }
                            title="Idioma da resposta"
                            value={idiomaResposta}
                          />
                          <SettingsSwitchRow
                            description="Permite lembrar preferências entre conversas."
                            icon="memory"
                            onValueChange={setMemoriaIa}
                            title="Memória da IA"
                            value={memoriaIa}
                          />
                          <SettingsSwitchRow
                            description="Consentimento para melhoria contínua do modelo."
                            icon="school-outline"
                            onValueChange={setAprendizadoIa}
                            title="Permitir aprendizado da IA"
                            value={aprendizadoIa}
                          />
                          <SettingsSegmentedRow
                            description="Tom principal do assistente durante a conversa."
                            icon="account-voice"
                            onChange={setTomConversa}
                            options={CONVERSATION_TONE_OPTIONS}
                            title="Tom da conversa"
                            value={tomConversa}
                          />
                          <SettingsScaleRow
                            description="Mais baixo para precisão, mais alto para criatividade."
                            icon="tune-variant"
                            maxLabel="Criativa"
                            minLabel="Precisa"
                            onChange={setTemperaturaIa}
                            title="Temperatura da resposta"
                            value={temperaturaIa}
                            values={TEMPERATURE_STEPS}
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("experiencia", "aparencia") ? (
                        <SettingsSection
                          icon="palette-outline"
                          subtitle="Visual, densidade e comportamento da interface."
                          title="Aparência"
                        >
                          <SettingsSegmentedRow
                            icon="theme-light-dark"
                            onChange={setTemaApp}
                            options={THEME_OPTIONS}
                            title="Tema"
                            value={temaApp}
                          />
                          <SettingsSegmentedRow
                            icon="format-size"
                            onChange={setTamanhoFonte}
                            options={FONT_SIZE_OPTIONS}
                            title="Tamanho da fonte"
                            value={tamanhoFonte}
                          />
                          <SettingsSegmentedRow
                            icon="view-compact-outline"
                            onChange={setDensidadeInterface}
                            options={DENSITY_OPTIONS}
                            title="Densidade da interface"
                            value={densidadeInterface}
                          />
                          <SettingsSegmentedRow
                            description="Cor principal usada nos detalhes do app."
                            icon="eyedropper-variant"
                            onChange={setCorDestaque}
                            options={ACCENT_OPTIONS}
                            title="Cor de destaque"
                            value={corDestaque}
                          />
                          <SettingsSwitchRow
                            icon="motion-outline"
                            onValueChange={setAnimacoesAtivas}
                            title="Animações"
                            value={animacoesAtivas}
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("experiencia", "notificacoes") ? (
                        <SettingsSection
                          icon="bell-outline"
                          subtitle="Como o usuário recebe alertas e avisos do app."
                          title="Notificações"
                        >
                          <SettingsSwitchRow
                            icon="message-badge-outline"
                            onValueChange={setNotificaRespostas}
                            title="Notificações de respostas"
                            value={notificaRespostas}
                          />
                          <SettingsSwitchRow
                            icon="bell-badge-outline"
                            onValueChange={handleToggleNotificaPush}
                            title="Notificações push"
                            value={notificaPush}
                          />
                          <SettingsPressRow
                            icon="music-note-outline"
                            onPress={() =>
                              setSomNotificacao((value) => nextOptionValue(value, NOTIFICATION_SOUND_OPTIONS))
                            }
                            title="Som de notificação"
                            value={somNotificacao}
                          />
                          <SettingsSwitchRow
                            icon="vibrate"
                            onValueChange={setVibracaoAtiva}
                            title="Vibração"
                            value={vibracaoAtiva}
                          />
                          <SettingsSwitchRow
                            description="Novidades, atualizações e avisos por email."
                            icon="email-fast-outline"
                            onValueChange={setEmailsAtivos}
                            title="Emails"
                            value={emailsAtivos}
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesPage("seguranca") && !settingsDrawerSectionMenuAtiva && mostrarGrupoSeguranca ? (
                          <SettingsGroupLabel
                            description="Proteção da conta, privacidade e controle das conversas."
                            title="Segurança e privacidade"
                          />
                        ) : null}
                        {settingsDrawerMatchesSection("seguranca", "contasConectadas") ? (
                        <SettingsSection
                          icon="account-lock-outline"
                          subtitle="Vincule múltiplos provedores, veja o status de cada conta e proteja o último método de acesso."
                          testID="settings-section-contas-conectadas"
                          title="Contas conectadas"
                        >
                          <View style={styles.securityStack}>
                            <View style={styles.settingsInfoGrid}>
                              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                                <Text style={styles.settingsInfoTitle}>Método principal</Text>
                                <Text style={styles.settingsInfoText}>{provedorPrimario}</Text>
                              </View>
                              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                                <Text style={styles.settingsInfoTitle}>Último vínculo</Text>
                                <Text style={styles.settingsInfoText}>{ultimoEventoProvedor}</Text>
                              </View>
                            </View>
                            <View style={styles.securityIntroCard}>
                              <Text style={styles.securityIntroTitle}>Métodos de login conectados</Text>
                              <Text style={styles.securityIntroText}>
                                Vincule Google, Apple e Microsoft à mesma conta do usuário com proteção para não remover o último método de acesso.
                              </Text>
                            </View>
                            <View style={styles.settingsInfoCard}>
                              <Text style={styles.settingsInfoTitle}>Proteção do acesso</Text>
                              <Text style={styles.settingsInfoText}>{resumoAlertaMetodosConta}</Text>
                            </View>
                            {provedoresConectados.map((provider) => (
                              <SecurityProviderCard
                                key={provider.id}
                                onToggle={handleToggleProviderConnection}
                                provider={provider}
                                testID={`settings-provider-${provider.id}`}
                              />
                            ))}
                            <Text style={styles.securityFootnote}>
                              {provedoresConectadosTotal > 1
                                ? `${provedoresConectadosTotal} métodos ativos.`
                                : "Mantenha mais de um método de acesso para evitar bloqueio da conta."}
                            </Text>
                          </View>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "sessoes") ? (
                        <SettingsSection
                          icon="devices"
                          subtitle="Visualize, invalide e acompanhe sessões ativas do usuário."
                          testID="settings-section-sessoes"
                          title="Sessões e dispositivos"
                        >
                          <View style={styles.securityStack}>
                            <View style={styles.settingsInfoGrid}>
                              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                                <Text style={styles.settingsInfoTitle}>Sessão atual</Text>
                                <Text style={styles.settingsInfoText}>{resumoSessaoAtual}</Text>
                              </View>
                              <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                                <Text style={styles.settingsInfoTitle}>Outros dispositivos</Text>
                                <Text style={styles.settingsInfoText}>{outrasSessoesAtivas.length} sessão(ões)</Text>
                                <Text style={styles.settingsInfoSubtle}>{sessoesSuspeitasTotal} suspeita(s)</Text>
                              </View>
                            </View>
                            <View style={styles.settingsInfoCard}>
                              <Text style={styles.settingsInfoTitle}>Resumo de risco</Text>
                              <Text style={styles.settingsInfoText}>
                                {sessoesAtivas.length} sessões ativas • {outrasSessoesAtivas.length} em outros dispositivos • {sessoesSuspeitasTotal} suspeita{sessoesSuspeitasTotal === 1 ? "" : "s"}
                              </Text>
                              <Text style={styles.settingsInfoSubtle}>{resumoBlindagemSessoes}</Text>
                            </View>
                            <View style={styles.settingsInfoCard}>
                              <Text style={styles.settingsInfoTitle}>Última revisão</Text>
                              <Text style={styles.settingsInfoText}>{ultimoEventoSessao}</Text>
                            </View>
                            {sessoesAtivas.map((item) => (
                              <SecuritySessionCard
                                key={item.id}
                                item={item}
                                onClose={handleEncerrarSessao}
                                onReview={handleRevisarSessao}
                                testID={`settings-session-${item.id}`}
                              />
                            ))}
                            <SettingsPressRow
                              danger
                              description="Encerra o token do dispositivo atual com confirmação."
                              icon="logout"
                              onPress={handleEncerrarSessaoAtual}
                              testID="settings-session-current-close-row"
                              title="Encerrar esta sessão"
                            />
                            <SettingsPressRow
                              danger
                              description="Remove somente sessões marcadas como suspeitas após a revisão."
                              icon="shield-alert-outline"
                              onPress={handleEncerrarSessoesSuspeitas}
                              testID="settings-session-close-suspicious-row"
                              title="Encerrar sessões suspeitas"
                              value={sessoesSuspeitasTotal ? `${sessoesSuspeitasTotal} suspeita(s)` : "Nenhuma"}
                            />
                            <SettingsPressRow
                              danger
                              icon="logout-variant"
                              onPress={handleEncerrarOutrasSessoes}
                              testID="settings-session-close-others-row"
                              title="Encerrar todas as outras"
                            />
                            <SettingsPressRow
                              danger
                              description="Encerra o acesso em todos os dispositivos ao sair."
                              icon="power"
                              onPress={() => {
                                fecharConfiguracoes();
                                void handleLogout();
                              }}
                              testID="settings-session-total-logout-row"
                              title="Logout total"
                            />
                          </View>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "twofa") ? (
                        <SettingsSection
                          icon="shield-star-outline"
                          subtitle="Ative 2FA, configure método e gere códigos de recuperação."
                          testID="settings-section-twofa"
                          title="Verificação em duas etapas"
                        >
                          <View style={styles.settingsInfoGrid}>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Status</Text>
                              <Text style={styles.settingsInfoText}>{resumo2FAStatus}</Text>
                            </View>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Códigos</Text>
                              <Text style={styles.settingsInfoText}>{resumoCodigosRecuperacao}</Text>
                            </View>
                          </View>
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Estratégia de proteção</Text>
                            <Text style={styles.settingsInfoText}>{resumo2FAFootnote}</Text>
                            <Text style={styles.settingsInfoSubtle}>Reautenticação atual: {reautenticacaoStatus}</Text>
                          </View>
                          <SettingsSwitchRow
                            description="Exige reautenticação antes de ativar ou desativar."
                            icon="shield-check-outline"
                            onValueChange={handleToggle2FA}
                            testID="settings-twofa-toggle-row"
                            title="Verificação em duas etapas"
                            value={twoFactorEnabled}
                          />
                          <SettingsSegmentedRow
                            description="Método preferido de confirmação."
                            icon="cellphone-key"
                            onChange={handleMudarMetodo2FA}
                            options={TWO_FACTOR_METHOD_OPTIONS}
                            testID="settings-twofa-method-row"
                            title="Método"
                            value={twoFactorMethod}
                          />
                          <SettingsSwitchRow
                            description="Códigos exibidos uma única vez ao gerar."
                            icon="key-chain-variant"
                            onValueChange={setRecoveryCodesEnabled}
                            title="Códigos de recuperação"
                            value={recoveryCodesEnabled}
                          />
                          <SettingsTextField
                            icon="numeric"
                            onChangeText={setCodigo2FA}
                            placeholder="Digite o código de confirmação"
                            testID="settings-twofa-code-field"
                            title="Código de confirmação"
                            value={codigo2FA}
                          />
                          <SettingsPressRow
                            icon="shield-check-outline"
                            onPress={handleConfirmarCodigo2FA}
                            testID="settings-twofa-confirm-row"
                            title="Confirmar código"
                          />
                          <SettingsPressRow
                            icon="content-copy"
                            onPress={handleGerarCodigosRecuperacao}
                            testID="settings-twofa-generate-recovery-row"
                            title="Gerar ou regenerar códigos"
                          />
                          <SettingsPressRow
                            description="Exporta os códigos em texto com confirmação de identidade."
                            icon="export-variant"
                            onPress={() => void handleCompartilharCodigosRecuperacao()}
                            testID="settings-twofa-share-recovery-row"
                            title="Compartilhar códigos de recuperação"
                            value={codigosRecuperacao.length ? `${codigosRecuperacao.length} códigos` : "Indisponível"}
                          />
                          {codigosRecuperacao.length ? (
                            <View style={styles.securityIntroCard}>
                              <Text style={styles.securityIntroTitle}>Códigos gerados</Text>
                              <Text style={styles.securityIntroText}>
                                Eles são mostrados uma única vez. Salve com segurança antes de sair desta tela.
                              </Text>
                              <View style={styles.securityRecoveryGrid}>
                                {codigosRecuperacao.map((codigo) => (
                                  <View key={codigo} style={styles.securityRecoveryCode}>
                                    <Text style={styles.securityRecoveryCodeText}>{codigo}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          ) : null}
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "protecaoDispositivo") ? (
                        <SettingsSection
                          icon="cellphone-lock"
                          subtitle="Proteja o acesso local ao aplicativo no dispositivo."
                          title="Proteção no dispositivo"
                        >
                          <SettingsSwitchRow
                            description="Usa biometria do sistema para desbloqueio local."
                            icon="fingerprint"
                            onValueChange={setDeviceBiometricsEnabled}
                            title="Desbloquear app com biometria"
                            value={deviceBiometricsEnabled}
                          />
                          <SettingsSwitchRow
                            description="Solicita autenticação ao abrir o app."
                            icon="shield-account-outline"
                            onValueChange={setRequireAuthOnOpen}
                            title="Exigir autenticação ao abrir"
                            value={requireAuthOnOpen}
                          />
                          <SettingsPressRow
                            icon="timer-lock-outline"
                            onPress={() => setLockTimeout((value) => nextOptionValue(value, LOCK_TIMEOUT_OPTIONS))}
                            title="Bloquear após inatividade"
                            value={lockTimeout}
                          />
                          <SettingsSwitchRow
                            description="Oculta informações sensíveis na multitarefa."
                            icon="eye-off-outline"
                            onValueChange={setHideInMultitask}
                            title="Ocultar conteúdo na multitarefa"
                            value={hideInMultitask}
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "verificacaoIdentidade") ? (
                        <SettingsSection
                          icon="shield-account-variant-outline"
                          subtitle="Ações críticas exigem reconfirmação da identidade."
                          title="Verificação de identidade"
                        >
                          <SettingsPressRow
                            description="Janela temporária para exportar dados, excluir conta e ações críticas."
                            icon="shield-refresh-outline"
                            onPress={handleReautenticacaoSensivel}
                            title="Reautenticar agora"
                            value={reautenticacaoStatus}
                          />
                          <SettingsPressRow
                            description="Exportar dados, apagar histórico, desativar 2FA ou remover o último provedor."
                            icon="alert-decagram-outline"
                            title="Ações protegidas"
                            value="Sempre confirmadas"
                          />
                          <Text style={styles.securityFootnote}>
                            A confiança desta verificação expira após um curto período e volta a ser exigida para ações sensíveis.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "atividadeSeguranca") ? (
                        <SettingsSection
                          icon="timeline-alert-outline"
                          subtitle="Acompanhe logins, conexões de provedores, exportações e eventos críticos."
                          title="Atividade de segurança"
                        >
                          <SettingsSegmentedRow
                            icon="filter-outline"
                            onChange={setFiltroEventosSeguranca}
                            options={SECURITY_EVENT_FILTERS}
                            title="Filtros"
                            value={filtroEventosSeguranca}
                          />
                          <View style={styles.securityStack}>
                            {eventosSegurancaFiltrados.map((item) => (
                              <SecurityEventCard item={item} key={item.id} />
                            ))}
                          </View>
                          <SettingsPressRow
                            danger
                            description="Use quando reconhecer uma atividade fora do esperado."
                            icon="alert-circle-outline"
                            onPress={handleReportarAtividadeSuspeita}
                            title="Reportar atividade suspeita"
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "dadosConversas") ? (
                        <SettingsSection
                          icon="forum-outline"
                          subtitle="Controle como conversas e dados da IA são armazenados."
                          testID="settings-section-dados-conversas"
                          title="Dados e conversas"
                        >
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Resumo do histórico</Text>
                            <Text style={styles.settingsInfoText}>
                              {resumoDadosConversas} • {conversasOcultasTotal} removida{conversasOcultasTotal === 1 ? "" : "s"} do histórico local
                            </Text>
                          </View>
                          <SettingsSwitchRow
                            icon="history"
                            onValueChange={setSalvarHistoricoConversas}
                            testID="settings-data-history-toggle-row"
                            title="Salvar histórico de conversas"
                            value={salvarHistoricoConversas}
                          />
                          <SettingsSwitchRow
                            description="Consentimento para melhoria da IA."
                            icon="share-variant-outline"
                            onValueChange={setCompartilharMelhoriaIa}
                            testID="settings-data-improve-toggle-row"
                            title="Permitir uso para melhoria da IA"
                            value={compartilharMelhoriaIa}
                          />
                          <SettingsPressRow
                            description="A exportação exige reautenticação."
                            icon="database-export-outline"
                            onPress={() => handleExportarDados("JSON")}
                            testID="settings-data-export-row"
                            title="Exportar conversas"
                            value="JSON"
                          />
                          <SettingsPressRow
                            description="A exportação exige reautenticação."
                            icon="file-pdf-box"
                            onPress={() => handleExportarDados("PDF")}
                            title="Exportar conversas"
                            value="PDF"
                          />
                          <SettingsPressRow
                            description="Abra o histórico lateral para fixar, retomar ou remover conversas específicas."
                            icon="playlist-edit"
                            onPress={handleGerenciarConversasIndividuais}
                            title="Gerenciar conversas individualmente"
                            value={`${conversasVisiveisTotal} ativas`}
                          />
                          <SettingsPressRow
                            description="Define por quanto tempo o histórico pode permanecer salvo."
                            icon="timer-sand"
                            onPress={() => setRetencaoDados((value) => nextOptionValue(value, DATA_RETENTION_OPTIONS))}
                            title="Retenção de dados"
                            value={retencaoDados}
                          />
                          <SettingsPressRow
                            danger
                            description="Confirmação obrigatória antes da exclusão."
                            icon="delete-sweep-outline"
                            onPress={handleApagarHistoricoConfiguracoes}
                            title="Apagar histórico"
                          />
                          <SettingsPressRow
                            danger
                            description="Remove todas as conversas locais e sincronizadas deste perfil."
                            icon="trash-can-outline"
                            onPress={handleLimparTodasConversasConfig}
                            title="Excluir conversas"
                          />
                          <SettingsSwitchRow
                            icon="cloud-sync-outline"
                            onValueChange={setBackupAutomatico}
                            title="Backup automático"
                            value={backupAutomatico}
                          />
                          <SettingsSwitchRow
                            icon="devices"
                            onValueChange={setSincronizacaoDispositivos}
                            title="Sincronização entre dispositivos"
                            value={sincronizacaoDispositivos}
                          />
                          <SettingsSwitchRow
                            icon="tag-text-outline"
                            onValueChange={setNomeAutomaticoConversas}
                            title="Nome automático de conversas"
                            value={nomeAutomaticoConversas}
                          />
                          <SettingsSwitchRow
                            icon="pin-outline"
                            onValueChange={setFixarConversas}
                            title="Fixar conversas"
                            value={fixarConversas}
                          />
                          <Text style={styles.securityFootnote}>
                            Quando o histórico é desativado, novas conversas deixam de ser persistidas no backend assim que essa política estiver ligada.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "permissoes") ? (
                        <SettingsSection
                          icon="shield-key-outline"
                          subtitle="Status atual de acesso ao microfone, câmera, arquivos, notificações e biometria."
                          title="Permissões"
                        >
                          <View style={styles.settingsInfoGrid}>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Resumo</Text>
                              <Text style={styles.settingsInfoText}>{resumoPermissoes}</Text>
                            </View>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Uso principal</Text>
                              <Text style={styles.settingsInfoText}>Anexos, voz, notificações e desbloqueio local.</Text>
                            </View>
                          </View>
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Permissões críticas</Text>
                            <Text style={styles.settingsInfoText}>{resumoPermissoesCriticas}</Text>
                          </View>
                          <SettingsPressRow
                            icon="microphone-outline"
                            onPress={() => handleGerenciarPermissao("Microfone", microfonePermitido ? "permitido" : "negado")}
                            title="Microfone"
                            value={microfonePermitido ? "Permitido" : "Negado"}
                          />
                          <SettingsPressRow
                            icon="camera-outline"
                            onPress={() => handleGerenciarPermissao("Câmera", cameraPermitida ? "permitido" : "negado")}
                            title="Câmera"
                            value={cameraPermitida ? "Permitido" : "Negado"}
                          />
                          <SettingsPressRow
                            icon="file-document-outline"
                            onPress={() => handleGerenciarPermissao("Arquivos", arquivosPermitidos ? "permitido" : "negado")}
                            title="Arquivos"
                            value={arquivosPermitidos ? "Permitido" : "Negado"}
                          />
                          <SettingsPressRow
                            icon="bell-outline"
                            onPress={() => handleGerenciarPermissao("Notificações", notificacoesPermitidas ? "permitido" : "negado")}
                            title="Notificações"
                            value={notificacoesPermitidas ? "Permitido" : "Negado"}
                          />
                          <SettingsPressRow
                            icon="fingerprint"
                            onPress={() => handleGerenciarPermissao("Biometria", biometriaPermitida ? "permitido" : "negado")}
                            title="Biometria"
                            value={biometriaPermitida ? "Permitido" : "Negado"}
                          />
                          <SettingsPressRow
                            description="Abra diretamente os ajustes do Android para revisar todas as permissões deste app."
                            icon="open-in-app"
                            onPress={() => handleAbrirAjustesDoSistema("as permissões do app do inspetor")}
                            title="Abrir ajustes do sistema"
                          />
                          <SettingsPressRow
                            description="Reúne câmera, arquivos e notificações, que são as permissões mais sensíveis no fluxo do inspetor."
                            icon="shield-sync-outline"
                            onPress={handleRevisarPermissoesCriticas}
                            title="Revisar permissões críticas"
                            value={permissoesNegadasTotal ? `${permissoesNegadasTotal} pendente(s)` : "Tudo certo"}
                          />
                          <Text style={styles.securityFootnote}>
                            Quando negada, a ação levará o usuário para as configurações do sistema com contexto de uso claro.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "segurancaArquivos") ? (
                        <SettingsSection
                          icon="file-lock-outline"
                          subtitle="Uploads são tratados como área crítica com validação e armazenamento protegido."
                          title="Segurança de arquivos enviados"
                        >
                          <View style={styles.securityIntroCard}>
                            <Text style={styles.securityIntroTitle}>Regras de upload</Text>
                            <Text style={styles.securityIntroText}>
                              Tipos aceitos: PDF, JPG, PNG e DOCX. Tamanho máximo por arquivo: 20 MB.
                            </Text>
                            <Text style={styles.securityIntroText}>
                              Os arquivos são validados no backend, associados ao usuário correto e servidos apenas por autorização.
                            </Text>
                          </View>
                          <SettingsPressRow
                            icon="shield-check-outline"
                            title="Validação de tipo e tamanho"
                            value="Ativa"
                          />
                          <SettingsPressRow
                            icon="link-variant"
                            title="URLs protegidas"
                            value="Assinadas"
                          />
                          <SettingsPressRow
                            icon="alert-octagon-outline"
                            title="Falhas e bloqueios"
                            value="Com feedback"
                          />
                          <Text style={styles.securityFootnote}>
                            O frontend nunca confia sozinho no arquivo enviado: validação, renomeação segura e controle de acesso são responsabilidade do backend.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "privacidadeNotificacoes") ? (
                        <SettingsSection
                          icon="bell-cog-outline"
                          subtitle="Defina o quanto aparece das mensagens nas notificações."
                          testID="settings-section-privacidade-notificacoes"
                          title="Privacidade em notificações"
                        >
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Prévia atual</Text>
                            <Text style={styles.settingsInfoText}>{resumoPrivacidadeNotificacoes}</Text>
                          </View>
                          <SettingsSwitchRow
                            description="Mostra o conteúdo da conversa quando permitido."
                            icon="message-text-outline"
                            onValueChange={handleToggleMostrarConteudoNotificacao}
                            testID="settings-notification-show-content-row"
                            title="Mostrar conteúdo da mensagem"
                            value={mostrarConteudoNotificacao}
                          />
                          <SettingsSwitchRow
                            description="Nunca exibe prévias na tela bloqueada."
                            icon="cellphone-lock"
                            onValueChange={handleToggleOcultarConteudoBloqueado}
                            testID="settings-notification-hide-locked-row"
                            title="Ocultar conteúdo na tela bloqueada"
                            value={ocultarConteudoBloqueado}
                          />
                          <SettingsSwitchRow
                            description='Exibe apenas o aviso "Nova mensagem".'
                            icon="message-badge-outline"
                            onValueChange={handleToggleMostrarSomenteNovaMensagem}
                            testID="settings-notification-show-generic-row"
                            title='Mostrar apenas "Nova mensagem"'
                            value={mostrarSomenteNovaMensagem}
                          />
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Como aparece hoje</Text>
                            <Text style={styles.settingsInfoText}>{previewPrivacidadeNotificacao}</Text>
                            <Text style={styles.settingsInfoSubtle}>
                              Esse exemplo respeita as combinações atuais de privacidade dentro do app.
                            </Text>
                          </View>
                          <Text style={styles.securityFootnote}>
                            Em modo privado, o app evita mostrar conteúdo sensível na tela bloqueada e reduz a prévia das conversas.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("seguranca", "excluirConta") ? (
                        <SettingsSection
                          icon="alert-outline"
                          subtitle="Área crítica para remoção permanente da conta."
                          testID="settings-section-excluir-conta"
                          title="Excluir conta"
                        >
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Impacto da exclusão</Text>
                            <Text style={styles.settingsInfoText}>{resumoExcluirConta}</Text>
                          </View>
                          <View style={styles.settingsMiniList}>
                            <View style={styles.settingsMiniListItem}>
                              <Text style={styles.settingsMiniListTitle}>O que será removido</Text>
                              <Text style={styles.settingsMiniListMeta}>Conta, sessões, histórico de conversas, preferências e tokens ativos deste perfil.</Text>
                            </View>
                            <View style={styles.settingsMiniListItem}>
                              <Text style={styles.settingsMiniListTitle}>Política de recuperação</Text>
                              <Text style={styles.settingsMiniListMeta}>Nesta versão do app, a exclusão é tratada como permanente e exige múltiplas confirmações.</Text>
                            </View>
                          </View>
                          <SettingsPressRow
                            description="Faça um backup do perfil antes da exclusão definitiva."
                            icon="database-export-outline"
                            onPress={handleExportarAntesDeExcluirConta}
                            testID="settings-delete-export-before-row"
                            title="Exportar dados antes de excluir"
                            value="JSON"
                          />
                          <SettingsPressRow
                            description="Ações destrutivas só seguem quando a verificação de identidade está válida."
                            icon="shield-refresh-outline"
                            onPress={handleReautenticacaoSensivel}
                            testID="settings-delete-reauth-row"
                            title="Status da reautenticação"
                            value={reautenticacaoStatus}
                          />
                          <SettingsPressRow
                            description="Ação destrutiva com múltiplas confirmações e reautenticação."
                            danger
                            icon="delete-alert-outline"
                            onPress={handleExcluirConta}
                            testID="settings-delete-account-row"
                            title="Excluir conta permanentemente"
                          />
                          <Text style={styles.securityFootnote}>
                            Essa ação invalidará sessões e tokens e removerá os dados conforme a política do sistema.
                          </Text>
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesPage("sistemaSuporte") && !settingsDrawerSectionMenuAtiva && mostrarGrupoSistema ? (
                          <SettingsGroupLabel
                            description="Recursos extras, manutenção do app e canais de ajuda."
                            title="Sistema e suporte"
                          />
                        ) : null}
                        {settingsDrawerMatchesSection("sistemaSuporte", "recursosAvancados") ? (
                        <SettingsSection
                          icon="flask-outline"
                          subtitle="Ative recursos extras e integrações do app."
                          testID="settings-section-recursos-avancados"
                          title="Recursos avançados"
                        >
                          <SettingsSwitchRow
                            icon="microphone-outline"
                            onValueChange={setEntradaPorVoz}
                            testID="settings-advanced-voice-input-row"
                            title="Entrada por voz"
                            value={entradaPorVoz}
                          />
                          <SettingsSwitchRow
                            icon="speaker-wireless"
                            onValueChange={setRespostaPorVoz}
                            testID="settings-advanced-voice-output-row"
                            title="Resposta por voz"
                            value={respostaPorVoz}
                          />
                          <SettingsSwitchRow
                            description="PDF, imagens e documentos no chat."
                            icon="paperclip"
                            onValueChange={setUploadArquivosAtivo}
                            testID="settings-advanced-upload-row"
                            title="Upload de arquivos"
                            value={uploadArquivosAtivo}
                          />
                          <SettingsPressRow
                            icon="connection"
                            onPress={handleIntegracoesExternas}
                            testID="settings-advanced-integrations-row"
                            title="Integrações"
                            value="Google Drive, Slack, Notion"
                          />
                          <SettingsPressRow
                            icon="puzzle-outline"
                            onPress={handlePluginsIa}
                            testID="settings-advanced-plugins-row"
                            title="Plugins"
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("sistemaSuporte", "sistema") ? (
                        <SettingsSection
                          icon="cellphone-cog"
                          subtitle="Idioma, região, bateria e informações técnicas do app."
                          testID="settings-section-sistema"
                          title="Sistema"
                        >
                          <SettingsPressRow
                            icon="translate"
                            onPress={() => setIdiomaApp((value) => nextOptionValue(value, APP_LANGUAGE_OPTIONS))}
                            testID="settings-system-language-row"
                            title="Idioma do aplicativo"
                            value={idiomaApp}
                          />
                          <SettingsPressRow
                            icon="map-marker-radius-outline"
                            onPress={() => setRegiaoApp((value) => nextOptionValue(value, REGION_OPTIONS))}
                            testID="settings-system-region-row"
                            title="Região"
                            value={regiaoApp}
                          />
                          <SettingsSwitchRow
                            icon="signal-cellular-outline"
                            onValueChange={setEconomiaDados}
                            testID="settings-system-data-saver-row"
                            title="Economia de dados"
                            value={economiaDados}
                          />
                          <SettingsPressRow
                            icon="battery-heart-variant"
                            onPress={() => setUsoBateria((value) => nextOptionValue(value, BATTERY_OPTIONS))}
                            testID="settings-system-battery-row"
                            title="Uso de bateria"
                            value={usoBateria}
                          />
                          <SettingsPressRow
                            description={APP_BUILD_CHANNEL}
                            icon="information-outline"
                            title="Versão do aplicativo"
                            value={APP_VERSION_LABEL}
                          />
                          <SettingsPressRow
                            icon="refresh-circle"
                            onPress={handleVerificarAtualizacoes}
                            testID="settings-system-check-updates-row"
                            title="Verificar atualizações"
                            value={ultimaVerificacaoAtualizacaoLabel}
                          />
                          <SettingsPressRow
                            icon="bell-badge-outline"
                            onPress={() => {
                              fecharConfiguracoes();
                              handleAbrirCentralAtividade();
                            }}
                            testID="settings-system-activity-center-row"
                            title="Central de atividade"
                          />
                          <SettingsPressRow
                            icon="cloud-upload-outline"
                            onPress={() => {
                              fecharConfiguracoes();
                              setFilaOfflineAberta(true);
                            }}
                            testID="settings-system-offline-queue-row"
                            title="Fila offline"
                          />
                          <SettingsPressRow
                            icon="refresh"
                            onPress={() => {
                              fecharConfiguracoes();
                              void handleRefresh();
                            }}
                            testID="settings-system-refresh-row"
                            title="Atualizar dados"
                          />
                        </SettingsSection>
                        ) : null}

                        {settingsDrawerMatchesSection("sistemaSuporte", "suporte") ? (
                        <SettingsSection
                          icon="lifebuoy"
                          subtitle="Ajuda, feedback e documentos do aplicativo."
                          testID="settings-section-suporte"
                          title="Suporte"
                        >
                          <View style={styles.settingsInfoGrid}>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Build em uso</Text>
                              <Text style={styles.settingsInfoText}>{resumoSuporteApp}</Text>
                            </View>
                            <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
                              <Text style={styles.settingsInfoTitle}>Retorno</Text>
                              <Text style={styles.settingsInfoText}>{emailAtualConta || email || "Defina um email na conta"}</Text>
                            </View>
                          </View>
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Fila local de suporte</Text>
                            <Text style={styles.settingsInfoText}>{resumoFilaSuporteLocal}</Text>
                            {ultimoTicketSuporte ? (
                              <Text style={styles.settingsInfoSubtle}>
                                Último envio • {ultimoTicketSuporte.kind === "bug" ? "Bug" : "Feedback"} •{" "}
                                {formatarHorarioAtividade(ultimoTicketSuporte.createdAt)}
                              </Text>
                            ) : null}
                          </View>
                          <SettingsPressRow
                            icon="book-open-page-variant-outline"
                            onPress={handleCentralAjuda}
                            testID="settings-support-help-center-row"
                            title="Central de ajuda"
                            value={`${artigosAjudaFiltrados.length} guia(s)`}
                          />
                          <SettingsPressRow
                            icon="bug-outline"
                            onPress={handleReportarProblema}
                            testID="settings-support-report-bug-row"
                            title="Reportar problema"
                            value={ticketsBugTotal ? `${ticketsBugTotal} na fila` : "Diagnóstico"}
                          />
                          <SettingsPressRow
                            icon="message-draw"
                            onPress={handleEnviarFeedback}
                            testID="settings-support-send-feedback-row"
                            title="Enviar feedback"
                            value={ticketsFeedbackTotal ? `${ticketsFeedbackTotal} na fila` : "Sugestões"}
                          />
                          <SettingsPressRow
                            icon="file-export-outline"
                            onPress={() => {
                              void handleExportarDiagnosticoApp();
                            }}
                            testID="settings-support-export-diagnostic-row"
                            title="Exportar diagnóstico"
                            value="TXT"
                          />
                          <SettingsPressRow
                            icon="file-document-check-outline"
                            onPress={handleTermosUso}
                            testID="settings-support-terms-row"
                            title="Termos de uso"
                          />
                          <SettingsPressRow
                            icon="scale-balance"
                            onPress={handleLicencas}
                            testID="settings-support-licenses-row"
                            title="Licenças"
                          />
                          {filaSuporteLocal.length ? (
                            <SettingsPressRow
                              danger
                              icon="tray-remove"
                              onPress={handleLimparFilaSuporteLocal}
                              title="Limpar fila local"
                              value="Remover itens"
                            />
                          ) : null}
                        </SettingsSection>
                        ) : null}
                        {!totalSecoesConfiguracaoVisiveis ? (
                          <View style={styles.settingsInfoCard}>
                            <Text style={styles.settingsInfoTitle}>Nenhuma seção encontrada</Text>
                            <Text style={styles.settingsInfoText}>
                              Ajuste a busca ou troque o filtro para localizar o bloco certo mais rápido.
                            </Text>
                          </View>
                        ) : null}
                    </ScrollView>
                  </Animated.View>
                ) : null}
              </View>
            </Modal>

            <Modal
              animationType="slide"
              onRequestClose={() => setCentralAtividadeAberta(false)}
              transparent
              visible={centralAtividadeAberta}
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
                    <Pressable
                      onPress={() => setCentralAtividadeAberta(false)}
                      style={styles.activityModalClose}
                    >
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
                          onPress={() => void handleAbrirNotificacao(item)}
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

            <Modal
              animationType="slide"
              onRequestClose={() => setFilaOfflineAberta(false)}
              transparent
              visible={filaOfflineAberta}
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
                    <Pressable
                      onPress={() => setFilaOfflineAberta(false)}
                      style={styles.activityModalClose}
                    >
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
                        onPress={() => void sincronizarFilaOffline(session.accessToken)}
                        style={[
                          styles.offlineModalSyncButton,
                          !podeSincronizarFilaOffline ? styles.offlineModalSyncButtonDisabled : null,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={podeSincronizarFilaOffline ? "upload-outline" : statusApi === "online" ? "timer-sand" : "cloud-off-outline"}
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

                  <View style={styles.offlineModalFilters}>
                    {filtrosFilaOffline.map((filtro) => {
                      const ativo = filtroFilaOffline === filtro.key;
                      return (
                        <Pressable
                          key={filtro.key}
                          onPress={() => setFiltroFilaOffline(filtro.key)}
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
                              disabled={statusApi !== "online" || sincronizandoFilaOffline || Boolean(sincronizandoItemFilaId)}
                              onPress={() => void sincronizarItemFilaOffline(item)}
                              style={[
                                styles.offlineModalActionGhost,
                                statusApi !== "online" || sincronizandoFilaOffline || Boolean(sincronizandoItemFilaId)
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
                                  statusApi !== "online" || sincronizandoFilaOffline || Boolean(sincronizandoItemFilaId)
                                    ? styles.offlineModalActionGhostTextDisabled
                                    : null,
                                ]}
                              >
                                {pendenciaFilaProntaParaReenvio(item) ? "Enviar agora" : "Forçar agora"}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void handleRetomarItemFilaOffline(item)}
                              style={styles.offlineModalActionPrimary}
                            >
                              <MaterialCommunityIcons name="reply-outline" size={16} color={colors.white} />
                              <Text style={styles.offlineModalActionPrimaryText}>Retomar</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => removerItemFilaOffline(item.id)}
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
                          name={filaOfflineOrdenada.length ? "filter-variant" : "cloud-check-outline"}
                          size={26}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.activityEmptyTitle}>
                          {filaOfflineOrdenada.length ? "Nenhuma pendência neste filtro" : "Fila offline vazia"}
                        </Text>
                        <Text style={styles.activityEmptyText}>
                          {filaOfflineOrdenada.length
                            ? "Troque entre Tudo, Chat e Mesa para localizar a pendência certa mais rápido."
                            : "Quando o app guardar um envio local, ele aparece aqui para você retomar ou sincronizar depois."}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              </View>
            </Modal>

            <Modal
              animationType="slide"
              onRequestClose={fecharSheetConfiguracao}
              transparent
              visible={Boolean(settingsSheet)}
            >
              <View style={styles.activityModalBackdrop}>
                <View style={styles.activityModalCard}>
                  <View style={styles.activityModalHeader}>
                    <View style={styles.activityModalCopy}>
                      <Text style={styles.activityModalEyebrow}>tariel.ia</Text>
                      <Text style={styles.activityModalTitle}>{settingsSheet?.title}</Text>
                      <Text style={styles.activityModalDescription}>{settingsSheet?.subtitle}</Text>
                    </View>
                    <Pressable onPress={fecharSheetConfiguracao} style={styles.activityModalClose}>
                      <MaterialCommunityIcons name="close" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </View>

                  <ScrollView contentContainerStyle={styles.settingsSheetContent}>
                    {renderSettingsSheetBody()}
                    {settingsSheetNotice ? (
                      <View style={styles.settingsSheetNotice}>
                        <MaterialCommunityIcons name="check-decagram" size={18} color={colors.success} />
                        <Text style={styles.settingsSheetNoticeText}>{settingsSheetNotice}</Text>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.settingsSheetFooter}>
                    <Pressable onPress={fecharSheetConfiguracao} style={styles.settingsSheetGhostButton}>
                      <Text style={styles.settingsSheetGhostButtonText}>Fechar</Text>
                    </Pressable>
                    {settingsSheet?.actionLabel ? (
                      <Pressable
                        disabled={settingsSheetLoading}
                        onPress={() => void handleConfirmarSettingsSheet()}
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

            <Modal
              animationType="fade"
              onRequestClose={fecharConfirmacaoConfiguracao}
              transparent
              visible={Boolean(confirmSheet)}
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
                        onChangeText={setConfirmTextDraft}
                        placeholder={confirmSheet.confirmPhrase}
                        placeholderTextColor={colors.textSecondary}
                        style={styles.settingsTextField}
                        value={confirmTextDraft}
                      />
                    </View>
                  ) : null}

                  <View style={styles.settingsSheetFooter}>
                    <Pressable onPress={fecharConfirmacaoConfiguracao} style={styles.settingsSheetGhostButton}>
                      <Text style={styles.settingsSheetGhostButtonText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      disabled={Boolean(confirmSheet?.confirmPhrase) && confirmTextDraft.trim().toUpperCase() !== confirmSheet?.confirmPhrase}
                      onPress={handleConfirmarAcaoCritica}
                      style={[
                        styles.confirmSheetDangerButton,
                        Boolean(confirmSheet?.confirmPhrase) && confirmTextDraft.trim().toUpperCase() !== confirmSheet?.confirmPhrase
                          ? styles.settingsSheetPrimaryButtonDisabled
                          : null,
                      ]}
                    >
                      <Text style={styles.confirmSheetDangerButtonText}>{confirmSheet?.confirmLabel}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

            <Modal
              animationType="fade"
              onRequestClose={() => setPreviewAnexoImagem(null)}
              transparent
              visible={Boolean(previewAnexoImagem)}
            >
              <View style={styles.attachmentModalBackdrop}>
                <View style={styles.attachmentModalCard}>
                  <View style={styles.attachmentModalHeader}>
                    <Text numberOfLines={1} style={styles.attachmentModalTitle}>
                      {previewAnexoImagem?.titulo || "Imagem anexada"}
                    </Text>
                    <Pressable
                      onPress={() => setPreviewAnexoImagem(null)}
                      style={styles.attachmentModalClose}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={colors.white} />
                    </Pressable>
                  </View>

                  {previewAnexoImagem?.uri && session ? (
                    <Image
                      resizeMode="contain"
                      source={{
                        uri: previewAnexoImagem.uri,
                        headers: {
                          Authorization: `Bearer ${session.accessToken}`,
                        },
                      }}
                      style={styles.attachmentModalImage}
                    />
                  ) : null}
                </View>
              </View>
            </Modal>
          </KeyboardAvoidingView>
        </SafeAreaView>
        <BrandLaunchOverlay accentColor={accentColor} animationsEnabled={animacoesAtivas} onDone={() => setIntroVisivel(false)} visible={introVisivel} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.surfaceSoft, colors.surface]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={keyboardAvoidingBehavior}
          keyboardVerticalOffset={loginKeyboardVerticalOffset}
        >
          <ScrollView
            contentContainerStyle={[
              styles.loginScrollContent,
              keyboardVisible ? styles.loginScrollContentKeyboardVisible : null,
              { paddingBottom: loginKeyboardBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.loginScreen}>
              <View style={styles.loginBrand}>
                <BrandIntroMark brandColor={accentColor} compact />
              </View>

              <View style={styles.loginCard}>
              {carregando ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingText}>Preparando o app do inspetor...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.loginFields}>
                    <View style={styles.mobileField}>
                      <MaterialCommunityIcons name="email-outline" size={22} color={colors.ink600} />
                      <TextInput
                        ref={emailInputRef}
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        importantForAutofill="yes"
                        keyboardType="email-address"
                        onChangeText={setEmail}
                        onSubmitEditing={() => senhaInputRef.current?.focus()}
                        placeholder="Email"
                        placeholderTextColor="#8EA0B3"
                        returnKeyType="next"
                        style={[styles.mobileFieldInput, { fontSize: 17 * fontScale }]}
                        testID="login-email-input"
                        textContentType="emailAddress"
                        value={email}
                      />
                    </View>

                    <View style={styles.mobileField}>
                      <MaterialCommunityIcons name="lock-outline" size={22} color={colors.ink600} />
                      <TextInput
                        ref={senhaInputRef}
                        autoCapitalize="none"
                        autoComplete="password"
                        importantForAutofill="yes"
                        onChangeText={setSenha}
                        onSubmitEditing={() => {
                          if (!entrando) {
                            void handleLogin();
                          }
                        }}
                        placeholder="Password"
                        placeholderTextColor="#8EA0B3"
                        returnKeyType="done"
                        secureTextEntry={!mostrarSenha}
                        style={[styles.mobileFieldInput, { fontSize: 17 * fontScale }]}
                        testID="login-password-input"
                        textContentType="password"
                        value={senha}
                      />
                      <Pressable
                        onPress={() => setMostrarSenha((current) => !current)}
                        style={styles.mobileFieldAction}
                        testID="toggle-password-visibility-button"
                      >
                        <MaterialCommunityIcons
                          name={mostrarSenha ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color="#8EA0B3"
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.loginForgotRow}>
                    <View />
                    <Pressable onPress={handleEsqueciSenha}>
                      <Text style={styles.loginForgotLink}>Esqueceu a senha?</Text>
                    </Pressable>
                  </View>

                  {!!erro && <Text style={styles.errorText}>{erro}</Text>}

                  <Pressable
                    disabled={entrando}
                    onPress={handleLogin}
                    style={[
                      styles.loginPrimaryButton,
                      { backgroundColor: accentColor, shadowColor: accentColor },
                      entrando && styles.primaryButtonDisabled,
                    ]}
                    testID="login-submit-button"
                  >
                    {entrando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.loginPrimaryButtonText}>Login</Text>}
                  </Pressable>

                  <View style={styles.loginDividerRow}>
                    <View style={styles.loginDividerLine} />
                    <Text style={styles.loginDividerText}>ou</Text>
                    <View style={styles.loginDividerLine} />
                  </View>

                  <View style={styles.loginSocialStack}>
                    <Text style={styles.loginSocialLabel}>Entrar com</Text>
                    <Pressable
                      onPress={() => handleLoginSocial("Google")}
                      style={styles.loginSocialButton}
                      testID="login-google-button"
                    >
                      <View style={styles.loginSocialIconShell}>
                        <MaterialCommunityIcons name="google" size={18} color={colors.textPrimary} />
                      </View>
                      <Text style={styles.loginSocialButtonText}>Continuar com Google</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleLoginSocial("Microsoft")}
                      style={styles.loginSocialButton}
                      testID="login-microsoft-button"
                    >
                      <View style={styles.loginSocialIconShell}>
                        <MaterialCommunityIcons name="microsoft-windows" size={18} color={colors.textPrimary} />
                      </View>
                      <Text style={styles.loginSocialButtonText}>Continuar com Microsoft</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.loginFooterText}>
                    Precisa de acesso? Fale com o administrador da sua empresa.
                  </Text>
                </>
              )}
            </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <BrandLaunchOverlay accentColor={accentColor} animationsEnabled={animacoesAtivas} onDone={() => setIntroVisivel(false)} visible={introVisivel} />
    </LinearGradient>
  );
}

