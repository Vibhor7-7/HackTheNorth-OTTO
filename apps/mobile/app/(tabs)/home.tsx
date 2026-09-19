import { useEffect, useState } from "react";
import { View, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
  useReducedMotion,
} from "react-native-reanimated";
import { colors as c } from "../../src/theme";
import {
  Copy,
  Display,
  Section,
  Button,
  Reveal,
  NetworkBanner,
  ToolMark,
  useOtto,
  s,
} from "../../src/ui";
import { GlassChrome } from "../../src/glass";
import { otto } from "../../src/data/mock";
import type { Approval, HomePayload, Task } from "../../src/data/types";

function DecisionCard({ approval }: { approval: Approval }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(approval.expires_at) - now) / 1000),
  );
  const price = approval.facts["New price"];
  return (
    <Reveal style={h.decision}>
      <View style={h.decisionTop}>
        <View style={h.inline}>
          <View style={h.dot} />
          <Copy style={{ fontWeight: "600", color: c.accent }}>Needs you</Copy>
        </View>
        <Copy style={{ color: c.accent, fontVariant: ["tabular-nums"] }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}{" "}
          left
        </Copy>
      </View>
      <View style={{ padding: 22, gap: 18 }}>
        <Display style={{ fontSize: 25, lineHeight: 30, letterSpacing: -0.7 }}>
          {approval.summary}
        </Display>
        {price ? (
          <View style={[h.inline, { alignItems: "baseline", flexWrap: "wrap" }]}>
            <Copy
              style={{
                fontSize: 20,
                color: c.muted,
                textDecorationLine: "line-through",
              }}
            >
              {approval.facts["Current price"]}
            </Copy>
            <Feather name="arrow-right" size={20} color={c.accent} />
            <Display style={{ fontSize: 34, color: c.accent }}>{price}</Display>
          </View>
        ) : (
          <Copy numberOfLines={2} style={{ color: c.muted }}>
            {approval.facts.To ??
              approval.facts.Restaurant ??
              Object.values(approval.facts)[0]}
          </Copy>
        )}
        <Button
          label="Review"
          icon="arrow-up-right"
          onPress={() =>
            router.push({
              pathname: "/approval/[id]",
              params: { id: approval.id },
            })
          }
        />
      </View>
    </Reveal>
  );
}

function TaskRow({ task, last = false }: { task: Task; last?: boolean }) {
  const complete = task.status === "succeeded";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/task/[id]", params: { id: task.id } })
      }
      style={({ pressed }) => [
        h.taskRow,
        {
          opacity: pressed ? 0.65 : 1,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: complete ? c.accentSurface : c.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather
          name={
            complete
              ? "check"
              : task.status === "failed"
                ? "alert-circle"
                : "minus"
          }
          size={18}
          color={complete ? c.accent : c.warning}
        />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Copy style={{ fontWeight: "600" }}>{task.goal}</Copy>
        <Copy style={{ color: c.muted, fontSize: 14 }}>
          {new Date(task.updated_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          {!complete
            ? ` · ${task.status === "failed" ? "Failed" : "Cancelled"}`
            : ""}
        </Copy>
      </View>
      <Feather name="chevron-right" size={17} color={c.muted} />
    </Pressable>
  );
}

export default function Home() {
  const state = useOtto();
  const [home, setHome] = useState<HomePayload>();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    void otto.getHome().then((value) => {
      if (active) setHome(value);
    });
    return () => {
      active = false;
    };
  }, [state]);
  const y = useSharedValue(0);
  const reduced = useReducedMotion();
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduced
          ? 1
          : interpolate(y.value, [0, 90], [1, 0.92], Extrapolation.CLAMP),
      },
    ],
  }));
  const approvals = home?.approvals ?? [];
  const connections = home?.connections ?? [];
  const items = home?.action_items ?? [];
  const tasks = home?.recent_tasks ?? [];
  const running = tasks.filter(
    (t) => t.status === "running" || t.status === "needs_input",
  );
  const today = new Date().toDateString();
  const done = tasks.filter(
    (t) =>
      t.status === "succeeded" &&
      new Date(t.updated_at).toDateString() === today,
  );
  const stopped = tasks.filter(
    (t) => t.status === "failed" || t.status === "cancelled",
  );
  return (
    <SafeAreaView edges={["top"]} style={s.page}>
      <NetworkBanner />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                setHome(await otto.getHome());
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
      >
        <View style={h.header}>
          <Animated.View style={titleStyle}>
            <Display style={{ fontSize: 36 }}>Today</Display>
          </Animated.View>
          <GlassChrome interactive>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Otto device and demo settings"
              onPress={() => router.push("/settings")}
              style={h.device}
            >
              <View
                style={[
                  h.dot,
                  {
                    backgroundColor:
                      state.network === "online" ? c.accent : c.warning,
                  },
                ]}
              />
              <Copy style={{ fontWeight: "600", fontSize: 15 }}>Otto</Copy>
              <Feather name="battery" size={18} color={c.muted} />
              <Copy style={{ fontSize: 15, color: c.muted }}>84%</Copy>
            </Pressable>
          </GlassChrome>
        </View>
        <View style={h.date}>
          <Copy style={{ color: c.muted }}>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Copy>
          <Copy style={{ color: c.muted, fontSize: 14 }}>Demo</Copy>
        </View>
        {approvals.map((approval) => (
          <DecisionCard key={approval.id} approval={approval} />
        ))}
        {connections.map((connection) => {
          const extension = state.extensions.find(
            (e) => e.id === connection.toolkit,
          );
          return (
            <Reveal key={connection.id} style={[s.card, { marginTop: 12 }]}>
              <View style={h.inline}>
                <ToolMark id={connection.toolkit} size={44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Copy style={{ fontSize: 19, fontWeight: "600" }}>
                    Connect {extension?.name ?? connection.toolkit}
                  </Copy>
                  <Copy style={{ color: c.muted }}>To continue your task</Copy>
                </View>
              </View>
              <View style={{ marginTop: 18 }}>
                <Button
                  label="Connect"
                  quiet
                  onPress={() =>
                    router.push({
                      pathname: "/connect/[id]",
                      params: { id: connection.toolkit },
                    })
                  }
                />
              </View>
            </Reveal>
          );
        })}
        {!approvals.length && !connections.length && (
          <Reveal
            style={[
              s.card,
              { backgroundColor: c.accentSurface, paddingVertical: 26 },
            ]}
          >
            <View style={[h.inline, { marginBottom: 16 }]}>
              <Feather name="check-circle" size={28} color={c.accent} />
              <Display style={{ fontSize: 25 }}>Nothing needs you</Display>
            </View>
            {!!items.length && (
              <Button
                label={`${items.length} suggested tasks`}
                quiet
                icon="arrow-right"
                onPress={() => router.push("/(tabs)/tasks")}
              />
            )}
          </Reveal>
        )}
        {!!items.length && !!(approvals.length + connections.length) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/tasks")}
            style={h.suggestions}
          >
            <Feather name="check-square" size={20} color={c.accent} />
            <Copy style={{ flex: 1, fontWeight: "500" }}>
              {items.length} suggested tasks
            </Copy>
            <Feather name="arrow-right" size={20} color={c.muted} />
          </Pressable>
        )}
        {!!running.length && (
          <>
            <Section title="Running" aside={String(running.length)} />
            {running.map((task) => {
              const steps = state.steps.filter(
                (step) => step.task_id === task.id,
              );
              const latest = steps.at(-1);
              return (
                <Reveal key={task.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/task/[id]",
                        params: { id: task.id },
                      })
                    }
                    style={[s.card, { marginBottom: 12 }]}
                  >
                    <View style={h.inline}>
                      <Copy
                        style={{ flex: 1, fontSize: 19, fontWeight: "600" }}
                      >
                        {task.goal}
                      </Copy>
                      <Feather
                        name="arrow-up-right"
                        size={20}
                        color={c.accent}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 5,
                        marginVertical: 18,
                      }}
                    >
                      {Array.from(
                        { length: Math.min(steps.length + 1, 7) },
                        (_, index) => (
                          <View
                            key={index}
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 2,
                              backgroundColor:
                                index < steps.length ? c.accent : c.line,
                            }}
                          />
                        ),
                      )}
                    </View>
                    <View style={h.inline}>
                      {task.toolkits_used.slice(0, 3).map((id) => (
                        <ToolMark key={id} id={id} size={28} />
                      ))}
                      <Copy
                        numberOfLines={2}
                        style={{ color: c.muted, flex: 1, fontSize: 15 }}
                      >
                        {task.status === "needs_input"
                          ? "Needs your answer"
                          : (latest?.summary ?? "Starting")}
                      </Copy>
                    </View>
                  </Pressable>
                </Reveal>
              );
            })}
          </>
        )}
        <Section title="Done today" aside={String(done.length)} />
        <Reveal style={s.group}>
          {done.length ? (
            done.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                last={index === done.length - 1}
              />
            ))
          ) : (
            <View style={{ padding: 24 }}>
              <Copy style={{ color: c.muted }}>No completed tasks yet.</Copy>
            </View>
          )}
        </Reveal>
        {!!stopped.length && (
          <>
            <Section title="Stopped" />
            <View style={s.group}>
              {stopped.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  last={index === stopped.length - 1}
                />
              ))}
            </View>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/tasks")}
          style={{
            minHeight: 52,
            marginTop: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Copy style={{ color: c.accent, fontWeight: "600" }}>
            All tasks <Feather name="arrow-right" size={16} />
          </Copy>
        </Pressable>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const h = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 18,
    gap: 14,
  },
  date: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  device: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 15,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  decision: {
    borderRadius: 28,
    backgroundColor: c.accentSurface,
    overflow: "hidden",
    marginBottom: 4,
  },
  decisionTop: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    backgroundColor: "#204B37",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  suggestions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 4,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 18,
    gap: 13,
    borderColor: c.line,
  },
});
