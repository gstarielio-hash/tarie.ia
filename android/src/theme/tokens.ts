export const colors = {
  ink900: "#0B1623",
  ink800: "#14263D",
  ink700: "#1E3350",
  ink600: "#435D79",
  surface: "#F2F0EC",
  surfaceSoft: "#F7F5F1",
  surfaceCanvas: "#FBFAF7",
  surfacePanel: "#FFFFFF",
  surfacePanelRaised: "#FFFFFF",
  surfaceMuted: "#EEE9E2",
  surfaceStroke: "#E1DBD2",
  surfaceStrokeStrong: "#D2C9BF",
  white: "#FFFFFF",
  textPrimary: "#122033",
  textSecondary: "#617184",
  textMuted: "#8A98A7",
  textInverse: "#F3F6F9",
  accent: "#F47B20",
  accentSoft: "#F5A15F",
  accentMuted: "#FBD7B5",
  accentWash: "#FFF3E8",
  success: "#2B9467",
  successSoft: "#C9E8D9",
  successWash: "#F1FAF5",
  warning: "#C78329",
  warningSoft: "#F0D7B7",
  warningWash: "#FFF8EC",
  info: "#2F76D2",
  infoSoft: "#CDDEF5",
  infoWash: "#F1F6FD",
  danger: "#CB5A58",
  dangerSoft: "#F2C9C8",
  dangerWash: "#FDF1F1",
  overlaySoft: "rgba(11,22,35,0.12)",
  overlayStrong: "rgba(11,22,35,0.48)",
  overlayOpaque: "rgba(11,22,35,0.78)",
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radii = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
};

export const typography = {
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bodySm: {
    fontSize: 13,
    lineHeight: 18,
  },
  titleSm: {
    fontSize: 17,
    fontWeight: "700",
  },
  titleMd: {
    fontSize: 24,
    fontWeight: "800",
  },
  titleLg: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  itemTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
} as const;

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export const componentSizes = {
  controlSm: 40,
  controlMd: 48,
  controlLg: 56,
  listRow: 60,
  listRowTall: 64,
  iconShellSm: 36,
  iconShellMd: 40,
} as const;

export const shadows = {
  soft: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  card: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  panel: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  floating: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;
