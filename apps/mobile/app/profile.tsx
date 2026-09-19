import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button, Copy, Header, Section, s } from "../src/ui";
import { colors as c } from "../src/theme";
import { demoProfile, useDemoProfile } from "../src/demo-profile";
import { OttoLogo } from "../src/OttoLogo";

export default function ProfileScreen() {
  const profile = useDemoProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void demoProfile.initialize();
  }, []);
  const name = draft ?? profile.name;
  return (
    <SafeAreaView style={s.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: 40 }]}
        >
          <Header
            title="Profile"
            back={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)/home")
            }
          />
          <View style={[s.card, { alignItems: "center", paddingVertical: 30 }]}>
            <OttoLogo size={64} />
            <Copy style={{ fontSize: 26, fontWeight: "700", marginTop: 18 }}>
              {profile.name}
            </Copy>
            <Copy style={{ color: c.muted, marginTop: 6 }}>Demo account</Copy>
          </View>
          <Section title="Your name" />
          <View style={s.card}>
            <Copy style={{ color: c.muted, marginBottom: 14 }}>
              What should Otto call you?
            </Copy>
            <TextInput
              accessibilityLabel="Your name"
              placeholder="Your name"
              placeholderTextColor={c.muted}
              value={name}
              maxLength={48}
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={(value) => {
                setDraft(value);
                setSaved(false);
              }}
              style={s.input}
              returnKeyType="done"
            />
            <View style={{ height: 16 }} />
            <Button
              label="Save name"
              disabled={
                !profile.hydrated ||
                !name.trim() ||
                name.trim() === profile.name
              }
              onPress={async () => {
                await demoProfile.setName(name);
                setDraft(null);
                setSaved(true);
                void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }}
            />
            {saved && (
              <Copy
                accessibilityLiveRegion="polite"
                style={{ color: c.accent, marginTop: 12 }}
              >
                Name saved.
              </Copy>
            )}
          </View>
          <Section title="Account" />
          <View style={s.group}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/urgent")}
              style={styles.link}
            >
              <Feather name="shield" color={c.warning} size={22} />
              <View style={{ flex: 1 }}>
                <Copy style={{ fontWeight: "600" }}>Urgent</Copy>
                <Copy style={{ fontSize: 14, color: c.muted, marginTop: 3 }}>
                  Decisions and demo text replies
                </Copy>
              </View>
              <Feather name="chevron-right" size={20} color={c.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={[
                styles.link,
                {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.line,
                },
              ]}
            >
              <Feather name="settings" color={c.text} size={22} />
              <View style={{ flex: 1 }}>
                <Copy style={{ fontWeight: "600" }}>Settings</Copy>
                <Copy style={{ fontSize: 14, color: c.muted, marginTop: 3 }}>
                  Device, preferences, and demo controls
                </Copy>
              </View>
              <Feather name="chevron-right" size={20} color={c.muted} />
            </Pressable>
          </View>
          <Copy
            style={{
              color: c.muted,
              fontSize: 14,
              lineHeight: 21,
              marginTop: 24,
            }}
          >
            Your name is saved on this device. This demo does not create an
            online account.
          </Copy>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  link: {
    padding: 20,
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
});
