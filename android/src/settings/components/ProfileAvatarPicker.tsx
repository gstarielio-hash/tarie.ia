import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../../features/InspectorMobileApp.styles";

interface ProfileAvatarPickerProps {
  photoUri: string;
  fallbackLabel: string;
  onPress: () => void;
  darkMode?: boolean;
  testID?: string;
}

export function ProfileAvatarPicker({
  photoUri,
  fallbackLabel,
  onPress,
  darkMode = false,
  testID,
}: ProfileAvatarPickerProps) {
  return (
    <View style={styles.settingsPrintAvatarShell}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={styles.settingsPrintAvatarImage}
        />
      ) : (
        <View style={styles.settingsPrintAvatarFallback}>
          <Text style={styles.settingsPrintAvatarInitials}>
            {fallbackLabel}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onPress}
        style={[
          styles.settingsPrintAvatarEditButton,
          darkMode ? styles.settingsPrintAvatarEditButtonDark : null,
        ]}
        testID={testID}
      >
        <MaterialCommunityIcons color={colors.ink700} name="pencil" size={12} />
      </Pressable>
    </View>
  );
}
