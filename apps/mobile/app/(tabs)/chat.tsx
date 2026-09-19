import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  Button,
  Copy,
  Header,
  NetworkBanner,
  Reveal,
  s,
  useOtto,
} from "../../src/ui";
import { GlassChrome } from "../../src/glass";
import { ConversationScene } from "../../src/visuals/ConversationScene";
import { colors as c, fonts } from "../../src/theme";
import { otto } from "../../src/data/mock";

const starters = [
  "What did I do today?",
  "What did I commit to this week?",
  "What's still open?",
];
const time = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const statuses: Record<string, string> = {
  running: "In progress",
  needs_input: "Needs an answer",
  awaiting_approval: "Your approval needed",
  awaiting_connection: "Connect an app",
  succeeded: "Completed",
  failed: "Could not finish",
  cancelled: "Cancelled",
};
type Mode = "Ask" | "Do" | "Remember";

function SourcePreview({ kind, id }: { kind: "turn" | "task"; id: string }) {
  const state = useOtto();
  const [expanded, setExpanded] = useState(false);
  const task =
    kind === "task" ? state.tasks.find((t) => t.id === id) : undefined;
  const turn =
    kind === "turn" ? state.turns.find((t) => t.id === id) : undefined;
  const steps = state.steps
    .filter((step) => step.task_id === id)
    .sort((a, b) => a.seq - b.seq);
  const approval = state.approvals.find(
    (a) => a.task_id === id && a.status === "pending",
  );
  const label = task?.goal ?? turn?.user_text ?? "Source unavailable";
  const date = task?.created_at ?? turn?.started_at;
  const open = () =>
    kind === "task"
      ? router.push({ pathname: "/task/[id]", params: { id } })
      : router.push({ pathname: "/(tabs)/context", params: { turn: id } });
  return (
    <View style={styles.source}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Preview source: ${label}`}
        onPress={() => setExpanded(!expanded)}
        style={styles.sourceHeader}
      >
        <Feather
          name={task ? "check-square" : "align-left"}
          size={18}
          color={c.accent}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Copy
            numberOfLines={expanded ? undefined : 2}
            style={{ fontSize: 14, fontWeight: "600", lineHeight: 20 }}
          >
            {label}
          </Copy>
          <Copy style={styles.sourceMeta}>
            {task ? statuses[task.status] : "Transcript"}
            {date ? ` · ${time(date)}` : ""}
          </Copy>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={17}
          color={c.muted}
        />
      </Pressable>
      {task && !expanded && (
        <Copy numberOfLines={2} style={styles.progress}>
          {steps.at(-1)?.summary ??
            task.spoken_summary ??
            statuses[task.status]}
        </Copy>
      )}
      {expanded && (
        <Reveal style={styles.preview}>
          {turn && (
            <>
              <Copy selectable style={styles.quote}>
                {turn.user_text}
              </Copy>
              <Copy selectable style={styles.sourceMeta}>
                {turn.assistant_text}
              </Copy>
            </>
          )}
          {task && (
            <>
              <Copy>{task.spoken_summary ?? statuses[task.status]}</Copy>
              {steps.slice(-3).map((step) => (
                <View key={step.id} style={styles.step}>
                  <Feather
                    name={
                      step.kind === "error"
                        ? "alert-circle"
                        : step.kind.endsWith("wait")
                          ? "clock"
                          : "corner-down-right"
                    }
                    size={15}
                    color={c.accent}
                  />
                  <Copy style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>
                    {step.summary}
                  </Copy>
                </View>
              ))}
            </>
          )}
          <Button
            quiet
            label="Open source"
            icon="arrow-up-right"
            onPress={open}
          />
        </Reveal>
      )}
      {task?.status === "awaiting_approval" && approval && (
        <View style={styles.approval}>
          <Copy style={{ fontWeight: "600" }}>{approval.summary}</Copy>
          {Object.entries(approval.facts).map(([key, value]) => (
            <View key={key} style={styles.fact}>
              <Copy style={styles.sourceMeta}>{key}</Copy>
              <Copy
                selectable
                style={{ flex: 1, textAlign: "right", fontSize: 14 }}
              >
                {value}
              </Copy>
            </View>
          ))}
          <Button
            label="Review approval"
            onPress={() =>
              router.push({
                pathname: "/approval/[id]",
                params: { id: approval.id },
              })
            }
          />
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const state = useOtto();
  const params = useLocalSearchParams<{ draft?: string; requestId?: string }>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<string | null>(null);
  const [savedMemory, setSavedMemory] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("Ask");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const locked = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const follow = useRef(true);
  const focus = useSharedValue(0);
  const focusStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      ["transparent", c.accent],
    ),
  }));
  const appliedRequest = useRef<string | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      const key = params.requestId ?? params.draft;
      if (params.draft && key !== appliedRequest.current) {
        appliedRequest.current = key;
        setDraft(params.draft);
        setMode("Ask");
        input.current?.focus();
      }
    }, [params.draft, params.requestId]),
  );
  const changeChat = async (id?: string) => {
    if (id) await otto.selectChat(id);
    else await otto.newChat();
    setHistoryOpen(false);
    setMemoryDraft(null);
    setClearOpen(false);
    setDraft("");
    setError("");
    setSavedMemory(null);
    follow.current = true;
  };
  const saveMemory = async () => {
    if (!memoryDraft?.trim()) return;
    try {
      const previous = new Set(otto.getSnapshot().memories.map((m) => m.id));
      await otto.addMemory(memoryDraft);
      setSavedMemory(
        otto.getSnapshot().memories.find((m) => !previous.has(m.id))?.id ??
          null,
      );
      setMemoryDraft(null);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  };
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
  const send = async (text = draft, chosenMode: Mode = mode) => {
    if (!text.trim() || disabled || locked.current) return;
    if (
      chosenMode === "Remember" ||
      /^remember (that |this: ?)?/i.test(text.trim())
    ) {
      setMemoryDraft(text.trim().replace(/^remember (that |this: ?)?/i, ""));
      return;
    }
    locked.current = true;
    setSending(true);
    setError("");
    setDraft("");
    follow.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      {
        const command =
          chosenMode === "Do" &&
          !/^(please\s+)?(schedule|send|email|save|create|book|remind|set up)\b/i.test(
            text.trim(),
          )
            ? `Create a task: ${text.trim()}`
            : text.trim();
        await otto.sendChat(command);
      }
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
          <Header title="Ask" />
          <View style={styles.historyBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chat history"
              accessibilityState={{ expanded: historyOpen }}
              onPress={() => {
                setHistoryOpen(!historyOpen);
                Keyboard.dismiss();
              }}
              style={[styles.historyTrigger, { flex: 1 }]}
            >
              <Copy numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
                {state.chatSessions.find(
                  (chat) => chat.id === state.activeChatId,
                )?.title ?? "New chat"}
              </Copy>
              <Feather
                name={historyOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={c.accent}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              onPress={() => void changeChat()}
              style={styles.historyTrigger}
            >
              <Feather name="edit" size={21} color={c.accent} />
            </Pressable>
          </View>
          {historyOpen && (
            <View style={styles.historyMenu}>
              <ScrollView
                style={{ maxHeight: 230 }}
                keyboardShouldPersistTaps="handled"
              >
                {[...state.chatSessions]
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .map((chat) => (
                    <Pressable
                      key={chat.id}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: chat.id === state.activeChatId,
                      }}
                      onPress={() => void changeChat(chat.id)}
                      style={styles.historyItem}
                    >
                      <Feather
                        name={
                          chat.id === state.activeChatId
                            ? "check"
                            : "message-circle"
                        }
                        size={17}
                        color={c.accent}
                      />
                      <View style={{ flex: 1 }}>
                        <Copy numberOfLines={1}>{chat.title}</Copy>
                        <Copy style={{ color: c.muted, fontSize: 13 }}>
                          {new Date(chat.created_at).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </Copy>
                      </View>
                    </Pressable>
                  ))}
              </ScrollView>
              <Button
                quiet
                label="Clear this chat"
                icon="trash-2"
                disabled={!state.messages.length}
                onPress={() => {
                  setHistoryOpen(false);
                  setClearOpen(true);
                }}
              />
            </View>
          )}
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
            if (follow.current && state.messages.length)
              scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {state.messages.length === 0 && (
            <View>
              <ConversationScene active={keyboardVisible} />
              <View style={styles.starters}>
                {starters.map((text, i) => (
                  <Reveal key={text} delay={i * 45}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => void send(text, "Ask")}
                      style={({ pressed }) => [
                        styles.starter,
                        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Feather
                        name={
                          i === 0
                            ? "sun"
                            : i === 1
                              ? "calendar"
                              : "check-square"
                        }
                        size={19}
                        color={c.accent}
                      />
                      <Copy style={{ flex: 1, fontWeight: "500" }}>{text}</Copy>
                      <Feather
                        name="arrow-up-right"
                        size={18}
                        color={c.muted}
                      />
                    </Pressable>
                  </Reveal>
                ))}
              </View>
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
                      : "Response stopped.")}
                </Copy>
                {!!message.citations?.length && (
                  <View style={styles.sources}>
                    {message.citations.map((citation, i) => (
                      <SourcePreview
                        key={`${citation.kind}-${citation.id}-${i}`}
                        {...citation}
                      />
                    ))}
                  </View>
                )}
                {!user && latest && !state.streaming && !!message.text && (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => setMemoryDraft(message.text)}
                      style={({ pressed }) => [
                        styles.action,
                        { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 },
                      ]}
                    >
                      <Feather name="bookmark" size={15} color={c.accent} />
                      <Copy style={styles.actionText}>Remember this</Copy>
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
                      <Feather
                        name="arrow-up-right"
                        size={15}
                        color={c.accent}
                      />
                    </Pressable>
                  </View>
                )}
              </Reveal>
            );
          })}
          {(state.streaming || sending) && (
            <Copy accessibilityLiveRegion="polite" style={styles.responding}>
              {mode === "Remember" && sending
                ? "Saving context…"
                : "Responding…"}
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
          {savedMemory && (
            <View style={styles.historyBar}>
              <Copy style={{ flex: 1, color: c.accent }}>Memory saved</Copy>
              <Button
                quiet
                label="Undo"
                onPress={async () => {
                  await otto.deleteMemory(savedMemory);
                  setSavedMemory(null);
                }}
              />
            </View>
          )}
          {!!error && (
            <Copy accessibilityRole="alert" style={styles.error}>
              {error}
            </Copy>
          )}
          {!!error && (
            <Button
              quiet
              label="Retry message"
              disabled={!state.streaming && (disabled || !draft.trim())}
              onPress={() => void send()}
            />
          )}
          <View style={styles.modes}>
            {(["Ask", "Do", "Remember"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
                onPress={() => {
                  setMode(item);
                  input.current?.focus();
                  void Haptics.selectionAsync().catch(() => {});
                }}
                style={[styles.mode, mode === item && styles.selectedMode]}
              >
                <Feather
                  name={
                    item === "Ask"
                      ? "message-circle"
                      : item === "Do"
                        ? "arrow-up-right"
                        : "bookmark"
                  }
                  size={14}
                  color={mode === item ? c.accent : c.muted}
                />
                <Copy
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: mode === item ? c.accent : c.muted,
                  }}
                >
                  {item}
                </Copy>
              </Pressable>
            ))}
          </View>
          <Animated.View style={[styles.focusRing, focusStyle]}>
            <GlassChrome interactive style={styles.composer}>
              <TextInput
                ref={input}
                accessibilityLabel={`${mode} Otto`}
                placeholder={
                  state.network !== "online"
                    ? "Reconnect to message Otto"
                    : mode === "Do"
                      ? "Schedule, send, or create…"
                      : mode === "Remember"
                        ? "A preference or detail to keep…"
                        : "Ask about today…"
                }
                placeholderTextColor={c.muted}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
                style={styles.input}
                editable={!sending}
                onFocus={() => {
                  focus.set(
                    withTiming(1, {
                      duration: 180,
                      reduceMotion: ReduceMotion.System,
                    }),
                  );
                }}
                onBlur={() => {
                  focus.set(
                    withTiming(0, {
                      duration: 180,
                      reduceMotion: ReduceMotion.System,
                    }),
                  );
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  state.streaming
                    ? "Stop response"
                    : mode === "Remember"
                      ? "Review memory"
                      : "Send message"
                }
                disabled={disabled || !draft.trim()}
                onPress={() =>
                  state.streaming ? otto.stopChat() : void send()
                }
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor:
                      !state.streaming && (disabled || !draft.trim())
                        ? c.raised
                        : c.accent,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Feather
                  name={
                    state.streaming
                      ? "square"
                      : mode === "Remember"
                        ? "check"
                        : "arrow-up"
                  }
                  size={23}
                  color={
                    !state.streaming && (disabled || !draft.trim())
                      ? c.muted
                      : c.onAccent
                  }
                />
              </Pressable>
            </GlassChrome>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      <Modal
        transparent
        visible={clearOpen || memoryDraft !== null}
        animationType="fade"
        onRequestClose={() => {
          setClearOpen(false);
          setMemoryDraft(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Copy style={{ fontSize: 24, fontWeight: "700" }}>
              {clearOpen ? "Clear this chat?" : "Remember this"}
            </Copy>
            {clearOpen ? (
              <Copy style={{ color: c.muted }}>
                Messages in this conversation will be removed. Your tasks and
                saved memories stay.
              </Copy>
            ) : (
              <TextInput
                accessibilityLabel="Memory to save"
                multiline
                value={memoryDraft ?? ""}
                onChangeText={setMemoryDraft}
                style={[
                  styles.input,
                  {
                    backgroundColor: c.background,
                    borderRadius: 18,
                    minHeight: 130,
                    maxHeight: 240,
                  },
                ]}
              />
            )}
            {!!error && !clearOpen && (
              <Copy accessibilityRole="alert" style={{ color: c.danger }}>
                {error}
              </Copy>
            )}
            <Button
              label={clearOpen ? "Clear chat" : "Save memory"}
              destructive={clearOpen}
              onPress={
                clearOpen
                  ? async () => {
                      await otto.clearChat();
                      setClearOpen(false);
                      setError("");
                    }
                  : saveMemory
              }
            />
            <Button
              quiet
              label="Cancel"
              onPress={() => {
                setClearOpen(false);
                setMemoryDraft(null);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  historyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  historyTrigger: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 18,
  },
  historyMenu: {
    backgroundColor: c.surface,
    borderRadius: 22,
    padding: 10,
    marginBottom: 10,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    padding: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    backgroundColor: c.surface,
    borderRadius: 28,
    padding: 24,
    gap: 18,
  },
  header: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  starters: { gap: 9, paddingTop: 10, paddingBottom: 10 },
  starter: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    minHeight: 58,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 20,
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
  sources: { gap: 10, marginTop: 18 },
  source: {
    borderRadius: 18,
    backgroundColor: c.background,
    overflow: "hidden",
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    minHeight: 56,
  },
  sourceMeta: { fontSize: 12, lineHeight: 18, color: c.muted },
  progress: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    fontSize: 13,
    lineHeight: 20,
    color: c.muted,
  },
  preview: { padding: 14, paddingTop: 0, gap: 13 },
  quote: { fontSize: 15, lineHeight: 23 },
  step: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  approval: { padding: 14, paddingTop: 4, gap: 13 },
  fact: { flexDirection: "row", gap: 15, justifyContent: "space-between" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  action: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 23,
    backgroundColor: c.raised,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  actionText: { fontSize: 14, fontWeight: "600" },
  responding: { fontSize: 14, color: c.muted, marginTop: 2, marginBottom: 12 },
  composerArea: {
    paddingHorizontal: 14,
    paddingTop: 5,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  modes: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 22,
  },
  selectedMode: { backgroundColor: c.accentSurface },
  focusRing: { borderWidth: 1, borderRadius: 32, padding: 2 },
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
