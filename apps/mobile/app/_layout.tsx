import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Appearance } from "react-native";
import { colors as c } from "../src/theme";
import { otto } from "../src/data/mock";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LaunchScreen } from "../src/LaunchScreen";
import { demoProfile } from "../src/demo-profile";
import { ApprovalNotice } from "../src/approval-notice";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState("");
  const initialize = () =>
    Promise.all([
      otto.initialize(),
      demoProfile.initialize(),
      AsyncStorage.getItem("otto.demo.entered"),
    ])
      .then(([, , seen]) => {
        setEntered(seen === "yes");
        setReady(true);
      })
      .catch(() => setError("Your demo could not load. Please try again."));
  useEffect(() => {
    Appearance.setColorScheme("dark");
    void initialize();
  }, []);
  const enter = async () => {
    try {
      await AsyncStorage.setItem("otto.demo.entered", "yes");
      setEntered(true);
    } catch {
      setError("Could not save your demo session. Please try again.");
    }
  };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider>
        <ThemeProvider value={DarkTheme}>
          <StatusBar style="light" />
          {!ready || !entered ? (
            <LaunchScreen
              error={error}
              onRetry={() => {
                setError("");
                void initialize();
              }}
              onContinue={ready ? () => void enter() : undefined}
            />
          ) : (
            <>
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
              <ApprovalNotice />
            </>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
