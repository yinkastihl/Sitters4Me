// app/parent-home.tsx — July 24 restore, clean unicode
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Dimensions, ActivityIndicator,
  Animated, Image,
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
  const [requestSent, setRequestSent]       = useState(false);
  const [queue, setQueue]                   = useState<any[]>([]);
  const [kidsCount, setKidsCount]           = useState<number>((global.currentUser || {}).kids || 1);
  const [activeJobBanner, setActiveJobBanner] = useState<any>((global as any).activeJob || null);

  const user         = global.currentUser || {};
  const RADIUS_MILES = user.search_radius || 10;
  const RADIUS_M     = RADIUS_MILES * 1609.34;
  const initials     = `${(user.fname || '?')[0]}${(user.lname || '?')[0]}`.toUpperCase();

  useEffect(() => {
    if ((global as any).activeJob) setActiveJobBanner((global as any).activeJob);
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
      if (status !== 'granted') { setLoc({ latitude: 29.7604, longitude: -95.3698 }); return; }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch { setLoc({ latitude: 29.7604, longitude: -95.3698 }); }
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

  const cancelReq = () => {
    pulseLoop.current?.stop?.();
    pulseAnim.setValue(1);
    clearInterval(pollRef.current);
    setRequesting(false);
    setRequestSent(false);
    setQueue([]);
  };

  const requestNow = () => {
    if (!loc) return Alert.alert('Location Required', 'Please enable location to request a sitter.');
    Alert.alert(
      'How many children?',
      'Tell the sitter how many children need care',
      [
        { text: '1 child',    onPress: () => doRequest(1) },
        { text: '2 children', onPress: () => doRequest(2) },
        { text: '3 children', onPress: () => doRequest(3) },
        { text: '4 children', onPress: () => doRequest(4) },
        { text: '5 children', onPress: () => doRequest(5) },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const doRequest = async (numKids: number) => {
    setKidsCount(numKids);
    if (onlineSitters.length === 0) {
      return Alert.alert(
        'No Sitters Online',
        `No babysitters are online within ${RADIUS_MILES} miles. Try scheduling for a later time.`
      );
    }
    setRequesting(true);
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
      const res = await axios.post(`${JOBS_API}?action=request_live`, {
        parent_id: user.id || 1,
        lat:       loc.latitude,
        lng:       loc.longitude,
        radius:    RADIUS_MILES,
        kids:      numKids,
        address:   'Current location',
      });
      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);

      if (!res.data?.success)
        return Alert.alert('Error', res.data?.error || 'Could not send request. Try again.');

      const data = res.data.data;
      if (!data?.sitters_found || data.sitters_found === 0)
        return Alert.alert('No Sitters Available', 'All nearby sitters are busy. Try again in a few minutes.');

      setQueue(data.queue || []);
      setRequestSent(true);

      pollRef.current = setInterval(async () => {
        try {
          const sr = await axios.post(`${JOBS_API}?action=job_status`, { job_id: data.job_id });
          const jst = sr.data?.data?.status;
          if (jst === 'assigned') {
            clearInterval(pollRef.current);
            setRequestSent(false);
            const jobData = { job_id: data.job_id, ...sr.data.data };
            (global as any).activeJob = jobData;
            setActiveJobBanner(jobData);
            Alert.alert(
              'Sitter Found!',
              `${sr.data.data.sitter_name || 'A sitter'} accepted and is on the way!`,
              [
                { text: 'View Job', onPress: () => router.push('/job-accepted') },
                { text: 'OK' },
              ]
            );
          } else if (jst === 'Cancelled' || jst === 'cancelled') {
            clearInterval(pollRef.current);
            setRequestSent(false);
            (global as any).activeJob = null;
            setActiveJobBanner(null);
            Alert.alert('Job Cancelled', 'The sitter cancelled. Please request a new sitter.');
          }
        } catch {}
      }, 5000);

    } catch {
      pulseLoop.current?.stop?.();
      pulseAnim.setValue(1);
      setRequesting(false);
      Alert.alert('Connection Error', 'Could not reach the server. Check your internet connection.');
    }
  };

  const focusSitter = (st: any) => {
    setSelected(st);
    mapRef.current?.animateToRegion({
      latitude:      parseFloat(st.latitude) - 0.003,
      longitude:     parseFloat(st.longitude),
      latitudeDelta: 0.02, longitudeDelta: 0.02,
    }, 600);
  };

  const dismissSitter = () => {
    setSelected(null);
    if (loc) mapRef.current?.animateToRegion({
      latitude: loc.latitude, longitude: loc.longitude,
      latitudeDelta: 0.05, longitudeDelta: 0.05,
    }, 500);
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.push('/parent-settings')} style={s.avatarWrap} activeOpacity={0.85}>
            <View style={s.avatarFallback}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          </TouchableOpacity>
          <View style={{flex:1}}>
            <Text style={s.greeting}>Hi {user.fname || 'there'}!</Text>
            <Text style={s.greetingSub}>
              {sittersLoading
                ? 'Looking for online sitters...'
                : onlineSitters.length > 0
                  ? `${onlineSitters.length} sitter${onlineSitters.length !== 1 ? 's' : ''} online nearby`
                  : 'No sitters online right now'}
            </Text>
          </View>
          <TouchableOpacity style={s.settingsBtn} onPress={() => router.push('/parent-settings')} activeOpacity={0.85}>
            <Text style={{fontSize:22}}>{'⚙️'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* JOB IN PROGRESS BANNER */}
      {activeJobBanner && (
        <TouchableOpacity
          style={s.banner}
          onPress={() => router.push('/job-accepted')}
          activeOpacity={0.9}
        >
          <View style={s.bannerDot} />
          <Text style={s.bannerText}>Job in progress - Tap to return</Text>
          <Text style={s.bannerArrow}>{'>'}</Text>
        </TouchableOpacity>
      )}

      {/* MAP */}
      <View style={s.mapWrap}>
        {locLoading ? (
          <View style={s.mapLoading}>
            <ActivityIndicator size="large" color="#C93488" />
            <Text style={s.mapLoadingText}>Getting your location...</Text>
          </View>
        ) : (
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: loc?.latitude || 29.7604,
              longitude: loc?.longitude || -95.3698,
              latitudeDelta: 0.05, longitudeDelta: 0.05,
            }}
            showsUserLocation showsMyLocationButton showsCompass>

            {loc && <Circle center={loc} radius={RADIUS_M}
              strokeColor="rgba(201,52,136,0.5)" fillColor="rgba(201,52,136,0.06)" strokeWidth={2} />}

            {onlineSitters.map((st, i) => {
              const lat = parseFloat(st.latitude);
              const lng = parseFloat(st.longitude);
              if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
              const si = `${(st.fname||'?')[0]}${(st.lname||'?')[0]}`.toUpperCase();
              const isSel = selected?.id === st.id;
              return (
                <Marker key={st.id||i} coordinate={{latitude:lat, longitude:lng}}
                  onPress={() => focusSitter(st)} tracksViewChanges={false}>
                  <View style={s.pin}>
                    <View style={[s.pinAv, isSel && s.pinAvSel]}>
                      {st.image
                        ? <Image source={{uri:`https://sitters4me.com/uploads/${st.image}`}} style={s.pinImg} />
                        : <LinearGradient colors={isSel?['#C93488','#9B5BAB']:['#02A4E2','#0270C8']} style={s.pinGrad}>
                            <Text style={s.pinInitials}>{si}</Text>
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
          <Text style={{fontSize:18}}>{sittersLoading ? '...' : 'R'}</Text>
        </TouchableOpacity>
        <View style={s.radiusBadge}>
          <Text style={s.radiusBadgeText}>{RADIUS_MILES} mi radius</Text>
        </View>
      </View>

      {/* DRAWER */}
      <View style={s.drawer}>
        <View style={s.handle} />

        {!selected && !requesting && !requestSent && (
          <View style={{gap:10}}>
            {onlineSitters.length === 0 && !sittersLoading ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTitle}>No sitters online right now</Text>
                <Text style={s.emptySub}>No babysitters online within {RADIUS_MILES} miles.</Text>
                <TouchableOpacity style={s.refreshSittersBtn} onPress={loadOnlineSitters}>
                  <Text style={s.refreshSittersText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity onPress={requestNow} activeOpacity={0.88}>
                  <LinearGradient colors={['#ED1E76','#C93488','#9B5BAB']}
                    start={{x:0,y:0}} end={{x:1,y:0}} style={s.requestBtn}>
                    <View style={s.requestBtnLeft}>
                      <View style={s.liveDot} />
                      <View style={{flex:1}}>
                        <Text style={s.requestBtnTitle}>Request a Babysitter Now</Text>
                        <Text style={s.requestBtnSub}>
                          {onlineSitters.length} sitter{onlineSitters.length!==1?'s':''} online - Nearest first - 60s to accept
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={s.chipLabel}>Online Now - Tap to View Profile</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10,paddingRight:16}}>
                  {onlineSitters.map((st, i) => (
                    <TouchableOpacity key={st.id||i} style={s.chip} onPress={() => focusSitter(st)} activeOpacity={0.85}>
                      <View style={s.chipAv}>
                        {st.image
                          ? <Image source={{uri:`https://sitters4me.com/uploads/${st.image}`}} style={{width:42,height:42,borderRadius:21}} />
                          : <>
                              <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                              <Text style={s.chipAvText}>{`${(st.fname||'?')[0]}${(st.lname||'?')[0]}`.toUpperCase()}</Text>
                            </>
                        }
                      </View>
                      <View>
                        <Text style={s.chipName}>{st.fname}</Text>
                        <Text style={s.chipRate}>${st.minrate}/hr</Text>
                        <Text style={s.chipDist}>{st.distance_away ? parseFloat(st.distance_away).toFixed(1)+' mi' : 'Nearby'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <TouchableOpacity onPress={() => router.push('/schedule-sitter')} activeOpacity={0.85}>
              <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.schedBtn}>
                <Text style={s.schedBtnText}>Schedule a Sitter for Later</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {selected && !requesting && !requestSent && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.profileRow}>
              <View style={s.profileAvWrap}>
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
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{selected.distance_away ? parseFloat(selected.distance_away).toFixed(1)+' mi' : 'Nearby'}</Text>
                  </View>
                  {selected.bgcheck === 'Y' && (
                    <View style={[s.badge,{backgroundColor:'#D4EDE9'}]}>
                      <Text style={[s.badgeText,{color:'#1A7F6E'}]}>BG Cleared</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={dismissSitter}>
                <Text style={{color:'#9B9FAE',fontSize:22}}>X</Text>
              </TouchableOpacity>
            </View>
            {!!selected.about && <Text style={s.profileAbout}>{selected.about}</Text>}
            <View style={s.profileActions}>
              <TouchableOpacity style={s.callBtn}
                onPress={() => Alert.alert('Interview Sitter','Call the sitter before booking.')}>
                <Text style={s.callBtnText}>Interview</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:2}}
                onPress={() => Alert.alert(
                  `Request ${selected.fname}?`,
                  `Rate: $${selected.minrate}/hr\n\nSend a direct request? They have 60 seconds to accept.`,
                  [
                    {text:'Cancel',style:'cancel'},
                    {text:'Send Request',onPress:()=>{setSelected(null);requestNow();}},
                  ]
                )} activeOpacity={0.85}>
                <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.reqBtn}>
                  <Text style={s.reqBtnText}>Request Now</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {requesting && (
          <View style={s.stateBox}>
            <Animated.View style={{transform:[{scale:pulseAnim}]}}>
              <LinearGradient colors={['#ED1E76','#C93488','#9B5BAB']} style={s.pulseCircle}>
                <Text style={{fontSize:32}}>{'🍼'}</Text>
              </LinearGradient>
            </Animated.View>
            <Text style={s.stateTitle}>Finding a sitter...</Text>
            <Text style={s.stateSub}>Sending to {onlineSitters.length} sitters - Nearest first - 60s each</Text>
            <ActivityIndicator color="#C93488" size="small" />
            <TouchableOpacity style={s.cancelBtn} onPress={cancelReq}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {requestSent && (
          <View style={s.stateBox}>
            <Text style={{fontSize:36}}>{'⏳'}</Text>
            <Text style={s.stateTitle}>Waiting for a sitter to accept...</Text>
            <Text style={s.stateSub}>Each sitter has 60 seconds. You will be notified when one accepts.</Text>
            {queue.length > 0 && (
              <View style={s.queueBox}>
                {queue.slice(0,3).map((st,i) => (
                  <View key={i} style={s.queueRow}>
                    <View style={s.queueAv}>
                      <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                      <Text style={s.queueAvText}>{`${(st.fname||'?')[0]}`.toUpperCase()}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={s.queueName}>{st.fname} {st.lname}</Text>
                      <Text style={s.queueMeta}>${st.minrate}/hr</Text>
                    </View>
                    <View style={[s.queueTag, i===0&&s.queueTagActive]}>
                      <Text style={[s.queueTagText,i===0&&{color:'#C93488'}]}>
                        {i===0?'Notified':i===1?'Next':'Queued'}
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:         {flex:1, backgroundColor:'#F5F4F0'},
  header:            {paddingBottom:20},
  headerRow:         {flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:14, paddingBottom:6, gap:12},
  avatarWrap:        {position:'relative'},
  avatarFallback:    {width:52, height:52, borderRadius:26, backgroundColor:'rgba(255,255,255,0.25)', alignItems:'center', justifyContent:'center', borderWidth:2.5, borderColor:'rgba(255,255,255,0.6)'},
  avatarInitials:    {fontSize:18, fontWeight:'800', color:'#FFFFFF'},
  greeting:          {fontSize:18, fontWeight:'900', color:'#FFFFFF', letterSpacing:-0.3},
  greetingSub:       {fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:2},
  settingsBtn:       {width:40, height:40, alignItems:'center', justifyContent:'center'},
  banner:            {backgroundColor:'#1A7F6E', flexDirection:'row', alignItems:'center', padding:14, gap:10},
  bannerDot:         {width:9, height:9, borderRadius:5, backgroundColor:'#FFFFFF', opacity:0.9},
  bannerText:        {flex:1, fontSize:14, fontWeight:'700', color:'#FFFFFF'},
  bannerArrow:       {fontSize:18, color:'rgba(255,255,255,0.8)'},
  mapWrap:           {flex:1, position:'relative'},
  mapLoading:        {flex:1, alignItems:'center', justifyContent:'center', gap:12, backgroundColor:'#E8F4F8'},
  mapLoadingText:    {fontSize:14, color:'#5A5F72'},
  refreshBtn:        {position:'absolute', top:12, right:12, width:40, height:40, backgroundColor:'#FFFFFF', borderRadius:20, alignItems:'center', justifyContent:'center', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.15, shadowRadius:6, elevation:4},
  radiusBadge:       {position:'absolute', top:12, left:12, backgroundColor:'rgba(255,255,255,0.92)', borderRadius:20, paddingHorizontal:12, paddingVertical:6},
  radiusBadgeText:   {fontSize:12, fontWeight:'600', color:'#5A5F72'},
  pin:               {alignItems:'center', gap:2},
  pinAv:             {width:48, height:48, borderRadius:24, overflow:'hidden', borderWidth:2.5, borderColor:'#FFFFFF', shadowColor:'#000', shadowOffset:{width:0,height:3}, shadowOpacity:0.25, shadowRadius:6, elevation:5},
  pinAvSel:          {borderColor:'#C93488', transform:[{scale:1.15}]},
  pinImg:            {width:48, height:48},
  pinGrad:           {flex:1, alignItems:'center', justifyContent:'center'},
  pinInitials:       {fontSize:16, fontWeight:'800', color:'#FFFFFF'},
  onlineDot:         {position:'absolute', bottom:0, right:0, width:13, height:13, borderRadius:7, backgroundColor:'#1A7F6E', borderWidth:2, borderColor:'#FFFFFF'},
  pinLabel:          {alignItems:'center', backgroundColor:'rgba(255,255,255,0.95)', borderRadius:8, paddingHorizontal:6, paddingVertical:2},
  pinName:           {fontSize:11, fontWeight:'700', color:'#0F1117'},
  pinRate:           {fontSize:10, fontWeight:'600', color:'#C93488'},
  drawer:            {backgroundColor:'#FFFFFF', borderTopLeftRadius:24, borderTopRightRadius:24, padding:16, paddingBottom:28, maxHeight:height*0.46, shadowColor:'#000', shadowOffset:{width:0,height:-4}, shadowOpacity:0.1, shadowRadius:16, elevation:10},
  handle:            {width:36, height:4, backgroundColor:'#EEECE7', borderRadius:2, alignSelf:'center', marginBottom:12},
  emptyBox:          {alignItems:'center', paddingVertical:8, gap:6},
  emptyTitle:        {fontSize:16, fontWeight:'800', color:'#0F1117'},
  emptySub:          {fontSize:13, color:'#5A5F72', textAlign:'center'},
  refreshSittersBtn: {marginTop:8, backgroundColor:'#F5F4F0', borderRadius:10, paddingVertical:10, paddingHorizontal:24, borderWidth:1, borderColor:'#E5E2DA'},
  refreshSittersText:{fontSize:13, fontWeight:'700', color:'#5A5F72'},
  requestBtn:        {borderRadius:16, padding:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', shadowColor:'#C93488', shadowOffset:{width:0,height:6}, shadowOpacity:0.4, shadowRadius:12, elevation:8},
  requestBtnLeft:    {flexDirection:'row', alignItems:'center', gap:10, flex:1},
  liveDot:           {width:10, height:10, borderRadius:5, backgroundColor:'#FFFFFF'},
  requestBtnTitle:   {fontSize:16, fontWeight:'900', color:'#FFFFFF', letterSpacing:-0.3},
  requestBtnSub:     {fontSize:11, color:'rgba(255,255,255,0.85)', marginTop:2},
  chipLabel:         {fontSize:13, fontWeight:'800', color:'#0F1117'},
  chip:              {flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#F5F4F0', borderRadius:14, padding:10, paddingRight:14, borderWidth:1, borderColor:'#E5E2DA'},
  chipAv:            {width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center', overflow:'hidden'},
  chipAvText:        {fontSize:14, fontWeight:'700', color:'#FFFFFF', zIndex:1},
  chipName:          {fontSize:13, fontWeight:'700', color:'#0F1117'},
  chipRate:          {fontSize:12, color:'#02A4E2', fontWeight:'600'},
  chipDist:          {fontSize:11, color:'#9B9FAE'},
  schedBtn:          {borderRadius:12, padding:13, alignItems:'center'},
  schedBtnText:      {color:'#FFFFFF', fontSize:14, fontWeight:'700'},
  profileRow:        {flexDirection:'row', alignItems:'flex-start', gap:12, marginBottom:10},
  profileAvWrap:     {width:56, height:56, borderRadius:16, alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0},
  profileAvText:     {fontSize:18, fontWeight:'800', color:'#FFFFFF', zIndex:1},
  profileName:       {fontSize:17, fontWeight:'800', color:'#0F1117'},
  profileRate:       {fontSize:15, color:'#02A4E2', fontWeight:'700', marginTop:2},
  badges:            {flexDirection:'row', gap:6, marginTop:6, flexWrap:'wrap'},
  badge:             {backgroundColor:'#F5F4F0', borderRadius:20, paddingHorizontal:8, paddingVertical:3},
  badgeText:         {fontSize:11, fontWeight:'600', color:'#5A5F72'},
  profileAbout:      {fontSize:13, color:'#5A5F72', lineHeight:20, marginBottom:12},
  profileActions:    {flexDirection:'row', gap:10},
  callBtn:           {flex:1, borderRadius:12, padding:14, alignItems:'center', borderWidth:1.5, borderColor:'#E5E2DA'},
  callBtnText:       {fontSize:14, fontWeight:'700', color:'#5A5F72'},
  reqBtn:            {borderRadius:12, padding:14, alignItems:'center'},
  reqBtnText:        {color:'#FFFFFF', fontSize:15, fontWeight:'700'},
  stateBox:          {alignItems:'center', gap:10, paddingVertical:4},
  pulseCircle:       {width:80, height:80, borderRadius:40, alignItems:'center', justifyContent:'center'},
  cancelBtn:         {borderRadius:10, paddingVertical:10, paddingHorizontal:28, borderWidth:1.5, borderColor:'#E5E2DA', marginTop:4},
  cancelBtnText:     {fontSize:14, fontWeight:'600', color:'#5A5F72'},
  stateTitle:        {fontSize:17, fontWeight:'800', color:'#0F1117', textAlign:'center'},
  stateSub:          {fontSize:13, color:'#5A5F72', textAlign:'center', lineHeight:18},
  queueBox:          {alignSelf:'stretch', gap:8, backgroundColor:'#F5F4F0', borderRadius:12, padding:12},
  queueRow:          {flexDirection:'row', alignItems:'center', gap:10},
  queueAv:           {width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center', overflow:'hidden'},
  queueAvText:       {fontSize:12, fontWeight:'700', color:'#FFFFFF', zIndex:1},
  queueName:         {fontSize:13, fontWeight:'600', color:'#0F1117'},
  queueMeta:         {fontSize:11, color:'#9B9FAE'},
  queueTag:          {backgroundColor:'#EEECE7', borderRadius:20, paddingHorizontal:10, paddingVertical:4},
  queueTagActive:    {backgroundColor:'#FFF0F7'},
  queueTagText:      {fontSize:11, fontWeight:'700', color:'#9B9FAE'},
});
