// app/job-tracking.tsx — Parent watches sitter travel in real time
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Alert, Linking, ActivityIndicator, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';
const POLL_MS  = 5000; // poll sitter location every 5 seconds

export default function JobTracking() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const jobId      = params.job_id      as string || (global.activeJob?.job_id  || '');
  const sitterId   = params.sitter_id   as string || (global.activeJob?.sitter_id || '');
  const sitterName = params.sitter_name as string || (global.activeJob?.sitter_name || 'Your Sitter');
  const sitterPhone= params.sitter_phone as string || '';
  const sitterImg  = params.sitter_image as string || '';

  const mapRef   = useRef<MapView>(null);
  const pollRef  = useRef<any>(null);
  const pulseAnim= useRef(new Animated.Value(1)).current;

  const user = global.currentUser || {};

  const [sitterLoc,  setSitterLoc]  = useState<{latitude:number,longitude:number}|null>(null);
  const [parentLoc,  setParentLoc]  = useState<{latitude:number,longitude:number}|null>(null);
  const [routePath,  setRoutePath]  = useState<{latitude:number,longitude:number}[]>([]);
  const [jobStatus,  setJobStatus]  = useState<'travelling'|'arrived'|'started'|'completed'>('travelling');
  const [eta,        setEta]        = useState('');
  const [distance,   setDistance]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null);

  const fname    = (sitterName||'').split(' ')[0];
  const initials = sitterName.split(' ').map((n:string)=>n[0]||'').join('').toUpperCase().slice(0,2);

  useEffect(() => {
    startPulse();
    loadInitialData();
    pollRef.current = setInterval(pollSitterLocation, POLL_MS);
    return () => {
      clearInterval(pollRef.current);
      pulseAnim.stopAnimation();
    };
  }, []);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Get job details including parent address for map
      const res = await axios.post(`${JOBS_API}?action=job_status`, { job_id: jobId });
      if (res.data.success) {
        const d = res.data.data;
        // Set job status
        if (d.sitter_status === 'arrived')  setJobStatus('arrived');
        if (d.sitter_status === 'started')  setJobStatus('started');
        if (d.status === 'Completed')       setJobStatus('completed');
        // Set parent's location as destination
        if (user.latitude && user.longitude) {
          setParentLoc({ latitude: parseFloat(user.latitude), longitude: parseFloat(user.longitude) });
        }
      }
      // Get sitter's current location
      await pollSitterLocation();
    } catch (e) {
      console.log('loadInitialData error:', e);
    } finally {
      setLoading(false);
    }
  };

  const pollSitterLocation = async () => {
    if (!sitterId) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_location`, {
        sitter_id: sitterId,
        job_id:    jobId,
      });
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        const newLoc = {
          latitude:  parseFloat(d.latitude),
          longitude: parseFloat(d.longitude),
        };

        if (!isNaN(newLoc.latitude) && !isNaN(newLoc.longitude) && newLoc.latitude !== 0) {
          setSitterLoc(newLoc);
          setLastUpdate(new Date());

          // Update route path (keep last 30 points for trail)
          setRoutePath(prev => {
            const updated = [...prev, newLoc];
            return updated.slice(-30);
          });

          // Calculate distance/ETA if we have parent location
          if (user.latitude && user.longitude) {
            const pLat = parseFloat(user.latitude);
            const pLng = parseFloat(user.longitude);
            const dist = haversine(newLoc.latitude, newLoc.longitude, pLat, pLng);
            setDistance(dist < 0.1 ? 'Arriving now' : dist.toFixed(1) + ' mi away');

            // Rough ETA at 25mph average
            const mins = Math.ceil((dist / 25) * 60);
            setEta(dist < 0.1 ? 'Arriving now' : mins <= 1 ? '1 min' : `${mins} mins`);
          }

          // Auto-fit map to show both markers
          if (user.latitude && user.longitude) {
            fitMap(newLoc, { latitude: parseFloat(user.latitude), longitude: parseFloat(user.longitude) });
          }
        }

        // Check job status updates
        if (d.sitter_status === 'arrived')  setJobStatus('arrived');
        if (d.sitter_status === 'started')  setJobStatus('started');
        if (d.job_status === 'Completed')   setJobStatus('completed');
      }
    } catch {}
  };

  const fitMap = (sLoc: any, pLoc: any) => {
    try {
      mapRef.current?.fitToCoordinates([sLoc, pLoc], {
        edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    } catch {}
  };

  const haversine = (lat1:number, lon1:number, lat2:number, lon2:number) => {
    const R = 3959; // miles
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
              Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const callSitter = () => {
    if (!sitterPhone) return Alert.alert('No Phone', 'Phone number not available.');
    Alert.alert(`Call ${fname}?`, sitterPhone, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${sitterPhone}`) },
    ]);
  };

  const textSitter = () => {
    if (!sitterPhone) return Alert.alert('No Phone', 'Phone number not available.');
    Linking.openURL(`sms:${sitterPhone}`);
  };

  const lastUpdatedText = lastUpdate
    ? `Updated ${Math.round((Date.now()-lastUpdate.getTime())/1000)}s ago`
    : 'Waiting for location...';

  const statusConfig = {
    travelling: { icon:'🚗', label:`${fname} is on the way`,  color:'#F5A623', bg:'#FDF3DC' },
    arrived:    { icon:'📍', label:`${fname} has arrived!`,   color:'#1A7F6E', bg:'#D4EDE9' },
    started:    { icon:'⏱️', label:'Job in progress',          color:'#02A4E2', bg:'#E8F6FD' },
    completed:  { icon:'✅', label:'Job complete!',             color:'#1A7F6E', bg:'#D4EDE9' },
  }[jobStatus];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Live Tracking</Text>
            <Text style={s.headerSub}>{lastUpdatedText}</Text>
          </View>
          <TouchableOpacity style={s.callHeaderBtn} onPress={callSitter}>
            <Text style={{fontSize:20}}>📞</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* MAP */}
      <View style={s.mapWrap}>
        {loading && !sitterLoc ? (
          <View style={s.mapLoading}>
            <ActivityIndicator size="large" color="#C93488" />
            <Text style={s.mapLoadingText}>Getting {fname}'s location...</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude:       sitterLoc?.latitude  || parseFloat(user.latitude  || '29.76'),
              longitude:      sitterLoc?.longitude || parseFloat(user.longitude || '-95.37'),
              latitudeDelta:  0.05,
              longitudeDelta: 0.05,
            }}
            showsTraffic
            showsUserLocation
          >
            {/* Route trail */}
            {routePath.length > 1 && (
              <Polyline
                coordinates={routePath}
                strokeColor="#C93488"
                strokeWidth={3}
                lineDashPattern={[1]}
              />
            )}

            {/* Sitter marker — animated pulsing car */}
            {sitterLoc && (
              <Marker coordinate={sitterLoc} anchor={{x:0.5,y:0.5}}>
                <View style={s.sitterMarkerWrap}>
                  <Animated.View style={[s.sitterPulse, {transform:[{scale:pulseAnim}], opacity: pulseAnim.interpolate({inputRange:[1,1.4],outputRange:[0.3,0]})}]} />
                  <View style={s.sitterMarker}>
                    {sitterImg
                      ? <Image source={{uri:`https://sitters4me.com/uploads/${sitterImg}`}} style={s.sitterMarkerImg} />
                      : <LinearGradient colors={['#C93488','#9B5BAB']} style={s.sitterMarkerGrad}>
                          <Text style={s.sitterMarkerInitials}>{initials}</Text>
                        </LinearGradient>
                    }
                  </View>
                  <View style={s.sitterMarkerLabel}>
                    <Text style={s.sitterMarkerName}>{fname}</Text>
                    {eta ? <Text style={s.sitterMarkerEta}>{eta}</Text> : null}
                  </View>
                </View>
              </Marker>
            )}

            {/* Parent / destination marker */}
            {parentLoc && (
              <Marker coordinate={parentLoc} anchor={{x:0.5,y:1}}>
                <View style={s.homeMarker}>
                  <Text style={{fontSize:28}}>🏠</Text>
                  <View style={s.homeLabel}>
                    <Text style={s.homeLabelText}>Your Home</Text>
                  </View>
                </View>
              </Marker>
            )}
          </MapView>
        )}
      </View>

      {/* BOTTOM PANEL */}
      <View style={s.panel}>

        {/* Status banner */}
        <View style={[s.statusBanner, {backgroundColor: statusConfig.bg, borderColor: statusConfig.color+'40'}]}>
          <Text style={{fontSize:24}}>{statusConfig.icon}</Text>
          <View style={{flex:1}}>
            <Text style={[s.statusLabel, {color: statusConfig.color}]}>{statusConfig.label}</Text>
            {jobStatus === 'travelling' && eta && distance ? (
              <Text style={s.statusSub}>📍 {distance} · ETA {eta}</Text>
            ) : jobStatus === 'arrived' ? (
              <Text style={s.statusSub}>The sitter is at your location</Text>
            ) : jobStatus === 'started' ? (
              <Text style={s.statusSub}>Babysitting session is in progress</Text>
            ) : null}
          </View>
          {/* Live pulse indicator */}
          {jobStatus === 'travelling' && (
            <View style={s.liveWrap}>
              <Animated.View style={[s.liveDot, {transform:[{scale:pulseAnim}]}]} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Sitter info row */}
        <View style={s.sitterRow}>
          <View style={s.sitterAvWrap}>
            {sitterImg
              ? <Image source={{uri:`https://sitters4me.com/uploads/${sitterImg}`}} style={s.sitterAv} />
              : <LinearGradient colors={['#02A4E2','#0270C8']} style={s.sitterAvFallback}>
                  <Text style={s.sitterAvInitials}>{initials}</Text>
                </LinearGradient>
            }
            <View style={s.onlineDot} />
          </View>
          <View style={{flex:1}}>
            <Text style={s.sitterName}>{sitterName}</Text>
            <Text style={s.sitterSub}>Your babysitter</Text>
          </View>
          <View style={s.contactBtns}>
            <TouchableOpacity style={s.contactBtn} onPress={callSitter} activeOpacity={0.85}>
              <Text style={{fontSize:18}}>📞</Text>
              <Text style={s.contactBtnLabel}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.contactBtn} onPress={textSitter} activeOpacity={0.85}>
              <Text style={{fontSize:18}}>💬</Text>
              <Text style={s.contactBtnLabel}>Text</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Job complete button */}
        {jobStatus === 'completed' && (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/payment',
              params: { job_id: jobId, sitter_id: sitterId, sitter_name: sitterName, rate: user.minrate || 15 },
            })}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#1A7F6E','#0D5C51']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.payBtn}>
              <Text style={s.payBtnText}>💳 Pay {fname} Now</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          {flex:1,backgroundColor:'#F5F4F0'},
  header:             {paddingBottom:16},
  headerRow:          {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  backBtn:            {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:           {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:        {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  headerSub:          {fontSize:12,color:'rgba(255,255,255,0.75)',marginTop:2},
  callHeaderBtn:      {width:40,height:40,alignItems:'center',justifyContent:'center'},
  mapWrap:            {flex:1},
  mapLoading:         {flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#E8F4F8'},
  mapLoadingText:     {fontSize:14,color:'#5A5F72'},
  // Sitter map marker
  sitterMarkerWrap:   {alignItems:'center'},
  sitterPulse:        {position:'absolute',width:60,height:60,borderRadius:30,backgroundColor:'#C93488'},
  sitterMarker:       {width:48,height:48,borderRadius:24,overflow:'hidden',borderWidth:3,borderColor:'#FFFFFF',shadowColor:'#C93488',shadowOffset:{width:0,height:4},shadowOpacity:0.5,shadowRadius:8,elevation:8},
  sitterMarkerImg:    {width:48,height:48},
  sitterMarkerGrad:   {flex:1,alignItems:'center',justifyContent:'center'},
  sitterMarkerInitials:{fontSize:16,fontWeight:'800',color:'#FFFFFF'},
  sitterMarkerLabel:  {backgroundColor:'rgba(255,255,255,0.95)',borderRadius:8,paddingHorizontal:8,paddingVertical:3,marginTop:4,alignItems:'center'},
  sitterMarkerName:   {fontSize:11,fontWeight:'700',color:'#0F1117'},
  sitterMarkerEta:    {fontSize:10,color:'#C93488',fontWeight:'600'},
  // Home marker
  homeMarker:         {alignItems:'center'},
  homeLabel:          {backgroundColor:'rgba(255,255,255,0.95)',borderRadius:8,paddingHorizontal:8,paddingVertical:3,marginTop:2},
  homeLabelText:      {fontSize:11,fontWeight:'700',color:'#0F1117'},
  // Bottom panel
  panel:              {backgroundColor:'#FFFFFF',borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,paddingBottom:32,gap:12,shadowColor:'#000',shadowOffset:{width:0,height:-4},shadowOpacity:0.1,shadowRadius:16,elevation:10},
  statusBanner:       {flexDirection:'row',alignItems:'center',gap:12,borderRadius:14,padding:14,borderWidth:1},
  statusLabel:        {fontSize:15,fontWeight:'800'},
  statusSub:          {fontSize:13,color:'#5A5F72',marginTop:2},
  liveWrap:           {alignItems:'center',gap:3},
  liveDot:            {width:10,height:10,borderRadius:5,backgroundColor:'#C93488'},
  liveText:           {fontSize:9,fontWeight:'800',color:'#C93488',letterSpacing:1},
  sitterRow:          {flexDirection:'row',alignItems:'center',gap:12},
  sitterAvWrap:       {position:'relative'},
  sitterAv:           {width:52,height:52,borderRadius:16},
  sitterAvFallback:   {width:52,height:52,borderRadius:16,alignItems:'center',justifyContent:'center'},
  sitterAvInitials:   {fontSize:18,fontWeight:'800',color:'#FFFFFF'},
  onlineDot:          {position:'absolute',bottom:-2,right:-2,width:14,height:14,borderRadius:7,backgroundColor:'#1A7F6E',borderWidth:2,borderColor:'#FFFFFF'},
  sitterName:         {fontSize:16,fontWeight:'800',color:'#0F1117'},
  sitterSub:          {fontSize:13,color:'#9B9FAE',marginTop:1},
  contactBtns:        {flexDirection:'row',gap:8},
  contactBtn:         {alignItems:'center',backgroundColor:'#F5F4F0',borderRadius:10,padding:10,gap:3,minWidth:52},
  contactBtnLabel:    {fontSize:11,fontWeight:'600',color:'#5A5F72'},
  payBtn:             {borderRadius:14,padding:16,alignItems:'center'},
  payBtnText:         {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
});
