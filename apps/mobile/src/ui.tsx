import React, { useState, useSyncExternalStore } from "react";
import {
  Pressable,
  Text,
  TextProps,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { colors as c, fonts, motion } from "./theme";
import { GlassChrome } from "./glass";
import { otto } from "./data/mock";
import { router } from "expo-router";
import { OttoLogo } from "./OttoLogo";
import { BrandMark } from "./brand-marks";

export function useOtto() {
  return useSyncExternalStore(
    otto.subscribe,
    otto.getSnapshot,
    otto.getSnapshot,
  );
}
export function Copy({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.copy, style]} />;
}
export function Display({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.display, style]} />;
}
export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.enter)
        .delay(delay)
        .reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
export function Button({
  label,
  onPress,
  quiet = false,
  light = false,
  disabled = false,
  icon,
  destructive = false,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  quiet?: boolean;
  light?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const foreground = destructive ? c.danger : quiet ? c.text : c.onAccent;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await onPress();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
        style={({ pressed }) => [
          s.button,
          {
            backgroundColor:
              destructive || quiet ? c.raised : light ? c.text : c.accent,
            opacity: disabled || busy ? 0.45 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <>
            <Copy style={{ fontWeight: "600", color: foreground }}>
              {label}
            </Copy>
            {icon && <Feather name={icon} size={18} color={foreground} />}
          </>
        )}
      </Pressable>
      {!!error && (
        <Copy
          accessibilityRole="alert"
          style={{ color: c.danger, marginTop: 8 }}
        >
          {error}
        </Copy>
      )}
    </View>
  );
}
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <GlassChrome interactive style={{ borderRadius: 24 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          width: 46,
          height: 46,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={name} size={21} color={c.text} />
      </Pressable>
    </GlassChrome>
  );
}
export function Header({
  title,
  right,
  back,
}: {
  title: string;
  right?: React.ReactNode;
  back?: () => void;
}) {
  return (
    <View style={{ paddingTop: 12, paddingBottom: 22, gap: 22 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ width: 46 }}>
          {back && (
            <IconButton name="chevron-left" label="Back" onPress={back} />
          )}
        </View>
        <OttoLogo size={36} />
        <IconButton
          name="user"
          label="Profile"
          onPress={() => router.push("/profile")}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Display style={{ fontSize: back ? 28 : 34, flex: 1 }}>{title}</Display>
        {right}
      </View>
    </View>
  );
}

export function Section({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={s.section}>
      <Display style={{ fontSize: 22, letterSpacing: -0.5 }}>{title}</Display>
      {aside && <Copy style={{ fontSize: 15, color: c.muted }}>{aside}</Copy>}
    </View>
  );
}
export function NetworkBanner() {
  const { network } = useOtto();
  return network === "online" ? null : (
    <View
      accessibilityRole="alert"
      style={{ padding: 12, backgroundColor: c.raised }}
    >
      <Copy style={{ color: c.warning, textAlign: "center" }}>
        {network === "offline" ? "Offline" : "Reconnecting…"}
      </Copy>
    </View>
  );
}
export function ToolMark({
  id,
  size = 38,
  logoUrl,
}: {
  id: string;
  size?: number;
  logoUrl?: string;
}) {
  const { extensions } = useOtto();
  const extension = extensions.find((tool) => tool.id === id);
  return (
    <BrandMark id={id} size={size} logoUrl={logoUrl ?? extension?.logoUrl} />
  );
}
export const s = StyleSheet.create({
  copy: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.text },
  display: {
    fontFamily: fonts.display,
    fontWeight: "700",
    fontSize: 34,
    letterSpacing: -1,
    color: c.text,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 18,
    paddingBottom: 24,
  },
  section: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 14,
    gap: 12,
  },
  page: { flex: 1, backgroundColor: c.background },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 112,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  row: {
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.line,
  },
  card: { backgroundColor: c.surface, borderRadius: 26, padding: 20 },
  group: { backgroundColor: c.surface, borderRadius: 26, overflow: "hidden" },
  input: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: c.text,
    padding: 16,
    borderRadius: 18,
    backgroundColor: c.raised,
    minHeight: 50,
  },
});
