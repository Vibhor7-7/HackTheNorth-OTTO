import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Copy, Display, Eyebrow, NetworkBanner, Reveal, s, useOtto } from '../../src/ui';
import { colors as c, fonts } from '../../src/theme';
import { otto } from '../../src/data/mock';

const starters = ['What did I do today?', 'What did I commit to this week?', "What's still open?"];

export default function ChatScreen() {
  const state = useOtto();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const locked = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const disabled = sending || state.streaming || state.network !== 'online';
  const send = async (text = draft) => {
    if (!text.trim() || disabled || locked.current) return;
    locked.current = true;
    setSending(true);
    setError('');
    setDraft('');
    follow.current = true;
    try { await otto.sendChat(text.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send. Please try again.'); setDraft(text); }
    finally { locked.current = false; setSending(false); }
  };
  return <SafeAreaView edges={['top']} style={s.page}>
    <NetworkBanner />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.topbar}>
        <View style={styles.identity}><View style={styles.signal}><View style={styles.signalCore} /></View><Eyebrow>Otto / Chat</Eyebrow></View>
        <Copy style={styles.demo}>Demo</Copy>
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[s.content, { paddingBottom: 28, flexGrow: 1 }]} scrollEventThrottle={32}
        onScroll={({ nativeEvent: e }) => { follow.current = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y < 100; }}
        onContentSizeChange={() => { if (follow.current) scroll.current?.scrollToEnd({ animated: false }); }}>
        <Reveal style={{ paddingTop: 24, paddingBottom: 26 }}>
          <Display style={styles.title}>Pick up{ '\n' }the thread.</Display>
          <Copy style={styles.intro}>Your words, your plans, your unfinished things. All in one conversation.</Copy>
        </Reveal>
        <View style={styles.starters}>
          {starters.map((text, i) => <Pressable key={text} accessibilityRole="button" accessibilityLabel={text} disabled={disabled} onPress={() => void send(text)} style={({ pressed }) => [styles.starter, { opacity: disabled ? .45 : pressed ? .6 : 1 }]}>
            <Copy style={styles.number}>0{i + 1}</Copy><Copy style={{ flex: 1, fontFamily: fonts.medium }}>{text}</Copy><Feather name="arrow-up-right" size={18} color={c.signal} />
          </Pressable>)}
        </View>
        {state.messages.length > 0 && <View style={styles.conversationLabel}><Eyebrow>The conversation</Eyebrow><View style={{ flex: 1, height: 1, backgroundColor: c.line }} /></View>}
        {state.messages.map((message, index) => {
          const user = message.role === 'user';
          const latest = index === state.messages.length - 1;
          return <Reveal key={message.id} style={[styles.message, user && styles.userMessage]}>
            <View style={styles.messageHeader}><Eyebrow>{user ? 'You' : 'Otto'}</Eyebrow><Copy style={styles.time}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Copy></View>
            <Copy selectable style={[styles.messageText, user && { fontFamily: fonts.medium }]}>{message.text || (state.streaming && latest ? 'Picking up the thread…' : 'No response yet.')}</Copy>
            {!!message.citations?.length && <View style={styles.sources}>{message.citations.map((citation, i) => {
              const task = state.tasks.find(t => t.id === citation.id);
              const turn = state.turns.find(t => t.id === citation.id);
              const label = citation.kind === 'task' ? task?.goal || 'View task' : turn?.user_text || 'View transcript';
              return <Pressable key={`${citation.kind}-${citation.id}-${i}`} accessibilityRole="button" accessibilityLabel={`View source: ${label}`} onPress={() => citation.kind === 'task' ? router.push({ pathname: '/task/[id]', params: { id: citation.id } }) : router.push({ pathname: '/(tabs)/context', params: { turn: citation.id } })} style={({ pressed }) => [styles.source, { opacity: pressed ? .6 : 1 }]}>
                <Feather name={citation.kind === 'task' ? 'git-commit' : 'align-left'} size={15} color={c.signal}/><Copy numberOfLines={2} style={{ flex: 1, fontSize: 12, lineHeight: 18 }}>{label}</Copy><Feather name="arrow-up-right" size={14} color={c.ink}/>
              </Pressable>;
            })}</View>}
          </Reveal>;
        })}
        {(state.streaming || sending) && <Copy accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.signal, marginTop: 8 }}>Otto is responding…</Copy>}
      </ScrollView>
      <View style={styles.composerArea}>
        {!!error && <Copy accessibilityRole="alert" style={{ color: c.signal, fontSize: 13, marginBottom: 8 }}>{error}</Copy>}
        <View style={styles.composer}>
          <TextInput accessibilityLabel="Message Otto" placeholder={state.network === 'online' ? 'Ask, remember, or do something…' : 'Reconnect to message Otto'} placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} multiline maxLength={2000} style={styles.input} editable={!sending} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={disabled || !draft.trim()} onPress={() => void send()} style={({ pressed }) => [styles.send, { opacity: disabled || !draft.trim() ? .35 : pressed ? .65 : 1 }]}><Feather name="arrow-up" size={23} color={c.bone}/></Pressable>
        </View>
        <Copy style={styles.footnote}>Demo conversation · Actions stay in Otto</Copy>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  topbar: { paddingHorizontal: 24, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.line },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  signal: { width: 25, height: 25, borderRadius: 20, borderWidth: 1, borderColor: c.signal, alignItems: 'center', justifyContent: 'center' },
  signalCore: { width: 13, height: 13, borderRadius: 10, backgroundColor: c.signal },
  demo: { color: c.muted, fontSize: 12 },
  title: { fontSize: 52, lineHeight: 53, letterSpacing: -2 },
  intro: { color: c.muted, marginTop: 16, maxWidth: 290 },
  starters: { borderTopWidth: 1, borderTopColor: c.ink, marginBottom: 12 },
  starter: { flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 62, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.line },
  number: { fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'] },
  conversationLabel: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 24, marginBottom: 10 },
  message: { paddingVertical: 23 },
  userMessage: { backgroundColor: c.pale, marginTop: 12, paddingHorizontal: 18, borderRadius: 3 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 11 },
  time: { fontSize: 10, color: c.muted },
  messageText: { fontSize: 16, lineHeight: 26 },
  sources: { marginTop: 17, gap: 7 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: c.line, borderRadius: 3, minHeight: 44 },
  composerArea: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.line, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: c.bone },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, borderRadius: 7, padding: 7 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, minHeight: 44, maxHeight: 120, paddingHorizontal: 7, paddingVertical: 11, color: c.ink },
  send: { height: 44, width: 44, borderRadius: 4, backgroundColor: c.signal, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontSize: 10, color: c.muted, textAlign: 'center', marginTop: 6, lineHeight: 16 },
});
