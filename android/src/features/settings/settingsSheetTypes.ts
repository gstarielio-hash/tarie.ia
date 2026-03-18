export type SettingsSheetKind =
  | "aiModel"
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
  | "terms"
  | "licenses"
  | "legal"
  | "privacy"
  | "integrations"
  | "plugins"
  | "updates";

export interface SettingsSheetState {
  kind: SettingsSheetKind;
  title: string;
  subtitle: string;
  actionLabel?: string;
}

export type ConfirmSheetKind =
  | "clearHistory"
  | "clearConversations"
  | "deleteAccount"
  | "provider"
  | "security"
  | "session"
  | "sessionCurrent"
  | "sessionOthers";

export interface ConfirmSheetState {
  kind: ConfirmSheetKind;
  title: string;
  description: string;
  confirmLabel: string;
  confirmPhrase?: string;
  onConfirm?: () => void;
}
