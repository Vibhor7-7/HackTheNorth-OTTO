import React, { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { Image } from "expo-image";
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export function SignalScene({
  active = false,
  compact = false,
}: {
  active?: boolean;
  compact?: boolean;
}) {
  const focused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const engagement = useSharedValue(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setForeground(next === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    engagement.set(
      withTiming(active && focused && foreground && !reducedMotion ? 1 : 0, {
        duration: 420,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [active, focused, foreground, reducedMotion, engagement]);
  const pose = useAnimatedStyle(() => ({
    transform: [
      { translateY: -6 * engagement.value },
      { scale: 1 + 0.035 * engagement.value },
      { rotate: `${-1.5 * engagement.value}deg` },
    ],
  }));
  return (
    <View style={[styles.frame, { height: compact ? 180 : 280 }]}>
      <Animated.View
        entering={FadeIn.duration(480).reduceMotion(ReduceMotion.System)}
        style={styles.art}
      >
        <Animated.View style={[styles.art, pose]}>
          <Image
            source={require("../../assets/otto-button-concept.png")}
            contentFit="contain"
            accessibilityLabel="Otto wearable concept"
            style={styles.art}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", overflow: "hidden", borderRadius: 28 },
  art: { width: "100%", height: "100%" },
});
