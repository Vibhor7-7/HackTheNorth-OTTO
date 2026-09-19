import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors as c, fonts } from "../../src/theme";
import { useOtto } from "../../src/ui";

export default function TabsLayout() {
  const state = useOtto();
  const count =
    state.approvals.filter((x) => x.status === "pending").length +
    state.connections.filter((x) => x.status === "pending").length;
  return (
    <NativeTabs
      tintColor={c.accent}
      blurEffect="systemChromeMaterialDark"
      iconColor={{ default: c.muted, selected: c.accent }}
      labelStyle={{ fontFamily: fonts.medium, fontSize: 11 }}
      badgeBackgroundColor={c.accent}
      badgeTextColor={c.onAccent}
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger name="home" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          sf={{ default: "circle", selected: "circle.inset.filled" }}
          md="today"
        />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        {count > 0 && (
          <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "checkmark.square",
            selected: "checkmark.square.fill",
          }}
          md="checklist"
        />
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="context" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="text.alignleft" md="notes" />
        <NativeTabs.Trigger.Label>Context</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          sf={{ default: "bubble.left", selected: "bubble.left.fill" }}
          md="chat_bubble_outline"
        />
        <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="connections" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="apps"
        />
        <NativeTabs.Trigger.Label>Apps</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
