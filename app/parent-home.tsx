// app/parent-home.tsx — July 23 version
// - Map shows real online sitters from API (profile icon pins, tappable)
// - Drawer: Request button + Schedule button + Invite & Earn card
// - NO sitter chips under the request button
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Dimensions, ActivityIndicator, Animated, Image,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import axios from 'axios';

const { height } = Dimensions.get('window');
const JOBS_API = 'https://sitters4me.com/api/jobs.php';

export default function ParentHome() {
  const router    = useRouter();
  const mapRef    = useRef<MapView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<any>(null);
  const pollRef   = useRef<any>(null);

  const [loc, setLoc]                       = useState<any>(null);
  const [locLoading, setLocLoading]         = useState(true);
  const [onlineSitters, setOnlineSitters]   = useState<any[]>([]);
  const [sittersLoading, setSittersLoading] = useState(false);
  const [selected, setSelected]             = useState<any>(null);
  const [requesting, setRequesting]         = useState(false);
  const [requestSent, setReqSent]           = useState(false);
  const [queue, setQueue]                   = useState<any[]>([]);
  const [tab, setTab]                       = useState<'now'|'schedule'>('now');
  const [kidsCount, setKidsCount]           = useState<number>((global.currentUser || {}).kids || 1);
  const [showKidsModal, setShowKidsModal]   = useState(false);
  const [childAges, setChildAges]           = useState<string[]>(['']);
  const [activeJobBanner, setActiveJobBanner] = useState<any>((global as any).activeJob || null);

  const user         = global.currentUser || {};
  const RADIUS_MILES = (global.currentUser?.search_radius) || 10;
  const RADIUS_M     = RADIUS_MILES * 1609.34;
  const initials     = `${(user.fname||'?')[0]}${(user.lname||'?')[0]}`.toUpperCase();

  useEffect(() => {
    getLocation();
    return () => { pulseLoop.current?.stop?.(); clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (loc) {
      loadOnlineSitters();
      const iv = setInterval(loadOnlineSitters, 30000);
      return () => clearInterval(iv);
    }
  }, [loc]);

  const getLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLoc({ latitude:29.7604, longitude:-95.3698 }); return; }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch { setLoc({ latitude:29.7604, longitude:-95.3698 }); }
    finally { setLocLoading(false); }
  };

  const loadOnlineSitters = async () => {
    if (!loc) return;
    setSittersLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=nearby_sitters`, {
        lat: loc.latitude, lng: loc.longitude, radius: RADIUS_MILES,
      });
      if (res.data?.success) setOnlineSitters(res.data.data || []);
      else setOnlineSitters([]);
    } catch { setOnlineSitters([]); }
    finally { setSittersLoading(false); }
  };

  const focusSitter = (st: any) => {
    setSelected(st);
    mapRef.current?.animateToRegion({
      latitude: parseFloat(st.latitude||st.lat) - 0.003,
      longitude: parseFloat(st.longitude||st.lng),
      latitudeDelta: 0.02, longitudeDelta: 0.02,
    }, 600);
  };

  const cancelReq = () => {
    pulseLoop.current?.stop?.();
    pulseAnim.setValue(1);
    clearInterval(pollRef.current);
    setRequesting(false);
    setReqSent(false);
    setQueue([]);
  };

  const requestNow = () => {
    if (!loc) return Alert.alert('Location Required','Please enable location to request a sitter.');
    // Reset to 1 child, open modal
    setKidsCount(1);
    setChildAges(['']);
    setShowKidsModal(true);
  };

  const updateKidsCount = (n: number) => {
    setKidsCount(n);
    setChildAges(prev => {
      const next = [...prev];
      while (next.length < n) next.push('');
      return next.slice(0, n);
    });
  };

  const confirmKidsAndRequest = () => {
    setShowKidsModal(false);
    const ages = childAges.map(a => a.trim()).filter(Boolean);
    sendActualRequest(kidsCount, ages);
  };

  const sendActualRequest = async (numKids: number, ages: string[] = []) => {
    if (onlineSitters.length === 0) {
      return Alert.alert(
        'No Sitters Online',
        `No babysitters are currently online within ${RADIUS_MILES} miles.\n\nTry scheduling for a future date instead.`,
        [
          { text: 'Schedule', onPress: () => { setTab('schedule'); router.push('/schedule-sitter'); } },
          { text: 'OK' },
        ]
      );
    }

    setRequesting(true);
    setSelected(null);
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue:1.28, duration:700, useNativeDriver:true }),
        Animated.timing(pulseAnim, { toValue:1,    duration:700, useNativeDriver:true }),
      ])
    );
    pulseLoop.current.start();

    try {
      const res = await axios.post(`${JOBS_API}?action=request_live`, {
        parent_id:  user.id || 1,
        lat:        loc.latitude,
        lng:        loc.longitude,
        radius:     RADIUS_MILES,
        kids:       numKids,
        child_ages: ages.join(', '),
        address:    'Current location',
      });

      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);

      if (!res.data?.success)
        return Alert.alert('Error', res.data?.error || 'Could not send request. Please try again.');

      const data = res.data.data;
      if (!data?.sitters_found || data.sitters_found === 0) {
        return Alert.alert('No Sitters Available','All nearby sitters are busy right now. Try again shortly.');
      }

      setQueue(data.queue || []);
      setReqSent(true);

      // Poll every 3s for acceptance
      pollRef.current = setInterval(async () => {
        try {
          const sr = await axios.post(`${JOBS_API}?action=job_status`, { job_id: data.job_id });
          const d = sr.data?.data;
          if (d?.assigned || d?.status === 'assigned') {
            clearInterval(pollRef.current);
            setReqSent(false);
            const jobData = { job_id: data.job_id, sitter_id: d.sitter_id, sitter_name: d.sitter_name, job_data: d };
            (global as any).activeJob = jobData;
            setActiveJobBanner(jobData);
            router.push('/job-accepted');
          } else if (d?.status === 'Cancelled' || d?.status === 'cancelled') {
            clearInterval(pollRef.current);
            setReqSent(false);
            (global as any).activeJob = null;
            setActiveJobBanner(null);
            Alert.alert('Job Cancelled', 'The sitter cancelled before arriving. Please request a new sitter.');
          }
        } catch {}
      }, 3000);

      setTimeout(() => { clearInterval(pollRef.current); if (requestSent) setReqSent(false); }, 900000);

    } catch {
      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);
      Alert.alert('Connection Error','Could not reach server. Please check your internet connection.');
    }
  };

  const requestSpecific = (st: any) => {
    setSelected(null);
    requestNow();
  };

  const inviteAndEarn = () => {
    router.push('/referral');
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* GRADIENT HEADER */}
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.push('/parent-settings')} style={s.avatarWrap} activeOpacity={0.85}>
            <View style={s.avatarFallback}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          </TouchableOpacity>
          <View style={{flex:1}}>
            <Text style={s.greeting}>Hi {user.fname||'there'}! 👋</Text>
            <Text style={s.greetingSub}>
              {sittersLoading ? 'Looking for sitters...'
                : onlineSitters.length > 0
                  ? `${onlineSitters.length} sitter${onlineSitters.length!==1?'s':''} online near you`
                  : 'No sitters online right now'}
            </Text>
          </View>
          <View style={s.logoWrap}>
            <Image source={require('../assets/logo.jpg')} style={s.headerLogo} resizeMode="contain" />
          </View>
        </View>
        {/* Tabs */}
        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab==='now'&&s.tabOn]} onPress={() => setTab('now')}>
            <Text style={[s.tabText, tab==='now'&&s.tabTextOn]}>🕐 Right Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab==='schedule'&&s.tabOn]} onPress={() => { setTab('schedule'); router.push('/schedule-sitter'); }}>
            <Text style={[s.tabText, tab==='schedule'&&s.tabTextOn]}>📅 Schedule</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* JOB IN PROGRESS BANNER */}
      {activeJobBanner && (
        <TouchableOpacity style={s.banner} onPress={() => router.push('/job-accepted')} activeOpacity={0.9}>
          <View style={s.bannerDot} />
          <Text style={s.bannerText}>Job in progress - Tap to return</Text>
          <Text style={s.bannerArrow}>{'>'}</Text>
        </TouchableOpacity>
      )}

      {/* MAP — real online sitters as profile icon pins */}
      <View style={s.mapWrap}>
        {locLoading ? (
          <View style={s.mapLoading}>
            <ActivityIndicator size="large" color="#C93488" />
            <Text style={s.mapLoadingText}>Getting your location...</Text>
          </View>
        ) : (
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE}
            initialRegion={{ latitude:loc?.latitude||29.7604, longitude:loc?.longitude||-95.3698, latitudeDelta:0.05, longitudeDelta:0.05 }}
            showsUserLocation showsMyLocationButton showsCompass>

            {loc && <Circle center={loc} radius={RADIUS_M}
              strokeColor="rgba(201,52,136,0.5)" fillColor="rgba(201,52,136,0.06)" strokeWidth={2} />}

            {/* Real online sitters — profile icon pins */}
            {onlineSitters.map((st, i) => {
              const lat = parseFloat(st.latitude);
              const lng = parseFloat(st.longitude);
              if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
              const initials2 = `${(st.fname||'?')[0]}${(st.lname||'?')[0]}`.toUpperCase();
              const isSelected = selected?.id === st.id;
              return (
                <Marker key={`sitter-${st.id}-${i}`} coordinate={{latitude:lat, longitude:lng}} onPress={() => focusSitter(st)} tracksViewChanges={false}>
                  <View style={s.pin}>
                    <View style={[s.pinAv, isSelected && s.pinAvSelected]}>
                      {st.image
                        ? <Image source={{uri:`https://sitters4me.com/uploads/${st.image}`}} style={s.pinImg} />
                        : <LinearGradient colors={isSelected?['#C93488','#9B5BAB']:['#02A4E2','#0270C8']} style={s.pinGrad}>
                            <Text style={s.pinInitials}>{initials2}</Text>
                          </LinearGradient>
                      }
                      <View style={s.onlineDot} />
                    </View>
                    <View style={s.pinLabel}>
                      <Text style={s.pinName}>{st.fname}</Text>
                      <Text style={s.pinRate}>${st.minrate}/hr</Text>
                    </View>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        )}

        <TouchableOpacity style={s.refreshBtn} onPress={() => { getLocation(); loadOnlineSitters(); }}>
          <Text style={{fontSize:18}}>{sittersLoading?'⏳':'🔄'}</Text>
        </TouchableOpacity>
        <View style={s.radiusBadge}>
          <Text style={s.radiusBadgeText}>📍 {RADIUS_MILES} mi radius</Text>
        </View>
      </View>

      {/* BOTTOM DRAWER */}
      <View style={s.drawer}>
        <View style={s.handle} />

        {/* Default — request + invite */}
        {!selected && !requesting && !requestSent && (
          <View style={{gap:10}}>
            {/* MAIN REQUEST BUTTON */}
            <TouchableOpacity onPress={requestNow} activeOpacity={0.88}>
              <LinearGradient colors={['#ED1E76','#C93488','#9B5BAB']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.requestBtn}>
                <View style={s.requestBtnLeft}>
                  <View style={s.liveDot} />
                  <View style={{flex:1}}>
                    <Text style={s.requestBtnTitle}>Request a Babysitter Now</Text>
                    <Text style={s.requestBtnSub}>
                      {onlineSitters.length > 0
                        ? `${onlineSitters.length} sitter${onlineSitters.length!==1?'s':''} online · Nearest first · 60s to accept`
                        : 'No sitters online — try scheduling for later'}
                    </Text>
                  </View>
                </View>
                <View style={s.requestBtnLogoWrap}>
                  <Image source={require('../assets/logo.jpg')} style={s.requestBtnLogo} resizeMode="contain" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Schedule + Invite row */}
            <View style={{flexDirection:'row', gap:10}}>
              <TouchableOpacity style={s.schedBtn} onPress={() => router.push('/schedule-sitter')} activeOpacity={0.85} flex={1}>
                <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.schedBtnInner}>
                  <Text style={s.schedBtnText}>📅 Schedule</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.inviteBtn} onPress={inviteAndEarn} activeOpacity={0.85}>
                <Text style={s.inviteIcon}>🎁</Text>
                <Text style={s.inviteText}>Invite & Earn $</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Selected sitter profile */}
        {selected && !requesting && !requestSent && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.profileRow}>
              <View style={s.profileAv}>
                {selected.image
                  ? <Image source={{uri:`https://sitters4me.com/uploads/${selected.image}`}} style={{width:56,height:56,borderRadius:16}} />
                  : <>
                      <LinearGradient colors={['#C93488','#02A4E2']} style={StyleSheet.absoluteFill} />
                      <Text style={s.profileAvText}>{`${(selected.fname||'?')[0]}${(selected.lname||'?')[0]}`.toUpperCase()}</Text>
                    </>
                }
              </View>
              <View style={{flex:1}}>
                <Text style={s.profileName}>{selected.fname} {selected.lname}</Text>
                <Text style={s.profileRate}>${selected.minrate}/hr</Text>
                <View style={s.badges}>
                  <View style={s.badge}><Text style={s.badgeText}>📍 {selected.distance_away ? parseFloat(selected.distance_away).toFixed(1)+' mi' : 'Nearby'}</Text></View>
                  {selected.bgcheck==='Y' && <View style={[s.badge,{backgroundColor:'#D4EDE9'}]}><Text style={[s.badgeText,{color:'#1A7F6E'}]}>✓ BG Cleared</Text></View>}
                </View>
              </View>
              <TouchableOpacity onPress={() => { setSelected(null); if (loc) mapRef.current?.animateToRegion({latitude:loc.latitude,longitude:loc.longitude,latitudeDelta:0.05,longitudeDelta:0.05},500); }}>
                <Text style={{color:'#9B9FAE',fontSize:22}}>✕</Text>
              </TouchableOpacity>
            </View>
            {!!selected.about && <Text style={s.profileAbout}>{selected.about}</Text>}
            <View style={s.stats}>
              <View style={s.stat}><Text style={s.statN}>{selected.rating||'—'}</Text><Text style={s.statL}>Rating</Text></View>
              <View style={s.statDiv}/>
              <View style={s.stat}><Text style={s.statN}>{selected.experience||selected.exp||'—'}</Text><Text style={s.statL}>Yrs Exp</Text></View>
              <View style={s.statDiv}/>
              <View style={s.stat}><Text style={s.statN}>{selected.kids||'—'}</Text><Text style={s.statL}>Max Kids</Text></View>
            </View>
            <View style={s.profileActions}>
              <TouchableOpacity style={s.callBtn} onPress={() => Alert.alert('Interview Sitter','This will call the sitter so you can speak with them before booking.')}>
                <Text style={s.callBtnText}>📞 Interview</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:2}} onPress={() => requestSpecific(selected)} activeOpacity={0.85}>
                <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.reqBtn}>
                  <Text style={s.reqBtnText}>Request Now 🍼</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* Searching animation */}
        {requesting && (
          <View style={s.stateBox}>
            <Animated.View style={{transform:[{scale:pulseAnim}]}}>
              <LinearGradient colors={['#ED1E76','#C93488','#9B5BAB']} style={s.pulseCircle}>
                <Image source={require('../assets/logo.jpg')} style={s.pulseImg} resizeMode="contain" />
              </LinearGradient>
            </Animated.View>
            <Text style={s.stateTitle}>Finding a sitter for you...</Text>
            <Text style={s.stateSub}>Sending to {onlineSitters.length} sitters · Nearest first · 60 seconds each</Text>
            <ActivityIndicator color="#C93488" size="small" />
            <TouchableOpacity style={s.cancelBtn} onPress={cancelReq}><Text style={s.cancelBtnText}>Cancel Request</Text></TouchableOpacity>
          </View>
        )}

        {/* Queue / waiting */}
        {requestSent && (
          <View style={s.stateBox}>
            <View style={s.sentIcon}><Text style={{fontSize:36}}>⏳</Text></View>
            <Text style={s.stateTitle}>Waiting for a sitter to accept...</Text>
            <Text style={s.stateSub}>Each sitter has 60 seconds. You'll be notified immediately when one accepts.</Text>
            {queue.length > 0 && (
              <View style={s.queueBox}>
                {queue.slice(0,4).map((st,i) => (
                  <View key={`queue-${i}`} style={s.queueRow}>
                    <View style={s.queueAv}>
                      <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                      <Text style={s.queueAvText}>{`${(st.fname||st.name||'S')[0]}`.toUpperCase()}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={s.queueName}>{st.fname||st.name}</Text>
                      <Text style={s.queueMeta}>{st.distance||st.distance_away ? parseFloat(st.distance||st.distance_away).toFixed(1)+' mi' : 'Nearby'} · ${st.minrate||st.rate}/hr</Text>
                    </View>
                    <View style={[s.queueTag, i===0&&s.queueTagActive]}>
                      <Text style={[s.queueTagText, i===0&&{color:'#C93488'}]}>{i===0?'⏱ 60s':i===1?'Next':'Queued'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={s.cancelBtn} onPress={cancelReq}><Text style={s.cancelBtnText}>Cancel Request</Text></TouchableOpacity>
          </View>
        )}
      </View>
      {/* CHILDREN COUNT + AGES MODAL */}
      <Modal visible={showKidsModal} transparent animationType="slide" onRequestClose={() => setShowKidsModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Children Details</Text>
            <Text style={s.modalSub}>Help your sitter prepare by sharing how many children and their ages</Text>

            {/* Count selector */}
            <Text style={s.modalLabel}>How many children?</Text>
            <View style={s.countRow}>
              {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={`count-${n}`} style={[s.countBtn, kidsCount===n && s.countBtnOn]}
                  onPress={() => updateKidsCount(n)} activeOpacity={0.85}>
                  <Text style={[s.countBtnText, kidsCount===n && s.countBtnTextOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Age inputs per child */}
            <Text style={s.modalLabel}>Ages (optional)</Text>
            <View style={s.ageInputsWrap}>
              {Array.from({length: kidsCount}).map((_, i) => (
                <View key={`age-${i}`} style={s.ageRow}>
                  <Text style={s.ageLabel}>Child {i + 1}</Text>
                  <TextInput
                    style={s.ageInput}
                    value={childAges[i] || ''}
                    onChangeText={t => {
                      const next = [...childAges];
                      next[i] = t;
                      setChildAges(next);
                    }}
                    placeholder="e.g. 3 years"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="default"
                    maxLength={20}
                  />
                </View>
              ))}
            </View>

            {/* Actions */}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowKidsModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={confirmKidsAndRequest} activeOpacity={0.85}>
                <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.modalConfirmGrad}>
                  <Text style={s.modalConfirmText}>Request Sitter</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  banner:            {backgroundColor:'#1A7F6E', flexDirection:'row', alignItems:'center', padding:14, gap:10},
  bannerDot:         {width:9, height:9, borderRadius:5, backgroundColor:'#FFFFFF', opacity:0.9},
  bannerText:        {flex:1, fontSize:14, fontWeight:'700', color:'#FFFFFF'},
  bannerArrow:       {fontSize:18, color:'rgba(255,255,255,0.8)'},
  container:         {flex:1, backgroundColor:'#F5F4F0'},
  header:            {paddingBottom:16},
  headerRow:         {flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingTop:12,paddingBottom:12,gap:12},
  avatarWrap:        {position:'relative'},
  avatarFallback:    {width:44,height:44,borderRadius:22,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'rgba(255,255,255,0.6)'},
  avatarInitials:    {fontSize:15,fontWeight:'800',color:'#FFFFFF'},
  greeting:          {fontSize:18,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  greetingSub:       {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  logoWrap:          {backgroundColor:'rgba(255,255,255,0.92)',borderRadius:10,padding:4},
  headerLogo:        {width:72,height:26},
  tabs:              {flexDirection:'row',marginHorizontal:20,backgroundColor:'rgba(255,255,255,0.15)',borderRadius:12,padding:3},
  tab:               {flex:1,paddingVertical:8,alignItems:'center',borderRadius:10},
  tabOn:             {backgroundColor:'#FFFFFF'},
  tabText:           {fontSize:14,fontWeight:'600',color:'rgba(255,255,255,0.8)'},
  tabTextOn:         {color:'#C93488'},
  mapWrap:           {flex:1,position:'relative'},
  mapLoading:        {flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#E8F4F8'},
  mapLoadingText:    {fontSize:14,color:'#5A5F72'},
  refreshBtn:        {position:'absolute',top:12,right:12,width:40,height:40,backgroundColor:'#FFFFFF',borderRadius:20,alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.15,shadowRadius:6,elevation:4},
  radiusBadge:       {position:'absolute',top:12,left:12,backgroundColor:'rgba(255,255,255,0.92)',borderRadius:20,paddingHorizontal:12,paddingVertical:6},
  radiusBadgeText:   {fontSize:12,fontWeight:'600',color:'#5A5F72'},
  // Sitter map pins — profile icon
  pin:               {alignItems:'center',gap:3},
  pinAv:             {width:48,height:48,borderRadius:24,overflow:'hidden',borderWidth:2.5,borderColor:'#FFFFFF',shadowColor:'#000',shadowOffset:{width:0,height:3},shadowOpacity:0.25,shadowRadius:6,elevation:5},
  pinAvSelected:     {borderColor:'#C93488',transform:[{scale:1.15}]},
  pinImg:            {width:48,height:48},
  pinGrad:           {flex:1,alignItems:'center',justifyContent:'center'},
  pinInitials:       {fontSize:16,fontWeight:'800',color:'#FFFFFF'},
  onlineDot:         {position:'absolute',bottom:0,right:0,width:13,height:13,borderRadius:7,backgroundColor:'#1A7F6E',borderWidth:2,borderColor:'#FFFFFF'},
  pinLabel:          {alignItems:'center',backgroundColor:'rgba(255,255,255,0.96)',borderRadius:8,paddingHorizontal:6,paddingVertical:2},
  pinName:           {fontSize:11,fontWeight:'700',color:'#0F1117'},
  pinRate:           {fontSize:10,fontWeight:'600',color:'#C93488'},
  // Drawer
  drawer:            {backgroundColor:'#FFFFFF',borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,paddingBottom:28,maxHeight:height*0.40,shadowColor:'#000',shadowOffset:{width:0,height:-4},shadowOpacity:0.1,shadowRadius:16,elevation:10},
  handle:            {width:36,height:4,backgroundColor:'#EEECE7',borderRadius:2,alignSelf:'center',marginBottom:12},
  requestBtn:        {borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',shadowColor:'#C93488',shadowOffset:{width:0,height:6},shadowOpacity:0.4,shadowRadius:12,elevation:8},
  requestBtnLeft:    {flexDirection:'row',alignItems:'center',gap:10,flex:1},
  liveDot:           {width:10,height:10,borderRadius:5,backgroundColor:'#FFFFFF'},
  requestBtnTitle:   {fontSize:16,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  requestBtnSub:     {fontSize:11,color:'rgba(255,255,255,0.85)',marginTop:2},
  requestBtnLogoWrap:{backgroundColor:'rgba(255,255,255,0.9)',borderRadius:8,padding:3},
  requestBtnLogo:    {width:44,height:30},
  // Schedule + Invite row
  schedBtn:          {flex:1,borderRadius:12,overflow:'hidden'},
  schedBtnInner:     {padding:13,alignItems:'center'},
  schedBtnText:      {color:'#FFFFFF',fontSize:13,fontWeight:'700'},
  inviteBtn:         {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#FFF0F7',borderRadius:12,padding:12,borderWidth:1.5,borderColor:'rgba(201,52,136,0.25)'},
  inviteIcon:        {fontSize:18},
  inviteText:        {color:'#C93488',fontSize:13,fontWeight:'700'},
  // Sitter profile in drawer
  profileRow:        {flexDirection:'row',alignItems:'flex-start',gap:12,marginBottom:10},
  profileAv:         {width:56,height:56,borderRadius:16,alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0},
  profileAvText:     {fontSize:18,fontWeight:'800',color:'#FFFFFF',zIndex:1},
  profileName:       {fontSize:17,fontWeight:'800',color:'#0F1117'},
  profileRate:       {fontSize:15,color:'#02A4E2',fontWeight:'700',marginTop:2},
  badges:            {flexDirection:'row',gap:6,marginTop:6,flexWrap:'wrap'},
  badge:             {backgroundColor:'#F5F4F0',borderRadius:20,paddingHorizontal:8,paddingVertical:3},
  badgeText:         {fontSize:11,fontWeight:'600',color:'#5A5F72'},
  profileAbout:      {fontSize:13,color:'#5A5F72',lineHeight:20,marginBottom:10},
  stats:             {flexDirection:'row',backgroundColor:'#F5F4F0',borderRadius:12,padding:14,marginBottom:10},
  stat:              {flex:1,alignItems:'center'},
  statN:             {fontSize:20,fontWeight:'900',color:'#0F1117'},
  statL:             {fontSize:11,color:'#9B9FAE',marginTop:2},
  statDiv:           {width:1,backgroundColor:'rgba(15,17,23,0.1)'},
  profileActions:    {flexDirection:'row',gap:10},
  callBtn:           {flex:1,borderRadius:12,padding:14,alignItems:'center',borderWidth:1.5,borderColor:'#E5E2DA'},
  callBtnText:       {fontSize:14,fontWeight:'700',color:'#5A5F72'},
  reqBtn:            {borderRadius:12,padding:14,alignItems:'center'},
  reqBtnText:        {color:'#FFFFFF',fontSize:15,fontWeight:'700'},
  // States
  stateBox:          {alignItems:'center',gap:10,paddingVertical:4},
  pulseCircle:       {width:80,height:80,borderRadius:40,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  pulseImg:          {width:68,height:48},
  sentIcon:          {width:80,height:80,backgroundColor:'#FFF0F7',borderRadius:40,alignItems:'center',justifyContent:'center'},
  stateTitle:        {fontSize:17,fontWeight:'800',color:'#0F1117',textAlign:'center'},
  stateSub:          {fontSize:13,color:'#5A5F72',textAlign:'center',lineHeight:18},
  cancelBtn:         {borderRadius:10,paddingVertical:10,paddingHorizontal:28,borderWidth:1.5,borderColor:'#E5E2DA',marginTop:4},
  cancelBtnText:     {fontSize:14,fontWeight:'600',color:'#5A5F72'},
  queueBox:          {alignSelf:'stretch',gap:8,backgroundColor:'#F5F4F0',borderRadius:12,padding:12},
  queueRow:          {flexDirection:'row',alignItems:'center',gap:10},
  queueAv:           {width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  queueAvText:       {fontSize:12,fontWeight:'700',color:'#FFFFFF',zIndex:1},
  queueName:         {fontSize:13,fontWeight:'600',color:'#0F1117'},
  queueMeta:         {fontSize:11,color:'#9B9FAE'},
  queueTag:          {backgroundColor:'#EEECE7',borderRadius:20,paddingHorizontal:10,paddingVertical:4},
  queueTagActive:    {backgroundColor:'#FFF0F7'},
  queueTagText:      {fontSize:11,fontWeight:'700',color:'#9B9FAE'},
  // Children modal
  modalOverlay:      {flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end'},
  modalBox:          {backgroundColor:'#FFFFFF', borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40},
  modalTitle:        {fontSize:20, fontWeight:'900', color:'#0F1117', marginBottom:6},
  modalSub:          {fontSize:13, color:'#5A5F72', lineHeight:18, marginBottom:20},
  modalLabel:        {fontSize:13, fontWeight:'700', color:'#5A5F72', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10},
  countRow:          {flexDirection:'row', gap:10, marginBottom:20},
  countBtn:          {width:48, height:48, borderRadius:24, borderWidth:2, borderColor:'#E5E2DA', alignItems:'center', justifyContent:'center', backgroundColor:'#F5F4F0'},
  countBtnOn:        {borderColor:'#C93488', backgroundColor:'#FFF0F7'},
  countBtnText:      {fontSize:18, fontWeight:'800', color:'#9B9FAE'},
  countBtnTextOn:    {color:'#C93488'},
  ageInputsWrap:     {gap:10, marginBottom:24},
  ageRow:            {flexDirection:'row', alignItems:'center', gap:12},
  ageLabel:          {fontSize:14, fontWeight:'600', color:'#0F1117', width:60},
  ageInput:          {flex:1, borderWidth:1.5, borderColor:'#E5E2DA', borderRadius:10, paddingHorizontal:14, paddingVertical:10, fontSize:14, color:'#0F1117', backgroundColor:'#F9F8F6'},
  modalActions:      {flexDirection:'row', gap:10},
  modalCancel:       {flex:1, borderRadius:12, padding:14, alignItems:'center', borderWidth:1.5, borderColor:'#E5E2DA'},
  modalCancelText:   {fontSize:15, fontWeight:'700', color:'#5A5F72'},
  modalConfirm:      {flex:2, borderRadius:12, overflow:'hidden'},
  modalConfirmGrad:  {padding:14, alignItems:'center'},
  modalConfirmText:  {fontSize:15, fontWeight:'800', color:'#FFFFFF'},
});