// app/parent-history.tsx — Parent's job history (all past bookings)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

// ── Helpers ─────────────────────────────────────────────────────
const fmtMoney = (n: number) => `$${(n || 0).toFixed(2)}`;
// Parse MySQL datetime string as UTC so device local time is shown correctly
const parseServerDt = (s: string): Date | null => {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  // Append Z only if no timezone info present — treats server time as UTC
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
};
const fmtDate  = (s: string) => {
  const d = parseServerDt(s);
  return d ? d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }) : '—';
};
const fmtTime = (s: string) => {
  const d = parseServerDt(s);
  return d ? d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) : '—';
};
const fmtDuration = (secs: number) => {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
const statusColor = (status: string) => {
  switch (status) {
    case 'Complete':       return { bg: '#D4EDE9', text: '#1A7F6E' };
    case 'In progress':
    case 'Sitter arrived':
    case 'Sitter hired':   return { bg: '#E8F6FD', text: '#02A4E2' };
    case 'Scheduled':      return { bg: '#FFF8E7', text: '#F5A623' };
    default:               return { bg: '#F5F4F0', text: '#9B9FAE' };
  }
};
const statusLabel = (status: string) => {
  switch (status) {
    case 'Complete':       return '✓ Completed';
    case 'In progress':    return '▶ In Progress';
    case 'Sitter arrived': return '📍 Sitter Arrived';
    case 'Sitter hired':   return '🚗 Sitter On Way';
    case 'Scheduled':      return '📅 Scheduled';
    default:               return status;
  }
};

export default function ParentHistory() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [jobs,       setJobs]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);

  const parentId = user.id || (user as any).u_id || 0;

  const cancelScheduled = (jobId: number) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this scheduled appointment? No fee will be charged.',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Appointment',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await axios.post(`${JOBS_API}?action=cancel_scheduled`, {
                job_id: jobId, parent_id: parentId,
              });
              if (res.data?.success) {
                setJobs(prev => prev.filter(j => j.id !== jobId));
                Alert.alert('Cancelled', 'Your appointment has been cancelled.');
              } else {
                Alert.alert('Error', res.data?.error || 'Could not cancel. Please try again.');
              }
            } catch {
              Alert.alert('Error', 'Could not connect. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.post(`${JOBS_API}?action=parent_job_history`, {
        parent_id: parentId,
      });
      if (res.data?.success) {
        setJobs(res.data.data || []);
      } else {
        setLoadError(res.data?.error || 'Unknown server error');
      }
    } catch (e: any) {
      setLoadError(e?.response?.data?.error || e?.message || 'Network error');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [parentId]);

  useEffect(() => { loadHistory(); }, []);

  // Aggregate stats
  const completed   = jobs.filter(j => j.status === 'Complete');
  const totalSpent  = completed.reduce((s, j) => s + (j.gross || 0), 0);
  const totalHours  = completed.reduce((s, j) => s + (j.hours || 0), 0);

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>My Booking History</Text>
            <Text style={s.headerSub}>All your babysitter requests</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Stats strip */}
        {!loading && jobs.length > 0 && (
          <View style={s.statsStrip}>
            <View style={s.stat}>
              <Text style={s.statN}>{jobs.length}</Text>
              <Text style={s.statL}>Total Bookings</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statN}>{completed.length}</Text>
              <Text style={s.statL}>Completed</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statN}>{fmtMoney(totalSpent)}</Text>
              <Text style={s.statL}>Total Spent</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadHistory(true)} tintColor="#C93488" />
        }
      >
        {loading ? (
          <View style={s.loadBox}>
            <ActivityIndicator size="large" color="#C93488" />
            <Text style={s.loadText}>Loading your history…</Text>
          </View>
        ) : loadError ? (
          <View style={s.errorBox}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={s.errorTitle}>Could Not Load History</Text>
            <Text style={s.errorMsg}>{loadError}</Text>
            <TouchableOpacity style={s.goBtn} onPress={() => loadHistory(true)} activeOpacity={0.85}>
              <Text style={s.goBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : jobs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No Bookings Yet</Text>
            <Text style={s.emptySub}>
              Your completed and scheduled babysitter sessions will appear here with full details.
            </Text>
            <TouchableOpacity style={s.goBtn} onPress={() => router.replace('/parent-home')} activeOpacity={0.85}>
              <Text style={s.goBtnText}>← Find a Sitter</Text>
            </TouchableOpacity>
          </View>
        ) : (
          jobs.map((job, i) => {
            const sc      = statusColor(job.status);
            const sl      = statusLabel(job.status);
            const ages    = Array.isArray(job.children_ages) ? job.children_ages : [];
            const kidCount = job.kids || ages.length || 1;
            const agesStr  = ages.length > 0
              ? ages.map((a: number) => a === 0 ? 'Infant' : `${a} yr${a !== 1 ? 's' : ''}`).join(', ')
              : null;
            const childrenLabel = agesStr
              ? `${kidCount} child${kidCount !== 1 ? 'ren' : ''} · ${agesStr}`
              : `${kidCount} child${kidCount !== 1 ? 'ren' : ''}`;
            const hasSitter = !!job.sitter_fname;
            const sitterName = job.sitter_name || `${job.sitter_fname || ''} ${job.sitter_lname || ''}`.trim() || 'Sitter';
            const isScheduled = job.status === 'Scheduled';
            return (
              <View key={job.id || i} style={s.card}>
                {/* Card header — date + status */}
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardDate}>
                      {isScheduled && job.scheduled_time
                        ? `📅 ${fmtDate(job.scheduled_time)} at ${fmtTime(job.scheduled_time)}`
                        : fmtDate(job.start_time || job.post_time)}
                    </Text>
                    {!isScheduled && job.start_time && (
                      <Text style={s.cardTime}>
                        ⏱ {fmtTime(job.start_time)}
                        {job.stop_time ? ` → ${fmtTime(job.stop_time)}` : ' (ongoing)'}
                      </Text>
                    )}
                  </View>
                  <View style={[s.badge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.badgeText, { color: sc.text }]}>{sl}</Text>
                  </View>
                </View>

                {/* Sitter info */}
                {hasSitter ? (
                  <View style={s.sitterRow}>
                    <View style={s.sitterAv}>
                      <Text style={s.sitterAvText}>
                        {(sitterName[0] || '?').toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={s.sitterName}>{sitterName}</Text>
                      <Text style={s.sitterRate}>${job.sitter_rate || '—'}/hr base rate</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.noSitterRow}>
                    <Text style={s.noSitterText}>
                      {isScheduled ? '🔍 Sitter will be assigned at appointment time' : '⏳ Waiting for a sitter…'}
                    </Text>
                  </View>
                )}

                {/* Cancel button for pending scheduled appointments */}
                {isScheduled && (
                  <TouchableOpacity
                    style={s.cancelSchedBtn}
                    onPress={() => cancelScheduled(job.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.cancelSchedText}>✕  Cancel Appointment</Text>
                  </TouchableOpacity>
                )}

                {/* Details grid */}
                <View style={s.grid}>
                  <View style={s.gridCell}>
                    <Text style={s.gridVal}>{childrenLabel}</Text>
                    <Text style={s.gridLbl}>Children</Text>
                  </View>
                  <View style={s.gridCell}>
                    <Text style={s.gridVal}>
                      {job.elapsed_secs > 0 ? fmtDuration(job.elapsed_secs) : '—'}
                    </Text>
                    <Text style={s.gridLbl}>Duration</Text>
                  </View>
                  <View style={s.gridCell}>
                    <Text style={s.gridVal}>
                      {job.address || job.city ? [job.city, job.state].filter(Boolean).join(', ') || 'Home' : '—'}
                    </Text>
                    <Text style={s.gridLbl}>Location</Text>
                  </View>
                </View>

                {/* Cost breakdown — only for completed jobs */}
                {job.status === 'Complete' && (
                  <View style={s.costBox}>
                    <View style={s.costRow}>
                      <Text style={s.costLabel}>Total Charged</Text>
                      <Text style={s.costVal}>{fmtMoney(job.gross)}</Text>
                    </View>
                    {job.payment_status === 'succeeded' && (
                      <View style={s.costRow}>
                        <Text style={s.paidBadge}>✓ Payment Processed</Text>
                      </View>
                    )}
                    {(!job.payment_status || job.payment_status !== 'succeeded') && job.gross > 0 && (
                      <View style={s.costRow}>
                        <Text style={s.pendingBadge}>⏳ Payment Pending</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Book Again — completed jobs with a known sitter */}
                {job.status === 'Complete' && hasSitter && (
                  <TouchableOpacity
                    style={s.bookAgainBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      (global as any).bookAgainSitter      = { id: job.sitter_id, fname: job.sitter_fname, lname: job.sitter_lname };
                      (global as any)._bookAgainSitterId   = job.sitter_id || null;
                      router.replace('/parent-home');
                    }}
                  >
                    <LinearGradient
                      colors={['#C93488', '#9B5BAB']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.bookAgainGrad}
                    >
                      <Text style={s.bookAgainText}>🔁 Book {job.sitter_fname || 'Sitter'} Again</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F5F4F0' },
  header:        { paddingBottom: 16 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:      { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  headerTitle:   { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSub:     { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  statsStrip:    { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },
  stat:          { flex: 1, alignItems: 'center' },
  statN:         { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  statL:         { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statDiv:       { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 4 },

  scroll:        { flex: 1 },
  content:       { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 48, gap: 14 },

  loadBox:       { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadText:      { fontSize: 14, color: '#9B9FAE' },
  errorBox:      { backgroundColor: '#FFF3F0', borderRadius: 16, padding: 24, alignItems: 'center', gap: 10, marginTop: 16, borderWidth: 1.5, borderColor: 'rgba(191,59,46,0.2)' },
  errorIcon:     { fontSize: 40 },
  errorTitle:    { fontSize: 17, fontWeight: '800', color: '#BF3B2E' },
  errorMsg:      { fontSize: 12, color: '#BF3B2E', textAlign: 'center', lineHeight: 18 },
  emptyBox:      { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 32, alignItems: 'center', gap: 10, marginTop: 16 },
  emptyIcon:     { fontSize: 56 },
  emptyTitle:    { fontSize: 20, fontWeight: '900', color: '#0F1117' },
  emptySub:      { fontSize: 13, color: '#5A5F72', textAlign: 'center', lineHeight: 20 },
  goBtn:         { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#C93488' },
  goBtnText:     { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  card:          { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHeader:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.07)', gap: 10 },
  cardDate:      { fontSize: 15, fontWeight: '800', color: '#0F1117' },
  cardTime:      { fontSize: 12, color: '#5A5F72', marginTop: 3 },
  badge:         { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:     { fontSize: 11, fontWeight: '700' },

  sitterRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.06)' },
  sitterAv:      { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C93488', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sitterAvText:  { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  sitterName:    { fontSize: 15, fontWeight: '700', color: '#0F1117' },
  sitterRate:    { fontSize: 12, color: '#9B9FAE', marginTop: 2 },
  cancelSchedBtn:{ margin: 14, marginTop: 0, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#BF3B2E' },
  cancelSchedText:{ color: '#BF3B2E', fontSize: 14, fontWeight: '700' },
  noSitterRow:   { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.06)' },
  noSitterText:  { fontSize: 13, color: '#9B9FAE', fontStyle: 'italic' },

  grid:          { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
  gridCell:      { flex: 1, alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 10, padding: 10 },
  gridVal:       { fontSize: 12, fontWeight: '800', color: '#0F1117', textAlign: 'center' },
  gridLbl:       { fontSize: 10, color: '#9B9FAE', marginTop: 2, textAlign: 'center', fontWeight: '600' },

  costBox:       { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#F5F4F0', borderRadius: 10, padding: 12, gap: 6 },
  costRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  costLabel:     { fontSize: 13, fontWeight: '700', color: '#0F1117' },
  costVal:       { fontSize: 16, fontWeight: '900', color: '#1A7F6E' },
  paidBadge:     { fontSize: 12, fontWeight: '700', color: '#1A7F6E' },
  pendingBadge:  { fontSize: 12, fontWeight: '700', color: '#F5A623' },

  bookAgainBtn:  { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, overflow: 'hidden' },
  bookAgainGrad: { padding: 14, alignItems: 'center' },
  bookAgainText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
