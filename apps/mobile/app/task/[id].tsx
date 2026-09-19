import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Button, Copy, Display, Eyebrow, NetworkBanner, Reveal, Section, s, useOtto } from '../../src/ui';
import { colors as c, fonts } from '../../src/theme';
import { otto } from '../../src/data/mock';
import type { TaskStep } from '../../src/data/types';

const labels = { running: 'In motion', needs_input: 'One quick question', awaiting_approval: 'Your call', awaiting_connection: 'One connection away', succeeded: 'Taken care of', failed: 'Hit a pause', cancelled: 'Stopped here' };
const stepLabels: Record<TaskStep['kind'], string> = { plan: 'The plan', tool_call: 'Taking action', tool_result: 'What happened', approval_wait: 'Your permission', connection_wait: 'A new connection', question: 'A little clarity', final: 'The outcome', error: 'What went wrong' };

function TimelineStep({ step, last, scrollY }: { step: TaskStep; last: boolean; scrollY: SharedValue<number> }) {
  const [expanded, setExpanded] = useState(false);
  const position = useSharedValue(0);
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => {
    const progress = reduced ? 1 : interpolate(scrollY.value + height - 100 - position.value, [0, 120], [0, 1], Extrapolation.CLAMP);
    return { opacity: .25 + progress * .75, transform: [{ translateY: (1 - progress) * 18 }] };
  });
  const facts = step.args_redacted !== undefined || step.result_redacted !== undefined;
  const tone = step.kind === 'error' || step.kind === 'approval_wait' ? c.signal : step.kind === 'final' ? c.pine : c.ink;
  return <Animated.View onLayout={event => { position.value = event.nativeEvent.layout.y; }} style={[styles.step, style]}>
    <View style={styles.rail}>{!last && <View style={styles.line}/>}<View style={[styles.node, { borderColor: tone }]}><View style={[styles.dot, { backgroundColor: tone }]}/></View></View>
    <View style={styles.stepBody}>
      <View style={styles.stepHead}><Eyebrow>{String(step.seq).padStart(2, '0')} / {stepLabels[step.kind]}</Eyebrow>{step.duration_ms !== undefined && <Copy style={styles.duration}>{(step.duration_ms / 1000).toFixed(2)}s</Copy>}</View>
      <Copy style={styles.stepSummary}>{step.summary}</Copy>
      {step.toolkit && <Copy style={styles.metadata}>{step.toolkit === 'googlecalendar' ? 'Google Calendar' : step.toolkit === 'gmail' ? 'Gmail' : step.toolkit}{step.risk ? ` · ${step.risk === 'R0' ? 'Read only' : step.risk === 'R1' ? 'Reversible action' : 'Permission required'}` : ''}</Copy>}
      {facts && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.detailToggle}><Copy style={styles.detailLabel}>{expanded ? 'Close details' : 'See the details'}</Copy><Feather name={expanded ? 'minus' : 'plus'} size={15} color={c.muted}/></Pressable>}
      {expanded && <View style={styles.facts}>
        {step.args_redacted !== undefined && <View><Eyebrow>Action facts</Eyebrow><Copy selectable style={styles.code}>{JSON.stringify(step.args_redacted, null, 2)}</Copy></View>}
        {step.result_redacted !== undefined && <View><Eyebrow>Result</Eyebrow><Copy selectable style={styles.code}>{JSON.stringify(step.result_redacted, null, 2)}</Copy></View>}
      </View>}
    </View>
  </Animated.View>;
}

export default function TaskDetail() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const state = useOtto();
  const task = state.tasks.find(task => task.id === id);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => { scrollY.value = event.contentOffset.y; });
  const steps = state.steps.filter(step => step.task_id === id).sort((a, b) => a.seq - b.seq);
  const turns = state.turns.filter(turn => turn.task_ids.includes(id)).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const approval = state.approvals.find(approval => approval.task_id === id && approval.status === 'pending');
  const connection = state.connections.find(connection => connection.task_id === id && connection.status === 'pending');
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
  return <SafeAreaView edges={['top', 'bottom']} style={s.page}>
    <View style={styles.nav}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={styles.back}><Feather name="arrow-left" size={23} color={c.ink}/></Pressable><Eyebrow>The task, unfolding</Eyebrow><Copy style={styles.demo}>DEMO</Copy></View>
    <NetworkBanner/>
    {!task ? <View style={[s.content, { paddingTop: 48 }]}><Display>This page has moved on.</Display><Copy style={{ marginVertical: 24 }}>The demo may have been reset. Your current tasks are on Home.</Copy><Button label="Back to Home" onPress={() => router.replace('/(tabs)/home')}/></View> : <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Reveal style={styles.header}><Eyebrow>{task.source === 'voice' ? 'From your wearable' : task.source === 'action_item' ? 'From a thought you shared' : 'From your conversation'}</Eyebrow><Display style={styles.title}>{task.goal}</Display><View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: task.status === 'succeeded' ? c.pine : ['awaiting_approval', 'needs_input', 'failed'].includes(task.status) ? c.signal : c.ink }]}/><Copy style={styles.status}>{labels[task.status]}</Copy></View><Copy style={styles.date}>{new Date(task.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Copy></Reveal>
      {task.status === 'needs_input' && <Reveal style={styles.question}><Eyebrow light>A name, two possibilities</Eyebrow><Display style={styles.questionTitle}>Which Sam?</Display><Copy style={styles.questionCopy}>I found two people named Sam. A little clarity before we make plans.</Copy><Button light label="Sam Chen · your manager" onPress={async () => { await Haptics.selectionAsync(); await otto.answerQuestion(id, 'Sam Chen'); }}/><View style={{ height: 10 }}/><Button light quiet label="Sam Patel · your designer" onPress={async () => { await Haptics.selectionAsync(); await otto.answerQuestion(id, 'Sam Patel'); }}/></Reveal>}
      {approval && <Reveal style={styles.attention}><Eyebrow>Waiting for your permission</Eyebrow><Display style={styles.attentionTitle}>{approval.summary}</Display><Button label="Review the action" icon="arrow-up-right" onPress={() => router.push(`/approval/${approval.id}`)}/></Reveal>}
      {connection && <Reveal style={styles.attention}><Eyebrow>A missing connection</Eyebrow><Display style={styles.attentionTitle}>A way forward.</Display><Copy style={{ marginBottom: 20 }}>Connect {state.extensions.find(extension => extension.id === connection.toolkit)?.name ?? connection.toolkit} to let Otto continue this demo task.</Copy><Button label="Connect & continue" icon="arrow-up-right" onPress={() => router.push(`/connect/${connection.toolkit}`)}/></Reveal>}
      <Section title="From word to done." aside={`${steps.length} steps`}/>
      {steps.map((step, index) => <TimelineStep key={step.id} step={step} last={index === steps.length - 1} scrollY={scrollY}/>)}
      {!!task.error && <View accessibilityRole="alert" style={styles.error}><Feather name="alert-circle" size={20} color={c.signal}/><Copy style={{ flex: 1 }}>{task.error}</Copy></View>}
      {(task.detail_md || (['succeeded', 'cancelled', 'failed'].includes(task.status) && task.spoken_summary)) && <View style={styles.outcome}><Eyebrow>The outcome</Eyebrow><Copy selectable style={{ marginTop: 12 }}>{task.detail_md ?? task.spoken_summary}</Copy></View>}
      <Section title="Your exact words."/>
      {turns.length ? turns.map(turn => <View key={turn.id} style={styles.transcript}><Eyebrow>You / {new Date(turn.started_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Eyebrow><Copy selectable style={styles.quote}>“{turn.user_text}”</Copy><Eyebrow>Otto</Eyebrow><Copy selectable style={styles.reply}>{turn.assistant_text}</Copy></View>) : <Copy style={styles.reply}>{task.source === 'chat' ? 'This request came from your Chat conversation.' : 'This demo task has no linked voice recording.'}</Copy>}
      <Copy style={styles.footer}>A complete record. Every action here is simulated locally.</Copy>
    </Animated.ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  nav: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: c.line }, back: { width: 44, height: 44, justifyContent: 'center' }, demo: { fontSize: 10, color: c.muted, letterSpacing: 1 },
  header: { paddingTop: 34, paddingBottom: 30 }, title: { fontSize: 43, marginTop: 20, marginBottom: 26 }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, statusDot: { width: 8, height: 8, borderRadius: 4 }, status: { fontFamily: fonts.medium, fontSize: 14 }, date: { marginTop: 8, color: c.muted, fontSize: 12 },
  question: { padding: 24, backgroundColor: c.signal, borderRadius: 6, marginBottom: 12 }, questionTitle: { color: c.bone, fontSize: 42, marginTop: 16 }, questionCopy: { color: c.bone, marginTop: 12, marginBottom: 24 }, attention: { padding: 22, backgroundColor: c.pale, borderRadius: 6 }, attentionTitle: { fontSize: 29, marginVertical: 18 },
  step: { flexDirection: 'row', gap: 17 }, rail: { width: 20, alignItems: 'center' }, line: { width: 1, backgroundColor: c.line, position: 'absolute', top: 19, bottom: 0 }, node: { width: 20, height: 20, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bone, marginTop: 2 }, dot: { width: 6, height: 6, borderRadius: 3 }, stepBody: { flex: 1, paddingBottom: 32 }, stepHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 5 }, duration: { fontSize: 11, color: c.muted }, stepSummary: { marginTop: 10, fontSize: 16, lineHeight: 25 }, metadata: { marginTop: 8, color: c.muted, fontSize: 12 }, detailToggle: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 12 }, detailLabel: { fontSize: 12, color: c.muted }, facts: { padding: 14, backgroundColor: c.pale, gap: 16, borderRadius: 4 }, code: { fontSize: 12, lineHeight: 20, marginTop: 8 },
  error: { flexDirection: 'row', padding: 18, gap: 12, borderWidth: 1, borderColor: c.signal, marginTop: 12 }, outcome: { paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }, transcript: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: c.line }, quote: { fontSize: 21, lineHeight: 31, marginVertical: 14 }, reply: { color: c.muted, marginTop: 10 }, footer: { fontSize: 11, color: c.muted, marginTop: 32, lineHeight: 18 },
});

