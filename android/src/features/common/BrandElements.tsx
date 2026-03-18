import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { TARIEL_APP_MARK } from "../InspectorMobileApp.constants";
import { styles } from "../InspectorMobileApp.styles";

export function BrandIntroMark({
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

export function BrandLaunchOverlay({
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
