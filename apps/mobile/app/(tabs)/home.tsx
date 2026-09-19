import { useEffect, useState } from "react";
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { colors as c } from "../../src/theme";
import {
  Header,
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
import { SignalScene } from "../../src/visuals/SignalScene";
import { otto } from "../../src/data/mock";
import type { HomePayload } from "../../src/data/types";

export default function Home() {
  const state = useOtto();
  const [home, setHome] = useState<HomePayload>();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(6);
  useEffect(() => {
    let live = true;
    void otto.getHome().then((value) => {
      if (live) setHome(value);
    });
    return () => {
      live = false;
    };
  }, [state]);
  const y = useSharedValue(0);
  const reduced = useReducedMotion();
  const scroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: reduced
          ? 0
          : interpolate(y.value, [0, 300], [0, 44], Extrapolation.CLAMP),
      },
      {
        scale: reduced
          ? 1
          : interpolate(y.value, [0, 300], [1, 0.94], Extrapolation.CLAMP),
      },
    ],
  }));
  const tasks = state.tasks;
  const active = tasks.filter((t) => t.status === "running");
  const urgent =
    (home?.approvals.length ?? 0) +
    (home?.connections.length ?? 0) +
    tasks.filter((t) => t.status === "needs_input").length;
  const approval = home?.approvals[0];
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const completed = tasks.filter(
      (t) =>
        t.status === "succeeded" &&
        new Date(t.updated_at).toDateString() === date.toDateString(),
    );
    return { date, completed };
  });
  const max = Math.max(1, ...days.map((d) => d.completed.length));
  const day = days[selected];
  const connected = state.extensions.filter((e) => e.status === "connected");
  return (
    <SafeAreaView edges={["top"]} style={s.page}>
      <NetworkBanner />
      <Animated.ScrollView
        onScroll={scroll}
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
        <Header
          title="Today"
          right={<Copy style={{ color: c.muted }}>Demo</Copy>}
        />
        <View style={h.hero}>
          <Animated.View style={sceneStyle}>
            <SignalScene active={active.length > 0} />
          </Animated.View>
          <View pointerEvents="none" style={h.heroTitle}>
            <Display
              style={{ fontSize: 38, lineHeight: 41, letterSpacing: -1.5 }}
            >
              A little less{"\n"}on your mind.
            </Display>
          </View>
          <View style={h.heroBottom}>
            <Copy style={{ color: c.muted }}>Otto · Device concept</Copy>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask Otto"
              onPress={() => router.push("/(tabs)/chat")}
              style={h.arrow}
            >
              <Feather name="arrow-up-right" size={24} color={c.onAccent} />
            </Pressable>
          </View>
        </View>
        <View style={h.summary}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/tasks")}
            style={{ flex: 1, gap: 6 }}
          >
            <Display style={{ fontSize: 38 }}>
              {days[6].completed.length}
            </Display>
            <Copy style={{ color: c.muted }}>Handled today</Copy>
          </Pressable>
          <View style={{ width: 1, backgroundColor: c.line }} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/tasks")}
            style={{ flex: 1, gap: 6, paddingLeft: 24 }}
          >
            <Display style={{ fontSize: 38, color: c.accent }}>
              {active.length}
            </Display>
            <Copy style={{ color: c.muted }}>In motion</Copy>
          </Pressable>
        </View>
        <Section title="Urgent" aside={urgent ? String(urgent) : undefined} />
        <Reveal
          style={[h.urgent, { backgroundColor: urgent ? c.accent : c.surface }]}
        >
          <View style={h.inline}>
            <Feather
              name={urgent ? "arrow-up-right" : "check"}
              size={26}
              color={urgent ? c.onAccent : c.accent}
            />
            <Copy style={{ color: urgent ? c.onAccent : c.muted, flex: 1 }}>
              {urgent ? "Your next move" : "All clear"}
            </Copy>
          </View>
          <Display
            style={{
              fontSize: 26,
              lineHeight: 32,
              color: urgent ? c.onAccent : c.text,
              marginVertical: 18,
            }}
          >
            {approval?.summary ??
              (urgent ? "Otto needs a hand." : "Nothing needs you.")}
          </Display>
          {approval && (
            <Copy
              numberOfLines={2}
              style={{ color: c.onAccent, marginBottom: 20 }}
            >
              {Object.entries(approval.facts)
                .slice(0, 2)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
            </Copy>
          )}
          <Button
            label={urgent ? "Review urgent" : "Open inbox"}
            quiet
            icon="arrow-right"
            onPress={() => router.push("/urgent")}
          />
        </Reveal>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/urgent", params: { tab: "text" } })
          }
          style={h.channel}
        >
          <Feather name="message-square" size={22} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Copy style={{ fontWeight: "600" }}>Approval texts</Copy>
            <Copy style={{ color: c.muted }}>Demo channel</Copy>
          </View>
          <Feather name="chevron-right" size={20} color={c.muted} />
        </Pressable>
        <Section
          title="Your week"
          aside={day.date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        />
        <View style={h.activity}>
          <View
            style={[
              h.inline,
              { justifyContent: "space-between", marginBottom: 24 },
            ]}
          >
            <Copy style={{ fontSize: 19, fontWeight: "600" }}>
              {day.completed.length} handled
            </Copy>
            <Feather name="bar-chart-2" size={22} color={c.accent} />
          </View>
          <View
            style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}
          >
            {days.map((d, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`${d.date.toLocaleDateString()}: ${d.completed.length} completed tasks`}
                accessibilityState={{ selected: index === selected }}
                onPress={() => setSelected(index)}
                style={{ flex: 1, alignItems: "center", gap: 12 }}
              >
                <View
                  style={{
                    height: 110,
                    width: "100%",
                    justifyContent: "flex-end",
                    backgroundColor:
                      index === selected ? c.raised : "transparent",
                    borderRadius: 12,
                    paddingHorizontal: 5,
                    paddingBottom: 5,
                  }}
                >
                  <View
                    style={{
                      height: Math.max(3, (d.completed.length / max) * 95),
                      backgroundColor: index === selected ? c.accent : c.line,
                      borderRadius: 8,
                    }}
                  />
                </View>
                <Copy
                  style={{
                    color: index === selected ? c.text : c.muted,
                    fontSize: 14,
                  }}
                >
                  {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                </Copy>
              </Pressable>
            ))}
          </View>
          {day.completed.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/task/[id]",
                  params: { id: day.completed[0].id },
                })
              }
              style={{ paddingTop: 24 }}
            >
              <Copy numberOfLines={2}>{day.completed[0].goal}</Copy>
              <Copy style={{ color: c.accent, marginTop: 8 }}>
                View result ↗
              </Copy>
            </Pressable>
          )}
        </View>
        <Section title="Within reach" aside={`${connected.length} apps`} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 24, paddingBottom: 12 }}
        >
          {connected.map((tool) => (
            <Pressable
              key={tool.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${tool.name} connection`}
              onPress={() => router.push("/(tabs)/connections")}
              style={{ alignItems: "center", gap: 12 }}
            >
              <ToolMark id={tool.id} size={58} />
              <Copy>{tool.name}</Copy>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/tasks")}
          style={[h.channel, { marginTop: 24 }]}
        >
          <Copy style={{ flex: 1, fontWeight: "600" }}>
            {home?.action_items.length ?? 0} suggested actions
          </Copy>
          <Feather name="arrow-right" size={22} color={c.accent} />
        </Pressable>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
const h = StyleSheet.create({
  hero: {
    height: 310,
    overflow: "hidden",
    borderRadius: 32,
    backgroundColor: "#080B0A",
  },
  heroTitle: { position: "absolute", top: 8, left: 0, right: 40 },
  heroBottom: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrow: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    flexDirection: "row",
    paddingVertical: 24,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  urgent: { borderRadius: 28, padding: 24 },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  activity: { padding: 24, backgroundColor: c.surface, borderRadius: 28 },
});
