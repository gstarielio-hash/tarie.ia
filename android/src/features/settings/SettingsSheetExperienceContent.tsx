import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { AI_MODEL_OPTIONS } from "../InspectorMobileApp.constants";
import { styles } from "../InspectorMobileApp.styles";

type ModeloIa = (typeof AI_MODEL_OPTIONS)[number];

const AI_MODEL_DETAILS: Record<ModeloIa, { subtitle: string }> = {
  rápido: {
    subtitle: "Respostas curtas com menor custo e latência.",
  },
  equilibrado: {
    subtitle: "Melhor equilíbrio entre velocidade e profundidade.",
  },
  avançado: {
    subtitle: "Mais contexto e análise para casos complexos.",
  },
};

function modelOptionTestId(value: ModeloIa): string {
  if (value === "rápido") {
    return "settings-ai-model-option-rapido";
  }
  if (value === "avançado") {
    return "settings-ai-model-option-avancado";
  }
  return "settings-ai-model-option-equilibrado";
}

export function SettingsAiModelSheetContent({
  modeloIa,
  onSelecionarModeloIa,
}: {
  modeloIa: ModeloIa;
  onSelecionarModeloIa: (value: ModeloIa) => void;
}) {
  return (
    <View style={styles.settingsMiniList}>
      {AI_MODEL_OPTIONS.map((option) => {
        const ativo = option === modeloIa;
        return (
          <Pressable
            key={`ai-model-${option}`}
            onPress={() => onSelecionarModeloIa(option)}
            style={[
              styles.settingsMiniListItem,
              styles.settingsMiniListItemPressable,
              ativo ? styles.settingsMiniListItemActive : null,
            ]}
            testID={modelOptionTestId(option)}
          >
            <View style={styles.settingsMiniListItemHeader}>
              <Text
                style={[
                  styles.settingsMiniListTitle,
                  ativo ? styles.settingsMiniListTitleActive : null,
                ]}
              >
                {option}
              </Text>
              <View
                style={[
                  styles.settingsMiniListSelectionBadge,
                  ativo ? styles.settingsMiniListSelectionBadgeActive : null,
                ]}
              >
                <MaterialCommunityIcons
                  color={ativo ? colors.white : colors.textSecondary}
                  name={ativo ? "check" : "circle-outline"}
                  size={14}
                />
              </View>
            </View>
            <Text style={styles.settingsMiniListMeta}>
              {AI_MODEL_DETAILS[option].subtitle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
