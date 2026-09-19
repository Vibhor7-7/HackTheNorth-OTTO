import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Copy, Header, NetworkBanner, Reveal, s, useOtto } from "../../src/ui";
import { GlassChrome } from "../../src/glass";
import { colors as c, fonts } from "../../src/theme";
import { otto } from "../../src/data/mock";

const starters = [
  "What did I do today?",
  "What did I commit to this week?",
  "What's still open?",
];
const time = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function ChatScreen() {
  const state = useOtto();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const locked = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const disabled = sending || state.streaming || state.network !== "online";
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const send = async (text = draft) => {
    if (!text.trim() || disabled || locked.current) return;
    locked.current = true;
    setSending(true);
    setError("");
    setDraft("");
    follow.current = true;
    try {
      await otto.sendChat(text.trim());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not send. Please try again.",
      );
      setDraft(text);
    } finally {
      locked.current = false;
      setSending(false);
    }
  };
  return (
    <SafeAreaView edges={["top"]} style={s.page}>
      <NetworkBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <Header
            title="Ask Otto"
            right={<Copy style={{ color: c.muted, fontSize: 14 }}>Demo</Copy>}
          />
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            s.content,
            { paddingBottom: 24, flexGrow: 1 },
          ]}
          scrollEventThrottle={32}
          onScroll={({ nativeEvent: e }) => {
            follow.current =
              e.contentSize.height -
                e.layoutMeasurement.height -
                e.contentOffset.y <
              100;
          }}
          onContentSizeChange={() => {
            if (follow.current)
              scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {state.messages.length === 0 && (
            <View style={styles.starters}>
              {starters.map((text) => (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => void send(text)}
                  style={({ pressed }) => [
                    styles.starter,
                    { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
                  ]}
                >
                  <Copy style={{ flex: 1, fontWeight: "500" }}>{text}</Copy>
                  <Feather name="arrow-up-right" size={18} color={c.accent} />
                </Pressable>
              ))}
            </View>
          )}
          {state.messages.map((message, index) => {
            const user = message.role === "user";
            const latest = index === state.messages.length - 1;
            return (
              <Reveal
                key={message.id}
                style={[styles.message, user && styles.userMessage]}
              >
                <Copy selectable style={styles.messageText}>
                  {message.text ||
                    (state.streaming && latest
                      ? "Thinking…"
                      : "No response yet.")}
                </Copy>
                {!!message.citations?.length && (
                  <View style={styles.sources}>
                    {message.citations.map((citation, i) => {
                      const task = state.tasks.find(
                        (t) => t.id === citation.id,
                      );
                      const turn = state.turns.find(
                        (t) => t.id === citation.id,
                      );
                      const label =
                        citation.kind === "task"
                          ? task?.goal || "View task"
                          : turn?.user_text || "View transcript";
                      const date =
                        citation.kind === "task"
                          ? task?.created_at
                          : turn?.started_at;
                      return (
                        <Pressable
                          key={`${citation.kind}-${citation.id}-${i}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${label}, ${date ? time(date) : "source"}`}
                          onPress={() =>
                            citation.kind === "task"
                              ? router.push({
                                  pathname: "/task/[id]",
                                  params: { id: citation.id },
                                })
                              : router.push({
                                  pathname: "/(tabs)/context",
                                  params: { turn: citation.id },
                                })
                          }
                          style={({ pressed }) => [
                            styles.source,
                            { opacity: pressed ? 0.65 : 1 },
                          ]}
                        >
                          <Feather
                            name={
                              citation.kind === "task"
                                ? "check-square"
                                : "align-left"
                            }
                            size={15}
                            color={c.accent}
                          />
                          <Copy style={styles.sourceText}>
                            {date
                              ? time(date)
                              : citation.kind === "task"
                                ? "Task"
                                : "Transcript"}
                          </Copy>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {!user && latest && !state.streaming && !!message.text && (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() =>
                        void send(
                          `Save a note with this summary: ${message.text}`,
                        )
                      }
                      style={({ pressed }) => [
                        styles.action,
                        { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 },
                      ]}
                    >
                      <Copy style={styles.actionText}>Save summary</Copy>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push("/(tabs)/tasks")}
                      style={({ pressed }) => [
                        styles.action,
                        { opacity: pressed ? 0.65 : 1 },
                      ]}
                    >
                      <Copy style={styles.actionText}>Open tasks</Copy>
                    </Pressable>
                  </View>
                )}
              </Reveal>
            );
          })}
          {(state.streaming || sending) && (
            <Copy accessibilityLiveRegion="polite" style={styles.responding}>
              Responding…
            </Copy>
          )}
        </ScrollView>
        <View
          style={[
            styles.composerArea,
            {
              paddingBottom: keyboardVisible
                ? 10
                : Platform.OS === "web"
                  ? 100
                  : 90,
            },
          ]}
        >
          {!!error && (
            <Copy accessibilityRole="alert" style={styles.error}>
              {error}
            </Copy>
          )}
          <GlassChrome interactive style={styles.composer}>
            <TextInput
              accessibilityLabel="Message Otto"
              placeholder={
                state.network === "online"
                  ? "Ask about today…"
                  : "Reconnect to message Otto"
              }
              placeholderTextColor={c.muted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              style={styles.input}
              editable={!sending}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={disabled || !draft.trim()}
              onPress={() => void send()}
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor:
                    disabled || !draft.trim() ? c.raised : c.accent,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
            >
              <Feather
                name="arrow-up"
                size={23}
                color={disabled || !draft.trim() ? c.muted : c.onAccent}
              />
            </Pressable>
          </GlassChrome>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  starters: { gap: 10, paddingTop: 4 },
  starter: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    minHeight: 60,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: c.surface,
  },
  message: {
    backgroundColor: c.surface,
    borderRadius: 26,
    padding: 20,
    marginBottom: 14,
  },
  userMessage: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    backgroundColor: c.accentSurface,
    borderBottomRightRadius: 8,
  },
  messageText: { fontSize: 17, lineHeight: 26 },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 14,
    minHeight: 44,
    backgroundColor: c.raised,
  },
  sourceText: {
    fontSize: 14,
    fontWeight: "600",
    color: c.accent,
    fontVariant: ["tabular-nums"],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  action: {
    minHeight: 44,
    borderRadius: 23,
    backgroundColor: c.raised,
    paddingVertical: 10,
    paddingHorizontal: 15,
    justifyContent: "center",
  },
  actionText: { fontSize: 15, fontWeight: "600" },
  responding: { fontSize: 14, color: c.muted, marginTop: 2, marginBottom: 12 },
  composerArea: {
    paddingHorizontal: 14,
    paddingTop: 8,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 8,
    borderRadius: 30,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 23,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: c.text,
  },
  send: {
    height: 46,
    width: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: c.danger,
    fontSize: 15,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
});
