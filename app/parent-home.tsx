// app/parent-home.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Dimensions, ActivityIndicator,
  Animated, Image, Modal, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';

const { height } = Dimensions.get('window');
const JOBS_API    = 'https://sitters4me.com/api/jobs.php';

export default function ParentHome() {
  const router    = useRouter();
  const mapRef    = useRef<MapView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<any>(null);
  const pollRef        = useRef<any>(null);
  const sitterPollRef  = useRef<any>(null);
  const upcomingPollRef = useRef<any>(null);
  const searchActiveRef = useRef(false);
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  // Default to Houston; overridden as soon as GPS resolves
  const DEFAULT_LOC = { latitude: 29.7604, longitude: -95.3698 };
  const locRef = useRef<any>((global as any).lastParentLoc || DEFAULT_LOC); // always current — avoids stale closure in setInterval
  const [loc, setLoc]                       = useState<any>((global as any).lastParentLoc || DEFAULT_LOC);
  const [locLoading, setLocLoading]         = useState(false); // map shows immediately
  const [onlineSitters, setOnlineSitters]   = useState<any[]>([]);
  const [sittersLoading, setSittersLoading] = useState(false);
  const [selected, setSelected]             = useState<any>(null);
  // Specialization filters
  const [filterCpr,          setFilterCpr]          = useState(false);
  const [filterInfant,       setFilterInfant]       = useState(false);
  const [filterSpecialNeeds, setFilterSpecialNeeds] = useState(false);
  const [filterMultilingual, setFilterMultilingual] = useState(false);
  const [requesting, setRequesting]         = useState(false);
  const [requestSent, setRequestSent]       = useState(false);
  const [queue, setQueue]                   = useState<any[]>([]);
  const [activeJobId, setActiveJobId]       = useState<number>(0);
  const activeJobIdRef                      = useRef<number>(0);
  const [profilePhoto, setProfilePhoto]     = useState<string | null>(null);
  const [hasActiveJob, setHasActiveJob]     = useState(false);
  const [unreadCount, setUnreadCount]       = useState(0);
  const chatPollRef                         = useRef<any>(null);

  // Re-check for an active job every time this screen gains focus
  useFocusEffect(
    useCallback(() => {
      const aj = (global as any).activeJob;
      setHasActiveJob(!!(aj?.job_id));
      // Reset so the scheduled-job redirect can fire again after returning from job-accepted
      if (!aj?.job_id) scheduledActiveRef.current = false;
    }, [])
  );

  // ── Children details pre-booking modal ────────────────────
  const [showChildrenModal, setShowChildrenModal] = useState(false);
  const [numKids, setNumKids]                     = useState(1);
  const [childAges, setChildAges]                 = useState<number[]>([1]);

  const updateNumKids = (n: number) => {
    const clamped = Math.max(1, Math.min(8, n));
    setNumKids(clamped);
    setChildAges(prev => {
      const next = [...prev];
      while (next.length < clamped) next.push(1);
      return next.slice(0, clamped);
    });
  };
  const updateChildAge = (idx: number, age: number) => {
    setChildAges(prev => {
      const next = [...prev];
      next[idx] = Math.max(0, Math.min(17, age));
      return next;
    });
  };
  const ageLabel = (age: number) => age === 0 ? 'Infant' : `${age} yr${age !== 1 ? 's' : ''}`;

  // ── Schedule / Future appointment state ───────────────────
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedDate, setSchedDate]                 = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d;
  });
  const [schedTime, setSchedTime]                 = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d;
  });
  const [schedPickerMode, setSchedPickerMode]     = useState<'date'|'time'>('date');
  const [schedPickerVisible, setSchedPickerVisible] = useState(false);
  const [scheduling, setScheduling]               = useState(false);
  const [schedDuration, setSchedDuration]         = useState(2);       // hours
  const [schedNotes, setSchedNotes]               = useState('');
  const [schedKids, setSchedKids]                 = useState<number>(() => Number(global.currentUser?.kids) || 1);
  const [schedAges, setSchedAges]                 = useState<number[]>(() => Array(Number(global.currentUser?.kids) || 1).fill(3));
  const setSchedAge = (idx: number, age: number) =>
    setSchedAges(prev => { const n = [...prev]; n[idx] = Math.max(0, Math.min(17, age)); return n; });
  const setSchedKidsCount = (n: number) => {
    const k = Math.max(1, Math.min(8, n));
    setSchedKids(k);
    setSchedAges(prev => {
      const next = [...prev];
      while (next.length < k) next.push(3);
      return next.slice(0, k);
    });
  };
  const DURATIONS = [1, 1.5, 2, 3, 4, 5, 6, 8];

  const user         = global.currentUser || {};
  const RADIUS_MILES = user.search_radius || 10;
  const RADIUS_M     = RADIUS_MILES * 1609.34;
  const initials     = `${(user.fname || '?')[0]}${(user.lname || '?')[0]}`.toUpperCase();

  useEffect(() => {
    getLocation();
    // Load sitters immediately with default/cached loc, refine when GPS resolves
    loadOnlineSitters();
    // Auto-refresh nearby sitters every 10 seconds
    sitterPollRef.current = setInterval(() => {
      if (!searchActiveRef.current) {
        loadOnlineSitters(undefined, true); // silent — no loading flash
      }
    }, 10000);
    // Load upcoming scheduled jobs and refresh every 30s
    loadUpcoming();
    upcomingPollRef.current = setInterval(loadUpcoming, 30000);
    return () => {
      pulseLoop.current?.stop?.();
      clearInterval(pollRef.current);
      clearInterval(sitterPollRef.current);
      clearInterval(upcomingPollRef.current);
    };
  }, []);

  // Poll for unread chat messages while an active job exists
  useEffect(() => {
    if (!hasActiveJob) {
      setUnreadCount(0);
      clearInterval(chatPollRef.current);
      return;
    }
    const jobId = (global as any).activeJob?.job_id || (global as any).activeJob?.id;
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await axios.post(`${JOBS_API}?action=get_unread_count`, {
          job_id: jobId, viewer_type: 'parent',
        });
        if (res.data?.success) setUnreadCount(res.data.data?.unread || 0);
      } catch {}
    };
    poll();
    chatPollRef.current = setInterval(poll, 5000);
    return () => clearInterval(chatPollRef.current);
  }, [hasActiveJob]);

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return; // keep default loc, map already showing

      // Step 1: get last-known position instantly (no GPS cold-start wait)
      const last = await Location.getLastKnownPositionAsync({});
      if (last) {
        const newLoc = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        locRef.current = newLoc;
        setLoc(newLoc);
        (global as any).lastParentLoc = newLoc;
        loadOnlineSitters(newLoc, true); // silent refresh with better position
        // Animate map to real location
        mapRef.current?.animateToRegion({
          ...newLoc, latitudeDelta: 0.05, longitudeDelta: 0.05,
        }, 600);
      }

      // Step 2: get precise fix in background (Balanced = fast, ~2-3s vs 10s for High)
      const precise = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const preciseLoc = { latitude: precise.coords.latitude, longitude: precise.coords.longitude };
      locRef.current = preciseLoc;
      setLoc(preciseLoc);
      (global as any).lastParentLoc = preciseLoc;
      loadOnlineSitters(preciseLoc);
      mapRef.current?.animateToRegion({
        ...preciseLoc, latitudeDelta: 0.05, longitudeDelta: 0.05,
      }, 600);
    } catch { /* keep default */ }
  };

  // Fetch online sitters — silent=true skips loading spinner (used for background polls)
  const loadOnlineSitters = async (
    useLoc?: { latitude: number; longitude: number },
    silent = false
  ) => {
    const position = useLoc || locRef.current;
    if (!position) return;
    if (!silent) setSittersLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=nearby_sitters`, {
        lat:    position.latitude,
        lng:    position.longitude,
        radius: RADIUS_MILES,
      });
      if (res.data?.success) {
        setOnlineSitters(res.data.data || []);
      }
      // On failure keep previous list — don't wipe on a bad poll
    } catch {
      // Network error — keep previous list
    } finally {
      if (!silent) setSittersLoading(false);
    }
  };

  const cancelReq = async () => {
    pulseLoop.current?.stop?.();
    pulseAnim.setValue(1);
    clearInterval(pollRef.current);
    pollRef.current = null;
    searchActiveRef.current = false;
    setRequesting(false);
    setRequestSent(false);
    setQueue([]);
    // Tell the server so the sitter's countdown dismisses immediately
    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = 0;
    setActiveJobId(0);
    if (jobId) {
      try {
        await axios.post(`${JOBS_API}?action=cancel_request`, {
          job_id:    jobId,
          parent_id: user.id,
        });
      } catch {}
    }
  };

  // ── UPCOMING SCHEDULED JOBS ──────────────────────────────────
  const scheduledActiveRef = useRef(false); // prevent double-navigate
  const loadUpcoming = async () => {
    if (!user.id) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=get_parent_scheduled`, { parent_id: user.id });
      if (!res.data?.success) return;
      const jobs: any[] = res.data.data || [];

      // Detect if any scheduled job has gone live (sitter on way / job started)
      const activeStatuses = ['sitter arrived', 'in progress'];
      const liveJob = jobs.find(j => activeStatuses.includes((j.status || '').toLowerCase()));
      if (liveJob && !scheduledActiveRef.current && !(global as any).activeJob) {
        scheduledActiveRef.current = true;
        (global as any).activeJob = {
          job_id:      liveJob.id,
          sitter_id:   liveJob.sitter_id || 0,
          sitter_name: liveJob.sitter_name || '',
        };
        setHasActiveJob(true);
        router.push('/job-accepted');
        return;
      }

      // Only show truly upcoming (not active) jobs in the list
      setUpcomingJobs(jobs.filter(j => !activeStatuses.includes((j.status || '').toLowerCase())));
    } catch {}
  };

  const cancelScheduledJob = (jobId: number) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this scheduled appointment?',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel', style: 'destructive',
          onPress: async () => {
            try {
              const res = await axios.post(`${JOBS_API}?action=cancel_scheduled`, {
                job_id: jobId, parent_id: user.id,
              });
              if (res.data?.success) {
                setUpcomingJobs(prev => prev.filter(j => j.id !== jobId));
              } else {
                Alert.alert('Error', res.data?.error || 'Could not cancel. Please try again.');
              }
            } catch {
              Alert.alert('Connection Error', 'Could not reach the server. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── SCHEDULE FUTURE APPOINTMENT ─────────────────────────────
  const scheduleAppointment = async () => {
    const combined = new Date(schedDate);
    combined.setHours(schedTime.getHours(), schedTime.getMinutes(), 0, 0);
    if (combined.getTime() <= Date.now() + 60 * 60 * 1000) {
      return Alert.alert('Too Soon', 'Appointment must be at least 1 hour from now. For immediate help tap "Request Now" instead.');
    }
    if (!loc) return Alert.alert('Location Required', 'Please enable location first.');
    setScheduling(true);
    try {
      const bookAgain = (global as any)._bookAgainSitterId || null;
      const res = await axios.post(`${JOBS_API}?action=schedule_job`, {
        parent_id:           user.id || 1,
        scheduled_time:      combined.toISOString(),
        kids:                schedKids,
        children_ages:       schedAges.slice(0, schedKids),
        duration_hours:      schedDuration,
        lat:                 loc.latitude,
        lng:                 loc.longitude,
        address:             user.address || 'Home',
        notes:               schedNotes.trim() || null,
        preferred_sitter_id: bookAgain,
      });
      (global as any)._bookAgainSitterId = null;
      setShowScheduleModal(false);
      setSchedNotes('');
      if (res.data?.success) {
        loadUpcoming(); // refresh upcoming list
        const durStr = schedDuration === 1 ? '1 hour' : `${schedDuration} hours`;
        Alert.alert(
          '📅 Appointment Scheduled!',
          `Booked for:\n${res.data.data?.formatted || combined.toLocaleString()}\n\nDuration: ${durStr} · ${schedKids} child${schedKids !== 1 ? 'ren' : ''}\n\nAvailable sitters will be notified 30 minutes before your appointment.`,
          [{ text: 'Great! 🎉' }]
        );
      } else {
        Alert.alert('Error', res.data?.error || 'Could not schedule. Please try again.');
      }
    } catch {
      Alert.alert('Connection Error', 'Could not reach the server. Please check your connection.');
    } finally {
      setScheduling(false);
    }
  };

  // ── OPEN children modal before booking ───────────────────────
  const openBookingModal = () => {
    if (hasActiveJob) {
      return Alert.alert(
        'Active Job In Progress',
        'You already have a babysitter booked. Please complete or cancel your current job before requesting a new one.',
        [
          { text: 'Return to Job', onPress: () => router.push('/job-accepted') },
          { text: 'Dismiss', style: 'cancel' },
        ]
      );
    }
    if (!loc) return Alert.alert('Location Required', 'Please enable location to request a sitter.');
    setShowChildrenModal(true);
  };

  // ── MAIN REQUEST FLOW — called after children modal confirmed ─
  const requestNow = async (kidsCount: number, ages: number[]) => {
    setShowChildrenModal(false);
    if (!loc) return Alert.alert('Location Required', 'Please enable location to request a sitter.');

    // ── REQUIRE PAYMENT METHOD BEFORE BOOKING ─────────────────
    const hasCard = !!(user.stripe_customer_id);
    if (!hasCard) {
      // Double-check via API in case it was just added
      try {
        const pm = await axios.post('https://sitters4me.com/api/stripe.php?action=get_payment_method', {
          parent_id: user.id,
        });
        if (!pm.data?.data?.has_card) {
          return Alert.alert(
            '💳 Payment Method Required',
            'You need to add a credit or debit card before requesting a sitter.\n\nSitters are automatically paid when the job ends — no action needed from you during the job.',
            [
              { text: 'Add Card Now', onPress: () => router.push('/parent-payment-settings') },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }
        // Card confirmed — store so we don't check again this session
        global.currentUser = { ...global.currentUser, stripe_customer_id: pm.data.data.customer_id || 'confirmed' };
      } catch {
        // API error — allow booking but warn
      }
    }

    if (onlineSitters.length === 0) {
      return Alert.alert(
        'No Sitters Online',
        `No babysitters are currently online within ${RADIUS_MILES} miles of your location.\n\nPlease try again later or tap "Schedule" to book for a future time.`
      );
    }

    setRequesting(true);
    searchActiveRef.current = true;    // pause auto-refresh while searching
    setSelected(null);
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.28, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
    try {
      // Pick up preferred sitter set from "Request Now" on sitter profile
      const preferredId = (global as any).requestSitterOnReturn?.id || null;
      (global as any).requestSitterOnReturn = null;

      const res = await axios.post(`${JOBS_API}?action=request_live`, {
        parent_id:            user.id || 1,
        lat:                  loc.latitude,
        lng:                  loc.longitude,
        radius:               RADIUS_MILES,
        kids:                 kidsCount,
        children_ages:        ages,
        address:              'Current location',
        ...(preferredId ? { preferred_sitter_id: preferredId } : {}),
      });

      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);

      if (!res.data?.success)
        return Alert.alert('Error', res.data?.error || 'Could not send request. Please try again.');

      const data = res.data.data;
      if (!data?.sitters_found || data.sitters_found === 0) {
        return Alert.alert(
          'No Sitters Available',
          'All nearby sitters are busy or unavailable right now. Please try again in a few minutes.'
        );
      }

      const jobId = data.job_id;
      activeJobIdRef.current = jobId;
      setActiveJobId(jobId);
      setQueue(data.queue || []);
      setRequestSent(true);

      // Poll every 3s — use ref so closure always has current job_id
      pollRef.current = setInterval(async () => {
        const jid = activeJobIdRef.current;
        if (!jid) return;
        try {
          const sr = await axios.post(`${JOBS_API}?action=job_status`, { job_id: jid });
          const d = sr.data?.data;
          // Check all possible accepted states
          const accepted = d?.assigned === true ||
                           d?.assigned === 1 ||
                           d?.status === 'Sitter hired' ||
                           d?.status === 'Sitter offered' ||
                           d?.status === 'In progress' ||
                           (d?.sitter_id && parseInt(d.sitter_id) > 0);
          if (accepted) {
            clearInterval(pollRef.current);
            clearInterval(sitterPollRef.current); // stop map refresh — no longer needed
            pollRef.current = null;
            activeJobIdRef.current = 0;
            searchActiveRef.current = false;
            setRequestSent(false);
            setActiveJobId(0);
            // Store full sitter info for job-accepted screen
            global.activeJob = {
              job_id:      jid,
              sitter_id:   d.sitter_id,
              sitter_name: d.sitter_name || (d.sitter_fname + ' ' + (d.sitter_lname||'')).trim(),
              job_data:    d,
            };
            router.push('/job-accepted');
          } else if (d?.status === 'Closed' || d?.status === 'Cancelled') {
            // All sitters declined or timed out — reset so parent can try again
            clearInterval(pollRef.current);
            clearInterval(sitterPollRef.current);
            pollRef.current = null;
            activeJobIdRef.current = 0;
            searchActiveRef.current = false;
            pulseLoop.current?.stop?.();
            pulseAnim.setValue(1);
            setRequesting(false);
            setRequestSent(false);
            setActiveJobId(0);
            Alert.alert(
              'No Sitters Available',
              'All nearby sitters declined or didn\'t respond. Please try again in a few minutes.',
              [{ text: 'OK' }]
            );
          }
        } catch {
          // network hiccup — keep polling
        }
      }, 3000);

    } catch {
      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);
      Alert.alert('Connection Error', 'Could not reach the server. Please check your internet connection.');
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
        const response = await fetch(asset.uri);
        const blob     = await response.blob();
        const reader   = new FileReader();
        const b64: string = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror   = reject;
          reader.readAsDataURL(blob);
        });
        const pid = Number(user.id) || Number((user as any).u_id) || 0;
        const uploadRes = await axios.post(`${JOBS_API}?action=upload_photo`, {
          user_type:    'parent',
          user_id:      pid,
          image_base64: b64,
        });
        if (uploadRes.data?.success) {
          const filename = uploadRes.data.data?.filename;
          if (filename) {
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

  // Expose booking trigger so sitter-profile-view can call back into this screen
  useEffect(() => {
    (global as any).triggerBooking = () => openBookingModal();
    return () => { (global as any).triggerBooking = null; };
  }, [loc, onlineSitters]);

  // Auto-open schedule modal when returning from "Book Again"
  useEffect(() => {
    const bookAgain = (global as any).bookAgainSitter;
    if (bookAgain) {
      (global as any).bookAgainSitter = null;
      // Small delay so the screen fully mounts before opening modal
      setTimeout(() => {
        setShowScheduleModal(true);
      }, 400);
    }
  }, []);

  const focusSitter = (st: any) => {
    setSelected(st);
    mapRef.current?.animateToRegion({
      latitude:      parseFloat(st.latitude)  - 0.003,
      longitude:     parseFloat(st.longitude),
      latitudeDelta: 0.02, longitudeDelta: 0.02,
    }, 600);
  };

  const viewSitterProfile = (st: any) => {
    (global as any).viewSitter = st;
    router.push('/sitter-profile-view');
  };

  const dismissSitter = () => {
    setSelected(null);
    if (loc) mapRef.current?.animateToRegion({
      latitude: loc.latitude, longitude: loc.longitude,
      latitudeDelta: 0.05,    longitudeDelta: 0.05,
    }, 500);
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER — profile photo, not logo */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
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
            <View style={s.cameraBadge}><Text style={{ fontSize: 10 }}>📷</Text></View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>Hi {user.fname || 'there'}! 👋</Text>
            <Text style={s.greetingSub}>
              {sittersLoading
                ? 'Checking for nearby sitters...'
                : onlineSitters.length > 0
                  ? `${onlineSitters.length} sitter${onlineSitters.length !== 1 ? 's' : ''} online nearby · live`
                  : 'No sitters online right now'}
            </Text>
          </View>

          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => Alert.alert(
              'Settings',
              `Hi ${user.fname || 'there'}! Manage your account.`,
              [
                { text: '👤 Edit Profile',      onPress: () => router.push('/parent-profile-edit') },
                { text: '🔍 Browse Sitters',   onPress: () => router.push('/sitter-browse') },
                { text: '⭐ My Favorites',      onPress: () => router.push('/parent-favorites') },
                { text: '💳 Payment Settings', onPress: () => router.push('/parent-payment-settings') },
                { text: '🚪 Log Out', style: 'destructive', onPress: () => {
                    global.currentUser = null;
                    global.activeJob   = null;
                    router.replace('/');
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ],
              { cancelable: true }
            )}
          >
            <Text style={{ fontSize: 22 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* MAP — shows immediately; GPS refines in background */}
      {/* ACTIVE JOB RETURN BANNER */}
      {hasActiveJob && (
        <TouchableOpacity
          style={s.activeJobBanner}
          onPress={() => router.push('/job-accepted')}
          activeOpacity={0.85}
        >
          <View style={s.activeJobBannerDot} />
          <Text style={s.activeJobBannerText}>🍼 Job in progress · Tap to return</Text>
          {unreadCount > 0 && (
            <View style={s.chatBadge}>
              <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
          <Text style={s.activeJobBannerChevron}>›</Text>
        </TouchableOpacity>
      )}

      <View style={s.mapWrap}>
        <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude:       loc?.latitude  || 29.7604,
              longitude:      loc?.longitude || -95.3698,
              latitudeDelta:  0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation
            showsMyLocationButton
            showsCompass
          >
            {/* Search radius */}
            {loc && (
              <Circle
                center={loc}
                radius={RADIUS_M}
                strokeColor="rgba(201,52,136,0.5)"
                fillColor="rgba(201,52,136,0.06)"
                strokeWidth={2}
              />
            )}

            {/* ONLY online sitters from database — no demo data */}
            {onlineSitters.map((st, i) => (
              <Marker
                key={st.id || i}
                coordinate={{
                  latitude:  parseFloat(st.latitude),
                  longitude: parseFloat(st.longitude),
                }}
                onPress={() => viewSitterProfile(st)}
              >
                <View style={[s.pin, selected?.id === st.id && s.pinSelected]}>
                  <LinearGradient
                    colors={selected?.id === st.id ? ['#C93488', '#9B5BAB'] : ['#02A4E2', '#0270C8']}
                    style={s.pinGrad}
                  >
                    {st.image
                      ? <Image source={{ uri: `https://sitters4me.com/uploads/${st.image}` }} style={s.pinPhoto} />
                      : <Text style={s.pinInitials}>{`${(st.fname||'?')[0]}${(st.lname||'?')[0]}`.toUpperCase()}</Text>
                    }
                  </LinearGradient>
                  <View style={s.pinLabel}>
                    <Text style={s.pinName}>{st.fname}</Text>
                    <Text style={s.pinRate}>${st.minrate}/hr</Text>
                  </View>
                </View>
              </Marker>
            ))}
          </MapView>

        <TouchableOpacity style={s.refreshBtn} onPress={() => { getLocation(); loadOnlineSitters(); }}>
          <Text style={{ fontSize: 18 }}>{sittersLoading ? '⏳' : '🔄'}</Text>
        </TouchableOpacity>
        <View style={s.radiusBadge}>
          <Text style={s.radiusBadgeText}>📍 {RADIUS_MILES} mi radius</Text>
        </View>
      </View>

      {/* BOTTOM DRAWER */}
      <View style={s.drawer}>
        <View style={s.handle} />

        {/* Default state */}
        {!selected && !requesting && !requestSent && (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Active job in progress — block new bookings */}
            {hasActiveJob ? (
              <View style={s.activeJobDrawer}>
                <View style={s.activeJobDrawerRow}>
                  <View style={s.activeJobDrawerDot} />
                  <Text style={s.activeJobDrawerTitle}>Job In Progress</Text>
                </View>
                <Text style={s.activeJobDrawerSub}>
                  Your babysitter is currently active. You can't request another sitter until this job is complete or cancelled.
                </Text>
                <TouchableOpacity
                  style={s.activeJobDrawerBtn}
                  onPress={() => router.push('/job-accepted')}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#16A34A', '#15803D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.activeJobDrawerBtnGrad}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.activeJobDrawerBtnText}>Return to Active Job  ›</Text>
                      {unreadCount > 0 && (
                        <View style={s.chatBadge}>
                          <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowScheduleModal(true)} activeOpacity={0.85}>
                    <LinearGradient colors={['#9B5BAB', '#C93488']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>📅 Schedule</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/parent-history')} activeOpacity={0.85}>
                    <LinearGradient colors={['#1A7F6E', '#0D5C51']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>📋 History</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/parent-payment-settings')} activeOpacity={0.85}>
                    <LinearGradient colors={['#02A4E2', '#0270C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>💳 Payment</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            ) : onlineSitters.length === 0 && !sittersLoading ? (
              // No online sitters
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>😔</Text>
                <Text style={s.emptyTitle}>No sitters online right now</Text>
                <Text style={s.emptySub}>
                  No babysitters are online within {RADIUS_MILES} miles.{'\n'}
                  Try again later or schedule for a future time.
                </Text>
                <TouchableOpacity style={s.refreshSittersBtn} onPress={() => loadOnlineSitters()} activeOpacity={0.85}>
                  <Text style={s.refreshSittersText}>🔄 Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* BIG REQUEST BUTTON */}
                <TouchableOpacity onPress={openBookingModal} activeOpacity={0.88}>
                  <LinearGradient
                    colors={['#ED1E76', '#C93488', '#9B5BAB']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.requestBtn}
                  >
                    <View style={s.requestBtnLeft}>
                      <View style={s.liveDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.requestBtnTitle}>Request a Babysitter Now</Text>
                        <Text style={s.requestBtnSub}>
                          {onlineSitters.length} sitter{onlineSitters.length !== 1 ? 's' : ''} online nearby · Nearest first · 60s to accept
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 26 }}>🍼</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Specialization filter chips */}
                {onlineSitters.length > 0 && (() => {
                  const filters: { key: string; label: string; val: boolean; set: (v: boolean) => void }[] = [
                    { key: 'cpr',    label: '❤️ CPR',          val: filterCpr,           set: setFilterCpr },
                    { key: 'infant', label: '🍼 Infant',        val: filterInfant,        set: setFilterInfant },
                    { key: 'sn',     label: '🌟 Special Needs', val: filterSpecialNeeds,  set: setFilterSpecialNeeds },
                    { key: 'multi',  label: '🌍 Multilingual',  val: filterMultilingual,  set: setFilterMultilingual },
                  ];
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8, paddingRight: 16 }}>
                      {filters.map(f => (
                        <TouchableOpacity
                          key={f.key}
                          style={[s.filterChip, f.val && s.filterChipActive]}
                          onPress={() => f.set(!f.val)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.filterChipText, f.val && s.filterChipTextActive]}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  );
                })()}

                {/* Online sitter chips */}
                <Text style={s.chipLabel}>Online Now — Tap to View Profile</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                  {onlineSitters.filter(st => {
                    if (filterCpr          && st.badge_cpr           != 1) return false;
                    if (filterInfant       && st.badge_infant        != 1) return false;
                    if (filterSpecialNeeds && st.badge_special_needs != 1) return false;
                    if (filterMultilingual && st.badge_multilingual  != 1) return false;
                    return true;
                  }).map((st, i) => (
                    <TouchableOpacity key={st.id || i} style={s.chip} onPress={() => viewSitterProfile(st)} activeOpacity={0.85}>
                      <View style={s.chipAv}>
                        {st.image
                          ? <Image source={{ uri: `https://sitters4me.com/uploads/${st.image}` }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                          : <>
                              <LinearGradient colors={['#02A4E2', '#0270C8']} style={StyleSheet.absoluteFill} />
                              <Text style={s.chipAvText}>{`${(st.fname||'?')[0]}${(st.lname||'?')[0]}`.toUpperCase()}</Text>
                            </>
                        }
                      </View>
                      <View>
                        <Text style={s.chipName}>{st.fname}</Text>
                        <Text style={s.chipRate}>${st.minrate}/hr</Text>
                        <Text style={s.chipDist}>
                          {st.distance_away ? parseFloat(st.distance_away).toFixed(1) + ' mi' : 'Nearby'}
                        </Text>
                        {/* Mini badge row */}
                        <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
                          {st.badge_cpr           == 1 && <Text style={s.miniBadge}>❤️</Text>}
                          {st.badge_infant        == 1 && <Text style={s.miniBadge}>🍼</Text>}
                          {st.badge_special_needs == 1 && <Text style={s.miniBadge}>🌟</Text>}
                          {st.badge_multilingual  == 1 && <Text style={s.miniBadge}>🌍</Text>}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Schedule / History / Payment — only when no active job */}
            {!hasActiveJob && (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => setShowScheduleModal(true)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#9B5BAB', '#C93488']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>📅 Schedule</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => router.push('/parent-history')}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#1A7F6E', '#0D5C51']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>📋 History</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => router.push('/parent-payment-settings')}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#02A4E2', '#0270C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedBtn}>
                      <Text style={s.schedBtnText}>💳 Payment</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                {/* Browse All Sitters button */}
                <TouchableOpacity onPress={() => router.push('/sitter-browse')} activeOpacity={0.88} style={{ marginTop: 8 }}>
                  <LinearGradient colors={['#02A4E2', '#0270C8', '#1A7F6E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.inviteBanner}>
                    <Text style={{ fontSize: 22 }}>🔍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.inviteBannerTitle}>Browse All Sitters</Text>
                      <Text style={s.inviteBannerSub}>View profiles, ratings & availability in your area</Text>
                    </View>
                    <Text style={{ color: '#fff', fontSize: 20 }}>›</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Invite & Earn banner */}
                <TouchableOpacity onPress={() => router.push('/referral')} activeOpacity={0.88} style={{ marginTop: 8 }}>
                  <LinearGradient colors={['#ED1E76', '#C93488', '#9B5BAB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.inviteBanner}>
                    <Text style={s.inviteBannerEmoji}>🎁</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.inviteBannerTitle}>Invite Friends & Earn $5</Text>
                      <Text style={s.inviteBannerSub}>Give $5, get $5 — share your invite code</Text>
                    </View>
                    <Text style={{ color: '#fff', fontSize: 20 }}>›</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* UPCOMING SCHEDULED APPOINTMENTS */}
            {upcomingJobs.length > 0 && (
              <>
                <Text style={s.upcomingTitle}>Upcoming Appointments</Text>
                {upcomingJobs.map((job: any) => {
                  const dt = job.scheduled_time ? new Date(job.scheduled_time) : null;
                  const ages: number[] = Array.isArray(job.children_ages) ? job.children_ages : [];
                  const agesStr = ages.length > 0
                    ? ages.map((a: number) => a === 0 ? 'Infant' : `${a}yr`).join(', ')
                    : null;
                  const dur = job.duration_hours ? `${job.duration_hours}hr` : null;
                  const sitterAssigned = !!job.sitter_name?.trim();
                  return (
                    <View key={job.id} style={s.upcomingCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <View style={s.upcomingDateBox}>
                          <Text style={s.upcomingDateMon}>{dt ? dt.toLocaleDateString('en-US', { month: 'short' }) : '—'}</Text>
                          <Text style={s.upcomingDateDay}>{dt ? dt.getDate() : '—'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.upcomingJobTitle}>
                            {dt ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
                            {dur ? `  ·  ${dur}` : ''}
                          </Text>
                          <Text style={s.upcomingJobSub}>
                            {sitterAssigned ? `👩‍👧 ${job.sitter_name}${job.rate > 0 ? `  ·  $${job.rate}/hr` : ''}` : '⏳ Awaiting sitter confirmation'}
                          </Text>
                        </View>
                        <View style={[s.upcomingStatusBadge, sitterAssigned ? s.upcomingStatusConfirmed : s.upcomingStatusPending]}>
                          <Text style={[s.upcomingStatusText, sitterAssigned ? { color: '#1A7F6E' } : { color: '#7A5500' }]}>
                            {sitterAssigned ? 'Confirmed' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <View style={s.upcomingChip}><Text style={s.upcomingChipText}>🍼 {job.kids || 1} child{(job.kids || 1) !== 1 ? 'ren' : ''}</Text></View>
                        {agesStr && <View style={s.upcomingChip}><Text style={s.upcomingChipText}>Ages: {agesStr}</Text></View>}
                        {job.city && <View style={s.upcomingChip}><Text style={s.upcomingChipText}>📍 {job.city}</Text></View>}
                      </View>
                      {!!job.notes && <Text style={s.upcomingNotes}>📝 {job.notes}</Text>}
                      <TouchableOpacity
                        style={s.upcomingCancelBtn}
                        onPress={() => cancelScheduledJob(job.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.upcomingCancelText}>✕  Cancel Appointment</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}

        {/* Selected sitter profile */}
        {selected && !requesting && !requestSent && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.profileRow}>
              <View style={s.profileAvWrap}>
                {selected.image
                  ? <Image source={{ uri: `https://sitters4me.com/uploads/${selected.image}` }} style={{ width: 56, height: 56, borderRadius: 16 }} />
                  : <>
                      <LinearGradient colors={['#C93488', '#02A4E2']} style={StyleSheet.absoluteFill} />
                      <Text style={s.profileAvText}>{`${(selected.fname||'?')[0]}${(selected.lname||'?')[0]}`.toUpperCase()}</Text>
                    </>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.profileName}>{selected.fname} {selected.lname}</Text>
                <Text style={s.profileRate}>${selected.minrate}/hr</Text>
                <View style={s.badges}>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>📍 {selected.distance_away ? parseFloat(selected.distance_away).toFixed(1) + ' mi' : 'Nearby'}</Text>
                  </View>
                  {selected.bgcheck === 'Y' && (
                    <View style={[s.badge, { backgroundColor: '#D4EDE9' }]}>
                      <Text style={[s.badgeText, { color: '#1A7F6E' }]}>✓ BG Cleared</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={dismissSitter}>
                <Text style={{ color: '#9B9FAE', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {!!selected.about && <Text style={s.profileAbout}>{selected.about}</Text>}
            <View style={s.profileActions}>
              <TouchableOpacity
                style={s.callBtn}
                onPress={() => Alert.alert('Interview Sitter', 'This will let you call the sitter before booking.')}
              >
                <Text style={s.callBtnText}>📞 Interview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 2 }}
                onPress={() => {
                  Alert.alert(
                    `Request ${selected.fname}?`,
                    `Rate: $${selected.minrate}/hr\n\nSend a direct request? They have 60 seconds to accept.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Send Request 🍼', onPress: () => { setSelected(null); openBookingModal(); } },
                    ]
                  );
                }}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#ED1E76', '#C93488']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.reqBtn}>
                  <Text style={s.reqBtnText}>Request Now 🍼</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* Searching/pulsing */}
        {requesting && (
          <View style={s.stateBox}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <LinearGradient colors={['#ED1E76', '#C93488', '#9B5BAB']} style={s.pulseCircle}>
                <Text style={{ fontSize: 32 }}>🍼</Text>
              </LinearGradient>
            </Animated.View>
            <Text style={s.stateTitle}>Finding a sitter for you...</Text>
            <Text style={s.stateSub}>
              Sending to {onlineSitters.length} online sitter{onlineSitters.length !== 1 ? 's' : ''} · Nearest first · 60 seconds each
            </Text>
            <ActivityIndicator color="#C93488" size="small" />
            <TouchableOpacity style={s.cancelBtn} onPress={cancelReq}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Queue/waiting */}
        {requestSent && (
          <View style={s.stateBox}>
            <View style={s.sentIcon}><Text style={{ fontSize: 36 }}>⏳</Text></View>
            <Text style={s.stateTitle}>Waiting for a sitter to accept...</Text>
            <Text style={s.stateSub}>Each sitter has 60 seconds. You'll be notified immediately when one accepts.</Text>
            {queue.length > 0 && (
              <View style={s.queueBox}>
                {queue.slice(0, 3).map((st, i) => (
                  <View key={i} style={s.queueRow}>
                    <View style={s.queueAv}>
                      <LinearGradient colors={['#02A4E2', '#0270C8']} style={StyleSheet.absoluteFill} />
                      <Text style={s.queueAvText}>{`${(st.fname||'?')[0]}`.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.queueName}>{st.fname} {st.lname}</Text>
                      <Text style={s.queueMeta}>${st.minrate}/hr</Text>
                    </View>
                    <View style={[s.queueTag, i === 0 && s.queueTagActive]}>
                      <Text style={[s.queueTagText, i === 0 && { color: '#C93488' }]}>
                        {i === 0 ? '⏱ Notified' : i === 1 ? 'Next' : 'Queued'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={s.cancelBtn} onPress={cancelReq}>
              <Text style={s.cancelBtnText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* ── CHILDREN DETAILS MODAL ──────────────────────────── */}
      <Modal visible={showChildrenModal} transparent animationType="slide" onRequestClose={() => setShowChildrenModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.schedModal}>
            <View style={s.schedModalHeader}>
              <Text style={s.schedModalTitle}>🍼 Who's Being Watched?</Text>
              <TouchableOpacity onPress={() => setShowChildrenModal(false)}>
                <Text style={s.schedModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.schedModalSub}>
              Tell your sitter about the children so they can prepare.
            </Text>

            {/* Number of children stepper */}
            <View style={s.kidField}>
              <Text style={s.kidFieldLabel}>Number of Children</Text>
              <View style={s.stepper}>
                <TouchableOpacity style={s.stepBtn} onPress={() => updateNumKids(numKids - 1)} activeOpacity={0.7}>
                  <Text style={s.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.stepVal}>{numKids}</Text>
                <TouchableOpacity style={s.stepBtn} onPress={() => updateNumKids(numKids + 1)} activeOpacity={0.7}>
                  <Text style={s.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Age for each child */}
            <Text style={s.agesTitle}>Child Ages</Text>
            <Text style={s.agesSub}>0 = infant · tap + / − to adjust</Text>
            {childAges.map((age, idx) => (
              <View key={idx} style={s.kidField}>
                <Text style={s.kidFieldLabel}>Child {idx + 1}</Text>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => updateChildAge(idx, age - 1)} activeOpacity={0.7}>
                    <Text style={s.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.stepVal}>{ageLabel(age)}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => updateChildAge(idx, age + 1)} activeOpacity={0.7}>
                    <Text style={s.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Summary */}
            <View style={s.schedSummary}>
              <Text style={s.schedSummaryText}>
                {numKids} child{numKids !== 1 ? 'ren' : ''} · {childAges.map(ageLabel).join(', ')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => requestNow(numKids, childAges)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#ED1E76','#C93488','#9B5BAB']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.schedConfirmGrad}>
                <Text style={s.schedConfirmText}>Find a Sitter Now 🍼</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── SCHEDULE APPOINTMENT MODAL ──────────────────────── */}
      <Modal visible={showScheduleModal} transparent animationType="slide" onRequestClose={() => setShowScheduleModal(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
          <View style={s.schedModal}>
            <View style={s.schedModalHeader}>
              <Text style={s.schedModalTitle}>📅 Schedule Appointment</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Text style={s.schedModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {(global as any)._bookAgainSitterId && (
              <View style={s.bookAgainBanner}>
                <Text style={s.bookAgainBannerText}>
                  🔁 Re-booking your previous sitter as preference
                </Text>
              </View>
            )}
            <Text style={s.schedModalSub}>
              Sitters will be notified 30 minutes before your appointment.
            </Text>

            {/* Date */}
            <TouchableOpacity style={s.schedField} onPress={() => { setSchedPickerMode('date'); setSchedPickerVisible(true); }} activeOpacity={0.8}>
              <Text style={s.schedFieldIcon}>📆</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schedFieldLabel}>Date</Text>
                <Text style={s.schedFieldValue}>{schedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </View>
              <Text style={s.schedChevron}>›</Text>
            </TouchableOpacity>

            {/* Time */}
            <TouchableOpacity style={s.schedField} onPress={() => { setSchedPickerMode('time'); setSchedPickerVisible(true); }} activeOpacity={0.8}>
              <Text style={s.schedFieldIcon}>⏰</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schedFieldLabel}>Start Time</Text>
                <Text style={s.schedFieldValue}>{schedTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
              </View>
              <Text style={s.schedChevron}>›</Text>
            </TouchableOpacity>

            {/* Duration */}
            <View style={s.schedFieldStatic}>
              <Text style={s.schedFieldIcon}>⏳</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schedFieldLabel}>Duration</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {DURATIONS.map(d => (
                      <TouchableOpacity key={d} onPress={() => setSchedDuration(d)} activeOpacity={0.8}
                        style={[s.durChip, schedDuration === d && s.durChipActive]}>
                        <Text style={[s.durChipText, schedDuration === d && s.durChipTextActive]}>
                          {d === 1 ? '1 hr' : d % 1 === 0 ? `${d} hrs` : `${d} hrs`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            {/* Children count + ages */}
            <View style={s.schedFieldStatic}>
              <Text style={s.schedFieldIcon}>🍼</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schedFieldLabel}>Children</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <TouchableOpacity onPress={() => setSchedKidsCount(schedKids - 1)} style={s.kidsBtn}><Text style={s.kidsBtnText}>−</Text></TouchableOpacity>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#0F1117', minWidth: 20, textAlign: 'center' }}>{schedKids}</Text>
                  <TouchableOpacity onPress={() => setSchedKidsCount(schedKids + 1)} style={s.kidsBtn}><Text style={s.kidsBtnText}>+</Text></TouchableOpacity>
                </View>
                {/* Age selectors */}
                <View style={{ gap: 8, marginTop: 10 }}>
                  {schedAges.slice(0, schedKids).map((age, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: '#5A5F72', width: 60 }}>Child {idx + 1}</Text>
                      <TouchableOpacity onPress={() => setSchedAge(idx, age - 1)} style={s.kidsBtn}><Text style={s.kidsBtnText}>−</Text></TouchableOpacity>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F1117', minWidth: 50, textAlign: 'center' }}>
                        {age === 0 ? 'Infant' : `${age} yr${age !== 1 ? 's' : ''}`}
                      </Text>
                      <TouchableOpacity onPress={() => setSchedAge(idx, age + 1)} style={s.kidsBtn}><Text style={s.kidsBtnText}>+</Text></TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Notes */}
            <View style={s.schedFieldStatic}>
              <Text style={s.schedFieldIcon}>📝</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.schedFieldLabel}>Notes for Sitter (optional)</Text>
                <TextInput
                  style={s.schedNotesInput}
                  value={schedNotes}
                  onChangeText={setSchedNotes}
                  placeholder="Allergies, bedtime routines, house rules…"
                  placeholderTextColor="#9B9FAE"
                  multiline
                  numberOfLines={2}
                  maxLength={300}
                />
              </View>
            </View>

            {/* Native picker */}
            {schedPickerVisible && (
              Platform.OS === 'android' ? (
                <DateTimePicker
                  value={schedPickerMode === 'date' ? schedDate : schedTime}
                  mode={schedPickerMode}
                  display="default"
                  minimumDate={schedPickerMode === 'date' ? new Date() : undefined}
                  onChange={(_, sel) => {
                    setSchedPickerVisible(false);
                    if (!sel) return;
                    if (schedPickerMode === 'date') setSchedDate(sel);
                    else setSchedTime(sel);
                  }}
                />
              ) : (
                <Modal transparent animationType="slide">
                  <View style={s.pickerOverlay}>
                    <View style={s.pickerSheet}>
                      <View style={s.pickerHeader}>
                        <TouchableOpacity onPress={() => setSchedPickerVisible(false)}><Text style={s.pickerCancel}>Cancel</Text></TouchableOpacity>
                        <Text style={s.pickerTitle}>{schedPickerMode === 'date' ? 'Select Date' : 'Select Time'}</Text>
                        <TouchableOpacity onPress={() => setSchedPickerVisible(false)}><Text style={s.pickerDone}>Done</Text></TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={schedPickerMode === 'date' ? schedDate : schedTime}
                        mode={schedPickerMode}
                        display="spinner"
                        minimumDate={schedPickerMode === 'date' ? new Date() : undefined}
                        onChange={(_, sel) => {
                          if (!sel) return;
                          if (schedPickerMode === 'date') setSchedDate(sel);
                          else setSchedTime(sel);
                        }}
                        style={{ height: 200 }}
                        textColor="#0F1117"
                      />
                    </View>
                  </View>
                </Modal>
              )
            )}

            {/* Summary */}
            <View style={s.schedSummary}>
              <Text style={s.schedSummaryText}>
                📅 {schedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {schedTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                {'  ·  '}⏳ {schedDuration === 1 ? '1 hr' : `${schedDuration} hrs`}
                {'  ·  '}🍼 {schedKids} child{schedKids !== 1 ? 'ren' : ''}
              </Text>
            </View>

            <TouchableOpacity onPress={scheduleAppointment} style={[s.schedConfirmBtn, scheduling && { opacity: 0.6 }]} disabled={scheduling} activeOpacity={0.85}>
              <LinearGradient colors={['#9B5BAB', '#C93488']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.schedConfirmGrad}>
                {scheduling ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.schedConfirmText}>Confirm Appointment 📅</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#F5F4F0' },
  header:            { paddingBottom: 20 },
  headerRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 12 },
  avatarWrap:        { position: 'relative' },
  avatarImg:         { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.8)' },
  avatarFallback:    { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  avatarInitials:    { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  cameraBadge:       { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  greeting:          { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },
  greetingSub:       { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  settingsBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  activeJobDrawer:       { gap: 12 },
  activeJobDrawerRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeJobDrawerDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  activeJobDrawerTitle:  { fontSize: 17, fontWeight: '900', color: '#0F1117' },
  activeJobDrawerSub:    { fontSize: 13, color: '#5A5F72', lineHeight: 19 },
  activeJobDrawerBtn:    { borderRadius: 14, overflow: 'hidden' },
  activeJobDrawerBtnGrad:{ padding: 16, alignItems: 'center' },
  activeJobDrawerBtnText:{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  activeJobBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16A34A', paddingVertical: 12, paddingHorizontal: 18, gap: 10 },
  activeJobBannerDot:    { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFFFFF', opacity: 0.9 },
  activeJobBannerText:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  activeJobBannerChevron:{ fontSize: 22, color: 'rgba(255,255,255,0.8)', fontWeight: '300' },
  chatBadge:             { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chatBadgeText:         { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  mapWrap:           { flex: 1, position: 'relative' },
  mapLoading:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#E8F4F8' },
  mapLoadingText:    { fontSize: 14, color: '#5A5F72' },
  refreshBtn:        { position: 'absolute', top: 12, right: 12, width: 40, height: 40, backgroundColor: '#FFFFFF', borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  radiusBadge:       { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  radiusBadgeText:   { fontSize: 12, fontWeight: '600', color: '#5A5F72' },
  pin:               { alignItems: 'center', gap: 2 },
  pinSelected:       { transform: [{ scale: 1.15 }] },
  pinGrad:           { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 5 },
  pinPhoto:          { width: 48, height: 48, borderRadius: 24 },
  pinInitials:       { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  pinLabel:          { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  pinName:           { fontSize: 11, fontWeight: '700', color: '#0F1117' },
  pinRate:           { fontSize: 10, fontWeight: '600', color: '#C93488' },
  drawer:            { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 28, maxHeight: height * 0.46, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 10 },
  handle:            { width: 36, height: 4, backgroundColor: '#EEECE7', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  emptyBox:          { alignItems: 'center', paddingVertical: 8, gap: 6 },
  emptyIcon:         { fontSize: 36 },
  emptyTitle:        { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  emptySub:          { fontSize: 13, color: '#5A5F72', textAlign: 'center', lineHeight: 20 },
  refreshSittersBtn: { marginTop: 8, backgroundColor: '#F5F4F0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, borderWidth: 1, borderColor: '#E5E2DA' },
  refreshSittersText:{ fontSize: 13, fontWeight: '700', color: '#5A5F72' },
  requestBtn:        { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, shadowColor: '#C93488', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  requestBtnLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  liveDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  requestBtnTitle:   { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.3 },
  requestBtnSub:     { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  filterChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F4F0', borderWidth: 1.5, borderColor: '#E5E2DA' },
  filterChipActive:  { backgroundColor: '#0F1117', borderColor: '#0F1117' },
  filterChipText:    { fontSize: 12, fontWeight: '700', color: '#5A5F72' },
  filterChipTextActive: { color: '#FFFFFF' },
  miniBadge:         { fontSize: 11 },
  chipLabel:         { fontSize: 13, fontWeight: '800', color: '#0F1117', marginBottom: 10 },
  chip:              { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F4F0', borderRadius: 14, padding: 10, paddingRight: 14, borderWidth: 1, borderColor: '#E5E2DA' },
  chipAv:            { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipAvText:        { fontSize: 14, fontWeight: '700', color: '#FFFFFF', zIndex: 1 },
  chipName:          { fontSize: 13, fontWeight: '700', color: '#0F1117' },
  chipRate:          { fontSize: 12, color: '#02A4E2', fontWeight: '600' },
  chipDist:          { fontSize: 11, color: '#9B9FAE' },
  schedBtn:          { borderRadius: 12, padding: 13, alignItems: 'center' },
  schedBtnText:      { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  inviteBanner:      { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteBannerEmoji: { fontSize: 22 },
  inviteBannerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  inviteBannerSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  // Upcoming appointments
  upcomingTitle:       { fontSize: 15, fontWeight: '800', color: '#0F1117', marginTop: 18, marginBottom: 8 },
  upcomingCard:        { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: 'rgba(155,91,171,0.25)', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  upcomingDateBox:     { width: 46, alignItems: 'center', backgroundColor: '#F3EEF9', borderRadius: 10, paddingVertical: 6 },
  upcomingDateMon:     { fontSize: 11, fontWeight: '700', color: '#9B5BAB', textTransform: 'uppercase' },
  upcomingDateDay:     { fontSize: 22, fontWeight: '900', color: '#9B5BAB', lineHeight: 26 },
  upcomingJobTitle:    { fontSize: 14, fontWeight: '800', color: '#0F1117' },
  upcomingJobSub:      { fontSize: 12, color: '#5A5F72', marginTop: 2 },
  upcomingStatusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  upcomingStatusConfirmed: { backgroundColor: '#D4EDE9', borderColor: '#1A7F6E' },
  upcomingStatusPending:   { backgroundColor: '#FFF8E1', borderColor: '#F5A623' },
  upcomingStatusText:  { fontSize: 11, fontWeight: '700' },
  upcomingChip:        { backgroundColor: '#F5F4F0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  upcomingChipText:    { fontSize: 12, fontWeight: '600', color: '#5A5F72' },
  upcomingNotes:       { fontSize: 12, color: '#5A5F72', fontStyle: 'italic', marginBottom: 8, lineHeight: 18 },
  upcomingCancelBtn:   { marginTop: 4, borderRadius: 10, borderWidth: 1.5, borderColor: '#E53E3E', padding: 9, alignItems: 'center' },
  upcomingCancelText:  { fontSize: 13, fontWeight: '700', color: '#E53E3E' },
  profileRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  profileAvWrap:     { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  profileAvText:     { fontSize: 18, fontWeight: '800', color: '#FFFFFF', zIndex: 1 },
  profileName:       { fontSize: 17, fontWeight: '800', color: '#0F1117' },
  profileRate:       { fontSize: 15, color: '#02A4E2', fontWeight: '700', marginTop: 2 },
  badges:            { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge:             { backgroundColor: '#F5F4F0', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:         { fontSize: 11, fontWeight: '600', color: '#5A5F72' },
  profileAbout:      { fontSize: 13, color: '#5A5F72', lineHeight: 20, marginBottom: 12 },
  profileActions:    { flexDirection: 'row', gap: 10 },
  callBtn:           { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E2DA' },
  callBtnText:       { fontSize: 14, fontWeight: '700', color: '#5A5F72' },
  reqBtn:            { borderRadius: 12, padding: 14, alignItems: 'center' },
  reqBtnText:        { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  stateBox:          { alignItems: 'center', gap: 10, paddingVertical: 4 },
  pulseCircle:       { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  sentIcon:          { width: 80, height: 80, backgroundColor: '#FFF0F7', borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  stateTitle:        { fontSize: 17, fontWeight: '800', color: '#0F1117', textAlign: 'center' },
  stateSub:          { fontSize: 13, color: '#5A5F72', textAlign: 'center', lineHeight: 18 },
  cancelBtn:         { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 28, borderWidth: 1.5, borderColor: '#E5E2DA', marginTop: 4 },
  cancelBtnText:     { fontSize: 14, fontWeight: '600', color: '#5A5F72' },
  queueBox:          { alignSelf: 'stretch', gap: 8, backgroundColor: '#F5F4F0', borderRadius: 12, padding: 12 },
  queueRow:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  queueAv:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  queueAvText:       { fontSize: 12, fontWeight: '700', color: '#FFFFFF', zIndex: 1 },
  queueName:         { fontSize: 13, fontWeight: '600', color: '#0F1117' },
  queueMeta:         { fontSize: 11, color: '#9B9FAE' },
  queueTag:          { backgroundColor: '#EEECE7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  queueTagActive:    { backgroundColor: '#FFF0F7' },
  queueTagText:      { fontSize: 11, fontWeight: '700', color: '#9B9FAE' },

  // Schedule modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  schedModal:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  schedModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  schedModalTitle:   { fontSize: 19, fontWeight: '900', color: '#0F1117' },
  schedModalClose:   { fontSize: 22, color: '#9B9FAE', fontWeight: '600', paddingHorizontal: 4 },
  schedModalSub:     { fontSize: 13, color: '#5A5F72', lineHeight: 20, marginTop: -6 },
  bookAgainBanner:   { backgroundColor: '#E8F6FD', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(2,164,226,0.3)', marginBottom: 6 },
  bookAgainBannerText: { fontSize: 13, fontWeight: '700', color: '#02A4E2', textAlign: 'center' },
  schedField:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', gap: 12 },
  schedFieldIcon:    { fontSize: 22 },
  schedFieldLabel:   { fontSize: 11, fontWeight: '700', color: '#9B9FAE', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  schedFieldValue:   { fontSize: 15, fontWeight: '600', color: '#0F1117' },
  schedChevron:      { fontSize: 22, color: '#9B9FAE' },
  schedFieldStatic:  { flexDirection: 'row', backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', gap: 12 },
  durChip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.12)' },
  durChipActive:     { backgroundColor: '#C93488', borderColor: '#C93488' },
  durChipText:       { fontSize: 13, fontWeight: '600', color: '#5A5F72' },
  durChipTextActive: { color: '#FFFFFF' },
  kidsBtn:           { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.12)', alignItems: 'center', justifyContent: 'center' },
  kidsBtnText:       { fontSize: 18, color: '#0F1117', lineHeight: 22 },
  schedNotesInput:   { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', padding: 10, fontSize: 14, color: '#0F1117', minHeight: 60 },
  schedSummary:      { backgroundColor: '#F0F8FF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(2,164,226,0.2)', alignItems: 'center' },
  schedSummaryText:  { fontSize: 14, fontWeight: '700', color: '#0270C8' },
  schedConfirmBtn:   { borderRadius: 14, overflow: 'hidden' },
  schedConfirmGrad:  { padding: 16, alignItems: 'center' },
  schedConfirmText:  { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  pickerOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:       { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  pickerHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EEE9' },
  pickerTitle:       { fontSize: 16, fontWeight: '700', color: '#0F1117' },
  pickerCancel:      { fontSize: 16, color: '#9B9FAE', fontWeight: '500' },
  pickerDone:        { fontSize: 16, color: '#C93488', fontWeight: '800' },
});
