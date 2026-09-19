import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { colors as c } from "./theme";

// Glass is chrome, not a content surface. Never wrap this in an opacity entrance.
export function GlassChrome({
  children,
  style,
  interactive = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  if (reduced)
    return (
      <View style={[{ backgroundColor: c.raised, borderRadius: 28 }, style]}>
        {children}
      </View>
    );
  if (
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable()
  ) {
    return (
      <GlassView
        colorScheme="dark"
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={[{ borderRadius: 28 }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      tint="systemChromeMaterialDark"
      intensity={65}
      style={[
        {
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: "#202923E8",
          borderWidth: 1,
          borderColor: "#FFFFFF12",
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}
