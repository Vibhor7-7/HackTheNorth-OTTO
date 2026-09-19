import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Button,
  Copy,
  Header,
  NetworkBanner,
  ToolMark,
  s,
  useOtto,
} from "../../src/ui";
import { colors as c } from "../../src/theme";
import { otto } from "../../src/data/mock";
import type { Task } from "../../src/data/types";

const labels: Record<Task["status"], string> = {
  running: "Running",
  needs_input: "Needs an answer",
  awaiting_approval: "Needs approval",
  awaiting_connection: "Needs a connection",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const openTask = (id: string) =>
  router.push({ pathname: "/task/[id]", params: { id } });

export default function TasksScreen() {
  const state = useOtto();
  const [selected, setSelected] = useState(0);
  const approvals = state.approvals.filter((a) => a.status === "pending");
  const connections = state.connections.filter((a) => a.status === "pending");
  const items = state.actionItems.filter((a) => a.status === "open");
  const questions = state.tasks.filter((t) => t.status === "needs_input");
  const running = state.tasks.filter((t) => t.status === "running");
  const done = state.tasks
    .filter((t) => ["succeeded", "failed", "cancelled"].includes(t.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const counts = [
    approvals.length + connections.length + items.length + questions.length,
    running.length,
    done.length,
  ];
  const filters = ["Needs you", "Running", "Done"];
  return (
    <SafeAreaView style={s.page} edges={["top"]}>
      <NetworkBanner />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Header title="Tasks" />
        {Platform.OS === "ios" ? (
          <SegmentedControl
            accessibilityLabel="Task filters"
            appearance="dark"
            values={filters.map((name, i) => `${name} ${counts[i]}`)}
            selectedIndex={selected}
            onChange={(event) => {
              setSelected(event.nativeEvent.selectedSegmentIndex);
              void Haptics.selectionAsync();
            }}
            backgroundColor={c.surface}
            tintColor={c.raised}
            fontStyle={{ color: c.muted, fontSize: 14 }}
            activeFontStyle={{ color: c.text, fontWeight: "600" }}
            style={{ height: 40, marginBottom: 24 }}
          />
        ) : (
          <View style={styles.filters}>
            {filters.map((name, i) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: selected === i }}
                onPress={() => setSelected(i)}
                style={[
                  styles.filter,
                  selected === i && { backgroundColor: c.raised },
                ]}
              >
                <Copy
                  style={{
                    fontWeight: "600",
                    color: selected === i ? c.text : c.muted,
                  }}
                >
                  {name} {counts[i]}
                </Copy>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ gap: 14 }}>
          {selected === 0 && (
            <>
              {approvals.map((approval) => (
                <View
                  key={approval.id}
                  style={[s.card, { borderWidth: 1, borderColor: c.warning }]}
                >
                  <View style={styles.row}>
                    <Feather name="shield" size={19} color={c.warning} />
                    <Copy style={{ color: c.warning, fontWeight: "600" }}>
                      Approval needed
                    </Copy>
                  </View>
                  <Copy style={styles.title}>{approval.summary}</Copy>
                  <Copy style={styles.secondary}>
                    {Object.entries(approval.facts)
                      .filter(([key]) =>
                        ["Product", "New price", "To", "Total"].includes(key),
                      )
                      .map(([key, value]) => `${key}: ${value}`)
                      .join("\n")}
                  </Copy>
                  <Button
                    label="Review"
                    onPress={() =>
                      router.push({
                        pathname: "/approval/[id]",
                        params: { id: approval.id },
                      })
                    }
                  />
                </View>
              ))}
              {connections.map((connection) => (
                <View key={connection.id} style={s.card}>
                  <View style={styles.row}>
                    <ToolMark id={connection.toolkit} />
                    <View style={{ flex: 1 }}>
                      <Copy style={{ fontWeight: "600" }}>
                        Connect{" "}
                        {state.extensions.find(
                          (e) => e.id === connection.toolkit,
                        )?.name ?? connection.toolkit}
                      </Copy>
                      <Copy style={{ color: c.muted, fontSize: 14 }}>
                        Waiting for access
                      </Copy>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openTask(connection.task_id)}
                    style={{ paddingVertical: 16 }}
                  >
                    <Copy>
                      {
                        state.tasks.find((t) => t.id === connection.task_id)
                          ?.goal
                      }
                    </Copy>
                  </Pressable>
                  <Button
                    label="Connect"
                    onPress={() =>
                      router.push({
                        pathname: "/connect/[id]",
                        params: { id: connection.toolkit },
                      })
                    }
                  />
                </View>
              ))}
              {questions.map((task) => (
                <Pressable
                  accessibilityRole="button"
                  key={task.id}
                  onPress={() => openTask(task.id)}
                  style={s.card}
                >
                  <View style={styles.row}>
                    <Feather name="help-circle" size={20} color={c.warning} />
                    <Copy style={{ fontWeight: "600", flex: 1 }}>
                      Which Sam?
                    </Copy>
                    <Feather name="chevron-right" size={20} color={c.muted} />
                  </View>
                  <Copy style={{ marginTop: 12 }}>{task.goal}</Copy>
                </Pressable>
              ))}
              {items.map((item) => {
                const turn = state.turns.find((t) => t.id === item.turn_id);
                return (
                  <View key={item.id} style={s.card}>
                    <Copy style={styles.itemTitle}>{item.title}</Copy>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="View source transcript"
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/context",
                          params: { turn: item.turn_id },
                        })
                      }
                      style={styles.source}
                    >
                      <Copy style={{ fontStyle: "italic", color: c.text }}>
                        “{item.snippet}”
                      </Copy>
                      <Copy style={{ color: c.muted, fontSize: 14, marginTop: 12 }}>
                        {Math.round(item.confidence * 100)}% confidence
                      </Copy>
                      <View style={[styles.row, { marginTop: 12 }]}>
                        <Copy style={{ color: c.muted, fontSize: 14, flex: 1 }}>
                          You
                          {turn
                            ? ` · ${new Date(turn.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                            : ""}
                        </Copy>
                        <Feather
                          name="arrow-up-right"
                          size={16}
                          color={c.muted}
                        />
                      </View>
                    </Pressable>
                    <View style={styles.actions}>
                      <View style={{ flex: 1 }}>
                        <Button
                          label="Do it"
                          onPress={async () => {
                            await Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Medium,
                            );
                            const id = await otto.doAction(item.id);
                            openTask(id);
                          }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          quiet
                          label="Dismiss"
                          onPress={() => otto.dismissAction(item.id)}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
          {(selected === 1 ? running : selected === 2 ? done : []).map(
            (task) => {
              const steps = state.steps
                .filter((step) => step.task_id === task.id)
                .sort((a, b) => a.seq - b.seq);
              const latest = steps.at(-1);
              const tone =
                task.status === "failed"
                  ? c.danger
                  : task.status === "cancelled"
                    ? c.muted
                    : c.accent;
              return (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  onPress={() => openTask(task.id)}
                  style={s.card}
                >
                  <View style={[styles.row, { alignItems: "flex-start" }]}>
                    <View style={{ flex: 1 }}>
                      <Copy style={styles.itemTitle}>{task.goal}</Copy>
                      <Copy
                        style={{ color: tone, fontWeight: "500", marginTop: 5 }}
                      >
                        {labels[task.status]}
                      </Copy>
                    </View>
                    <Feather
                      name={
                        task.status === "succeeded"
                          ? "check-circle"
                          : task.status === "failed"
                            ? "alert-circle"
                            : task.status === "cancelled"
                              ? "x-circle"
                              : "chevron-right"
                      }
                      size={22}
                      color={tone}
                    />
                  </View>
                  {selected === 1 && (
                    <>
                      <Copy style={{ marginTop: 18, color: c.muted }}>
                        {steps.length} recorded{" "}
                        {steps.length === 1 ? "step" : "steps"}
                      </Copy>
                      <View style={styles.steps}>
                        {steps.map((step) => (
                          <View key={step.id} style={styles.step} />
                        ))}
                      </View>
                      <Copy style={{ marginBottom: 16 }}>
                        {latest?.summary ?? "Starting task…"}
                      </Copy>
                    </>
                  )}
                  {selected === 2 && task.spoken_summary && (
                    <Copy style={{ marginTop: 12, color: c.muted }}>
                      {task.spoken_summary}
                    </Copy>
                  )}
                  <View style={[styles.row, { marginTop: 14 }]}>
                    {task.toolkits_used.map((tool) => (
                      <ToolMark key={tool} id={tool} size={28} />
                    ))}
                    <Copy
                      style={{
                        fontSize: 14,
                        color: c.muted,
                        marginLeft: "auto",
                      }}
                    >
                      {new Date(task.updated_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Copy>
                  </View>
                </Pressable>
              );
            },
          )}
          {counts[selected] === 0 && (
            <View style={[s.card, { paddingVertical: 36 }]}>
              <Copy style={{ fontSize: 20, fontWeight: "600" }}>
                {selected === 0
                  ? "Nothing needs you"
                  : selected === 1
                    ? "No tasks running"
                    : "No finished tasks yet"}
              </Copy>
              <Copy style={{ color: c.muted, marginTop: 10 }}>
                {selected === 0
                  ? "Approvals and suggestions will appear here."
                  : selected === 1
                    ? "Start a task from a suggestion or Ask."
                    : "Completed, cancelled, and failed tasks appear here."}
              </Copy>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  filters: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  filter: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 12,
  },
  secondary: { color: c.muted, marginBottom: 20 },
  itemTitle: { fontSize: 20, lineHeight: 27, fontWeight: "600" },
  source: {
    backgroundColor: c.raised,
    padding: 16,
    borderRadius: 18,
    marginTop: 16,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  steps: { flexDirection: "row", gap: 5, marginTop: 10, marginBottom: 14 },
  step: { height: 4, flex: 1, backgroundColor: c.accent, borderRadius: 2 },
});
