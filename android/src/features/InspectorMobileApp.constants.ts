import * as FileSystem from "expo-file-system/legacy";
import { Dimensions } from "react-native";

export const TOKEN_KEY = "tariel_inspetor_access_token";
export const EMAIL_KEY = "tariel_inspetor_email";
export const OFFLINE_QUEUE_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-offline-queue.json`;
export const NOTIFICATIONS_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-activity-feed.json`;
export const READ_CACHE_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-read-cache.json`;
export const APP_PREFERENCES_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}tariel-app-preferences.json`;
export const MAX_NOTIFICATIONS = 40;
export const TARIEL_APP_MARK = require("../../assets/icon.png");
export const SCREEN_WIDTH = Dimensions.get("window").width;
export const SIDE_PANEL_WIDTH = Math.min(372, Math.max(304, SCREEN_WIDTH * 0.82));
export const HISTORY_PANEL_CLOSED_X = -SIDE_PANEL_WIDTH - 24;
export const SETTINGS_PANEL_CLOSED_X = SIDE_PANEL_WIDTH + 24;
export const PANEL_ANIMATION_DURATION = 220;
export const PANEL_EDGE_GESTURE_WIDTH = 28;
export const PANEL_OPEN_SWIPE_THRESHOLD = 34;
export const PANEL_CLOSE_SWIPE_THRESHOLD = 40;
export const PANEL_EDGE_GESTURE_TOP_OFFSET = 78;
export const APP_VERSION_LABEL = "1.0.0 preview";
export const APP_BUILD_CHANNEL = "Prévia do inspetor";

export const AI_MODEL_OPTIONS = ["rápido", "equilibrado", "avançado"] as const;
export const RESPONSE_STYLE_OPTIONS = ["curto", "padrão", "detalhado", "criativo"] as const;
export const RESPONSE_LANGUAGE_OPTIONS = ["Português", "Inglês", "Espanhol", "Auto detectar"] as const;
export const CONVERSATION_TONE_OPTIONS = ["profissional", "casual", "técnico", "amigável"] as const;
export const THEME_OPTIONS = ["claro", "escuro", "automático"] as const;
export const FONT_SIZE_OPTIONS = ["pequeno", "médio", "grande"] as const;
export const DENSITY_OPTIONS = ["compacta", "confortável"] as const;
export const ACCENT_OPTIONS = ["azul", "laranja", "roxo", "personalizado"] as const;
export const NOTIFICATION_SOUND_OPTIONS = ["Ping", "Sino curto", "Silencioso"] as const;
export const APP_LANGUAGE_OPTIONS = ["Português", "Inglês", "Espanhol"] as const;
export const REGION_OPTIONS = ["Brasil", "Estados Unidos", "Europa"] as const;
export const BATTERY_OPTIONS = ["Otimizado", "Desempenho", "Econômico"] as const;
export const PAYMENT_CARD_OPTIONS = ["Visa final 4242", "Mastercard final 1034", "Sem cartão"] as const;
export const PLAN_OPTIONS = ["Free", "Pro", "Enterprise"] as const;
export const TEMPERATURE_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
export const LOCK_TIMEOUT_OPTIONS = ["imediatamente", "1 minuto", "5 minutos", "15 minutos", "nunca"] as const;
export const TWO_FACTOR_METHOD_OPTIONS = ["App autenticador", "Email"] as const;
export const SECURITY_EVENT_FILTERS = ["todos", "críticos", "acessos"] as const;
export const DATA_RETENTION_OPTIONS = ["30 dias", "90 dias", "1 ano", "Até excluir"] as const;
export const SETTINGS_DRAWER_FILTERS = [
  { key: "todos", label: "Tudo" },
  { key: "prioridades", label: "Agora" },
  { key: "acesso", label: "Conta" },
  { key: "experiencia", label: "App" },
  { key: "seguranca", label: "Segurança" },
  { key: "sistema", label: "Sistema" },
] as const;
export const HISTORY_DRAWER_FILTERS = [
  { key: "todos", label: "Tudo" },
  { key: "fixadas", label: "Fixadas" },
  { key: "recentes", label: "Recentes" },
] as const;
export const HELP_CENTER_ARTICLES = [
  {
    id: "help-primeiros-passos",
    title: "Primeiros passos no laudo",
    category: "Operação",
    summary: "Como abrir um registro limpo, conversar com a Tariel.ia e ganhar velocidade em campo.",
    body:
      "Comece descrevendo o local, o achado principal e o impacto observado. A Tariel.ia transforma isso em um registro técnico claro, sugere próximos passos e organiza o contexto do laudo para você continuar sem sobrecarregar a tela.",
    estimatedRead: "2 min",
  },
  {
    id: "help-mesa-avaliadora",
    title: "Quando usar a aba Mesa",
    category: "Mesa",
    summary: "Entenda quando a mesa aparece e como responder de forma objetiva e útil.",
    body:
      "A aba Mesa é reservada para retornos da equipe avaliadora. Quando houver uma solicitação, responda de forma direta, com evidências e contexto. Se ainda não existir conversa da mesa, foque apenas no chat principal para não fragmentar a inspeção.",
    estimatedRead: "3 min",
  },
  {
    id: "help-fila-offline",
    title: "Fila offline e retomada",
    category: "Conectividade",
    summary: "Saiba como o app guarda mensagens, anexos e respostas quando a internet falha.",
    body:
      "Sempre que a conexão cair, o app guarda localmente as mensagens e anexos permitidos. Quando a rede voltar, você pode sincronizar tudo pela fila offline ou retomar manualmente uma pendência para revisar o texto antes do reenvio.",
    estimatedRead: "2 min",
  },
  {
    id: "help-seguranca-conta",
    title: "Segurança da conta do inspetor",
    category: "Segurança",
    summary: "Reautenticação, 2FA e permissões do dispositivo em linguagem simples.",
    body:
      "Use contas conectadas, verificação em duas etapas e proteção local do dispositivo para reduzir risco de acesso indevido. Ações críticas, como exportar dados ou excluir a conta, pedem confirmação extra para manter a operação segura.",
    estimatedRead: "4 min",
  },
] as const;
export const UPDATE_CHANGELOG = [
  {
    id: "update-1",
    title: "Branding Tariel no mobile",
    summary: "Launcher, login e estados vazios agora usam a identidade TG com acentos mais sutis.",
  },
  {
    id: "update-2",
    title: "Drawer lateral de histórico e configurações",
    summary: "Os painéis agora abrem sobre o chat, com gesto lateral e foco melhor na conversa.",
  },
  {
    id: "update-3",
    title: "Engrenagem em evolução",
    summary: "Conta, segurança, permissões, privacidade e suporte ficaram mais vivos dentro do app.",
  },
] as const;

export const EXTERNAL_INTEGRATION_OPTIONS = [
  {
    id: "google_drive",
    label: "Google Drive",
    description: "Enviar evidências e anexos do laudo direto para pasta operacional.",
    icon: "google",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Notificar equipe sobre retornos da mesa e pendências críticas.",
    icon: "slack",
  },
  {
    id: "notion",
    label: "Notion",
    description: "Sincronizar resumos técnicos do laudo para base de conhecimento.",
    icon: "notebook-outline",
  },
] as const;

export const TERMS_OF_USE_SECTIONS = [
  {
    id: "escopo",
    title: "Escopo de uso",
    body: "O aplicativo é destinado ao registro técnico de inspeções e apoio à comunicação com a mesa avaliadora.",
  },
  {
    id: "responsabilidade",
    title: "Responsabilidade do usuário",
    body: "As evidências enviadas devem ser verdadeiras, completas e respeitar as políticas de segurança da organização.",
  },
  {
    id: "dados",
    title: "Tratamento de dados",
    body: "Dados de sessão, histórico e segurança podem ser armazenados conforme as preferências locais e a política do sistema.",
  },
  {
    id: "restricoes",
    title: "Restrições",
    body: "É proibido usar o app para conteúdo ilícito, tentativa de fraude, bypass de autenticação ou acesso não autorizado.",
  },
] as const;

export const LICENSES_CATALOG = [
  {
    id: "react-native",
    name: "React Native",
    license: "MIT",
    source: "https://github.com/facebook/react-native",
  },
  {
    id: "expo",
    name: "Expo SDK",
    license: "MIT",
    source: "https://github.com/expo/expo",
  },
  {
    id: "mdi",
    name: "Material Design Icons",
    license: "Apache-2.0",
    source: "https://github.com/Templarian/MaterialDesign",
  },
] as const;
