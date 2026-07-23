// app/sitter-home.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Switch, StatusBar, Vibration, Alert, Animated, Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';

const JOBS_API      = 'https://sitters4me.com/api/jobs.php';
const POLL_INTERVAL = 6000; // poll every 6 seconds
const COUNTDOWN     = 60;

// Sound files
const SOUNDS = {
  jobRequest:    require('../assets/sounds/job_request.mp3'),
  jobAccepted:   require('../assets/sounds/job_accepted.mp3'),
  countdownWarn: require('../assets/sounds/countdown_warn.mp3'),
};

export default function SitterHome() {
  const router   = useRouter();
  const countRef      = useRef<any>(null);
  const pollRef       = useRef<any>(null);
  const cancelPollRef = useRef<any>(null);
  const soundLoopRef  = useRef<any>(null);
  const progAnim      = useRef(new Animated.Value(1)).current;
  const modalRef      = useRef(false);
  const warnedRef     = useRef(false);

  // keepAudioSessionActive:true holds the iOS audio session open between plays
  const ringPlayer   = useAudioPlayer(SOUNDS.jobRequest,    { keepAudioSessionActive: true });
  const warnPlayer   = useAudioPlayer(SOUNDS.countdownWarn, { keepAudioSessionActive: true });
  const acceptPlayer = useAudioPlayer(SOUNDS.jobAccepted,   { keepAudioSessionActive: true });

  // Restore online state from global so returning from active-job keeps sitter online
  const [isOnline, setIsOnline]         = useState((global as any).sitterOnline === true);
  const [toggling, setToggling]         = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [countdown, setCountdown]       = useState(COUNTDOWN);
  const [incomingJob, setIncomingJob]   = useState<any>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  const [tick, setTick] = useState(0); // increments every 60s to re-evaluate minsUntil
  // Increment to force re-render after returning from profile edit screen
  const [profileVersion, setProfileVersion] = useState(0);
  const [hasActiveJob,   setHasActiveJob]   = useState(false);

  // Re-read global.currentUser every time this screen gains focus
  // (picks up rate/distance changes made in profile edit screen)
  // Also re-check whether a job is in progress so the return banner appears
  useFocusEffect(
    useCallback(() => {
      setProfileVersion(v => v + 1);
      const aj = (global as any).activeJob;
      setHasActiveJob(!!(aj?.job_id));
    }, [])
  );

  const user     = global.currentUser || {};
  // Support both id and u_id field names from auth.php
  const sitterId = user.id || (user as any).u_id || 0;
  const initials = `${(user.fname || '?')[0]}${(user.lname || '?')[0]}`.toUpperCase();

  const upcomingPollRef = useRef<any>(null);

  const loadUpcoming = async () => {
    if (!sitterId) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_scheduled`, { sitter_id: sitterId });
      if (res.data?.success) setUpcomingJobs(res.data.data || []);
    } catch {}
  };

  const tickRef = useRef<any>(null);
  useEffect(() => {
    loadUpcoming();
    upcomingPollRef.current = setInterval(loadUpcoming, 30000);
    // Tick every 60s so minsUntil recalculates and the Begin Job button unlocks on time
    tickRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      clearInterval(countRef.current);
      clearInterval(pollRef.current);
      clearInterval(soundLoopRef.current);
      clearInterval(cancelPollRef.current);
      clearInterval(upcomingPollRef.current);
      clearInterval(tickRef.current);
      Vibration.cancel();
    };
  }, []);

  // Set audio mode right before every play — iOS deactivates the session between plays
  // unless we reactivate it. This mirrors the pattern that works in chat.tsx.
  const ensureAudio = async () => {
    await setAudioModeAsync({
      playsInSilentMode:      true,   // play even when the silent switch is on
      shouldPlayInBackground: true,
      interruptionMode:       'mixWithOthers',
    });
  };

  const startRing = async () => {
    try {
      await ensureAudio();
      ringPlayer.loop   = true;
      ringPlayer.volume = 1.0;
      await ringPlayer.seekTo(0);
      ringPlayer.play();
    } catch (e) { console.warn('startRing error:', e); }
  };

  const stopRing = () => {
    clearInterval(soundLoopRef.current);
    soundLoopRef.current = null;
    try { ringPlayer.pause(); ringPlayer.seekTo(0); } catch {}
  };

  const stopSound = stopRing;

  const playWarn = async () => {
    try {
      await ensureAudio();
      warnPlayer.volume = 1.0;
      await warnPlayer.seekTo(0);
      warnPlayer.play();
    } catch (e) { console.warn('playWarn error:', e); }
  };

  const playAccept = async () => {
    try {
      await ensureAudio();
      acceptPlayer.volume = 1.0;
      await acceptPlayer.seekTo(0);
      acceptPlayer.play();
    } catch (e) { console.warn('playAccept error:', e); }
  };

  // Start/stop polling based on online status
  useEffect(() => {
    if (isOnline) {
      // Start polling for real job requests from parents
      pollRef.current = setInterval(checkForJobs, POLL_INTERVAL);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [isOnline]);

  // ── Poll API for incoming jobs — only shows popup when parent presses Request Now ──
  const checkForJobs = async () => {
    if (modalRef.current) return; // don't poll if popup already showing
    if (!sitterId) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=check_incoming`, {
        sitter_id: sitterId,
      });
      if (res.data?.success && res.data?.data?.job) {
        const job = res.data.data.job;
        if (job.is_scheduled) {
          showScheduledJobPopup(job);  // calm accept/decline — no countdown
        } else {
          showJobPopup(job);           // live 60-second countdown
        }
      }
    } catch {}
  };

  // ── Scheduled booking request — no countdown, sitter decides at leisure ──
  const showScheduledJobPopup = (job: any) => {
    if (modalRef.current) return; // already showing a modal
    modalRef.current = true;
    setIncomingJob(job);
    setShowModal(true);
    // No ring, no vibration, no countdown for scheduled requests
  };

  const handleAcceptScheduled = async () => {
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    setIncomingJob(null);
    try {
      await axios.post(`${JOBS_API}?action=accept_job`, {
        job_id: job.id, sitter_id: sitterId,
      });
      const dt = job.scheduled_time ? new Date(job.scheduled_time) : null;
      const formatted = dt
        ? dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' at ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : 'the scheduled time';
      Alert.alert(
        '✅ Booking Confirmed!',
        `You\'ve accepted the job for ${formatted}. It will appear in your upcoming jobs.`,
        [{ text: 'OK' }]
      );
      loadUpcoming(); // refresh upcoming list
    } catch {
      Alert.alert('Error', 'Could not confirm booking. Please try again.');
    }
  };

  const handleDeclineScheduled = async () => {
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    setIncomingJob(null);
    try {
      await axios.post(`${JOBS_API}?action=decline_job`, {
        job_id: job.id, sitter_id: sitterId,
      });
    } catch { /* non-critical */ }
  };

  const showJobPopup = (job: any) => {
    modalRef.current = true;
    warnedRef.current = false;
    setIncomingJob(job);
    setShowModal(true);
    setCountdown(COUNTDOWN);

    // Start continuous ring — async but don't block the countdown
    startRing().catch(e => console.warn('ring failed:', e));

    // Vibrate: buzz 600ms, pause 800ms, repeat until Vibration.cancel()
    Vibration.vibrate([0, 600, 800], true);

    // Poll check_incoming every 3 s — if the job disappears, parent cancelled
    const jobId = job.id;  // capture in closure so no stale-state risk
    clearInterval(cancelPollRef.current);
    cancelPollRef.current = setInterval(async () => {
      if (!modalRef.current) { clearInterval(cancelPollRef.current); return; }
      try {
        const res = await axios.post(`${JOBS_API}?action=check_incoming`, { sitter_id: sitterId });
        const returnedJobId = res.data?.data?.job?.id;
        // If the server no longer returns this job, parent cancelled — dismiss silently
        if (res.data?.success && returnedJobId !== jobId) {
          clearInterval(cancelPollRef.current);
          clearInterval(countRef.current);
          Vibration.cancel();
          stopRing();
          modalRef.current = false;
          setShowModal(false);
          progAnim.setValue(1);
          setIncomingJob(null);
        }
      } catch {}
    }, 3000);

    clearInterval(countRef.current);
    progAnim.setValue(1);
    Animated.timing(progAnim, {
      toValue: 0, duration: COUNTDOWN * 1000, useNativeDriver: false,
    }).start();

    let remaining = COUNTDOWN;
    countRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      // Play warning beep at 10 seconds
      if (remaining === 10 && !warnedRef.current) {
        warnedRef.current = true;
        playWarn();
        Vibration.vibrate([0, 200, 100, 200, 100, 200]);
      }
      if (remaining <= 0) {
        handleTimeout(job);
      }
    }, 1000);
  };

  const handleTimeout = async (job?: any) => {
    clearInterval(countRef.current);
    clearInterval(cancelPollRef.current);
    Vibration.cancel();
    stopSound();
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    const j = job || incomingJob;
    if (j?.id) {
      try {
        await axios.post(`${JOBS_API}?action=timeout_job`, {
          job_id: j.id, sitter_id: sitterId,
        });
      } catch {}
    }
    setIncomingJob(null);
  };

  const handleAccept = async () => {
    clearInterval(countRef.current);
    clearInterval(cancelPollRef.current);
    Vibration.cancel();
    stopRing();                    // stop ring before playing accept chime
    playAccept();                  // happy chime on accept
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    setIncomingJob(null);
    try {
      await axios.post(`${JOBS_API}?action=accept_job`, {
        job_id: job.id, sitter_id: sitterId,
      });
    } catch {}
    // Mark as still online so sitter-home restores online state when they return
    (global as any).sitterOnline = true;
    // Store job globally so active-job screen can access it
    global.activeJob = {
      id:             job.id,
      job_id:         job.id,
      parent_name:    job.parent_name || 'Parent',
      parent_phone:   job.parent_phone || '',
      kids:           job.kids || 1,
      children_ages:  Array.isArray(job.children_ages) ? job.children_ages : [],
      address:        job.address || '',
      city:           job.city || '',
      state:          job.state || '',
      rate:           job.rate || user.minrate || 15,
    };
    // Navigate to active job screen immediately
    router.push('/active-job');
  };

  const handleDecline = async () => {
    clearInterval(countRef.current);
    Vibration.cancel();
    stopSound();
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    setIncomingJob(null);
    try {
      await axios.post(`${JOBS_API}?action=decline_job`, {
        job_id: job.id, sitter_id: sitterId,
      });
    } catch {}
  };

  const toggleOnline = async (val: boolean) => {
    setToggling(true);
    try {
      let lat = 0, lng = 0;
      if (val) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Required', 'Please enable location services to go online and receive job requests.');
          setToggling(false);
          return;
        }
        const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = l.coords.latitude;
        lng = l.coords.longitude;
      }
      const res = await axios.post(`${JOBS_API}?action=set_online`, {
        sitter_id: sitterId, online: val ? 1 : 0, lat, lng,
      });
      // Update local + global state
      if (res.data?.success || res.status === 200) {
        setIsOnline(val);
        (global as any).sitterOnline = val;
      } else {
        setIsOnline(val);
        (global as any).sitterOnline = val;
        // set_online returned non-success — UI still updated optimistically
      }
      if (!val) {
        clearInterval(pollRef.current);
        clearInterval(countRef.current);
        modalRef.current = false;
        setShowModal(false);
        Vibration.cancel();
      }
    } catch {
      // Network error — still update UI optimistically so user isn't stuck
      setIsOnline(val);
      (global as any).sitterOnline = val;
      if (!val) {
        clearInterval(pollRef.current);
        clearInterval(countRef.current);
        modalRef.current = false;
        setShowModal(false);
        Vibration.cancel();
      }
      // Only show error if going ONLINE (important for location sharing)
      if (val) {
        Alert.alert('Warning', 'You appear to be online but we could not confirm with the server. Your status will sync when connection improves.');
      }
    } finally {
      setToggling(false);
    }
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setProfilePhoto(asset.uri);   // optimistic local preview
      try {
        // Convert to base64 and upload
        const response = await fetch(asset.uri);
        const blob     = await response.blob();
        const reader   = new FileReader();
        const b64: string = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror   = reject;
          reader.readAsDataURL(blob);
        });
        const uploadRes = await axios.post(`${JOBS_API}?action=upload_photo`, {
          user_type:    'sitter',
          user_id:      user.id,
          image_base64: b64,
        });
        if (uploadRes.data?.success) {
          const filename = uploadRes.data.data?.filename;
          if (filename) {
            // Keep global user in sync so the image persists across screens
            (global as any).currentUser = { ...(global as any).currentUser, image: filename };
          }
          Alert.alert('Photo Updated', 'Your profile photo has been updated!');
        } else {
          Alert.alert('Upload Failed', uploadRes.data?.error || 'Could not upload photo. Please try again.');
        }
      } catch (e) {
        console.warn('Photo upload error:', e);
        Alert.alert('Upload Error', 'Could not upload photo. Check your connection and try again.');
      }
    }
  };

  const countColor = countdown > 30 ? '#1A7F6E' : countdown > 10 ? '#F5A623' : '#BF3B2E';
  const progWidth  = progAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER — shows profile photo, not logo */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          {/* Profile photo with camera tap */}
          <TouchableOpacity onPress={pickPhoto} style={s.avatarWrap} activeOpacity={0.85}>
            {profilePhoto || user.image ? (
              <Image
                source={{ uri: profilePhoto || `https://sitters4me.com/uploads/${user.image}` }}
                style={s.avatarImg}
              />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.cameraBadge}>
              <Text style={{ fontSize: 10 }}>📷</Text>
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>Hi {user.fname || 'Sitter'}!</Text>
            <Text style={s.greetingSub}>
              {isOnline ? '🟢 Online — receiving job requests' : '⚫ Offline — tap to go online'}
            </Text>
          </View>

          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => Alert.alert(
              'Settings',
              `Hi ${user.fname || 'there'}! Manage your account.`,
              [
                { text: '✏️ Edit Profile',       onPress: () => router.push('/sitter-profile-edit') },
                { text: '💰 My Earnings',        onPress: () => router.push('/sitter-earnings') },
                { text: '🏦 Direct Deposit',     onPress: () => router.push('/sitter-bank-setup') },
                { text: '🚪 Log Out', style: 'destructive', onPress: () => {
                    global.currentUser  = null;
                    global.activeJob    = null;
                    (global as any).sitterOnline = false;
                    clearInterval(pollRef.current);
                    router.replace('/');
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            )}
          >
            <Text style={{ fontSize: 22 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ACTIVE JOB RETURN BANNER */}
      {hasActiveJob && (
        <TouchableOpacity
          style={s.activeJobBanner}
          onPress={() => router.push('/active-job')}
          activeOpacity={0.85}
        >
          <View style={s.activeJobBannerDot} />
          <Text style={s.activeJobBannerText}>⏱ Job in progress · Tap to return</Text>
          <Text style={s.activeJobBannerChevron}>›</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ONLINE TOGGLE */}
        <View style={[s.onlineCard, isOnline && s.onlineCardOn]}>
          <View style={s.onlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.onlineTitle}>
                {isOnline ? '🟢 You are Online' : '⚫ You are Offline'}
              </Text>
              <Text style={s.onlineSub}>
                {isOnline
                  ? `Parents within ${user.work_distance || 10} miles can send you real-time job requests`
                  : 'Toggle on to start receiving job requests from nearby parents'}
              </Text>
            </View>
            {toggling
              ? <ActivityIndicator color="#02A4E2" style={{ marginLeft: 12 }} />
              : <Switch
                  value={isOnline}
                  onValueChange={toggleOnline}
                  trackColor={{ false: '#D1D5DB', true: '#02A4E2' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D1D5DB"
                  style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
                />
            }
          </View>

          {isOnline && (
            <>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={s.statN}>{user.work_distance || 10}</Text>
                  <Text style={s.statL}>mile radius</Text>
                </View>
                <View style={s.statDiv} />
                <View style={s.stat}>
                  <Text style={s.statN}>${user.minrate || 15}</Text>
                  <Text style={s.statL}>min/hr</Text>
                </View>
                <View style={s.statDiv} />
                <View style={s.stat}>
                  <Text style={s.statN}>${user.maxrate || 25}</Text>
                  <Text style={s.statL}>max/hr</Text>
                </View>
              </View>
              <View style={s.waitBox}>
                <ActivityIndicator color="#02A4E2" size="small" />
                <Text style={s.waitText}>Waiting for job requests from nearby parents...</Text>
              </View>
            </>
          )}
        </View>

        {/* PROFILE CARD */}
        <View style={s.profileCard}>
          <View style={s.profileCardHeader}>
            <Text style={s.sectionTitle}>My Profile</Text>
            <TouchableOpacity onPress={() => router.push('/sitter-profile-edit')}>
              <Text style={s.editLink}>✏️ Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={s.profileItems}>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>📍</Text>
              <Text style={s.profileItemVal}>{user.city || '—'}{user.state ? ', ' + user.state : ''}</Text>
            </View>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>💰</Text>
              <Text style={s.profileItemVal}>${user.minrate || '—'}–${user.maxrate || '—'}/hr</Text>
            </View>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>📏</Text>
              <Text style={s.profileItemVal}>{user.work_distance || 10} mi travel</Text>
            </View>
          </View>
          <TouchableOpacity style={s.photoRow} onPress={pickPhoto} activeOpacity={0.85}>
            <Text style={s.photoRowText}>📷  Tap to update your profile photo</Text>
          </TouchableOpacity>
        </View>

        {/* UPCOMING SCHEDULED JOBS */}
        {upcomingJobs.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Upcoming Appointments</Text>
            {upcomingJobs.map((job: any) => {
              const dt = job.scheduled_time ? new Date(job.scheduled_time) : null;
              const ages: number[] = Array.isArray(job.children_ages) ? job.children_ages : [];
              const agesStr = ages.length > 0
                ? ages.map((a: number) => a === 0 ? 'Infant' : `${a}yr`).join(', ')
                : null;
              const dur = job.duration_hours ? `${job.duration_hours}hr` : null;
              const minsUntil  = dt ? Math.round((dt.getTime() - Date.now()) / 60000) : null;
              const canBegin   = minsUntil !== null && minsUntil <= 45;
              const timeLabel  = minsUntil === null ? null
                : minsUntil <= 0  ? '🟢 Time to go!'
                : minsUntil < 60  ? `⏰ In ${minsUntil} min`
                : `⏰ In ${Math.round(minsUntil / 60)} hr${Math.round(minsUntil / 60) !== 1 ? 's' : ''}`;
              return (
                <View key={`${job.id}-${tick}`} style={s.upcomingCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={s.upcomingDateBox}>
                      <Text style={s.upcomingDateMon}>{dt ? dt.toLocaleDateString('en-US', { month: 'short' }) : '—'}</Text>
                      <Text style={s.upcomingDateDay}>{dt ? dt.getDate() : '—'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.upcomingTitle}>{job.parent_name || 'Parent'}</Text>
                      <Text style={s.upcomingSub}>
                        {dt ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                        {dur ? `  ·  ${dur}` : ''}
                      </Text>
                    </View>
                    <Text style={s.upcomingRate}>${job.rate || '—'}/hr</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <View style={s.upcomingChip}><Text style={s.upcomingChipText}>🍼 {job.kids || 1} child{(job.kids || 1) !== 1 ? 'ren' : ''}</Text></View>
                    {agesStr && <View style={s.upcomingChip}><Text style={s.upcomingChipText}>Ages: {agesStr}</Text></View>}
                    {job.city && <View style={s.upcomingChip}><Text style={s.upcomingChipText}>📍 {job.city}</Text></View>}
                    {timeLabel && <View style={s.upcomingChip}><Text style={s.upcomingChipText}>{timeLabel}</Text></View>}
                  </View>
                  {!!job.notes && <Text style={s.upcomingNotes}>📝 {job.notes}</Text>}

                  {canBegin ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        global.activeJob = { job_id: job.id, id: job.id, ...job };
                        router.push('/active-job');
                      }}
                    >
                      <LinearGradient
                        colors={['#16A34A', '#1A7F6E']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={s.beginJobBtn}
                      >
                        <Text style={s.beginJobText}>🚗  I'm On My Way — Begin Job</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.beginJobBtnDisabled}>
                      <Text style={s.beginJobTextDisabled}>🔒  Unlocks 45 min before appointment</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* QUICK ACTIONS */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickRow}>
          {[
            { icon: '📅', label: 'Availability', action: () => router.push('/sitter-availability') },
            { icon: '💰', label: 'Earnings',     action: () => router.push('/sitter-earnings') },
            { icon: '💼', label: 'Job History',  action: () => router.push('/sitter-earnings') },
          ].map((q, i) => (
            <TouchableOpacity
              key={i}
              style={s.quickBtn}
              onPress={q.action}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 28 }}>{q.icon}</Text>
              <Text style={s.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* JOB REQUEST POPUP — ONLY shows when parent presses "Request Now" and API sends a job */}
      {showModal && incomingJob && incomingJob.is_scheduled && (
        /* ── SCHEDULED BOOKING REQUEST MODAL (no countdown) ── */
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalBody}>
              <Text style={s.modalTitle}>📅 Booking Request</Text>
              <Text style={s.schedReqBadge}>Future Appointment</Text>
              {(() => {
                const dt = incomingJob.scheduled_time ? new Date(incomingJob.scheduled_time) : null;
                const dateStr = dt
                  ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                  : '—';
                const timeStr = dt
                  ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                  : '—';
                const ages: number[] = Array.isArray(incomingJob.children_ages) ? incomingJob.children_ages : [];
                const kidCount = incomingJob.kids || ages.length || 1;
                const ageStr = ages.length
                  ? ages.map((a: number) => a === 0 ? 'Infant' : `${a}yr`).join(', ')
                  : null;
                const rows = [
                  ['Parent',    incomingJob.parent_name || 'Parent'],
                  ['Date',      dateStr],
                  ['Time',      timeStr],
                  ['Duration',  `${incomingJob.duration_hours || 2} hrs`],
                  ['Children',  ageStr ? `${kidCount} (${ageStr})` : `${kidCount}`],
                  ['Location',  `${incomingJob.city || ''}, ${incomingJob.state || ''}`],
                  ['Your rate', `$${incomingJob.rate}/hr`],
                ];
                return (
                  <View style={s.jobDetails}>
                    {rows.map(([label, val]) => (
                      <View key={label} style={s.detailRow}>
                        <Text style={s.detailLabel}>{label}</Text>
                        <Text style={s.detailValue}>{val}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
              {incomingJob.notes ? (
                <Text style={s.schedReqNotes}>📝 {incomingJob.notes}</Text>
              ) : null}
              <View style={s.btnRow}>
                <TouchableOpacity style={[s.btn, s.btnDecline]} onPress={handleDeclineScheduled} activeOpacity={0.85}>
                  <Text style={s.btnDeclineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnAccept]} onPress={handleAcceptScheduled} activeOpacity={0.85}>
                  <LinearGradient colors={['#16A34A','#15803D']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                    <Text style={s.btnAcceptText}>Accept Booking</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {showModal && incomingJob && !incomingJob.is_scheduled && (
        /* ── LIVE JOB REQUEST MODAL (60-second countdown) ── */
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.progTrack}>
              <Animated.View style={[s.progBar, { width: progWidth, backgroundColor: countColor }]} />
            </View>
            <View style={s.modalBody}>
              <Text style={s.modalTitle}>🔔 New Job Request!</Text>
              <View style={[s.countRing, { borderColor: countColor }]}>
                <Text style={[s.countNum, { color: countColor }]}>{countdown}</Text>
                <Text style={s.countSec}>sec</Text>
              </View>
              <Text style={s.countHint}>Respond before the timer runs out</Text>
              <View style={s.jobDetails}>
                {(() => {
                  const ages: number[] = Array.isArray(incomingJob.children_ages) ? incomingJob.children_ages : [];
                  const kidCount = incomingJob.kids || ages.length || 1;
                  const agesStr = ages.length > 0
                    ? ages.map((a: number) => a === 0 ? 'Infant' : `${a} yr${a !== 1 ? 's' : ''}`).join(', ')
                    : null;
                  const childrenValue = agesStr
                    ? `${kidCount} child${kidCount !== 1 ? 'ren' : ''} · ${agesStr}`
                    : `${kidCount} child${kidCount !== 1 ? 'ren' : ''}`;
                  return [
                    ['Parent',   incomingJob.parent_name || 'Parent'],
                    ['Location', `${incomingJob.city || ''}, ${incomingJob.state || ''}`],
                    ['Children', childrenValue],
                    ['Rate',     `$${incomingJob.rate || user.minrate || 15}/hr`],
                  ].map(([label, value]) => (
                    <View key={label} style={s.detailRow}>
                      <Text style={s.detailLabel}>{label}</Text>
                      <Text style={[
                        s.detailValue,
                        label === 'Rate' && { color: '#02A4E2', fontWeight: '800', fontSize: 18 },
                        label === 'Children' && { flexShrink: 1, textAlign: 'right', maxWidth: '65%' },
                      ]}>{value}</Text>
                    </View>
                  ));
                })()}
              </View>
              <View style={s.modalActions}>
                <TouchableOpacity style={s.declineBtn} onPress={handleDecline} activeOpacity={0.85}>
                  <Text style={s.declineBtnText}>✕  Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 2 }} onPress={handleAccept} activeOpacity={0.85}>
                  <LinearGradient
                    colors={['#02A4E2', '#0270C8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.acceptBtn}
                  >
                    <Text style={s.acceptBtnText}>✓  Accept Job</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F5F4F0' },
  header:          { paddingBottom: 20 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 12 },
  avatarWrap:      { position: 'relative' },
  avatarImg:       { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.8)' },
  avatarFallback:  { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  avatarInitials:  { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  cameraBadge:     { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
  greeting:        { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },
  greetingSub:     { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  settingsBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  activeJobBanner:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16A34A', paddingVertical: 12, paddingHorizontal: 18, gap: 10 },
  activeJobBannerDot:     { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFFFFF', opacity: 0.9 },
  activeJobBannerText:    { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  activeJobBannerChevron: { fontSize: 22, color: 'rgba(255,255,255,0.8)', fontWeight: '300' },
  scroll:          { flex: 1, marginTop: -16 },
  content:         { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 48, gap: 16 },
  onlineCard:      { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  onlineCardOn:    { borderColor: '#02A4E2', backgroundColor: 'rgba(2,164,226,0.03)' },
  onlineRow:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  onlineTitle:     { fontSize: 15, fontWeight: '700', color: '#0F1117' },
  onlineSub:       { fontSize: 13, color: '#5A5F72', marginTop: 2, lineHeight: 18 },
  statsRow:        { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(2,164,226,0.2)' },
  stat:            { flex: 1, alignItems: 'center' },
  statN:           { fontSize: 22, fontWeight: '900', color: '#02A4E2' },
  statL:           { fontSize: 11, color: '#9B9FAE', marginTop: 2 },
  statDiv:         { width: 1, backgroundColor: 'rgba(2,164,226,0.2)' },
  waitBox:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(2,164,226,0.15)' },
  waitText:        { fontSize: 13, color: '#02A4E2', fontWeight: '600', flex: 1 },
  profileCard:     { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  profileCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:    { fontSize: 17, fontWeight: '800', color: '#0F1117', letterSpacing: -0.2 },
  editLink:        { color: '#C93488', fontSize: 13, fontWeight: '700' },
  profileItems:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  profileItem:     { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#F5F4F0', borderRadius: 10, padding: 10 },
  profileItemIcon: { fontSize: 20 },
  profileItemVal:  { fontSize: 11, color: '#5A5F72', textAlign: 'center', fontWeight: '600' },
  photoRow:        { backgroundColor: '#F5F4F0', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E2DA' },
  photoRowText:    { fontSize: 13, fontWeight: '600', color: '#5A5F72' },
  upcomingCard:    { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: 'rgba(2,164,226,0.25)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  upcomingDateBox: { width: 48, alignItems: 'center', backgroundColor: '#E8F6FD', borderRadius: 10, paddingVertical: 6 },
  upcomingDateMon: { fontSize: 11, fontWeight: '700', color: '#02A4E2', textTransform: 'uppercase' },
  upcomingDateDay: { fontSize: 22, fontWeight: '900', color: '#02A4E2', lineHeight: 26 },
  upcomingTitle:   { fontSize: 15, fontWeight: '800', color: '#0F1117' },
  upcomingSub:     { fontSize: 12, color: '#5A5F72', marginTop: 2 },
  upcomingRate:    { fontSize: 16, fontWeight: '900', color: '#02A4E2' },
  upcomingChip:    { backgroundColor: '#F5F4F0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  upcomingChipText:{ fontSize: 12, fontWeight: '600', color: '#5A5F72' },
  upcomingNotes:       { marginBottom: 10, fontSize: 12, color: '#5A5F72', fontStyle: 'italic', lineHeight: 18 },
  beginJobBtn:         { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  beginJobText:        { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  beginJobBtnDisabled: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F5F4F0', borderWidth: 1, borderColor: '#E5E2DA' },
  beginJobTextDisabled:{ color: '#9B9FAE', fontSize: 13, fontWeight: '600' },
  quickRow:        { flexDirection: 'row', gap: 10 },
  quickBtn:        { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  quickLabel:      { fontSize: 11, fontWeight: '600', color: '#5A5F72', textAlign: 'center' },
  overlay:         { position: 'absolute', inset: 0, backgroundColor: 'rgba(15,17,23,0.75)', justifyContent: 'flex-end' },
  modal:           { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  progTrack:       { height: 5, backgroundColor: '#EEECE7' },
  progBar:         { height: 5 },
  modalBody:       { padding: 24, paddingBottom: 40, alignItems: 'center' },
  modalTitle:      { fontSize: 26, fontWeight: '900', color: '#0F1117', marginBottom: 16, letterSpacing: -0.5 },
  countRing:       { width: 100, height: 100, borderRadius: 50, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  countNum:        { fontSize: 36, fontWeight: '900' },
  countSec:        { fontSize: 12, color: '#9B9FAE', marginTop: -4 },
  countHint:       { fontSize: 13, color: '#5A5F72', marginBottom: 20 },
  jobDetails:      { alignSelf: 'stretch', marginBottom: 20 },
  detailRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.07)' },
  detailLabel:     { fontSize: 13, color: '#9B9FAE', fontWeight: '600' },
  detailValue:     { fontSize: 14, color: '#0F1117', fontWeight: '600' },
  modalActions:    { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  declineBtn:      { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BF3B2E' },
  declineBtnText:  { color: '#BF3B2E', fontSize: 15, fontWeight: '700' },
  acceptBtn:       { borderRadius: 10, padding: 14, alignItems: 'center' },
  acceptBtnText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  // Scheduled booking request modal
  schedReqBadge:   { fontSize: 12, fontWeight: '700', color: '#9B5BAB', backgroundColor: '#F3EAFA', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 16, overflow: 'hidden' },
  schedReqNotes:   { alignSelf: 'stretch', fontSize: 13, color: '#5A5F72', fontStyle: 'italic', marginBottom: 16, lineHeight: 18 },
  btnRow:          { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn:             { flex: 1, borderRadius: 12, overflow: 'hidden' },
  btnDecline:      { borderWidth: 1.5, borderColor: '#BF3B2E', alignItems: 'center', justifyContent: 'center', padding: 14 },
  btnDeclineText:  { color: '#BF3B2E', fontSize: 15, fontWeight: '700' },
  btnAccept:       { flex: 2 },
  btnGrad:         { padding: 14, alignItems: 'center' },
  btnAcceptText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
