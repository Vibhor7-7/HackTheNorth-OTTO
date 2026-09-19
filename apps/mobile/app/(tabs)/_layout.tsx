import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors as c, fonts } from '../../src/theme';
import { useOtto } from '../../src/ui';

export default function TabsLayout() {
  const state = useOtto();
  const count = state.approvals.filter(x => x.status === 'pending').length + state.connections.filter(x => x.status === 'pending').length + state.actionItems.filter(x => x.status === 'open').length;
  return <NativeTabs backgroundColor={c.bone} tintColor={c.signal} iconColor={{ default: c.muted, selected: c.signal }} labelStyle={{ fontFamily: fonts.medium, fontSize: 10 }} badgeBackgroundColor={c.signal} disableTransparentOnScrollEdge>
    <NativeTabs.Trigger name="home"><NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" /><NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>{count > 0 && <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge>}</NativeTabs.Trigger>
    <NativeTabs.Trigger name="context"><NativeTabs.Trigger.Icon sf="text.alignleft" md="notes" /><NativeTabs.Trigger.Label>Context</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="connections"><NativeTabs.Trigger.Icon sf={{ default: 'point.3.connected.trianglepath.dotted', selected: 'point.3.filled.connected.trianglepath.dotted' }} md="link" /><NativeTabs.Trigger.Label>Connections</NativeTabs.Trigger.Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="chat"><NativeTabs.Trigger.Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} md="chat_bubble_outline" /><NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label></NativeTabs.Trigger>
  </NativeTabs>;
}
