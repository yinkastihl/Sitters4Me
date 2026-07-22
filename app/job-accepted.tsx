// app/job-accepted.tsx — shown to PARENT after sitter accepts
// Features: live sitter map, waiting counter, synced job timer, cancellation policy,
//           post-job rating + review, save-favourite sitter
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Linking, Image, ActivityIndicator,
  Platform, Modal, Animated, TextInput, KeyboardAvoidingView, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { saveActiveSession, clearActiveSession } from './index';

const JOBS_API   = 'https://sitters4me.com/api/jobs.php';
const STRIPE_API = 'https://sitters4me.com/api/stripe.php';
const POLL_MS    = 5000;

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtElapsed(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Date/Time picker ──────────────────────────────────────────
function DatePickerField({ label, icon, date, onConfirm, mode }: {
  label: string; icon: string; date: Date;
  onConfirm: (d: Date) => void; mode: 'date' | 'time';
}) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(date);
  const display = mode === 'date' ? fmtDate(date) : fmtTime(date);

  if (Platform.OS === 'android') {
    return (
      <>
        <TouchableOpacity style={pf.field} onPress={() => setShow(true)} activeOpacity={0.8}>
          <Text style={pf.icon}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={pf.fieldLabel}>{label}</Text>
            <Text style={pf.fieldValue}>{display}</Text>
          </View>
          <Text style={pf.chevron}>›</Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker value={temp} mode={mode} display="default"
            minimumDate={mode === 'date' ? new Date() : undefined}
            onChange={(_, sel) => { setShow(false); if (sel) { setTemp(sel); onConfirm(sel); } }} />
        )}
      </>
    );
  }
  return (
    <>
      <TouchableOpacity style={pf.field} onPress={() => { setTemp(date); setShow(true); }} activeOpacity={0.8}>
        <Text style={pf.icon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={pf.fieldLabel}>{label}</Text>
          <Text style={pf.fieldValue}>{display}</Text>
        </View>
        <Text style={pf.chevron}>›</Text>
      </TouchableOpacity>
      <Modal transparent animationType="slide" visible={show}>
        <View style={pf.overlay}>
          <View style={pf.pickerSheet}>
            <View style={pf.pickerHeader}>
              <TouchableOpacity onPress={() => setShow(false)}>
                <Text style={pf.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={pf.pickerTitle}>{label}</Text>
              <TouchableOpacity onPress={() => { setShow(false); onConfirm(temp); }}>
                <Text style={pf.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker value={temp} mode={mode} display="spinner"
              minimumDate={mode === 'date' ? new Date() : undefined}
              onChange={(_, sel) => { if (sel) setTemp(sel); }}
              style={{ height: 200 }} textColor="#0F1117" />
          </View>
        </View>
      </Modal>
    </>
  );
}

const pf = StyleSheet.create({
  field:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', gap: 12 },
  icon:         { fontSize: 22 },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: '#9B9FAE', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  fieldValue:   { fontSize: 15, fontWeight: '600', color: '#0F1117' },
  chevron:      { fontSize: 22, color: '#9B9FAE' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:  { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EEE9' },
  pickerTitle:  { fontSize: 16, fontWeight: '700', color: '#0F1117' },
  pickerCancel: { fontSize: 16, color: '#9B9FAE', fontWeight: '500' },
  pickerDone:   { fontSize: 16, color: '#C93488', fontWeight: '800' },
});

// ── Star rating component ─────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 8 }}>
      {[1,2,3,4,5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}>
          <Text style={{ fontSize: 36, color: n <= value ? '#F5A623' : '#D8D5CE' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Job status types ───────────────────────────────────────────
type JobPhase = 'travelling' | 'arrived' | 'in_progress' | 'complete';

// ── Main Screen ────────────────────────────────────────────────
export default function JobAccepted() {
  const router       = useRouter();
  const mapRef       = useRef<MapView>(null);
  const pollRef      = useRef<any>(null);
  const timerRef     = useRef<any>(null);
  const waitTimerRef = useRef<any>(null);
  const chatPollRef  = useRef<any>(null);
  const timerRunning = useRef(false);
  const arrivedAnim  = useRef(new Animated.Value(0)).current;

  const [sitter, setSitter]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const job                         = global.activeJob || {};

  // Kids + rate state — populated from job_status poll
  const [jobKids, setJobKids]             = useState<number>(0);
  const [childAges, setChildAges]         = useState<number[]>([]);
  const [baseRate, setBaseRate]           = useState<number>(0);
  const [addRate, setAddRate]             = useState<number>(0);
  const [effectiveRate, setEffectiveRate] = useState<number>(0);
  const [avgRating, setAvgRating]         = useState<number>(0);
  const [reviewCount, setReviewCount]     = useState<number>(0);

  // Live data from polling
  const [phase, setPhase]               = useState<JobPhase>('travelling');
  const [sitterCoord, setSitterCoord]   = useState<{latitude:number; longitude:number} | null>(null);
  const [parentCoord, setParentCoord]   = useState<{latitude:number; longitude:number} | null>(null);
  const [elapsed, setElapsed]           = useState(0);   // seconds since job STARTED
  const [waitElapsed, setWaitElapsed]   = useState(0);   // seconds since sitter ACCEPTED
  const [chargeAmt, setChargeAmt]       = useState<number | null>(null);
  const [arrivedBanner, setArrivedBanner] = useState(false);

  // Cancellation
  const [cancelCount, setCancelCount]   = useState(0);
  const [cancelFree, setCancelFree]     = useState(true);
  const [cancelling, setCancelling]     = useState(false);
  const [parentId, setParentId]         = useState<number>(0);

  // Rating modal
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [starValue, setStarValue]             = useState(5);
  const [reviewText, setReviewText]           = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError]           = useState<string | null>(null);

  // Save sitter
  const [sitterSaved,  setSitterSaved]  = useState(false);
  const [unreadCount,  setUnreadCount] = useState(0);
  const [savingSitter, setSavingSitter] = useState(false);

  // Tipping
  const [tipSent,      setTipSent]      = useState(false);
  const [tipAmount,    setTipAmount]    = useState(0);       // 0 = none selected
  const [customTip,    setCustomTip]    = useState('');
  const [sendingTip,   setSendingTip]   = useState(false);
  const TIP_PRESETS = [5, 10, 15, 20];

  // Appointment
  const defaultDT = (() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(15,0,0,0); return d; })();
  const [apptDate, setApptDate] = useState<Date>(defaultDT);
  const [apptTime, setApptTime] = useState<Date>(defaultDT);
  const [apptSaved, setApptSaved] = useState(false);

  const user = global.currentUser || {};

  useEffect(() => {
    loadSitterProfile();
    getParentLocation();
    startPolling();
    // Start local waiting-counter immediately (synced from server on first poll)
    waitTimerRef.current = setInterval(() => {
      setWaitElapsed(prev => prev + 1);
    }, 1000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
      clearInterval(waitTimerRef.current);
      clearInterval(chatPollRef.current);
    };
  }, []);

  // Poll unread message count every 5 s
  useEffect(() => {
    const resolvedJobId = job?.job_id || job?.id;
    if (!resolvedJobId) return;
    const poll = async () => {
      try {
        const res = await axios.post(`${JOBS_API}?action=get_unread_count`, {
          job_id:      resolvedJobId,
          viewer_type: 'parent',
        });
        if (res.data?.success) {
          const newCount = res.data.data?.unread || 0;
          setUnreadCount(prev => {
            if (newCount > prev) Vibration.vibrate(200); // buzz when new message arrives
            return newCount;
          });
        }
      } catch {}
    };
    poll();
    chatPollRef.current = setInterval(poll, 5000);
    return () => clearInterval(chatPollRef.current);
  }, []);

  const getParentLocation = async () => {
    if (job?.job_data?.job_lat && job?.job_data?.job_lng) {
      setParentCoord({ latitude: job.job_data.job_lat, longitude: job.job_data.job_lng });
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setParentCoord({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch { /* no location */ }
  };

  const loadSitterProfile = async () => {
    const jobId = job?.job_id || job?.id;
    if (!jobId) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=job_status`, { job_id: jobId });
      if (res.data?.success) {
        const d = res.data.data;
        setSitter({
          id:      d.sitter_id,
          name:    d.sitter_name || job?.sitter_name || 'Your Sitter',
          fname:   d.sitter_fname || (d.sitter_name||'').split(' ')[0],
          lname:   d.sitter_lname || (d.sitter_name||'').split(' ')[1] || '',
          phone:   d.sitter_phone || '',
          rate:    d.rate || '',
          image:   d.sitter_image || '',
          about:   d.about || '',
          bgcheck: d.bgcheck || 'N',
        });
        applyJobUpdate(d);
      }
    } catch {}
    setLoading(false);
  };

  const applyJobUpdate = (d: any) => {
    if (d.sitter_lat && d.sitter_lng) {
      setSitterCoord({ latitude: d.sitter_lat, longitude: d.sitter_lng });
    }
    if (d.job_lat && d.job_lng && !parentCoord) {
      setParentCoord({ latitude: d.job_lat, longitude: d.job_lng });
    }

    // Kids + rate from actual booking
    if (d.kids && d.kids > 0) {
      setJobKids(Number(d.kids));
      setChildAges(Array.isArray(d.children_ages) ? d.children_ages : []);
      const base = Number(d.rate) || 15;
      const add  = Number(d.additional_child_rate) || 0;
      const eff  = Number(d.effective_rate) || (base + add * Math.max(0, Number(d.kids) - 1));
      setBaseRate(base);
      setAddRate(add);
      setEffectiveRate(eff);
    }

    // Ratings
    if (d.avg_rating !== undefined) setAvgRating(Number(d.avg_rating));
    if (d.review_count !== undefined) setReviewCount(Number(d.review_count));

    // Cancellation policy
    if (d.parent_id)   setParentId(Number(d.parent_id));
    if (d.cancel_count !== undefined) setCancelCount(Number(d.cancel_count));
    if (d.cancel_free  !== undefined) setCancelFree(Boolean(d.cancel_free));

    // Persist session so app can resume if killed mid-job
    const jid = d.job_id || job?.job_id || job?.id;
    if (jid && d.status && d.status !== 'Complete') {
      saveActiveSession('parent', Number(jid), (global as any).currentUser || {});
    } else if (d.status === 'Complete') {
      global.activeJob = null;
      clearActiveSession();
    }

    // Sync waiting counter from server (seconds since sitter accepted)
    if (typeof d.waiting_seconds === 'number' && d.waiting_seconds > 0) {
      setWaitElapsed(d.waiting_seconds);
    }

    // Determine phase
    const st = (d.status || '').toLowerCase();
    let newPhase: JobPhase = 'travelling';
    if (st === 'sitter arrived')  newPhase = 'arrived';
    else if (st === 'in progress') newPhase = 'in_progress';
    else if (st === 'complete')    newPhase = 'complete';

    setPhase(prev => {
      if (prev === 'travelling' && newPhase === 'arrived') showArrivedBanner();
      return newPhase;
    });

    // Job timer (starts when sitter clicks "Start Job")
    if (newPhase === 'in_progress' || newPhase === 'complete') {
      const serverElapsed = Math.max(0, Number(d.elapsed_seconds) || 0);
      if (newPhase === 'in_progress') {
        if (!timerRunning.current) {
          timerRunning.current = true;
          // Stop waiting counter when job starts
          clearInterval(waitTimerRef.current);
          let tick = serverElapsed;
          setElapsed(tick);
          timerRef.current = setInterval(() => { tick++; setElapsed(tick); }, 1000);
        }
      } else if (newPhase === 'complete') {
        clearInterval(timerRef.current);
        clearInterval(waitTimerRef.current);
        timerRunning.current = false;
        setElapsed(serverElapsed);
        if (d.charge_amt) setChargeAmt(parseFloat(d.charge_amt));
        if (d.tip_amount && parseFloat(d.tip_amount) > 0) {
          setTipSent(true);
          setTipAmount(parseFloat(d.tip_amount));
        }
        // Auto-show rating modal after brief delay
        setTimeout(() => setShowRatingModal(true), 1200);
      }
    }
  };

  const startPolling = () => {
    const jobId = job?.job_id || job?.id;
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.post(`${JOBS_API}?action=job_status`, { job_id: jobId });
        if (res.data?.success) {
          applyJobUpdate(res.data.data);
          if ((res.data.data.status||'').toLowerCase() === 'complete') {
            clearInterval(pollRef.current);
          }
        }
      } catch { /* keep polling */ }
    }, POLL_MS);
  };

  const showArrivedBanner = () => {
    setArrivedBanner(true);
    arrivedAnim.setValue(0);
    Animated.sequence([
      Animated.spring(arrivedAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.delay(4000),
      Animated.timing(arrivedAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setArrivedBanner(false));
  };

  useEffect(() => {
    if (sitterCoord && parentCoord && mapRef.current) {
      mapRef.current.fitToCoordinates([sitterCoord, parentCoord], {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [sitterCoord, parentCoord]);

  const callSitter = () => {
    if (!sitter?.phone) return Alert.alert('No Phone Number', 'Phone number not available.');
    Alert.alert(`Call ${sitter.fname}?`, sitter.phone, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call Now', onPress: () => Linking.openURL(`tel:${sitter.phone}`) },
    ]);
  };
  const textSitter = () => {
    if (!sitter?.phone) return Alert.alert('No Phone', 'Phone number not available.');
    Linking.openURL(`sms:${sitter.phone}`);
  };
  const saveAppointment = () => {
    const combined = new Date(apptDate);
    combined.setHours(apptTime.getHours(), apptTime.getMinutes(), 0, 0);
    if (combined <= new Date()) return Alert.alert('Invalid Time', 'Please pick a future date and time.');
    setApptSaved(true);
    Alert.alert('📅 Appointment Confirmed!',
      `${sitter?.fname || 'Your sitter'} is booked for:\n\n${fmtDate(apptDate)} at ${fmtTime(apptTime)}`,
      [{ text: 'Great! 🎉' }]);
  };

  // ── CANCEL with policy ─────────────────────────────────────────
  const cancelJob = () => {
    if (phase === 'in_progress' || phase === 'complete') {
      return Alert.alert('Cannot Cancel', 'The job has already started. You cannot cancel once the sitter begins working.');
    }
    const freeLeft = Math.max(0, 3 - cancelCount);
    const policyLine = cancelFree
      ? `You have ${freeLeft} free cancellation${freeLeft !== 1 ? 's' : ''} remaining (including this one).`
      : 'You have used all 3 free cancellations. A 10% cancellation fee will be charged.';
    Alert.alert(
      'Cancel Booking?',
      `Are you sure you want to cancel this booking?\n\n${policyLine}`,
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: cancelFree ? 'Cancel — No Fee' : 'Cancel (10% Fee)',
          style: 'destructive',
          onPress: async () => {
            const pid = parentId || Number(user.id) || Number((user as any).u_id) || 0;
            const jobId = job?.job_id || job?.id;
            if (!pid || !jobId) {
              global.activeJob = null;
              clearActiveSession();
              router.replace('/parent-home');
              return;
            }
            setCancelling(true);
            try {
              const res = await axios.post(`${JOBS_API}?action=cancel_booking`, {
                job_id: jobId, parent_id: pid,
              });
              if (res.data?.success) {
                const d = res.data.data;
                Alert.alert(
                  d.fee_applied ? '❌ Booking Cancelled (Fee Applied)' : '❌ Booking Cancelled',
                  d.fee_applied
                    ? `A $${d.cancellation_fee?.toFixed(2)} cancellation fee has been applied.`
                    : `Cancellation successful. ${d.free_remaining} free cancellation${d.free_remaining !== 1 ? 's' : ''} remaining.`,
                  [{ text: 'OK', onPress: () => { global.activeJob = null; clearActiveSession(); router.replace('/parent-home'); } }]
                );
              } else {
                Alert.alert('Error', res.data?.error || 'Could not cancel. Please try again.');
              }
            } catch {
              Alert.alert('Error', 'Network error. Please try again.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  // ── SUBMIT REVIEW ─────────────────────────────────────────────
  const submitReview = async () => {
    setReviewError(null);
    const jobId    = job?.job_id || job?.id;
    const pid      = parentId || Number(user.id) || 0;
    const sid      = sitter?.id || Number(job?.sitter_id) || 0;
    if (!jobId || !pid || !sid) {
      setReviewError('Missing job data — please try again.');
      return;
    }
    setSubmittingReview(true);
    try {
      await axios.post(`${JOBS_API}?action=submit_review`, {
        job_id: jobId, parent_id: pid, sitter_id: sid,
        rating: starValue, review_text: reviewText,
      });
      setRatingSubmitted(true);
      setShowRatingModal(false);
    } catch {
      setReviewError('Could not submit review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // ── SAVE SITTER ───────────────────────────────────────────────
  const openChat = () => {
    const resolvedJobId = job?.job_id || job?.id || 0;
    const name = sitter?.name || sitter?.fname || job?.sitter_name || 'Sitter';
    const init = name[0]?.toUpperCase() || 'S';
    if (!resolvedJobId) return;
    (global as any).chatJob = {
      job_id:        resolvedJobId,
      viewer_type:   'parent',
      viewer_id:     parentId || Number(user.id) || 0,
      other_name:    name,
      other_initial: init,
    };
    setUnreadCount(0);
    router.push('/chat');
  };

  const saveFavoriteSitter = async () => {
    const pid = parentId || Number(user.id) || 0;
    const sid = sitter?.id || 0;
    if (!pid || !sid) return;
    setSavingSitter(true);
    try {
      await axios.post(`${JOBS_API}?action=save_favorite`, {
        parent_id: pid, sitter_id: sid,
      });
      setSitterSaved(true);
      Alert.alert('❤️ Sitter Saved!', `${sitter?.fname || 'This sitter'} has been added to your favorites!`, [{ text: 'Great!' }]);
    } catch {
      Alert.alert('Error', 'Could not save sitter. Please try again.');
    } finally {
      setSavingSitter(false);
    }
  };

  const sendTip = async (amount: number) => {
    if (amount < 1) return Alert.alert('Invalid Amount', 'Please enter a tip of at least $1.');
    if (amount > 200) return Alert.alert('Too Large', 'Maximum tip is $200.');
    const jobId = job?.job_id || job?.id;
    const pid   = parentId || Number(user.id) || 0;
    if (!jobId || !pid) return Alert.alert('Error', 'Missing job data. Please try again.');
    setSendingTip(true);
    try {
      const res = await axios.post(`${STRIPE_API}?action=add_tip`, {
        job_id:     jobId,
        parent_id:  pid,
        tip_amount: amount,
      });
      if (res.data?.success) {
        setTipSent(true);
        setTipAmount(amount);
        Alert.alert('💝 Tip Sent!', `$${amount.toFixed(2)} tip sent to ${sitter?.fname || 'your sitter'}. They'll love it!`, [{ text: '🎉' }]);
      } else {
        Alert.alert('Tip Failed', res.data?.error || 'Could not send tip. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send tip. Check your connection.');
    } finally {
      setSendingTip(false);
    }
  };

  const initials = sitter
    ? `${(sitter.fname||'?')[0]}${(sitter.lname||'?')[0]}`.toUpperCase()
    : '??';

  const phaseConfig = {
    travelling:  { label: '🚗 Sitter is on the way',  color: '#F5A623', headerColors: ['#1A7F6E','#02A4E2'] as [string,string] },
    arrived:     { label: '📍 Sitter has arrived!',   color: '#1A7F6E', headerColors: ['#1A7F6E','#0270C8'] as [string,string] },
    in_progress: { label: '⏱️ Job in progress',       color: '#02A4E2', headerColors: ['#0270C8','#9B5BAB'] as [string,string] },
    complete:    { label: '✅ Job complete',           color: '#1A7F6E', headerColors: ['#1A7F6E','#0D5C51'] as [string,string] },
  }[phase];

  const displayKids = jobKids  || Number(job?.job_data?.kids) || 1;
  const displayRate = effectiveRate || Number(sitter?.rate) || Number(job?.job_data?.rate) || 15;
  const displayBase = baseRate || Number(sitter?.rate) || 15;
  const displayAdd  = addRate;
  const estEarning  = (elapsed / 3600 * displayRate).toFixed(2);

  const mapRegion = parentCoord
    ? { latitude: parentCoord.latitude - 0.005, longitude: parentCoord.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 29.7604, longitude: -95.3698, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Arrived banner overlay */}
      {arrivedBanner && (
        <Animated.View style={[s.arrivedBanner, {
          opacity: arrivedAnim,
          transform: [{ scale: arrivedAnim.interpolate({ inputRange: [0,1], outputRange: [0.85,1] }) }],
        }]}>
          <Text style={s.arrivedBannerIcon}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.arrivedBannerTitle}>{sitter?.fname || 'Your sitter'} has arrived!</Text>
            <Text style={s.arrivedBannerSub}>They are ready to start babysitting</Text>
          </View>
        </Animated.View>
      )}

      {/* Header */}
      <LinearGradient colors={phaseConfig.headerColors} start={{ x:0, y:0 }} end={{ x:1, y:1 }} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/parent-home')} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>
              {phase === 'complete' ? '✅ Job Complete' : '🍼 Sitter Confirmed!'}
            </Text>
            <Text style={s.headerSub}>{phaseConfig.label}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color="#1A7F6E" />
            <Text style={s.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* ── WAITING COUNTER (visible from moment sitter accepts, until job starts) ── */}
            {(phase === 'travelling' || phase === 'arrived') && (
              <View style={s.waitCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={s.waitDot} />
                  <Text style={s.waitLabel}>
                    {phase === 'arrived' ? 'Sitter at your door' : 'Waiting for sitter'}
                  </Text>
                  <Text style={s.waitTimer}>{fmtElapsed(waitElapsed)}</Text>
                </View>
                <Text style={s.waitSub}>
                  {phase === 'arrived'
                    ? 'Timer will start when sitter begins the job'
                    : 'Sitter is on the way — timer starts when they begin'}
                </Text>
              </View>
            )}

            {/* ── LIVE MAP ─────────────────────────────────────── */}
            {phase !== 'complete' && (
              <View style={s.mapCard}>
                <View style={s.mapHeader}>
                  <Text style={s.mapTitle}>
                    {phase === 'travelling'  ? '🚗 Sitter Navigating to You'  :
                     phase === 'arrived'     ? '📍 Sitter At Your Location'   :
                                              '⏱️ Job In Progress'}
                  </Text>
                  {sitterCoord && (
                    <View style={s.liveBadge}>
                      <View style={s.liveDot} />
                      <Text style={s.liveBadgeText}>LIVE</Text>
                    </View>
                  )}
                </View>
                <MapView
                  ref={mapRef}
                  style={s.map}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={mapRegion}
                  showsUserLocation={false}
                  showsCompass
                >
                  {parentCoord && (
                    <Marker coordinate={parentCoord} title="Your Home" anchor={{ x: 0.5, y: 1 }}>
                      <View style={s.homePin}><Text style={s.homePinIcon}>🏠</Text></View>
                    </Marker>
                  )}
                  {sitterCoord && (
                    <Marker coordinate={sitterCoord} title={sitter?.name || 'Sitter'} anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={[s.sitterPin, phase === 'arrived' && s.sitterPinArrived]}>
                        <LinearGradient
                          colors={phase === 'arrived' ? ['#1A7F6E','#0D5C51'] : ['#02A4E2','#0270C8']}
                          style={s.sitterPinGrad}
                        >
                          {sitter?.image
                            ? <Image source={{ uri: `https://sitters4me.com/uploads/${sitter.image}` }} style={s.sitterPinImg} />
                            : <Text style={s.sitterPinInitials}>{initials}</Text>
                          }
                        </LinearGradient>
                        <Text style={s.sitterPinLabel}>{phase === 'arrived' ? '✓ Here' : sitter?.fname || 'Sitter'}</Text>
                      </View>
                    </Marker>
                  )}
                  {sitterCoord && parentCoord && phase === 'travelling' && (
                    <Polyline coordinates={[sitterCoord, parentCoord]} strokeColor="#02A4E2" strokeWidth={3} lineDashPattern={[8,4]} />
                  )}
                </MapView>
                {!sitterCoord && (
                  <View style={s.noLocOverlay}>
                    <ActivityIndicator color="#02A4E2" />
                    <Text style={s.noLocText}>Getting sitter location...</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── JOB TIMER (when in progress or complete) ─────── */}
            {(phase === 'in_progress' || phase === 'complete') && (
              <View style={[s.timerCard, phase === 'complete' && s.timerCardDone]}>
                <Text style={s.timerLabel}>
                  {phase === 'complete' ? 'Total Job Time' : 'Job Time (Live)'}
                </Text>
                <Text style={s.timerDisplay}>{fmtElapsed(elapsed)}</Text>
                <View style={s.timerRow}>
                  <View style={s.timerStat}>
                    <Text style={s.timerStatVal}>${estEarning}</Text>
                    <Text style={s.timerStatLbl}>{phase === 'complete' ? 'Charged' : 'Estimated'}</Text>
                  </View>
                  <View style={s.timerDivider} />
                  <View style={s.timerStat}>
                    <Text style={s.timerStatVal}>${displayRate.toFixed(2)}/hr</Text>
                    <Text style={s.timerStatLbl}>
                      {displayKids} child{displayKids !== 1 ? 'ren' : ''}
                      {displayKids > 1 && displayAdd > 0
                        ? `\n$${displayBase.toFixed(2)}+$${displayAdd.toFixed(2)}×${displayKids-1}`
                        : ''}
                    </Text>
                  </View>
                  <View style={s.timerDivider} />
                  <View style={s.timerStat}>
                    <Text style={s.timerStatVal}>{(elapsed/3600).toFixed(2)}h</Text>
                    <Text style={s.timerStatLbl}>Hours</Text>
                  </View>
                </View>
                {phase === 'complete' && (
                  <View style={s.chargedBadge}>
                    <Text style={s.chargedBadgeText}>
                      ✓ ${chargeAmt?.toFixed(2) || estEarning} charged to your card
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── STATUS BANNER ────────────────────────────────── */}
            <View style={[s.statusBanner, { borderColor: phaseConfig.color + '40' }]}>
              <Text style={s.statusBannerIcon}>
                {phase === 'travelling' ? '🚗' : phase === 'arrived' ? '📍' : phase === 'in_progress' ? '⏱️' : '✅'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.statusBannerTitle, { color: phaseConfig.color }]}>
                  {phase === 'travelling'  ? `${sitter?.fname || 'Your sitter'} is on the way!`        :
                   phase === 'arrived'     ? `${sitter?.fname || 'Your sitter'} has arrived!`           :
                   phase === 'in_progress' ? `${sitter?.fname || 'Your sitter'} is babysitting now`     :
                                            'Job is complete — great work!'}
                </Text>
                <Text style={s.statusBannerSub}>
                  {phase === 'travelling'  ? 'Map updates live every 10 seconds'        :
                   phase === 'arrived'     ? 'They are at your door and ready to start'  :
                   phase === 'in_progress' ? 'Timer synced with sitter app in real time' :
                                            'Your card was charged automatically'}
                </Text>
              </View>
            </View>

            {/* ── SITTER PROFILE CARD ──────────────────────────── */}
            <View style={s.profileCard}>
              <View style={s.profileTop}>
                <View style={s.avatarWrap}>
                  {sitter?.image
                    ? <Image source={{ uri: `https://sitters4me.com/uploads/${sitter.image}` }} style={s.avatar} />
                    : <LinearGradient colors={['#02A4E2','#0270C8']} style={s.avatarFallback}>
                        <Text style={s.avatarInitials}>{initials}</Text>
                      </LinearGradient>
                  }
                  <View style={[s.onlineDot, phase !== 'complete' && { backgroundColor: '#1A7F6E' }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sitterName}>{sitter?.name || job?.sitter_name || 'Your Sitter'}</Text>
                  <Text style={s.sitterRate}>
                    {displayRate > 0 ? `$${displayRate.toFixed(2)}/hr` : sitter?.rate ? `$${sitter.rate}/hr` : 'Rate TBD'}
                    {displayKids > 1 && displayAdd > 0 ? ` (${displayKids} children)` : ''}
                  </Text>
                  {/* Star rating display */}
                  {avgRating > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Text style={{ color: '#F5A623', fontSize: 13 }}>
                        {'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#5A5F72' }}>
                        {avgRating.toFixed(1)} ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
                      </Text>
                    </View>
                  )}
                  {sitter?.bgcheck === 'Y' && (
                    <View style={s.bgBadge}><Text style={s.bgBadgeText}>✓ Background Checked</Text></View>
                  )}
                </View>
              </View>
              {sitter?.about ? <Text style={s.about}>{sitter.about}</Text> : null}
              <View style={s.contactRow}>
                <TouchableOpacity style={s.callBtn} onPress={callSitter} activeOpacity={0.85}>
                  <Text style={s.contactIcon}>📞</Text>
                  <Text style={s.callBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.textBtn} onPress={textSitter} activeOpacity={0.85}>
                  <Text style={s.contactIcon}>💬</Text>
                  <Text style={s.textBtnText}>Text</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, position: 'relative' }}>
                  <TouchableOpacity style={s.chatBtn} onPress={openChat} activeOpacity={0.85}>
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
            </View>

            {/* ── APPOINTMENT PICKER ────────────────────────────── */}
            {(phase === 'travelling' || phase === 'arrived') && (
              <View style={s.scheduleCard}>
                <Text style={s.scheduleTitle}>📅 Set Appointment Time</Text>
                <Text style={s.scheduleSub}>Tap a field to open the calendar or clock</Text>
                <View style={s.pickerGroup}>
                  <DatePickerField label="Date" icon="📆" date={apptDate} mode="date" onConfirm={setApptDate} />
                  <DatePickerField label="Start Time" icon="⏰" date={apptTime} mode="time" onConfirm={setApptTime} />
                </View>
                {apptSaved && (
                  <View style={s.apptPreview}>
                    <Text style={s.apptPreviewText}>✓ {fmtDate(apptDate)} · {fmtTime(apptTime)}</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={saveAppointment}
                  style={[s.schedSaveBtn, apptSaved && s.schedSaveBtnDone]}
                  activeOpacity={0.85}
                >
                  <Text style={s.schedSaveBtnText}>
                    {apptSaved ? '✓ Confirmed — Tap to Change' : 'Confirm Appointment'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── POST-JOB ACTIONS (complete phase) ────────────── */}
            {phase === 'complete' && (
              <View style={s.completeActionsCard}>
                <Text style={s.completeActionsTitle}>🎉 Job Complete!</Text>

                {/* Rate sitter */}
                {!ratingSubmitted ? (
                  <TouchableOpacity
                    style={s.rateBtn}
                    onPress={() => setShowRatingModal(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.rateBtnIcon}>⭐</Text>
                    <Text style={s.rateBtnText}>Rate &amp; Review {sitter?.fname || 'Sitter'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.ratedBadge}>
                    <Text style={s.ratedBadgeText}>✓ Review Submitted — Thank you!</Text>
                  </View>
                )}

                {/* Save sitter */}
                <TouchableOpacity
                  style={[s.saveBtn, sitterSaved && s.saveBtnDone]}
                  onPress={sitterSaved ? undefined : saveFavoriteSitter}
                  disabled={sitterSaved || savingSitter}
                  activeOpacity={0.85}
                >
                  {savingSitter
                    ? <ActivityIndicator color="#C93488" size="small" />
                    : <>
                        <Text style={s.saveBtnIcon}>{sitterSaved ? '❤️' : '🤍'}</Text>
                        <Text style={[s.saveBtnText, sitterSaved && { color: '#C93488' }]}>
                          {sitterSaved ? `${sitter?.fname || 'Sitter'} Saved to Favorites` : `Save ${sitter?.fname || 'Sitter'} as Favorite`}
                        </Text>
                      </>
                  }
                </TouchableOpacity>

                {/* ── TIP CARD ──────────────────────────────────── */}
                {tipSent ? (
                  <View style={s.tipSentCard}>
                    <Text style={s.tipSentIcon}>💝</Text>
                    <Text style={s.tipSentTitle}>Tip Sent!</Text>
                    <Text style={s.tipSentAmt}>${tipAmount.toFixed(2)}</Text>
                    <Text style={s.tipSentSub}>went straight to {sitter?.fname || 'your sitter'}</Text>
                  </View>
                ) : (
                  <View style={s.tipCard}>
                    <Text style={s.tipTitle}>💝 Add a Tip?</Text>
                    <Text style={s.tipSub}>100% goes directly to {sitter?.fname || 'your sitter'}</Text>
                    <View style={s.tipPresets}>
                      {TIP_PRESETS.map(amt => (
                        <TouchableOpacity
                          key={amt}
                          style={s.tipPresetBtn}
                          onPress={() => sendTip(amt)}
                          disabled={sendingTip}
                          activeOpacity={0.8}
                        >
                          <Text style={s.tipPresetText}>${amt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.tipCustomRow}>
                      <Text style={s.tipDollar}>$</Text>
                      <TextInput
                        style={s.tipInput}
                        value={customTip}
                        onChangeText={t => setCustomTip(t.replace(/[^0-9.]/g, ''))}
                        placeholder="Custom amount"
                        placeholderTextColor="#9B9FAE"
                        keyboardType="decimal-pad"
                        editable={!sendingTip}
                      />
                      <TouchableOpacity
                        style={[s.tipSendBtn, (!customTip || sendingTip) && { opacity: 0.4 }]}
                        onPress={() => sendTip(parseFloat(customTip) || 0)}
                        disabled={!customTip || sendingTip}
                        activeOpacity={0.85}
                      >
                        {sendingTip
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.tipSendBtnText}>Send</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── CANCEL BUTTON (only before job starts) ───────── */}
            {(phase === 'travelling' || phase === 'arrived') && (
              <TouchableOpacity
                style={[s.cancelBtn, cancelling && { opacity: 0.6 }]}
                onPress={cancelJob}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                {cancelling
                  ? <ActivityIndicator color="#BF3B2E" size="small" />
                  : <>
                      <Text style={s.cancelBtnText}>Cancel This Booking</Text>
                      <Text style={s.cancelBtnSub}>
                        {cancelFree
                          ? `${Math.max(0, 3 - cancelCount)} free cancellation${Math.max(0, 3 - cancelCount) !== 1 ? 's' : ''} remaining`
                          : '⚠️ 10% cancellation fee applies'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            )}

            {/* Done button when complete */}
            {phase === 'complete' && (
              <TouchableOpacity
                style={s.doneBtn}
                onPress={() => { global.activeJob = null; clearActiveSession(); router.replace('/parent-home'); }}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#1A7F6E','#0D5C51']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.doneBtnGrad}>
                  <Text style={s.doneBtnText}>✓ Done — Back to Home</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* ── RATING MODAL ─────────────────────────────────────────── */}
      <Modal visible={showRatingModal} transparent animationType="slide" onRequestClose={() => setShowRatingModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <View style={s.modalOverlay}>
            <View style={s.ratingModal}>
              {/* Fixed header — never scrolls away */}
              <View style={s.ratingModalHeader}>
                <Text style={s.ratingModalTitle}>⭐ Rate Your Sitter</Text>
                <TouchableOpacity onPress={() => { setShowRatingModal(false); setReviewError(null); }}>
                  <Text style={s.ratingModalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Scrollable body — content above keyboard when typing */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center', gap: 6, paddingBottom: 16 }}
              >
                {sitter?.image
                  ? <Image source={{ uri: `https://sitters4me.com/uploads/${sitter.image}` }} style={s.ratingAvatar} />
                  : <View style={s.ratingAvatarFallback}>
                      <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                      <Text style={s.ratingAvatarInitials}>{initials}</Text>
                    </View>
                }
                <Text style={s.ratingName}>{sitter?.name || 'Your Sitter'}</Text>
                <Text style={s.ratingPrompt}>How was your experience?</Text>

                <StarRating value={starValue} onChange={setStarValue} />
                <Text style={s.starLabel}>
                  {starValue === 1 ? 'Poor' : starValue === 2 ? 'Fair' : starValue === 3 ? 'Good' : starValue === 4 ? 'Very Good' : 'Excellent!'}
                </Text>

                <TextInput
                  style={s.reviewInput}
                  placeholder="Write a review (optional)..."
                  placeholderTextColor="#9B9FAE"
                  multiline
                  numberOfLines={3}
                  value={reviewText}
                  onChangeText={t => { setReviewText(t); if (reviewError) setReviewError(null); }}
                  maxLength={500}
                  returnKeyType="done"
                  blurOnSubmit
                />

                {reviewError && (
                  <View style={s.reviewErrorTip}>
                    <Text style={s.reviewErrorIcon}>⚠️</Text>
                    <Text style={s.reviewErrorText}>{reviewError}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.submitReviewBtn, submittingReview && { opacity: 0.6 }]}
                  onPress={submitReview}
                  disabled={submittingReview}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#F5A623','#E8961A']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.submitReviewGrad}>
                    {submittingReview
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={s.submitReviewText}>Submit Review ⭐</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setShowRatingModal(false); setReviewError(null); }} style={{ marginTop: 6 }}>
                  <Text style={{ color: '#9B9FAE', fontSize: 14, textAlign: 'center' }}>Skip for now</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F5F4F0' },
  header:             { paddingBottom: 16 },
  headerRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn:            { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:           { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  headerTitle:        { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSub:          { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  scroll:             { flex: 1, marginTop: -16 },
  content:            { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 48, gap: 14 },
  loadingBox:         { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText:        { fontSize: 14, color: '#5A5F72' },

  // Arrived banner
  arrivedBanner:      { position: 'absolute', top: 110, left: 16, right: 16, zIndex: 99, backgroundColor: '#1A7F6E', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  arrivedBannerIcon:  { fontSize: 32 },
  arrivedBannerTitle: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  arrivedBannerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  // Waiting counter card
  waitCard:           { backgroundColor: '#FFF8E7', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: 'rgba(245,166,35,0.4)' },
  waitDot:            { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F5A623' },
  waitLabel:          { flex: 1, fontSize: 14, fontWeight: '700', color: '#A0700A' },
  waitTimer:          { fontSize: 18, fontWeight: '900', color: '#F5A623', fontVariant: ['tabular-nums'] },
  waitSub:            { fontSize: 12, color: '#A0700A', marginTop: 6, opacity: 0.8 },

  // Map
  mapCard:            { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  mapHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  mapTitle:           { fontSize: 14, fontWeight: '700', color: '#0F1117' },
  liveBadge:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FF3B30', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveBadgeText:      { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  map:                { height: 220 },
  noLocOverlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,244,240,0.85)', gap: 8 },
  noLocText:          { fontSize: 13, color: '#9B9FAE' },

  // Map markers
  homePin:            { alignItems: 'center', justifyContent: 'center' },
  homePinIcon:        { fontSize: 36 },
  sitterPin:          { alignItems: 'center', gap: 3 },
  sitterPinArrived:   { transform: [{ scale: 1.15 }] },
  sitterPinGrad:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF', overflow: 'hidden' },
  sitterPinImg:       { width: 44, height: 44, borderRadius: 22 },
  sitterPinInitials:  { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  sitterPinLabel:     { fontSize: 11, fontWeight: '700', color: '#0F1117', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // Timer
  timerCard:          { backgroundColor: '#1A3A4A', borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  timerCardDone:      { backgroundColor: '#1A7F6E' },
  timerLabel:         { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' },
  timerDisplay:       { fontSize: 52, fontWeight: '900', color: '#FFFFFF', letterSpacing: -2 },
  timerRow:           { flexDirection: 'row', alignItems: 'center', gap: 0 },
  timerStat:          { flex: 1, alignItems: 'center' },
  timerStatVal:       { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  timerStatLbl:       { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2, textAlign: 'center' },
  timerDivider:       { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  chargedBadge:       { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  chargedBadgeText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Status banner
  statusBanner:       { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5 },
  statusBannerIcon:   { fontSize: 28 },
  statusBannerTitle:  { fontSize: 15, fontWeight: '700' },
  statusBannerSub:    { fontSize: 12, color: '#9B9FAE', marginTop: 2 },

  // Sitter profile card
  profileCard:        { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  profileTop:         { flexDirection: 'row', gap: 14, marginBottom: 12 },
  avatarWrap:         { position: 'relative' },
  avatar:             { width: 72, height: 72, borderRadius: 20 },
  avatarFallback:     { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarInitials:     { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  onlineDot:          { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#9B9FAE', borderWidth: 2.5, borderColor: '#FFFFFF' },
  sitterName:         { fontSize: 20, fontWeight: '900', color: '#0F1117', letterSpacing: -0.3 },
  sitterRate:         { fontSize: 15, color: '#02A4E2', fontWeight: '700', marginTop: 2 },
  bgBadge:            { marginTop: 6, backgroundColor: '#D4EDE9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  bgBadgeText:        { fontSize: 12, fontWeight: '700', color: '#1A7F6E' },
  about:              { fontSize: 13, color: '#5A5F72', lineHeight: 20, marginBottom: 14 },
  contactRow:         { flexDirection: 'row', gap: 10 },
  callBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A7F6E', borderRadius: 12, padding: 14 },
  contactIcon:        { fontSize: 20 },
  callBtnText:        { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  textBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F6FD', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(2,164,226,0.3)' },
  textBtnText:        { color: '#02A4E2', fontSize: 15, fontWeight: '800' },
  chatBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF0F7', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(201,52,136,0.3)' },
  chatBtnText:        { color: '#C93488', fontSize: 15, fontWeight: '800' },
  chatBadge:          { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  chatBadgeText:      { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  // Appointment
  scheduleCard:       { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  scheduleTitle:      { fontSize: 17, fontWeight: '800', color: '#0F1117', marginBottom: 4 },
  scheduleSub:        { fontSize: 13, color: '#5A5F72', marginBottom: 16, lineHeight: 20 },
  pickerGroup:        { gap: 10, marginBottom: 14 },
  apptPreview:        { backgroundColor: '#D4EDE9', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center' },
  apptPreviewText:    { fontSize: 14, fontWeight: '700', color: '#1A7F6E' },
  schedSaveBtn:       { backgroundColor: '#C93488', borderRadius: 12, padding: 14, alignItems: 'center' },
  schedSaveBtnDone:   { backgroundColor: '#1A7F6E' },
  schedSaveBtnText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Post-job actions
  completeActionsCard:{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)', gap: 12 },
  completeActionsTitle:{ fontSize: 17, fontWeight: '800', color: '#0F1117', marginBottom: 4 },
  rateBtn:            { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E7', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(245,166,35,0.4)' },
  rateBtnIcon:        { fontSize: 22 },
  rateBtnText:        { fontSize: 15, fontWeight: '700', color: '#A0700A', flex: 1 },
  ratedBadge:         { backgroundColor: '#D4EDE9', borderRadius: 12, padding: 14, alignItems: 'center' },
  ratedBadgeText:     { fontSize: 14, fontWeight: '700', color: '#1A7F6E' },
  saveBtn:            { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF0F7', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(201,52,136,0.25)' },
  saveBtnDone:        { backgroundColor: '#FFF0F7', borderColor: '#C93488' },
  saveBtnIcon:        { fontSize: 22 },
  saveBtnText:        { fontSize: 15, fontWeight: '700', color: '#5A5F72', flex: 1 },

  // Tip card
  tipCard:            { backgroundColor: '#FFF8E7', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: 'rgba(255,170,0,0.3)', gap: 10, marginTop: 4 },
  tipTitle:           { fontSize: 17, fontWeight: '800', color: '#0F1117', textAlign: 'center' },
  tipSub:             { fontSize: 13, color: '#5A5F72', textAlign: 'center', marginTop: -4 },
  tipPresets:         { flexDirection: 'row', gap: 8 },
  tipPresetBtn:       { flex: 1, backgroundColor: '#FFAA00', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  tipPresetText:      { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  tipCustomRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,170,0,0.4)', paddingHorizontal: 12 },
  tipDollar:          { fontSize: 18, fontWeight: '700', color: '#5A5F72' },
  tipInput:           { flex: 1, fontSize: 16, color: '#0F1117', paddingVertical: 12 },
  tipSendBtn:         { backgroundColor: '#FFAA00', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tipSendBtnText:     { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  tipSentCard:        { backgroundColor: '#E8F8EE', borderRadius: 14, padding: 18, borderWidth: 1.5, borderColor: 'rgba(30,160,90,0.3)', alignItems: 'center', gap: 4, marginTop: 4 },
  tipSentIcon:        { fontSize: 32 },
  tipSentTitle:       { fontSize: 16, fontWeight: '800', color: '#1A7F6E' },
  tipSentAmt:         { fontSize: 28, fontWeight: '900', color: '#1A7F6E' },
  tipSentSub:         { fontSize: 13, color: '#5A5F72' },

  // Cancel button
  cancelBtn:          { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(191,59,46,0.3)', backgroundColor: '#FDE9E7' },
  cancelBtnText:      { color: '#BF3B2E', fontSize: 14, fontWeight: '700' },
  cancelBtnSub:       { color: '#BF3B2E', fontSize: 11, marginTop: 3, opacity: 0.75 },

  // Done button
  doneBtn:            { borderRadius: 14, overflow: 'hidden' },
  doneBtnGrad:        { padding: 18, alignItems: 'center' },
  doneBtnText:        { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Rating modal
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  ratingModal:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, alignItems: 'center', gap: 6 },
  ratingModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', marginBottom: 10 },
  ratingModalTitle:   { fontSize: 19, fontWeight: '900', color: '#0F1117' },
  ratingModalClose:   { fontSize: 22, color: '#9B9FAE', fontWeight: '600' },
  ratingAvatar:       { width: 80, height: 80, borderRadius: 24, marginBottom: 4 },
  ratingAvatarFallback:{ width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4 },
  ratingAvatarInitials:{ fontSize: 28, fontWeight: '800', color: '#FFFFFF', zIndex: 1 },
  ratingName:         { fontSize: 18, fontWeight: '800', color: '#0F1117' },
  ratingPrompt:       { fontSize: 14, color: '#5A5F72', marginTop: 2 },
  starLabel:          { fontSize: 14, fontWeight: '700', color: '#F5A623', marginTop: -4 },
  reviewInput:        { alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F1117', minHeight: 80, textAlignVertical: 'top', marginTop: 6 },
  reviewErrorTip:     { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF4E5', borderWidth: 1, borderColor: '#F5A623', borderRadius: 10, padding: 10, marginTop: 8 },
  reviewErrorIcon:    { fontSize: 16 },
  reviewErrorText:    { flex: 1, fontSize: 13, color: '#7A4900', fontWeight: '600', lineHeight: 18 },
  submitReviewBtn:    { alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  submitReviewGrad:   { padding: 16, alignItems: 'center' },
  submitReviewText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
