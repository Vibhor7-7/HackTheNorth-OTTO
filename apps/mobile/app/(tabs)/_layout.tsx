import { Badge, Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Feather } from '@expo/vector-icons';
import { colors as c, fonts } from '../../src/theme';
import { useOtto } from '../../src/ui';

export default function TabsLayout() {
  const state = useOtto();
  const count = state.approvals.filter(x => x.status === 'pending').length + state.connections.filter(x => x.status === 'pending').length + state.actionItems.filter(x => x.status === 'open').length;
  return <NativeTabs backgroundColor={c.bone} tintColor={c.signal} iconColor={{ default: c.muted, selected: c.signal }} labelStyle={{ fontFamily: fonts.medium, fontSize: 10 }} badgeBackgroundColor={c.signal} disableTransparentOnScrollEdge>
    <NativeTabs.Trigger name="home"><Icon sf={{ default: 'house', selected: 'house.fill' }} androidSrc={<VectorIcon family={Feather} name="home" />} /><Label>Home</Label>{count > 0 && <Badge>{String(count)}</Badge>}</NativeTabs.Trigger>
    <NativeTabs.Trigger name="context"><Icon sf="text.alignleft" androidSrc={<VectorIcon family={Feather} name="align-left" />} /><Label>Context</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="connections"><Icon sf={{ default: 'point.3.connected.trianglepath.dotted', selected: 'point.3.filled.connected.trianglepath.dotted' }} androidSrc={<VectorIcon family={Feather} name="link" />} /><Label>Connections</Label></NativeTabs.Trigger>
    <NativeTabs.Trigger name="chat"><Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} androidSrc={<VectorIcon family={Feather} name="message-circle" />} /><Label>Chat</Label></NativeTabs.Trigger>
  </NativeTabs>;
}
