import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Appearance,
  Pressable,
  Text,
  View,
} from "react-native";
import { colors as c } from "../src/theme";
import { otto } from "../src/data/mock";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const initialize = () => {
    setError("");
    otto
      .initialize()
      .then(() => setReady(true))
      .catch(() => setError("Your demo could not load. Please try again."));
  };
  useEffect(() => {
    Appearance.setColorScheme("dark");
    otto
      .initialize()
      .then(() => setReady(true))
      .catch(() => setError("Your demo could not load. Please try again."));
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider>
        <ThemeProvider value={DarkTheme}>
          <StatusBar style="light" />
          {!ready ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
                backgroundColor: c.background,
              }}
            >
              <Text style={{ fontSize: 38, fontWeight: "700", color: c.text }}>
                Otto
              </Text>
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={initialize}
                  style={{ padding: 24 }}
                >
                  <Text style={{ color: c.danger }}>{error}</Text>
                  <Text
                    style={{ color: c.text, marginTop: 12, textAlign: "center" }}
                  >
                    Retry
                  </Text>
                </Pressable>
              ) : (
                <ActivityIndicator color={c.accent} />
              )}
            </View>
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.background },
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen
                name="approval/[id]"
                options={{
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.9, 1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                }}
              />
              <Stack.Screen
                name="connect/[id]"
                options={{
                  presentation: "formSheet",
                  sheetAllowedDetents: [0.75, 1],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 32,
                }}
              />
              <Stack.Screen
                name="settings"
                options={{ presentation: "modal" }}
              />
            </Stack>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
