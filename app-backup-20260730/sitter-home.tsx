// app/sitter-home.tsx — clean rewrite, no unicode escapes
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Switch, StatusBar, Vibration, Alert, Animated, Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API      = 'https://sitters4me.com/api/jobs.php';
const POLL_INTERVAL = 6000;
const COUNTDOWN     = 60;

export default function SitterHome() {
  const router   = useRouter();
  const countRef = useRef<any>(null);
  const pollRef  = useRef<any>(null);
  const progAnim = useRef(new Animated.Value(1)).current;
  const modalRef = useRef(false);

  const [isOnline, setIsOnline]         = useState(false);
  const [toggling, setToggling]         = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [countdown, setCountdown]       = useState(COUNTDOWN);
  const [incomingJob, setIncomingJob]   = useState<any>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [hasActiveJob, setHasActiveJob] = useState(false);

  const user     = global.currentUser || {};
  const initials = `${(user.fname || '?')[0]}${(user.lname || '?')[0]}`.toUpperCase();

  useEffect(() => {
    const aj = (global as any).activeJob;
    if (aj?.job_id) {
      axios.post(`${JOBS_API}?action=job_status`, { job_id: aj.job_id })
        .then((res: any) => {
          const st = res.data?.data?.status;
          if (st === 'Complete' || st === 'Completed' || st === 'Cancelled' || st === 'cancelled') {
            (global as any).activeJob = null;
            setHasActiveJob(false);
          } else {
            setHasActiveJob(true);
          }
        })
        .catch(() => setHasActiveJob(true));
    }
    return () => {
      clearInterval(countRef.current);
      clearInterval(pollRef.current);
      Vibration.cancel();
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      pollRef.current = setInterval(checkForJobs, POLL_INTERVAL);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [isOnline]);

  const checkForJobs = async () => {
    if (modalRef.current || !user.id) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=check_incoming`, { sitter_id: user.id });
      if (res.data?.success && res.data?.data?.job) {
        showJobPopup(res.data.data.job);
      }
    } catch {}
  };

  const showJobPopup = (job: any) => {
    modalRef.current = true;
    setIncomingJob(job);
    setShowModal(true);
    setCountdown(COUNTDOWN);
    Vibration.vibrate([0, 400, 200, 400, 200, 400]);
    clearInterval(countRef.current);
    progAnim.setValue(1);
    Animated.timing(progAnim, { toValue: 0, duration: COUNTDOWN * 1000, useNativeDriver: false }).start();
    let remaining = COUNTDOWN;
    countRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) handleTimeout(job);
    }, 1000);
  };

  const handleTimeout = async (job?: any) => {
    clearInterval(countRef.current);
    Vibration.cancel();
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    const j = job || incomingJob;
    if (j?.id) {
      try { await axios.post(`${JOBS_API}?action=timeout_job`, { job_id: j.id, sitter_id: user.id }); } catch {}
    }
    setIncomingJob(null);
  };

  const handleAccept = async () => {
    clearInterval(countRef.current);
    Vibration.cancel();
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    setIncomingJob(null);
    try { await axios.post(`${JOBS_API}?action=accept_job`, { job_id: job.id, sitter_id: user.id }); } catch {}
    (global as any).activeJob = { job_id: job.id, parent_name: job.parent_name, parent_id: job.parent_id };
    setHasActiveJob(true);
    Alert.alert(
      'Job Accepted!',
      `You accepted the job from ${job.parent_name || 'the parent'}.\n\nThey have been notified you are on your way!`,
      [{ text: 'View Job', onPress: () => router.push('/active-job') }, { text: 'OK' }]
    );
  };

  const handleDecline = async () => {
    clearInterval(countRef.current);
    Vibration.cancel();
    const job = incomingJob;
    modalRef.current = false;
    setShowModal(false);
    progAnim.setValue(1);
    setIncomingJob(null);
    try { await axios.post(`${JOBS_API}?action=decline_job`, { job_id: job.id, sitter_id: user.id }); } catch {}
  };

  const toggleOnline = async (val: boolean) => {
    setToggling(true);
    try {
      let lat = 0, lng = 0;
      if (val) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Required', 'Please enable location to go online and receive job requests.');
          setToggling(false);
          return;
        }
        const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = l.coords.latitude;
        lng = l.coords.longitude;
      }
      await axios.post(`${JOBS_API}?action=set_online`, { sitter_id: user.id, online: val ? 1 : 0, lat, lng });
      setIsOnline(val);
      if (!val) {
        clearInterval(pollRef.current);
        clearInterval(countRef.current);
        modalRef.current = false;
        setShowModal(false);
        Vibration.cancel();
      }
    } catch {
      Alert.alert('Error', 'Could not update your status. Check your internet connection.');
    } finally { setToggling(false); }
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
      Alert.alert('Photo Updated', 'Your profile photo has been updated!');
    }
  };

  const countColor = countdown > 30 ? '#1A7F6E' : countdown > 10 ? '#F5A623' : '#BF3B2E';
  const progWidth  = progAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={pickPhoto} style={s.avatarWrap} activeOpacity={0.85}>
            {profilePhoto || user.image ? (
              <Image source={{uri: profilePhoto || `https://sitters4me.com/uploads/${user.image}`}} style={s.avatarImg} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.cameraBadge}><Text style={{fontSize:10}}>{'📷'}</Text></View>
          </TouchableOpacity>
          <View style={{flex:1}}>
            <Text style={s.greeting}>Hi {user.fname || 'Sitter'}!</Text>
            <Text style={s.greetingSub}>
              {isOnline ? 'Online - receiving job requests' : 'Offline - tap toggle to go online'}
            </Text>
          </View>
          <TouchableOpacity style={s.settingsBtn}
            onPress={() => router.push('/sitter-settings')} activeOpacity={0.85}>
            <Text style={{fontSize:22}}>{'⚙️'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ACTIVE JOB BANNER */}
      {hasActiveJob && (
        <TouchableOpacity style={s.activeBanner} onPress={() => router.push('/active-job')} activeOpacity={0.9}>
          <View style={s.activeDot} />
          <Text style={s.activeBannerText}>Job in progress - Tap to return</Text>
          <Text style={s.activeBannerArrow}>{'>'}</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ONLINE TOGGLE */}
        <View style={[s.onlineCard, isOnline && s.onlineCardOn]}>
          <View style={s.onlineRow}>
            <View style={{flex:1}}>
              <Text style={s.onlineTitle}>{isOnline ? 'You are Online' : 'You are Offline'}</Text>
              <Text style={s.onlineSub}>
                {isOnline
                  ? `Parents within ${user.work_distance || 10} miles can send you job requests`
                  : 'Toggle on to start receiving real-time job requests from parents near you'}
              </Text>
            </View>
            {toggling
              ? <ActivityIndicator color="#02A4E2" style={{marginLeft:12}} />
              : <Switch value={isOnline} onValueChange={toggleOnline}
                  trackColor={{false:'#D1D5DB', true:'#02A4E2'}} thumbColor="#FFFFFF"
                  ios_backgroundColor="#D1D5DB" style={{transform:[{scaleX:1.2},{scaleY:1.2}]}} />
            }
          </View>
          {isOnline && (
            <>
              <View style={s.statsRow}>
                <View style={s.stat}><Text style={s.statN}>{user.work_distance||10}</Text><Text style={s.statL}>mile radius</Text></View>
                <View style={s.statDiv}/>
                <View style={s.stat}><Text style={s.statN}>${user.minrate||15}</Text><Text style={s.statL}>min/hr</Text></View>
                <View style={s.statDiv}/>
                <View style={s.stat}><Text style={s.statN}>${user.maxrate||25}</Text><Text style={s.statL}>max/hr</Text></View>
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
              <Text style={s.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={s.profileItems}>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>{'📍'}</Text>
              <Text style={s.profileItemVal}>{user.city || '-'}{user.state ? ', ' + user.state : ''}</Text>
            </View>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>{'💰'}</Text>
              <Text style={s.profileItemVal}>${user.minrate || '-'}-${user.maxrate || '-'}/hr</Text>
            </View>
            <View style={s.profileItem}>
              <Text style={s.profileItemIcon}>{'🚗'}</Text>
              <Text style={s.profileItemVal}>{user.work_distance || 10} mi travel</Text>
            </View>
          </View>
          <TouchableOpacity style={s.photoRow} onPress={pickPhoto} activeOpacity={0.85}>
            <Text style={s.photoRowText}>Tap to update your profile photo</Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACTIONS */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickRow}>
          {[
            { icon: '📅', label: 'Availability', route: '/sitter-availability' },
            { icon: '💰', label: 'Earnings',     route: '/sitter-earnings' },
            { icon: '📋', label: 'Job History',  route: '/parent-history' },
          ].map((q, i) => (
            <TouchableOpacity key={i} style={s.quickBtn}
              onPress={() => router.push(q.route as any)} activeOpacity={0.85}>
              <Text style={{fontSize:28}}>{q.icon}</Text>
              <Text style={s.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* JOB REQUEST MODAL */}
      {showModal && incomingJob && (
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.progTrack}>
              <Animated.View style={[s.progBar, {width: progWidth, backgroundColor: countColor}]} />
            </View>
            <View style={s.modalBody}>
              <Text style={s.modalTitle}>New Job Request!</Text>
              <View style={[s.countRing, {borderColor: countColor}]}>
                <Text style={[s.countNum, {color: countColor}]}>{countdown}</Text>
                <Text style={s.countSec}>sec</Text>
              </View>
              <Text style={s.countHint}>Respond before the timer runs out</Text>
              <View style={s.jobDetails}>
                {[
                  ['Parent',   incomingJob.parent_name || 'Parent'],
                  ['Location', `${incomingJob.city || ''}, ${incomingJob.state || ''}`],
                  ['Children', String(incomingJob.kids || 1)],
                  ['Rate',     `$${incomingJob.rate || user.minrate || 15}/hr`],
                ].map(([label, value]) => (
                  <View key={label} style={s.detailRow}>
                    <Text style={s.detailLabel}>{label}</Text>
                    <Text style={[s.detailValue, label === 'Rate' && {color:'#02A4E2',fontWeight:'800',fontSize:18}]}>{value}</Text>
                  </View>
                ))}
              </View>
              <View style={s.modalActions}>
                <TouchableOpacity style={s.declineBtn} onPress={handleDecline} activeOpacity={0.85}>
                  <Text style={s.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{flex:2}} onPress={handleAccept} activeOpacity={0.85}>
                  <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.acceptBtn}>
                    <Text style={s.acceptBtnText}>Accept Job</Text>
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
  container:       {flex:1, backgroundColor:'#F5F4F0'},
  header:          {paddingBottom:20},
  headerRow:       {flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:14, paddingBottom:6, gap:12},
  avatarWrap:      {position:'relative'},
  avatarImg:       {width:52, height:52, borderRadius:26, borderWidth:2.5, borderColor:'rgba(255,255,255,0.8)'},
  avatarFallback:  {width:52, height:52, borderRadius:26, backgroundColor:'rgba(255,255,255,0.25)', alignItems:'center', justifyContent:'center', borderWidth:2.5, borderColor:'rgba(255,255,255,0.6)'},
  avatarInitials:  {fontSize:18, fontWeight:'800', color:'#FFFFFF'},
  cameraBadge:     {position:'absolute', bottom:-2, right:-2, width:20, height:20, borderRadius:10, backgroundColor:'#FFFFFF', alignItems:'center', justifyContent:'center', elevation:3},
  greeting:        {fontSize:18, fontWeight:'900', color:'#FFFFFF', letterSpacing:-0.3},
  greetingSub:     {fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:2},
  settingsBtn:     {width:40, height:40, alignItems:'center', justifyContent:'center'},
  activeBanner:    {backgroundColor:'#1A7F6E', flexDirection:'row', alignItems:'center', padding:14, gap:10},
  activeDot:       {width:9, height:9, borderRadius:5, backgroundColor:'#FFFFFF', opacity:0.9},
  activeBannerText:{flex:1, fontSize:14, fontWeight:'700', color:'#FFFFFF'},
  activeBannerArrow:{fontSize:18, color:'rgba(255,255,255,0.8)'},
  scroll:          {flex:1, marginTop:-16},
  content:         {paddingTop:24, paddingHorizontal:16, paddingBottom:48, gap:16},
  onlineCard:      {backgroundColor:'#FFFFFF', borderRadius:16, padding:18, borderWidth:1.5, borderColor:'rgba(15,17,23,0.1)', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.07, shadowRadius:8, elevation:3},
  onlineCardOn:    {borderColor:'#02A4E2', backgroundColor:'rgba(2,164,226,0.03)'},
  onlineRow:       {flexDirection:'row', alignItems:'center', gap:14},
  onlineTitle:     {fontSize:15, fontWeight:'700', color:'#0F1117'},
  onlineSub:       {fontSize:13, color:'#5A5F72', marginTop:2, lineHeight:18},
  statsRow:        {flexDirection:'row', marginTop:14, paddingTop:14, borderTopWidth:1, borderTopColor:'rgba(2,164,226,0.2)'},
  stat:            {flex:1, alignItems:'center'},
  statN:           {fontSize:22, fontWeight:'900', color:'#02A4E2'},
  statL:           {fontSize:11, color:'#9B9FAE', marginTop:2},
  statDiv:         {width:1, backgroundColor:'rgba(2,164,226,0.2)'},
  waitBox:         {flexDirection:'row', alignItems:'center', gap:10, marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:'rgba(2,164,226,0.15)'},
  waitText:        {fontSize:13, color:'#02A4E2', fontWeight:'600', flex:1},
  profileCard:     {backgroundColor:'#FFFFFF', borderRadius:16, padding:18, borderWidth:1, borderColor:'rgba(15,17,23,0.09)'},
  profileCardHeader:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12},
  sectionTitle:    {fontSize:17, fontWeight:'800', color:'#0F1117', letterSpacing:-0.2},
  editLink:        {color:'#C93488', fontSize:13, fontWeight:'700'},
  profileItems:    {flexDirection:'row', gap:8, marginBottom:14},
  profileItem:     {flex:1, alignItems:'center', gap:4, backgroundColor:'#F5F4F0', borderRadius:10, padding:10},
  profileItemIcon: {fontSize:20},
  profileItemVal:  {fontSize:11, color:'#5A5F72', textAlign:'center', fontWeight:'600'},
  photoRow:        {backgroundColor:'#F5F4F0', borderRadius:10, padding:12, alignItems:'center', borderWidth:1, borderColor:'#E5E2DA'},
  photoRowText:    {fontSize:13, fontWeight:'600', color:'#5A5F72'},
  quickRow:        {flexDirection:'row', gap:10},
  quickBtn:        {flex:1, backgroundColor:'#FFFFFF', borderRadius:14, padding:16, alignItems:'center', gap:6, borderWidth:1, borderColor:'rgba(15,17,23,0.09)', shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:2},
  quickLabel:      {fontSize:11, fontWeight:'600', color:'#5A5F72', textAlign:'center'},
  overlay:         {position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(15,17,23,0.75)', justifyContent:'flex-end'},
  modal:           {backgroundColor:'#FFFFFF', borderTopLeftRadius:28, borderTopRightRadius:28, overflow:'hidden'},
  progTrack:       {height:5, backgroundColor:'#EEECE7'},
  progBar:         {height:5},
  modalBody:       {padding:24, paddingBottom:40, alignItems:'center'},
  modalTitle:      {fontSize:26, fontWeight:'900', color:'#0F1117', marginBottom:16, letterSpacing:-0.5},
  countRing:       {width:100, height:100, borderRadius:50, borderWidth:5, alignItems:'center', justifyContent:'center', marginBottom:8},
  countNum:        {fontSize:36, fontWeight:'900'},
  countSec:        {fontSize:12, color:'#9B9FAE', marginTop:-4},
  countHint:       {fontSize:13, color:'#5A5F72', marginBottom:20},
  jobDetails:      {alignSelf:'stretch', marginBottom:20},
  detailRow:       {flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'rgba(15,17,23,0.07)'},
  detailLabel:     {fontSize:13, color:'#9B9FAE', fontWeight:'600'},
  detailValue:     {fontSize:14, color:'#0F1117', fontWeight:'600'},
  modalActions:    {flexDirection:'row', gap:10, alignSelf:'stretch'},
  declineBtn:      {flex:1, borderRadius:10, padding:14, alignItems:'center', borderWidth:1.5, borderColor:'#BF3B2E'},
  declineBtnText:  {color:'#BF3B2E', fontSize:15, fontWeight:'700'},
  acceptBtn:       {borderRadius:10, padding:14, alignItems:'center'},
  acceptBtnText:   {color:'#FFFFFF', fontSize:15, fontWeight:'700'},
});
