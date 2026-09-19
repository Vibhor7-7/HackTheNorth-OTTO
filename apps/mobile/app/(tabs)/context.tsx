import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Button, Copy, Header, Section, s, useOtto } from "../../src/ui";
import { GlassChrome } from "../../src/glass";
import { colors as c, fonts } from "../../src/theme";
import { otto } from "../../src/data/source";
export default function ContextScreen() {
  const state = useOtto();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { turn: selectedTurn } = useLocalSearchParams<{ turn?: string }>();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const offset = useRef(0);
  useEffect(() => {
    if (selectedTurn) {
      const update = setTimeout(() => {
        setTab(0);
        setSearch("");
      }, 0);
      const timer = setTimeout(
        () =>
          scroll.current?.scrollTo({
            y: positions.current[selectedTurn] ?? 0,
            animated: true,
          }),
        350,
      );
      return () => {
        clearTimeout(update);
        clearTimeout(timer);
      };
    }
  }, [selectedTurn]);
  const turns = [...state.turns]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .filter((t) =>
      (t.user_text + " " + t.assistant_text)
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const notes = state.memories.filter((m) => m.source === "user");
  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <Header title="Context" />
        {Platform.OS === "ios" ? (
          <SegmentedControl
            values={["Transcript", "Notes"]}
            selectedIndex={tab}
            onChange={(e) => setTab(e.nativeEvent.selectedSegmentIndex)}
            appearance="dark"
            tintColor={c.raised}
            fontStyle={{ color: c.muted, fontSize: 15 }}
            activeFontStyle={{ color: c.text, fontWeight: "600" }}
            style={{ height: 38 }}
          />
        ) : (
          <View
            style={{
              flexDirection: "row",
              padding: 4,
              backgroundColor: c.surface,
              borderRadius: 14,
            }}
          >
            {["Transcript", "Notes"].map((label, i) => (
              <Pressable
                key={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === i }}
                onPress={() => setTab(i)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: tab === i ? c.raised : "transparent",
                }}
              >
                <Copy
                  style={{
                    textAlign: "center",
                    fontWeight: "600",
                    color: tab === i ? c.text : c.muted,
                  }}
                >
                  {label}
                </Copy>
              </Pressable>
            ))}
          </View>
        )}
        {tab === 0 ? (
          <View
            onLayout={(e) => {
              offset.current = e.nativeEvent.layout.y;
            }}
          >
            <GlassChrome
              style={{ marginTop: 20, marginBottom: 6, borderRadius: 20 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 16,
                }}
              >
                <Feather name="search" size={20} color={c.muted} />
                <TextInput
                  accessibilityLabel="Search transcript"
                  placeholder="Search transcript"
                  placeholderTextColor={c.muted}
                  value={search}
                  onChangeText={setSearch}
                  style={{
                    flex: 1,
                    fontFamily: fonts.body,
                    fontSize: 17,
                    color: c.text,
                    minHeight: 50,
                  }}
                />
                {!!search && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    onPress={() => setSearch("")}
                    style={{
                      minHeight: 44,
                      minWidth: 30,
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="x-circle" size={19} color={c.muted} />
                  </Pressable>
                )}
              </View>
            </GlassChrome>
            {turns.map((turn, index) => {
              const day = new Date(turn.started_at).toLocaleDateString(
                undefined,
                { weekday: "long", month: "short", day: "numeric" },
              );
              const showDay =
                index === 0 ||
                new Date(turns[index - 1].started_at).toDateString() !==
                  new Date(turn.started_at).toDateString();
              return (
                <View
                  key={turn.id}
                  onLayout={(e) => {
                    positions.current[turn.id] =
                      e.nativeEvent.layout.y + offset.current;
                  }}
                >
                  {showDay && <Section title={day} />}
                  <View
                    style={[
                      s.card,
                      {
                        marginBottom: 12,
                        borderWidth: selectedTurn === turn.id ? 1 : 0,
                        borderColor: c.accent,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <Copy style={{ fontWeight: "600" }}>You</Copy>
                      <Copy style={{ color: c.muted, fontSize: 14 }}>
                        {new Date(turn.started_at).toLocaleTimeString(
                          undefined,
                          { hour: "numeric", minute: "2-digit" },
                        )}
                      </Copy>
                    </View>
                    <Copy style={{ fontSize: 18, lineHeight: 26 }}>
                      {turn.user_text}
                    </Copy>
                    <View
                      style={{
                        marginTop: 20,
                        paddingTop: 16,
                        borderTopWidth: 1,
                        borderColor: c.line,
                      }}
                    >
                      <Copy
                        style={{
                          fontWeight: "600",
                          color: c.accent,
                          marginBottom: 7,
                        }}
                      >
                        Otto
                      </Copy>
                      <Copy style={{ color: c.muted }}>
                        {turn.assistant_text}
                      </Copy>
                    </View>
                    {turn.task_ids.map((id) => (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: "/task/[id]",
                            params: { id },
                          })
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 14,
                          paddingVertical: 10,
                          minHeight: 44,
                        }}
                      >
                        <Feather
                          name="arrow-up-right"
                          size={18}
                          color={c.accent}
                        />
                        <Copy
                          style={{ color: c.accent, flex: 1, fontSize: 15 }}
                        >
                          {state.tasks.find((t) => t.id === id)?.goal ??
                            "Open task"}
                        </Copy>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
            {!turns.length && (
              <View style={{ paddingVertical: 50 }}>
                <Copy style={{ fontSize: 22, fontWeight: "600" }}>
                  {search ? "No matching words" : "No conversations yet"}
                </Copy>
                <Copy style={{ color: c.muted, marginTop: 10 }}>
                  {search
                    ? "Try another word."
                    : "Your spoken requests will appear here."}
                </Copy>
              </View>
            )}
          </View>
        ) : (
          <View>
            <Section title="Add a note" />
            <TextInput
              accessibilityLabel="New context note"
              multiline
              placeholder="A preference or detail Otto should remember"
              placeholderTextColor={c.muted}
              value={note}
              onChangeText={setNote}
              style={[
                s.input,
                { minHeight: 120, textAlignVertical: "top", marginBottom: 14 },
              ]}
            />
            <Button
              label="Save note"
              disabled={!note.trim()}
              icon="plus"
              onPress={async () => {
                try {
                  await otto.addMemory(note.trim());
                  setNote("");
                } catch {
                  // Keep the text so the note is not lost when the server is down.
                }
              }}
            />
            <Section title="Your notes" aside={String(notes.length)} />
            <View style={s.group}>
              {notes.map((memory, i) => (
                <View
                  key={memory.id}
                  style={{
                    padding: 18,
                    flexDirection: "row",
                    gap: 10,
                    borderBottomWidth: i < notes.length - 1 ? 1 : 0,
                    borderColor: c.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Copy style={{ fontSize: 17, lineHeight: 25 }}>
                      {memory.text}
                    </Copy>
                    <Copy
                      style={{ color: c.muted, fontSize: 14, marginTop: 8 }}
                    >
                      {new Date(memory.created_at).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </Copy>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={"Delete note: " + memory.text}
                    onPress={async () => {
                      setError("");
                      try {
                        await otto.deleteMemory(memory.id);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not delete note.",
                        );
                      }
                    }}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="trash-2" size={19} color={c.muted} />
                  </Pressable>
                </View>
              ))}
              {!notes.length && (
                <Copy style={{ padding: 20, color: c.muted }}>
                  No saved notes.
                </Copy>
              )}
            </View>
            {!!error && (
              <Copy
                accessibilityRole="alert"
                style={{ color: c.danger, marginTop: 12 }}
              >
                {error}
              </Copy>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
