import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

interface SettingsDrawerHeaderProps {
  settingsDrawerInOverview: boolean;
  settingsPrintDarkMode: boolean;
  settingsDrawerTitle: string;
  settingsDrawerSubtitle: string;
  onCloseOrBackPress: () => void;
}

export function SettingsDrawerHeader({
  settingsDrawerInOverview,
  settingsPrintDarkMode,
  settingsDrawerTitle,
  settingsDrawerSubtitle: _settingsDrawerSubtitle,
  onCloseOrBackPress,
}: SettingsDrawerHeaderProps) {
  return (
    <View style={styles.sidePanelHeader}>
      <View style={styles.sidePanelCopy}>
        <Text
          style={[
            styles.activityModalEyebrow,
            settingsDrawerInOverview ? styles.activityModalEyebrowPrint : null,
            settingsDrawerInOverview && settingsPrintDarkMode
              ? styles.activityModalEyebrowPrintDark
              : null,
            styles.settingsDrawerWordmark,
            settingsDrawerInOverview
              ? styles.settingsDrawerWordmarkPrint
              : null,
            settingsDrawerInOverview && settingsPrintDarkMode
              ? styles.settingsDrawerWordmarkPrintDark
              : null,
          ]}
        >
          tariel.ia
        </Text>
        <Text
          style={[
            styles.sidePanelTitle,
            settingsDrawerInOverview ? styles.sidePanelTitlePrint : null,
            settingsDrawerInOverview && settingsPrintDarkMode
              ? styles.sidePanelTitlePrintDark
              : null,
          ]}
        >
          {settingsDrawerTitle}
        </Text>
      </View>
      <Pressable
        onPress={onCloseOrBackPress}
        style={[
          styles.sidePanelCloseButton,
          settingsDrawerInOverview ? styles.sidePanelCloseButtonPrint : null,
          settingsDrawerInOverview && settingsPrintDarkMode
            ? styles.sidePanelCloseButtonPrintDark
            : null,
        ]}
        testID={
          settingsDrawerInOverview
            ? "close-settings-drawer-button"
            : "settings-drawer-back-button"
        }
      >
        <MaterialCommunityIcons
          name={settingsDrawerInOverview ? "close" : "chevron-left"}
          size={22}
          color={colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}
