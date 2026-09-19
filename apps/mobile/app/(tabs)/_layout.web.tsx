import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors as c, fonts } from '../../src/theme';
import { useOtto } from '../../src/ui';

export default function WebTabsLayout() {
  const state = useOtto();
  const count = state.approvals.filter(x => x.status === 'pending').length + state.connections.filter(x => x.status === 'pending').length + state.actionItems.filter(x => x.status === 'open').length;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.signal, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.bone, borderTopColor: c.line, height: 76, paddingTop: 9, paddingBottom: 14 }, tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 }, tabBarBadgeStyle: { backgroundColor: c.signal, color: c.bone, fontSize: 10 }, sceneStyle: { backgroundColor: c.bone }, animation: 'fade' }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarBadge: count || undefined, tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
    <Tabs.Screen name="context" options={{ title: 'Context', tabBarIcon: ({ color, size }) => <Feather name="align-left" size={size} color={color} /> }} />
    <Tabs.Screen name="connections" options={{ title: 'Connections', tabBarIcon: ({ color, size }) => <Feather name="link" size={size} color={color} /> }} />
    <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }} />
  </Tabs>;
}
