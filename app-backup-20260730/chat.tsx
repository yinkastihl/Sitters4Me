// app/chat.tsx
// In-app chat between parent and sitter, scoped to a job
// global.chatJob must be set before navigating here:
//   { job_id, viewer_type: 'parent'|'sitter', viewer_id, other_name, other_initial }
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Alert, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

const parseServerDt = (s: string): Date | null => {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
};
const fmtTime = (s: string) => {
  const d = parseServerDt(s);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
};
const fmtDateHeader = (s: string) => {
  const d = parseServerDt(s);
  if (!d) return '';
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

interface Message {
  id: number;
  sender_type: 'parent' | 'sitter';
  sender_id: number;
  message: string;
  created_at: string;
  read_at: string | null;
}

export default function Chat() {
  const router = useRouter();
  const ctx = (global as any).chatJob || {};
  const {
    job_id       = 0,
    viewer_type  = 'parent',   // 'parent' | 'sitter'
    viewer_id    = 0,
    other_name   = 'Contact',
    other_initial= '?',
  } = ctx;

  const [messages,   setMessages]   = useState<Message[]>([]);
  const [text,       setText]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [loading,    setLoading]    = useState(true);

  const lastIdRef   = useRef(0);
  const pollRef     = useRef<any>(null);
  const listRef     = useRef<FlatList>(null);
  const inputRef    = useRef<TextInput>(null);
  const dingPlayer = useAudioPlayer(require('../assets/sounds/chat_ding.mp3'), { keepAudioSessionActive: true });

  const playDing = async () => {
    try {
      Vibration.vibrate(200);
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      dingPlayer.volume = 1.0;
      await dingPlayer.seekTo(0);
      dingPlayer.play();
    } catch (e) {
      console.warn('Chat ding error:', e);
    }
  };

  // ── Load initial messages ──────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    if (!job_id) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=get_all_messages`, {
        job_id, viewer_type, viewer_id,
      });
      if (res.data?.success) {
        const msgs: Message[] = res.data.data || [];
        setMessages(msgs);
        if (msgs.length > 0) lastIdRef.current = msgs[msgs.length - 1].id;
      }
    } catch {}
    finally { setLoading(false); }
  }, [job_id]);

  // ── Poll for new messages every 4 seconds ─────────────────────────────────
  const pollMessages = useCallback(async () => {
    if (!job_id) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=get_messages`, {
        job_id,
        last_id: lastIdRef.current,
        viewer_type,
        viewer_id,
      });
      if (res.data?.success) {
        const newMsgs: Message[] = res.data.data || [];
        if (newMsgs.length > 0) {
          setMessages(prev => [...prev, ...newMsgs]);
          lastIdRef.current = newMsgs[newMsgs.length - 1].id;
          // Ding + vibrate only for messages from the OTHER person
          const hasIncoming = newMsgs.some(m => m.sender_type !== viewer_type);
          if (hasIncoming) playDing();
          // Auto-scroll to bottom
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    } catch {}
  }, [job_id, viewer_type, viewer_id]);

  useEffect(() => {
    loadInitial();
    pollRef.current = setInterval(pollMessages, 4000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Scroll to bottom when messages first load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [loading]);

  // ── Send message ───────────────────────────────────────────────────────────
  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');

    // Optimistic UI — add message immediately
    const optimistic: Message = {
      id: Date.now(),          // temp id
      sender_type: viewer_type as 'parent' | 'sitter',
      sender_id: viewer_id,
      message: trimmed,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const res = await axios.post(`${JOBS_API}?action=send_message`, {
        job_id,
        sender_type: viewer_type,
        sender_id:   viewer_id,
        message:     trimmed,
      });
      if (res.data?.success) {
        // Replace optimistic with real message id
        const realId = res.data.data?.id;
        if (realId) {
          setMessages(prev =>
            prev.map(m => m.id === optimistic.id ? { ...m, id: realId } : m)
          );
          lastIdRef.current = Math.max(lastIdRef.current, realId);
        }
      } else {
        // Remove optimistic on failure
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        Alert.alert('Error', 'Message failed to send. Please try again.');
        setText(trimmed);
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      Alert.alert('Error', 'Could not send message. Check your connection.');
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isMine = (msg: Message) => msg.sender_type === viewer_type;

  const renderItem = ({ item: msg, index }: { item: Message; index: number }) => {
    const mine        = isMine(msg);
    const prevMsg     = messages[index - 1];
    const showDate    = !prevMsg || fmtDateHeader(msg.created_at) !== fmtDateHeader(prevMsg.created_at);
    const isLastMine  = mine && (index === messages.length - 1 || !isMine(messages[index + 1]));

    return (
      <>
        {showDate && (
          <View style={s.dateRow}>
            <View style={s.dateLine} />
            <Text style={s.dateLabel}>{fmtDateHeader(msg.created_at)}</Text>
            <View style={s.dateLine} />
          </View>
        )}
        <View style={[s.msgRow, mine ? s.msgRowMine : s.msgRowOther]}>
          {/* Avatar for other person */}
          {!mine && (
            <View style={s.avatar}>
              <Text style={s.avatarText}>{other_initial}</Text>
            </View>
          )}

          <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
            <Text style={[s.bubbleText, mine ? s.bubbleTextMine : s.bubbleTextOther]}>
              {msg.message}
            </Text>
            <Text style={[s.bubbleTime, mine ? s.bubbleTimeMine : s.bubbleTimeOther]}>
              {fmtTime(msg.created_at)}
              {mine && isLastMine && (
                <Text> · {msg.read_at ? '✓✓' : '✓'}</Text>
              )}
            </Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>

          {/* Avatar */}
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarText}>{other_initial}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.headerName}>{other_name}</Text>
            <Text style={s.headerSub}>
              {viewer_type === 'parent' ? 'Your Sitter' : 'Parent'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color="#C93488" size="large" />
            <Text style={s.loadingText}>Loading conversation…</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>💬</Text>
            <Text style={s.emptyTitle}>No messages yet</Text>
            <Text style={s.emptySub}>
              Send a message to {other_name} to get started.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => String(m.id)}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder={`Message ${other_name}…`}
            placeholderTextColor="#9B9FAE"
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={s.sendBtnText}>➤</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F5F4F0' },

  // Header
  header:          { paddingBottom: 14 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  backBtn:         { width: 36, alignItems: 'center' },
  backBtnText:     { fontSize: 28, color: '#FFFFFF', fontWeight: '300', lineHeight: 32 },
  headerAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  headerAvatarText:{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  headerName:      { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  headerSub:       { fontSize: 12, color: 'rgba(255,255,255,0.75)' },

  // States
  loadingBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:     { fontSize: 14, color: '#5A5F72' },
  emptyBox:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyIcon:       { fontSize: 52 },
  emptyTitle:      { fontSize: 18, fontWeight: '800', color: '#0F1117' },
  emptySub:        { fontSize: 14, color: '#9B9FAE', textAlign: 'center', lineHeight: 20 },

  // Messages
  list:            { padding: 16, paddingBottom: 8, gap: 4 },

  dateRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  dateLine:        { flex: 1, height: 1, backgroundColor: '#E5E2DA' },
  dateLabel:       { fontSize: 11, fontWeight: '600', color: '#9B9FAE' },

  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
  msgRowMine:      { justifyContent: 'flex-end' },
  msgRowOther:     { justifyContent: 'flex-start' },

  avatar:          { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E8F4FB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:      { fontSize: 12, fontWeight: '700', color: '#02A4E2' },

  bubble:          { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine:      { backgroundColor: '#C93488', borderBottomRightRadius: 4 },
  bubbleOther:     { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },

  bubbleText:      { fontSize: 15, lineHeight: 21 },
  bubbleTextMine:  { color: '#FFFFFF' },
  bubbleTextOther: { color: '#0F1117' },

  bubbleTime:      { fontSize: 10, marginTop: 4 },
  bubbleTimeMine:  { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  bubbleTimeOther: { color: '#9B9FAE' },

  // Input bar
  inputBar:        { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F0EEE9', gap: 10 },
  input:           { flex: 1, borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#0F1117', maxHeight: 120, backgroundColor: '#F9F8F6' },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C93488', alignItems: 'center', justifyContent: 'center', shadowColor: '#C93488', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  sendBtnDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0 },
  sendBtnText:     { fontSize: 18, color: '#FFFFFF', marginLeft: 2 },
});
