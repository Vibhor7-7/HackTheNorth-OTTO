import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button, Copy, Display, Eyebrow, Masthead, Reveal, s, useOtto } from '../../src/ui';
import { colors as c, fonts } from '../../src/theme';
import { otto } from '../../src/data/mock';

export default function ContextScreen() {
  const state = useOtto(); const router = useRouter(); const insets = useSafeAreaInsets();
  const { turn: selectedTurn } = useLocalSearchParams<{ turn?: string }>();
  const [error, setError] = useState(''); const [tab, setTab] = useState(0); const [search, setSearch] = useState(''); const [note, setNote] = useState('');
  const scroll = useRef<ScrollView>(null); const positions = useRef<Record<string, number>>({}); const transcriptOffset = useRef(0);
  useEffect(() => { if (selectedTurn) { setTab(0); setSearch(''); const timer = setTimeout(() => scroll.current?.scrollTo({ y: positions.current[selectedTurn] ?? 0, animated: true }), 350); return () => clearTimeout(timer); } }, [selectedTurn]);
  const turns = [...state.turns].sort((a,b) => b.started_at.localeCompare(a.started_at)).filter(t => `${t.user_text} ${t.assistant_text}`.toLowerCase().includes(search.toLowerCase()));
  const notes = state.memories.filter(m => m.source === 'user');
  let previousDay = '';
  return <View style={[s.page, { paddingTop: insets.top }]}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Masthead title={'A little more\nunderstanding.'} subtitle="What you said. What matters to you. The context Otto carries into every task." />
    {Platform.OS === 'ios' ? <SegmentedControl values={['Transcript', 'Add context']} selectedIndex={tab} onChange={e => setTab(e.nativeEvent.selectedSegmentIndex)} tintColor={c.ink} activeFontStyle={{color:c.bone}} style={{height:44}} /> : <View style={{flexDirection:'row',borderBottomWidth:1,borderColor:c.line}}>{['Transcript','Add context'].map((label,i) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:tab===i}} onPress={() => setTab(i)} style={{flex:1,paddingVertical:16,borderBottomWidth:3,borderColor:tab===i?c.signal:'transparent'}}><Copy style={{textAlign:'center',fontFamily:fonts.medium,color:tab===i?c.ink:c.muted}}>{label}</Copy></Pressable>)}</View>}
    {tab === 0 ? <View onLayout={e => { transcriptOffset.current = e.nativeEvent.layout.y; }}>
      <View style={{marginTop:24,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:c.line,paddingBottom:12}}><Feather name="search" size={18} color={c.muted}/><TextInput accessibilityLabel="Search transcript" placeholder="Find something you said" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{flex:1,fontFamily:fonts.body,fontSize:16,color:c.ink,minHeight:36}} />{search !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} hitSlop={12}><Feather name="x" size={18} color={c.ink}/></Pressable>}</View>
      <Copy style={{color:c.muted,fontSize:12,marginTop:12}}>Word for word. Only recorded when you press the button.</Copy>
      {turns.map((turn,index) => { const day = new Date(turn.started_at).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}); const showDay = day !== previousDay; previousDay = day; return <View key={turn.id} onLayout={e => {positions.current[turn.id] = e.nativeEvent.layout.y + transcriptOffset.current;}}>
        {showDay && <View style={{marginTop:32,marginBottom:8}}><Eyebrow>{day}</Eyebrow></View>}
        <Reveal delay={Math.min(index,3)*40}><View style={[s.row,selectedTurn===turn.id && {backgroundColor:c.pale,paddingHorizontal:16,borderRadius:6}]}>
          <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:14}}><Eyebrow>You said</Eyebrow><Copy style={{fontSize:12,color:c.muted}}>{new Date(turn.started_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</Copy></View>
          <Display style={{fontSize:25,lineHeight:32,letterSpacing:-.5}}>{turn.user_text}</Display>
          <View style={{marginTop:22,flexDirection:'row',gap:12}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:c.signal,marginTop:8}}/><View style={{flex:1}}><Eyebrow>Otto replied</Eyebrow><Copy style={{marginTop:7,color:c.muted}}>{turn.assistant_text}</Copy></View></View>
          {turn.task_ids.map(id => <Pressable accessibilityRole="button" key={id} onPress={() => router.push({pathname:'/task/[id]',params:{id}})} style={{flexDirection:'row',alignItems:'center',gap:10,marginTop:18,minHeight:44}}><Feather name="arrow-up-right" size={19} color={c.signal}/><Copy style={{flex:1,fontFamily:fonts.medium,fontSize:13}}>{state.tasks.find(t=>t.id===id)?.goal ?? 'Open related task'}</Copy></Pressable>)}
        </View></Reveal></View>;})}
      {!turns.length && <View style={{paddingVertical:56}}><Display style={{fontSize:30}}>{search ? 'No matching words.' : 'Your record starts here.'}</Display><Copy style={{color:c.muted,marginTop:12}}>{search ? 'Try another word from the conversation.' : 'Spoken requests and Otto’s replies will appear here.'}</Copy></View>}
    </View> : <Reveal><View style={{paddingTop:28}}><Display style={{fontSize:32}}>The things worth knowing.</Display><Copy style={{marginTop:12,marginBottom:20,color:c.muted}}>Your preferences, your people, the details you’d rather say once. Otto uses these notes in Chat.</Copy><TextInput accessibilityLabel="New context note" multiline placeholder="I prefer coffee meetings after 10 am…" placeholderTextColor={c.muted} value={note} onChangeText={setNote} style={[s.input,{minHeight:130,textAlignVertical:'top',marginBottom:12}]} /><Button label="Give Otto context" disabled={!note.trim()} icon="plus" onPress={async () => {await otto.addMemory(note.trim());setNote('');}}/>
      <View style={{marginTop:36,marginBottom:6}}><Eyebrow>{notes.length} personal {notes.length===1?'note':'notes'}</Eyebrow></View>{notes.map(memory => <View key={memory.id} style={[s.row,{flexDirection:'row',gap:20}]}><View style={{flex:1}}><Copy style={{fontSize:18,lineHeight:27}}>{memory.text}</Copy><Copy style={{fontSize:12,color:c.muted,marginTop:8}}>Added {new Date(memory.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Copy></View><Pressable accessibilityRole="button" accessibilityLabel={`Delete note: ${memory.text}`} onPress={async () => {setError('');try {await otto.deleteMemory(memory.id);} catch(e) {setError(e instanceof Error ? e.message : 'Could not delete the note.');}}} style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}><Feather name="trash-2" size={18} color={c.muted}/></Pressable></View>)}{!!error && <Copy accessibilityRole="alert" style={{color:c.signal,marginTop:16}}>{error}</Copy>}{!notes.length && <Copy style={{marginTop:18,color:c.muted}}>A blank slate. Add one useful detail to start.</Copy>}
    </View></Reveal>}
  </ScrollView></View>;
}
