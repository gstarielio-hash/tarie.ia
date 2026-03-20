import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { spacing } from "../../theme/tokens";

interface SettingsScreenProps {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
}

export function SettingsScreen({ children, scroll = true, testID }: SettingsScreenProps) {
  if (!scroll) {
    return (
      <View style={styles.container} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} testID={testID}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
