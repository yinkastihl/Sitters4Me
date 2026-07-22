// app/active-job.tsx — shown to SITTER after accepting a job
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Linking, Image, ActivityIndicator, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { saveActiveSession, clearActiveSession } from './index';

const JOBS_API   = 'https://sitters4me.com/api/jobs.php';
const STRIPE_API = 'https://sitters4me.com/api/stripe.php';
const LOC_INTERVAL_MS = 10000; // send GPS every 10 seconds while travelling

export default function ActiveJob() {
  const router      = useRouter();
  const timerRef       = useRef<any>(null);
  const locRef         = useRef<any>(null);   // Location.watchPositionAsync subscription
  const locSendRef     = useRef<any>(null);   // setInterval for sending location
  const statusPollRef  = useRef<any>(null);   // polls job_status to detect cancellation
  const chatPollRef    = useRef<any>(null);   // polls unread message count
  const jobIdRef       = useRef<number>(0);   // so the poll closure always has the current id
  const cancelledRef   = useRef(false);       // prevent double-alert

  const [job, setJob]               = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [status, setStatus]         = useState<'travelling'|'arrived'|'started'|'done'>('travelling');
  const [elapsed, setElapsed]       = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const user = global.currentUser || {};

  useEffect(() => {
    loadActiveJob();
    startLocationTracking();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(locSendRef.current);
      clearInterval(statusPollRef.current);
      clearInterval(chatPollRef.current);
      locRef.current?.remove?.();
    };
  }, []);

  // Poll unread message count every 5 s
  useEffect(() => {
    const resolvedJobId = job?.id || job?.job_id || jobIdRef.current;
    if (!resolvedJobId) return;
    const poll = async () => {
      try {
        const res = await axios.post(`${JOBS_API}?action=get_unread_count`, {
          job_id:      resolvedJobId,
          viewer_type: 'sitter',
        });
        if (res.data?.success) {
          const newCount = res.data.data?.unread || 0;
          setUnreadCount(prev => {
            if (newCount > prev) Vibration.vibrate(200);
            return newCount;
          });
        }
      } catch {}
    };
    poll();
    chatPollRef.current = setInterval(poll, 5000);
    return () => clearInterval(chatPollRef.current);
  }, [job]);

  // ── Send live GPS to server while sitter is travelling ────────
  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Watch position continuously
      locRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          // Store latest coords in a ref so the interval can read them
          (locRef as any).lastCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      );

      // Send to server every 10 seconds (only while travelling or arrived)
      locSendRef.current = setInterval(async () => {
        const coords = (locRef as any).lastCoords;
        if (!coords || !user.id) return;
        try {
          await axios.post(`${JOBS_API}?action=update_sitter_location`, {
            sitter_id: user.id,
            lat: coords.lat,
            lng: coords.lng,
          });
        } catch { /* non-critical */ }
      }, LOC_INTERVAL_MS);
    } catch { /* location permission denied */ }
  };

  // Stop sending location once the job has started (sitter is at home)
  useEffect(() => {
    if (status === 'started' || status === 'done') {
      clearInterval(locSendRef.current);
      locRef.current?.remove?.();
    }
  }, [status]);

  const loadActiveJob = async () => {
    try {
      // Get the job that this sitter just accepted
      const res = await axios.post(`${JOBS_API}?action=get_sitter_active_job`, {
        sitter_id: user.id,
      });
      if (res.data?.success && res.data?.data) {
        const jobData = res.data.data;
        setJob(jobData);
        const jid = jobData.id || jobData.job_id;
        if (jid) {
          jobIdRef.current = Number(jid);
          startStatusPoll(Number(jid));
          saveActiveSession('sitter', Number(jid), user);
        }
      } else {
        // Use global activeJob as fallback
        if (global.activeJob) {
          setJob(global.activeJob);
          const jid = global.activeJob.job_id || global.activeJob.id;
          if (jid) {
            jobIdRef.current = Number(jid);
            startStatusPoll(Number(jid));
            saveActiveSession('sitter', Number(jid), user);
          }
        }
      }
    } catch {
      if (global.activeJob) {
        setJob(global.activeJob);
        const jid = global.activeJob.job_id || global.activeJob.id;
        if (jid) {
          jobIdRef.current = Number(jid);
          startStatusPoll(Number(jid));
          saveActiveSession('sitter', Number(jid), user);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Poll job_status every 6s — detect parent cancellation ────
  const startStatusPoll = (jobId: number) => {
    if (statusPollRef.current) return; // already polling
    statusPollRef.current = setInterval(async () => {
      if (!jobId || cancelledRef.current) return;
      try {
        const res = await axios.post(`${JOBS_API}?action=job_status`, { job_id: jobId });
        const jobStatus = (res.data?.data?.status || '').toLowerCase();
        if (jobStatus === 'cancelled') {
          if (cancelledRef.current) return; // prevent double-alert
          cancelledRef.current = true;
          clearInterval(statusPollRef.current);
          clearInterval(timerRef.current);
          clearInterval(locSendRef.current);
          locRef.current?.remove?.();
          Alert.alert(
            '❌ Booking Cancelled',
            'The parent has cancelled this booking. You will not be charged and no payment is due.',
            [{
              text: 'OK',
              onPress: () => {
                global.activeJob = null;
                clearActiveSession();
                router.replace('/sitter-home');
              },
            }]
          );
        }
      } catch { /* network hiccup — keep polling */ }
    }, 6000);
  };

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  };

  const stopTimer = () => clearInterval(timerRef.current);

  const fmt = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // Effective rate = sitter base rate + (additional child rate × extra kids beyond first)
  // All values coerced to Number — PHP returns numeric fields as strings in JSON
  const kids     = Number(job?.kids) || 1;
  const baseRate = Number(job?.sitter_minrate ?? job?.rate ?? (user as any).minrate) || 15;
  const addRate  = Number(job?.additional_child_rate) || 0;
  const rate     = Number(job?.effective_rate) || (baseRate + addRate * Math.max(0, kids - 1));
  const earnings = (elapsed / 3600 * rate).toFixed(2);

  const handleArrived = async () => {
    setStatus('arrived');
    // Notify parent via server
    try {
      await axios.post(`${JOBS_API}?action=sitter_arrived`, {
        job_id:    job?.id || job?.job_id,
        sitter_id: user.id || (user as any).u_id,
      });
    } catch (e) { /* non-critical */ }
    Alert.alert('Arrived! 📍', 'The parent has been notified that you have arrived.');
  };

  const handleStartJob = async () => {
    setStatus('started');
    startTimer();
    // Tell server job has started — records start_time, notifies parent
    try {
      await axios.post(`${JOBS_API}?action=start_job`, {
        job_id:    job?.id || job?.job_id,
        sitter_id: user.id || (user as any).u_id,
      });
    } catch (e) { /* non-critical — timer still runs locally */ }
    Alert.alert('Job Started! ⏱️', 'Timer is running. The parent has been notified.');
  };

  const handleEndJob = () => {
    const hoursWorked = parseFloat((elapsed / 3600).toFixed(4));
    Alert.alert(
      'End Job?',
      `Time: ${fmt(elapsed)}\nEarnings: $${earnings}\n\nThis will charge the parent's card and complete the job.`,
      [
        { text: 'Continue Job', style: 'cancel' },
        {
          text: 'End & Charge Parent',
          onPress: () => processJobEnd(hoursWorked),
        },
      ]
    );
  };

  const processJobEnd = async (hoursWorked: number) => {
    stopTimer();
    clearInterval(statusPollRef.current); // no longer need cancellation check
    setStatus('done');
    clearActiveSession();

    const jobId    = job?.id || job?.job_id;
    const kids     = job?.kids || user?.kids || 1;

    // 1. Tell server job stopped (notifies parent, updates DB)
    // Server returns the authoritative hours (handles timer-not-started case)
    let billableHours = hoursWorked;
    try {
      const stopRes = await axios.post(`${JOBS_API}?action=stop_job`, {
        job_id:    jobId,
        sitter_id: user.id || (user as any).u_id,
        hours:     hoursWorked,
      });
      // Use server-computed hours (handles 0-elapsed case with minimum billing)
      if (stopRes.data?.data?.hours > 0) {
        billableHours = stopRes.data.data.hours;
      }
    } catch (e) { console.log('stop_job error:', e); }

    // 2. Trigger Stripe charge on parent's saved card
    try {
      const res = await axios.post(`${STRIPE_API}?action=charge_parent`, {
        job_id:    jobId,
        sitter_id: user.id || (user as any).u_id,
        hours:     billableHours,  // use server-authoritative hours
        kids,
      });

      if (res.data?.success) {
        const d = res.data.data;
        Alert.alert(
          '🎉 Job Complete & Payment Sent!',
          `Duration:  ${fmt(elapsed)}\n` +
          `Earnings:  $${d.sitter_payout ?? earnings}\n` +
          `Charged:   $${d.amount_charged} to parent\n\n` +
          `Your payout will be deposited within 2 business days.`,
          [{ text: 'Great, thanks!' }]
        );
      } else {
        // Payment failed — let sitter know, parent will be contacted
        Alert.alert(
          'Job Complete — Payment Pending',
          `Duration: ${fmt(elapsed)}\nEstimated Earnings: $${earnings}\n\n` +
          `We could not charge the parent automatically: ${res.data?.error || 'Unknown error'}.\n\n` +
          `Our team will follow up with the parent directly.`,
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.log('charge error:', e);
      Alert.alert(
        'Job Complete',
        `Duration: ${fmt(elapsed)}\nEarnings: $${earnings}\n\nPayment will be processed shortly.`,
        [{ text: 'OK' }]
      );
    }
  };

  const callParent = () => {
    const phone = job?.parent_phone || job?.parent?.phone;
    if (!phone) {
      Alert.alert('No Phone Number', 'Parent phone number is not available.');
      return;
    }
    Alert.alert(
      'Call Parent?',
      `Call ${job?.parent_name || 'the parent'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => Linking.openURL(`tel:${phone}`) },
      ]
    );
  };

  const textParent = () => {
    const phone = job?.parent_phone || job?.parent?.phone;
    if (!phone) { Alert.alert('No Phone', 'Parent phone number not available.'); return; }
    Linking.openURL(`sms:${phone}`);
  };

  const getDirections = () => {
    const addr = job?.address || job?.city;
    if (!addr) { Alert.alert('No Address', 'Job address not available.'); return; }
    const url = `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
    Linking.openURL(url);
  };

  const pInitials = job?.parent_name
    ? job.parent_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : 'P';

  const statusColor = {
    travelling: '#F5A623',
    arrived:    '#02A4E2',
    started:    '#1A7F6E',
    done:       '#1A7F6E',
  }[status];

  const statusLabel = {
    travelling: '🚗 Travelling to parent',
    arrived:    '📍 Arrived at location',
    started:    '⏱️ Job in progress',
    done:       '✅ Job complete',
  }[status];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#02A4E2', '#0270C8', '#9B5BAB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/sitter-home')} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Active Job</Text>
            <Text style={s.headerSub}>{statusLabel}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {loading ? (
          <View style={s.loadBox}>
            <ActivityIndicator size="large" color="#02A4E2" />
            <Text style={s.loadText}>Loading job details...</Text>
          </View>
        ) : (
          <>
            {/* Timer card */}
            {status === 'started' || status === 'done' ? (
              <View style={[s.timerCard, status === 'done' && s.timerCardDone]}>
                <Text style={s.timerLabel}>
                  {status === 'done' ? 'Total Time' : 'Elapsed Time'}
                </Text>
                <Text style={s.timerDisplay}>{fmt(elapsed)}</Text>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>
                    {status === 'done' ? 'Total Earned' : 'Current Earnings'}
                  </Text>
                  <Text style={s.earningsValue}>${earnings}</Text>
                </View>
                <Text style={s.rateNote}>
                  ${rate.toFixed(2)}/hr × {(elapsed/3600).toFixed(2)} hrs
                  {kids > 1 && addRate > 0
                    ? `\n$${baseRate.toFixed(2)} base + $${addRate.toFixed(2)}×${kids-1} extra child${kids-1 !== 1 ? 'ren' : ''}`
                    : ''}
                </Text>
              </View>
            ) : null}

            {/* Status indicator */}
            <View style={[s.statusCard, { borderColor: statusColor }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>

            {/* Parent info card */}
            <View style={s.parentCard}>
              <Text style={s.cardTitle}>Parent Details</Text>
              <View style={s.parentTop}>
                <View style={s.parentAv}>
                  <LinearGradient colors={['#C93488', '#9B5BAB']} style={StyleSheet.absoluteFill} />
                  <Text style={s.parentAvText}>{pInitials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.parentName}>{job?.parent_name || 'Parent'}</Text>
                  <Text style={s.parentMeta}>
                    {job?.kids || user?.kids || 1} child{(job?.kids || 1) !== 1 ? 'ren' : ''}
                  </Text>
                  {job?.address ? (
                    <Text style={s.parentAddress} numberOfLines={2}>
                      📍 {job.address}{job.city ? `, ${job.city}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Contact buttons */}
              <View style={s.contactRow}>
                <TouchableOpacity style={s.callBtn} onPress={callParent} activeOpacity={0.85}>
                  <Text style={s.contactIcon}>📞</Text>
                  <Text style={s.callBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.textBtn} onPress={textParent} activeOpacity={0.85}>
                  <Text style={s.contactIcon}>💬</Text>
                  <Text style={s.textBtnText}>Text</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, position: 'relative' }}>
                  <TouchableOpacity
                    style={s.chatBtn}
                    onPress={() => {
                      const parentName = job?.parent_name || job?.pname || 'Parent';
                      (global as any).chatJob = {
                        job_id:        job?.id || jobIdRef.current,
                        viewer_type:   'sitter',
                        viewer_id:     user.id,
                        other_name:    parentName,
                        other_initial: (parentName[0] || 'P').toUpperCase(),
                      };
                      setUnreadCount(0);
                      router.push('/chat');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={s.contactIcon}>✉️</Text>
                    <Text style={s.chatBtnText}>Chat</Text>
                  </TouchableOpacity>
                  {unreadCount > 0 && (
                    <View style={s.chatBadge}>
                      <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Directions */}
              <TouchableOpacity style={s.directionsBtn} onPress={getDirections} activeOpacity={0.85}>
                <Text style={s.directionsBtnText}>🗺️ Get Directions</Text>
              </TouchableOpacity>
            </View>

            {/* Job details */}
            <View style={s.detailCard}>
              <Text style={s.cardTitle}>Job Summary</Text>
              {(() => {
                const ages: number[] = Array.isArray(job?.children_ages) ? job.children_ages : [];
                const kidCount = job?.kids || ages.length || 1;
                const agesStr  = ages.length > 0
                  ? ages.map((a: number) => a === 0 ? 'Infant' : `${a} yr${a !== 1 ? 's' : ''}`).join(', ')
                  : null;
                const childrenLabel = agesStr
                  ? `${kidCount} child${kidCount !== 1 ? 'ren' : ''} · ${agesStr}`
                  : `${kidCount} child${kidCount !== 1 ? 'ren' : ''}`;
                return [
                  ['Job ID',    `#${job?.id || job?.job_id || '—'}`],
                  ['Children',  childrenLabel],
                  ['Your Rate', kids > 1 && addRate > 0
                    ? `$${rate.toFixed(2)}/hr ($${baseRate.toFixed(2)} + $${addRate.toFixed(2)}×${kids-1})`
                    : `$${rate.toFixed(2)}/hr`],
                  ['Address',   job?.address || '—'],
                ].map(([label, value]) => (
                  <View key={label} style={s.detailRow}>
                    <Text style={s.detailLabel}>{label}</Text>
                    <Text style={[s.detailValue, label === 'Children' && { fontSize: 12, lineHeight: 18 }]}>{value}</Text>
                  </View>
                ));
              })()}
            </View>

            {/* Action buttons based on status */}
            {status === 'travelling' && (
              <TouchableOpacity onPress={handleArrived} activeOpacity={0.85}>
                <LinearGradient colors={['#02A4E2', '#0270C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtn}>
                  <Text style={s.actionBtnText}>📍  I Have Arrived</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {status === 'arrived' && (
              <TouchableOpacity onPress={handleStartJob} activeOpacity={0.85}>
                <LinearGradient colors={['#1A7F6E', '#0D5C51']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtn}>
                  <Text style={s.actionBtnText}>▶  Start Job & Timer</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {status === 'started' && (
              <TouchableOpacity onPress={handleEndJob} activeOpacity={0.85}>
                <LinearGradient colors={['#BF3B2E', '#8B1A10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtn}>
                  <Text style={s.actionBtnText}>■  End Job</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {status === 'done' && (
              <View style={s.doneCard}>
                <Text style={s.doneText}>🎉 Job Complete!</Text>
                <Text style={s.doneSub}>Earnings: ${earnings} · Duration: {fmt(elapsed)}</Text>
                <Text style={s.doneSub2}>Payment will be processed by the parent shortly.</Text>
                <TouchableOpacity
                  style={s.doneBtn}
                  onPress={() => router.replace('/sitter-home')}
                  activeOpacity={0.85}
                >
                  <Text style={s.doneBtnText}>Back to Home</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F5F4F0' },
  header:         { paddingBottom: 16 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:       { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  headerTitle:    { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSub:      { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  scroll:         { flex: 1, marginTop: -16 },
  content:        { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 48, gap: 14 },
  loadBox:        { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadText:       { fontSize: 14, color: '#5A5F72' },
  timerCard:      { backgroundColor: '#2C3E50', borderRadius: 20, padding: 28, alignItems: 'center', gap: 6 },
  timerCardDone:  { backgroundColor: '#1A7F6E' },
  timerLabel:     { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, textTransform: 'uppercase' },
  timerDisplay:   { fontSize: 52, fontWeight: '900', color: '#FFFFFF', letterSpacing: -2 },
  earningsRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  earningsLabel:  { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  earningsValue:  { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  rateNote:       { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  statusCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderWidth: 2 },
  statusDot:      { width: 12, height: 12, borderRadius: 6 },
  statusText:     { fontSize: 15, fontWeight: '700' },
  parentCard:     { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  cardTitle:      { fontSize: 16, fontWeight: '800', color: '#0F1117', marginBottom: 14 },
  parentTop:      { flexDirection: 'row', gap: 12, marginBottom: 14 },
  parentAv:       { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  parentAvText:   { fontSize: 18, fontWeight: '800', color: '#FFFFFF', zIndex: 1 },
  parentName:     { fontSize: 17, fontWeight: '800', color: '#0F1117' },
  parentMeta:     { fontSize: 13, color: '#5A5F72', marginTop: 2 },
  parentAddress:  { fontSize: 12, color: '#9B9FAE', marginTop: 4, lineHeight: 18 },
  contactRow:     { flexDirection: 'row', gap: 10, marginBottom: 10 },
  callBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1A7F6E', borderRadius: 10, padding: 12 },
  chatBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF0F7', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: 'rgba(201,52,136,0.3)' },
  chatBtnText:    { color: '#C93488', fontSize: 13, fontWeight: '700' },
  chatBadge:      { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  chatBadgeText:  { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  contactIcon:    { fontSize: 18 },
  callBtnText:    { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  textBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E8F6FD', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: 'rgba(2,164,226,0.3)' },
  textBtnText:    { color: '#02A4E2', fontSize: 13, fontWeight: '700' },
  directionsBtn:  { backgroundColor: '#F5F4F0', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E2DA' },
  directionsBtnText: { fontSize: 14, fontWeight: '700', color: '#5A5F72' },
  detailCard:     { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.07)' },
  detailLabel:    { fontSize: 13, color: '#9B9FAE', fontWeight: '600' },
  detailValue:    { fontSize: 13, color: '#0F1117', fontWeight: '600', flex: 1, textAlign: 'right' },
  actionBtn:      { borderRadius: 14, padding: 18, alignItems: 'center' },
  actionBtnText:  { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  doneCard:       { backgroundColor: '#D4EDE9', borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(26,127,110,0.2)' },
  doneText:       { fontSize: 22, fontWeight: '900', color: '#1A7F6E' },
  doneSub:        { fontSize: 15, color: '#1A7F6E', fontWeight: '600' },
  doneSub2:       { fontSize: 13, color: '#1A7F6E', textAlign: 'center', lineHeight: 20 },
  doneBtn:        { marginTop: 8, backgroundColor: '#1A7F6E', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  doneBtnText:    { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
