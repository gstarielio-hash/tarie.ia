import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { colors, radii, spacing } from "../theme/tokens";

type AssistantContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

interface CitationItem {
  artigo: string;
  key: string;
  norma: string;
  trecho: string;
  url: string;
}

interface AssistantMessageContentProps {
  text: string;
  textStyle?: StyleProp<TextStyle>;
}

interface AssistantCitationListProps {
  citations?: Array<Record<string, unknown>>;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function parseAssistantContent(text: string): AssistantContentBlock[] {
  const lines = normalizeInlineText(text).split("\n");
  const blocks: AssistantContentBlock[] = [];
  const paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphBuffer
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (paragraph) {
      blocks.push({ type: "paragraph", text: paragraph });
    }
    paragraphBuffer.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", text: headingMatch[2].trim() });
      continue;
    }

    if (/^[A-ZÀ-Ý0-9][^:]{0,64}:$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "heading", text: line.slice(0, -1).trim() });
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      let cursor = index;

      while (cursor < lines.length) {
        const current = (lines[cursor] ?? "").trim();
        const currentMatch = ordered
          ? current.match(/^\d+[.)]\s+(.+)$/)
          : current.match(/^[-*•]\s+(.+)$/);
        if (!currentMatch) {
          break;
        }
        items.push(currentMatch[1].trim());
        cursor += 1;
      }

      if (items.length) {
        blocks.push({ type: "list", ordered, items });
      }

      index = cursor - 1;
      continue;
    }

    paragraphBuffer.push(rawLine);
  }

  flushParagraph();
  return blocks;
}

function parseInlineSegments(text: string): Array<{ text: string; tone: "plain" | "strong" | "emphasis" | "code" }> {
  const normalized = text.replace(/\r\n/g, "\n");
  const segments: Array<{ text: string; tone: "plain" | "strong" | "emphasis" | "code" }> = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;

  normalized.replace(pattern, (match, _group, offset: number) => {
    if (offset > lastIndex) {
      segments.push({ text: normalized.slice(lastIndex, offset), tone: "plain" });
    }

    const isStrong = (match.startsWith("**") && match.endsWith("**")) || (match.startsWith("__") && match.endsWith("__"));
    const isCode = match.startsWith("`") && match.endsWith("`");
    const delimiterLength = isStrong ? 2 : 1;
    const cleaned = match.slice(delimiterLength, match.length - delimiterLength);

    segments.push({
      text: cleaned,
      tone: isStrong ? "strong" : isCode ? "code" : "emphasis",
    });

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < normalized.length) {
    segments.push({ text: normalized.slice(lastIndex), tone: "plain" });
  }

  return segments.length ? segments : [{ text: normalized, tone: "plain" }];
}

function renderInlineText(text: string, baseStyle: StyleProp<TextStyle>, keyPrefix: string) {
  const segments = parseInlineSegments(text);

  return segments.map((segment, index) => {
    const toneStyle =
      segment.tone === "strong"
        ? styles.inlineStrong
        : segment.tone === "emphasis"
          ? styles.inlineEmphasis
          : segment.tone === "code"
            ? styles.inlineCode
            : null;

    return (
      <Text key={`${keyPrefix}-${index}`} style={[baseStyle, toneStyle]}>
        {segment.text}
      </Text>
    );
  });
}

function normalizeCitationValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCitationEntry(entry: Record<string, unknown>, index: number): CitationItem | null {
  const norma = normalizeCitationValue(entry.norma || entry.referencia || entry.fonte || entry.titulo);
  const artigo = normalizeCitationValue(entry.artigo || entry.item || entry.topico);
  const trecho = normalizeCitationValue(entry.trecho || entry.resumo || entry.descricao);
  const url = normalizeCitationValue(entry.url || entry.link);

  if (!norma && !trecho) {
    return null;
  }

  return {
    artigo,
    key: `${norma || "citacao"}-${artigo || "base"}-${index}`,
    norma,
    trecho,
    url,
  };
}

async function openCitationUrl(url: string) {
  if (!url) {
    return;
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  } catch {
    // Ignora falhas silenciosamente para não interromper a conversa.
  }
}

function createHeadingStyle(textStyle?: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const base = StyleSheet.flatten(textStyle) || {};
  const fontSize = typeof base.fontSize === "number" ? base.fontSize : 15;
  const lineHeight = typeof base.lineHeight === "number" ? base.lineHeight : 24;

  return [
    styles.headingText,
    {
      fontSize: Math.max(12, Math.round(fontSize * 0.82)),
      lineHeight: Math.max(18, Math.round(lineHeight * 0.85)),
    },
  ];
}

function createListShellStyle(textStyle?: StyleProp<TextStyle>): StyleProp<ViewStyle> {
  const base = StyleSheet.flatten(textStyle) || {};
  const lineHeight = typeof base.lineHeight === "number" ? base.lineHeight : 24;

  return [
    styles.listItem,
    {
      minHeight: Math.max(20, Math.round(lineHeight)),
    },
  ];
}

export function AssistantMessageContent({
  text,
  textStyle,
}: AssistantMessageContentProps) {
  const blocks = parseAssistantContent(text);
  const headingStyle = createHeadingStyle(textStyle);
  const hasMultipleBlocks = blocks.length > 1;

  return (
    <View style={styles.contentStack}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          return (
            <View key={`heading-${blockIndex}`} style={styles.headingRow}>
              <View style={styles.headingLine} />
              <Text style={headingStyle}>{block.text}</Text>
            </View>
          );
        }

        if (block.type === "list") {
          return (
            <View key={`list-${blockIndex}`} style={styles.listGroup}>
              {block.items.map((item, itemIndex) => {
                const marker = block.ordered ? `${itemIndex + 1}.` : "•";
                return (
                  <View key={`list-${blockIndex}-${itemIndex}`} style={createListShellStyle(textStyle)}>
                    <Text style={styles.listMarker}>{marker}</Text>
                    <Text style={[styles.paragraphText, textStyle, styles.listText]}>
                      {renderInlineText(item, [styles.paragraphText, textStyle, styles.listText], `list-${blockIndex}-${itemIndex}`)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }

        return (
          <Text
            key={`paragraph-${blockIndex}`}
            style={[
              styles.paragraphText,
              textStyle,
              blockIndex === 0 && hasMultipleBlocks ? styles.leadParagraph : null,
            ]}
          >
            {renderInlineText(block.text, [styles.paragraphText, textStyle], `paragraph-${blockIndex}`)}
          </Text>
        );
      })}
    </View>
  );
}

export function AssistantCitationList({
  citations = [],
}: AssistantCitationListProps) {
  const normalized = citations
    .map((entry, index) => normalizeCitationEntry(entry, index))
    .filter((entry): entry is CitationItem => Boolean(entry));

  if (!normalized.length) {
    return null;
  }

  return (
    <View style={styles.citationsCard}>
      <View style={styles.citationsHeader}>
        <View style={styles.citationsIconShell}>
          <MaterialCommunityIcons
            name="book-open-page-variant-outline"
            size={15}
            color={colors.accent}
          />
        </View>
        <View style={styles.citationsHeaderCopy}>
          <Text style={styles.citationsTitle}>Referências normativas</Text>
          <Text style={styles.citationsSubtitle}>
            Base usada para sustentar a análise da Tariel.ia.
          </Text>
        </View>
      </View>

      <View style={styles.citationsList}>
        {normalized.map((citation, index) => {
          const label = citation.norma
            ? `${citation.norma}${citation.artigo ? ` — ${citation.artigo}` : ""}`
            : `Referência ${index + 1}`;

          return (
            <Pressable
              key={citation.key}
              disabled={!citation.url}
              onPress={() => void openCitationUrl(citation.url)}
              style={[
                styles.citationItem,
                citation.url ? styles.citationItemPressable : null,
              ]}
            >
              <View style={styles.citationIndexShell}>
                <Text style={styles.citationIndexText}>{index + 1}</Text>
              </View>

              <View style={styles.citationCopy}>
                <Text style={styles.citationNorma}>{label}</Text>
                {citation.trecho ? (
                  <Text style={styles.citationTrecho}>{citation.trecho}</Text>
                ) : null}
                {citation.url ? (
                  <View style={styles.citationLinkRow}>
                    <Text style={styles.citationLinkText}>Abrir fonte</Text>
                    <MaterialCommunityIcons
                      name="arrow-top-right"
                      size={14}
                      color={colors.accent}
                    />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: spacing.sm,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  headingLine: {
    width: 18,
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: "#F4B57D",
  },
  headingText: {
    color: colors.accent,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  paragraphText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
  },
  leadParagraph: {
    color: colors.ink800,
    fontWeight: "500",
  },
  listGroup: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  listMarker: {
    minWidth: 18,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 24,
    textAlign: "center",
  },
  listText: {
    flex: 1,
  },
  inlineStrong: {
    fontWeight: "800",
    color: colors.ink800,
  },
  inlineEmphasis: {
    fontStyle: "italic",
    color: colors.ink800,
  },
  inlineCode: {
    fontFamily: "monospace",
    backgroundColor: "#FFF1E4",
    color: colors.accent,
  },
  citationsCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EBD8C6",
    backgroundColor: "#FFF8F1",
    gap: spacing.sm,
  },
  citationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  citationsIconShell: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1E4",
    borderWidth: 1,
    borderColor: "#F2D3B6",
  },
  citationsHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  citationsTitle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  citationsSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  citationsList: {
    gap: spacing.sm,
  },
  citationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#EADFD4",
  },
  citationItemPressable: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  citationIndexShell: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1E4",
  },
  citationIndexText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
  },
  citationCopy: {
    flex: 1,
    gap: 4,
  },
  citationNorma: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  citationTrecho: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  citationLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  citationLinkText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
