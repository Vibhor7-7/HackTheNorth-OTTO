import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { OttoLogo } from "./OttoLogo";
import { Button, Copy } from "./ui";
import { colors as c, motion } from "./theme";
import { baseUrl, isLive } from "./data/source";

export function LaunchScreen({
  onContinue,
  error,
  onRetry,
}: {
  onContinue?: () => void;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          entering={FadeIn.duration(motion.scene).reduceMotion(
            ReduceMotion.System,
          )}
          style={styles.brand}
        >
          <OttoLogo size={112} />
          <Copy style={styles.title}>Otto</Copy>
        </Animated.View>
        <View style={styles.bottom}>
          {error ? (
            <>
              <Copy
                accessibilityRole="alert"
                style={{
                  color: c.danger,
                  textAlign: "center",
                  marginBottom: 20,
                }}
              >
                {error}
              </Copy>
              {onRetry && <Button label="Try again" onPress={onRetry} />}
            </>
          ) : onContinue ? (
            <>
              <Button label={isLive ? "Continue" : "Continue demo"} onPress={onContinue} />
              <Copy style={styles.note}>
                {isLive
                  ? `Connected to ${baseUrl}. Approvals here run real actions.`
                  : "Explore Otto with sample tasks and approvals. No real actions are sent."}
              </Copy>
            </>
          ) : (
            <>
              <ActivityIndicator
                accessibilityLabel="Loading Otto"
                size="small"
                color={c.accent}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 32,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  brand: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  title: {
    fontSize: 52,
    lineHeight: 64,
    fontWeight: "700",
    letterSpacing: -2,
    marginTop: 24,
  },
  subtitle: {
    fontSize: 18,
    color: c.muted,
    marginTop: 12,
    textAlign: "center",
  },
  bottom: { paddingTop: 36, paddingBottom: 12 },
  note: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    color: c.muted,
    marginTop: 18,
  },
});
