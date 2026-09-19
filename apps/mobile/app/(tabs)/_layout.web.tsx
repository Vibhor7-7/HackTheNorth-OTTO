import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors as c, fonts } from "../../src/theme";
import { useOtto } from "../../src/ui";
import { GlassChrome } from "../../src/glass";

export default function WebTabsLayout() {
  const state = useOtto();
  const count =
    state.approvals.filter((x) => x.status === "pending").length +
    state.connections.filter((x) => x.status === "pending").length +
    state.actionItems.filter((x) => x.status === "open").length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          position: "absolute",
          bottom: 16,
          left: 16,
          right: 16,
          borderRadius: 32,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: 72,
          paddingTop: 10,
          paddingBottom: 10,
          elevation: 0,
        },
        tabBarBackground: () => (
          <GlassChrome
            style={{ position: "absolute", inset: 0, borderRadius: 32 }}
          >
            {null}
          </GlassChrome>
        ),
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarBadgeStyle: {
          backgroundColor: c.accent,
          color: c.onAccent,
          fontSize: 11,
        },
        sceneStyle: { backgroundColor: c.background },
        animation: "fade",
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Today",
          tabBarBadge: count || undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <Feather name="check-square" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="context"
        options={{
          title: "Context",
          tabBarIcon: ({ color, size }) => (
            <Feather name="align-left" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Ask",
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: "Apps",
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
