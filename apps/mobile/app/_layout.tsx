import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { PublicSans_400Regular, PublicSans_600SemiBold } from '@expo-google-fonts/public-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors as c } from '../src/theme';
import { otto } from '../src/data/mock';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_600SemiBold, PublicSans_400Regular, PublicSans_600SemiBold });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const initialize = () => { setError(''); otto.initialize().then(() => setReady(true)).catch(() => setError('Your demo could not load. Please try again.')); };
  useEffect(() => { otto.initialize().then(() => setReady(true)).catch(() => setError('Your demo could not load. Please try again.')); }, []);
  if (fontError) throw fontError;
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bone }}><SafeAreaProvider>
    <StatusBar style="dark" />
    {!ready || !fontsLoaded ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, backgroundColor: c.bone }}>
      <Text style={{ fontSize: 52, color: c.ink, fontFamily: fontsLoaded ? 'BricolageGrotesque_600SemiBold' : undefined }}>Otto.</Text>
      {error ? <Pressable accessibilityRole="button" onPress={initialize} style={{ padding: 24 }}><Text style={{ color: c.signal }}>{error}</Text><Text style={{ color: c.ink, marginTop: 12, textAlign: 'center' }}>Retry</Text></Pressable> : <ActivityIndicator color={c.signal} />}
    </View> : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bone }, animation: 'slide_from_right' }} />}
  </SafeAreaProvider></GestureHandlerRootView>;
}
