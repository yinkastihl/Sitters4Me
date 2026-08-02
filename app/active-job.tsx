// app/active-job.tsx — Sitter active job with live location push
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Linking, ActivityIndicator, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API     = 'https://sitters4me.com/api/jobs.php';
const LOC_INTERVAL = 10000; // push location every 10 seconds

export default function ActiveJob() {
  const router    = useRouter();
  const timerRef  = useRef<any>(null);
  const locRef    = useRef<any>(null);

  const [job,     setJob]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState<'travelling'|'arrived'|'started'|'done'>('travelling');
  const [elapsed, setElapsed] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatPollRef = useRef<any>(null);

  const user  = global.currentUser || {};
  const rate  = user.minrate || job?.rate || 15;
  const earnings = ((elapsed / 3600) * rate).toFixed(2);

  useEffect(() => {
    loadActiveJob();
    startLocationSharing();
    // Poll unread chat messages every 5s
    const startChatPoll = () => {
      chatPollRef.current = setInterval(async () => {
        const j = job || (global as any).activeJob;
        const jid = j?.id || j?.job_id;
        if (!jid) return;
        try {
          const res = await axios.post(`${JOBS_API}?action=get_unread_count`, {
            job_id: jid, viewer_type: 'sitter',
          });
          if (res.data?.success) {
            const newCount = res.data.data?.unread || 0;
            setUnreadCount(prev => {
              if (newCount > prev) try { Vibration.vibrate(200); } catch {}
              return newCount;
            });
          }
        } catch {}
      }, 5000);
    };
    startChatPoll();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(locRef.current);
      clearInterval(chatPollRef.current);
    };
  }, []);

  const loadActiveJob = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_active_job`, { sitter_id: user.id });
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        setJob(d);
        // Restore status and timer if returning mid-job
        const st = (d.status || '').toLowerCase();
        if (st === 'started' || st === 'in_progress' || st === 'in progress') {
          setStatus('started');
          // Calculate elapsed: prefer global jobStartTime, then server started_at
          let elapsedSec = 0;
          if ((global as any).jobStartTime) {
            elapsedSec = Math.max(0, Math.floor((Date.now() - (global as any).jobStartTime) / 1000));
          } else if (d.started_at) {
            elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(d.started_at).getTime()) / 1000));
            (global as any).jobStartTime = Date.now() - (elapsedSec * 1000);
          }
          setElapsed(elapsedSec);
          clearInterval(timerRef.current);
          const base = (global as any).jobStartTime || Date.now();
          timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - base) / 1000));
          }, 1000);
        } else if (st === 'arrived') {
          setStatus('arrived');
        } else if (st === 'completed' || st === 'complete') {
          setStatus('done');
        } else if (st === 'travelling' || st === 'assigned') {
          setStatus('travelling');
        }
      } else if (global.activeJob) {
        setJob(global.activeJob);
      }
    } catch { if (global.activeJob) setJob(global.activeJob); }
    finally { setLoading(false); }
  };

  // Push location to server every 10s so parent can track
  const startLocationSharing = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Push immediately then every 10s
      await pushLocation();
      locRef.current = setInterval(pushLocation, LOC_INTERVAL);
    } catch {}
  };

  const pushLocation = async () => {
    if (!user.id) return;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await axios.post(`${JOBS_API}?action=update_location`, {
        sitter_id: user.id,
        lat:       loc.coords.latitude,
        lng:       loc.coords.longitude,
      });
    } catch {}
  };

  const fmt = (s: number) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };


  const handleArrived = async () => {
    setStatus('arrived');
    const j = job || global.activeJob;
    const jobId = j?.id || j?.job_id;
    if (jobId) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await axios.post(`${JOBS_API}?action=sitter_arrived`, {
          job_id: jobId, sitter_id: user.id,
          lat: loc.coords.latitude, lng: loc.coords.longitude,
        });
      } catch {}
    }
    Alert.alert('Arrived!', 'The parent has been notified that you have arrived.');
  };

  const handleStartJob = async () => {
    setStatus('started');
    const j = job || global.activeJob;
    const jobId = j?.id || j?.job_id;
    if (jobId) {
      try { await axios.post(`${JOBS_API}?action=start_job`, { job_id: jobId, sitter_id: user.id }); } catch {}
    }
    const startTime = Date.now();
    (global as any).jobStartTime = startTime;
    setElapsed(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - ((global as any).jobStartTime || startTime)) / 1000);
      setElapsed(e);
    }, 1000);
    Alert.alert('Job Started!', 'Timer is running. The parent has been notified.');
  };

  const handleEndJob = async () => {
    Alert.alert(
      'End Job?',
      `Time: ${fmt(elapsed)}\nEarnings: $${earnings}\n\nThis will notify the parent the job is complete.`,
      [
        { text: 'Continue Job', style: 'cancel' },
        { text: 'End Job', onPress: async () => {
          clearInterval(timerRef.current);
          setStatus('done');
          const j2 = job || global.activeJob;
          const jid2 = j2?.id || j2?.job_id;
          if (jid2) { try { await axios.post(`${JOBS_API}?action=stop_job`, { job_id: jid2, sitter_id: user.id }); } catch {} }
          const finalElapsed = elapsed;
          (global as any).activeJob = null;
          Alert.alert('Job Complete!',
            `Duration: ${fmt(finalElapsed)}\nEarnings: $${((finalElapsed / 3600) * rate).toFixed(2)}\n\nPayment will be processed shortly.`,
            [{ text: 'Rate Parent', onPress: () => router.push({
                pathname: '/rate-parent',
                params: {
                  parent_id: String(job?.parent_id || ''),
                  parent_name: job?.parent_name || 'Parent',
                  job_id: String(job?.id || job?.job_id || ''),
                  seconds: String(finalElapsed),
                  kids: String(job?.kids || 1),
                  child_ages: job?.child_ages || '',
                }
              })},
             { text: 'Done', onPress: () => router.replace('/sitter-home') }]
          );
        }},
      ]
    );
  };

  const callParent = () => {
    const phone = job?.parent_phone || job?.parent?.phone;
    if (!phone) return Alert.alert('No Phone', 'Parent phone not available.');
    Linking.openURL(`tel:${phone}`);
  };

  const textParent = () => {
    const phone = job?.parent_phone || job?.parent?.phone;
    if (!phone) return Alert.alert('No Phone', 'Parent phone not available.');
    Linking.openURL(`sms:${phone}`);
  };

  const getDirections = () => {
    const j = job || (global as any).activeJob || {};
    const lat = j.parent_lat || j.lat;
    const lng = j.parent_lng || j.lng;
    const addr = j.address || j.city;
    if (lat && lng && parseFloat(lat) !== 0) {
      Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}`);
    } else if (addr) {
      Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(addr)}`);
    } else {
      Alert.alert('No Address', 'Parent location not available.');
    }
  };

  const pInitials = job?.parent_name
    ? job.parent_name.split(' ').map((n:string)=>n[0]).join('').toUpperCase()
    : 'P';

  const statusColor = {travelling:'#F5A623',arrived:'#02A4E2',started:'#1A7F6E',done:'#1A7F6E'}[status];
  const statusLabel = {
    travelling:'🚗 Travelling to parent',
    arrived:   '📍 Arrived at location',
    started:   '⏱️ Job in progress',
    done:      '✅ Job complete',
  }[status];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#02A4E2','#0270C8','#9B5BAB']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/sitter-home')} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Active Job</Text>
            <Text style={s.headerSub}>{statusLabel}</Text>
          </View>
          <View style={{width:36}} />
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
            {/* Timer */}
            {(status === 'started' || status === 'done') && (
              <View style={[s.timerCard, status==='done'&&{backgroundColor:'#1A7F6E'}]}>
                <Text style={s.timerLabel}>{status==='done'?'Total Time':'Elapsed Time'}</Text>
                <Text style={s.timerDisplay}>{fmt(elapsed)}</Text>
                <View style={s.earningsRow}>
                  <Text style={s.earningsLabel}>{status==='done'?'Total Earned':'Current Earnings'}</Text>
                  <Text style={s.earningsValue}>${earnings}</Text>
                </View>
                <Text style={s.rateNote}>${rate}/hr × {(elapsed/3600).toFixed(2)} hrs</Text>
              </View>
            )}

            {/* Status indicator */}
            <View style={[s.statusCard, {borderColor:statusColor}]}>
              <View style={[s.statusDot, {backgroundColor:statusColor}]} />
              <Text style={[s.statusText, {color:statusColor}]}>{statusLabel}</Text>
              {status === 'travelling' && (
                <View style={s.liveTag}>
                  <Text style={s.liveTagText}>📡 LIVE</Text>
                </View>
              )}
            </View>

            {/* Parent info */}
            <View style={s.parentCard}>
              <Text style={s.cardTitle}>Parent Details</Text>
              <View style={s.parentTop}>
                <View style={s.parentAv}>
                  <LinearGradient colors={['#C93488','#9B5BAB']} style={StyleSheet.absoluteFill} />
                  <Text style={s.parentAvText}>{pInitials}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.parentName}>{job?.parent_name || 'Parent'}</Text>
                  <Text style={s.parentMeta}>{job?.kids||1} child{(job?.kids||1)!==1?'ren':''}</Text>
                  {job?.address ? <Text style={s.parentAddress} numberOfLines={2}>📍 {job.address}{job.city?', '+job.city:''}</Text> : null}
                </View>
              </View>
              <View style={s.contactRow}>
                <TouchableOpacity style={s.callBtn} onPress={callParent} activeOpacity={0.85}>
                  <Text style={{fontSize:18}}>📞</Text><Text style={s.callBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.textBtn} onPress={textParent} activeOpacity={0.85}>
                  <Text style={{fontSize:18}}>💬</Text><Text style={s.textBtnText}>Text</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.chatBtn} onPress={() => {
                  const j = job || (global as any).activeJob || {};
                  const sitterUser = global.currentUser || {};
                  const parentName = j.parent_name || j.parent_fname || 'Parent';
                  (global as any).chatJob = {
                    job_id:        j.id || j.job_id || 0,
                    viewer_type:   'sitter',
                    viewer_id:     Number(sitterUser.id) || 0,
                    other_name:    parentName,
                    other_initial: parentName[0]?.toUpperCase() || 'P',
                  };
                  setUnreadCount(0);
                  router.push('/chat');
                }} activeOpacity={0.85}>
                  <Text style={{fontSize:18}}>{'\uD83D\uDCAC'}</Text><Text style={s.chatBtnText}>Chat</Text>
                  {unreadCount > 0 && (
                    <View style={s.chatBadge}>
                      <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.directionsBtn} onPress={getDirections} activeOpacity={0.85}>
                <Text style={s.directionsBtnText}>🗺️ Get Directions</Text>
              </TouchableOpacity>
            </View>

            {/* Location sharing notice */}
            <View style={s.locationNote}>
              <Text style={s.locationNoteText}>
                📡 Your location is being shared with the parent in real time so they can track your arrival.
              </Text>
            </View>

            {/* Job details */}
            <View style={s.detailCard}>
              <Text style={s.cardTitle}>Job Summary</Text>
              {[
                ['Job ID',    `#${job?.id||job?.job_id||'—'}`],
                ['Children',  `${job?.kids||1}`],
                ['Your Rate', `$${rate}/hr`],
                ['Address',   job?.address||'—'],
              ].map(([label,value])=>(
                <View key={label} style={s.detailRow}>
                  <Text style={s.detailLabel}>{label}</Text>
                  <Text style={s.detailValue}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            {status==='travelling' && (
              <>
                <TouchableOpacity onPress={handleArrived} activeOpacity={0.85}>
                  <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.actionBtn}>
                    <Text style={s.actionBtnText}>📍  I Have Arrived</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelJobBtn} onPress={() => {
                  Alert.alert('Cancel Job?', 'Cancel this job before arriving?',
                    [{ text: 'Keep Job', style: 'cancel' },
                     { text: 'Cancel Job', style: 'destructive', onPress: async () => {
                        const j = job || global.activeJob;
                        const jobId = j?.id || j?.job_id;
                        if (jobId) { try { await axios.post(JOBS_API+'?action=cancel_request',
                          { job_id: jobId, parent_id: job?.parent_id || 0 }); } catch {} }
                        clearInterval(timerRef.current); clearInterval(locRef.current);
                        global.activeJob = null; router.replace('/sitter-home');
                     }}]
                  );
                }} activeOpacity={0.85}>
                  <Text style={s.cancelJobText}>✕  Cancel Job</Text>
                </TouchableOpacity>
              </>
            )}
            {status==='arrived' && (
              <TouchableOpacity onPress={handleStartJob} activeOpacity={0.85}>
                <LinearGradient colors={['#1A7F6E','#0D5C51']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.actionBtn}>
                  <Text style={s.actionBtnText}>▶  Start Job & Timer</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {status==='started' && (
              <TouchableOpacity onPress={handleEndJob} activeOpacity={0.85}>
                <LinearGradient colors={['#BF3B2E','#8B1A10']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.actionBtn}>
                  <Text style={s.actionBtnText}>■  End Job</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            {status==='done' && (
              <View style={s.doneCard}>
                <Text style={s.doneText}>🎉 Job Complete!</Text>
                <Text style={s.doneSub}>Earnings: ${earnings} · {fmt(elapsed)}</Text>
                <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/sitter-home')} activeOpacity={0.85}>
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
  container:      {flex:1,backgroundColor:'#F5F4F0'},
  header:         {paddingBottom:16},
  headerRow:      {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  backBtn:        {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:       {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:    {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  headerSub:      {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  scroll:         {flex:1,marginTop:-16},
  content:        {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  loadBox:        {alignItems:'center',paddingVertical:48,gap:12},
  loadText:       {fontSize:14,color:'#5A5F72'},
  timerCard:      {backgroundColor:'#2C3E50',borderRadius:20,padding:28,alignItems:'center',gap:6},
  timerLabel:     {fontSize:12,fontWeight:'600',color:'rgba(255,255,255,0.7)',letterSpacing:1.5,textTransform:'uppercase'},
  timerDisplay:   {fontSize:52,fontWeight:'900',color:'#FFFFFF',letterSpacing:-2},
  earningsRow:    {flexDirection:'row',alignItems:'center',gap:10,marginTop:4},
  earningsLabel:  {fontSize:13,color:'rgba(255,255,255,0.7)'},
  earningsValue:  {fontSize:28,fontWeight:'900',color:'#FFFFFF'},
  rateNote:       {fontSize:12,color:'rgba(255,255,255,0.5)'},
  statusCard:     {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFFFFF',borderRadius:12,padding:14,borderWidth:2},
  statusDot:      {width:12,height:12,borderRadius:6},
  statusText:     {fontSize:15,fontWeight:'700',flex:1},
  liveTag:        {backgroundColor:'#FFF0F7',borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  liveTagText:    {fontSize:10,fontWeight:'800',color:'#C93488'},
  parentCard:     {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  cardTitle:      {fontSize:16,fontWeight:'800',color:'#0F1117',marginBottom:14},
  parentTop:      {flexDirection:'row',gap:12,marginBottom:14},
  parentAv:       {width:56,height:56,borderRadius:16,alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0},
  parentAvText:   {fontSize:18,fontWeight:'800',color:'#FFFFFF',zIndex:1},
  parentName:     {fontSize:17,fontWeight:'800',color:'#0F1117'},
  parentMeta:     {fontSize:13,color:'#5A5F72',marginTop:2},
  parentAddress:  {fontSize:12,color:'#9B9FAE',marginTop:4,lineHeight:18},
  contactRow:     {flexDirection:'row',gap:10,marginBottom:10},
  callBtn:        {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#1A7F6E',borderRadius:10,padding:12},
  callBtnText:    {color:'#FFFFFF',fontSize:13,fontWeight:'700'},
  textBtn:        {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#E8F6FD',borderRadius:10,padding:12,borderWidth:1.5,borderColor:'rgba(2,164,226,0.3)'},
  textBtnText:    {color:'#02A4E2',fontSize:13,fontWeight:'700'},
  directionsBtn:  {backgroundColor:'#F5F4F0',borderRadius:10,padding:12,alignItems:'center',borderWidth:1,borderColor:'#E5E2DA'},
  directionsBtnText:{fontSize:14,fontWeight:'700',color:'#5A5F72'},
  locationNote:   {backgroundColor:'#FFF0F7',borderRadius:12,padding:12,borderWidth:1,borderColor:'rgba(201,52,136,0.2)'},
  locationNoteText:{fontSize:13,color:'#C93488',lineHeight:18},
  detailCard:     {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  detailRow:      {flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.07)'},
  detailLabel:    {fontSize:13,color:'#9B9FAE',fontWeight:'600'},
  detailValue:    {fontSize:13,color:'#0F1117',fontWeight:'600',flex:1,textAlign:'right'},
  actionBtn:      {borderRadius:14,padding:18,alignItems:'center'},
  actionBtnText:  {color:'#FFFFFF',fontSize:17,fontWeight:'800'},
  doneCard:       {backgroundColor:'#D4EDE9',borderRadius:16,padding:24,alignItems:'center',gap:8,borderWidth:1,borderColor:'rgba(26,127,110,0.2)'},
  doneText:       {fontSize:22,fontWeight:'900',color:'#1A7F6E'},
  doneSub:        {fontSize:15,color:'#1A7F6E',fontWeight:'600'},
  doneBtn:        {marginTop:8,backgroundColor:'#1A7F6E',borderRadius:12,paddingVertical:12,paddingHorizontal:32},
  doneBtnText:    {color:'#FFFFFF',fontSize:15,fontWeight:'700'},
  chatBtn:        {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#F5F4F0',borderRadius:10,padding:12,borderWidth:1.5,borderColor:'#E5E2DA'},
  chatBtnText:    {color:'#5A5F72',fontSize:13,fontWeight:'700'},
  chatBadge:      {position:'absolute',top:-6,right:-6,minWidth:20,height:20,borderRadius:10,backgroundColor:'#E53935',alignItems:'center',justifyContent:'center',paddingHorizontal:4,borderWidth:2,borderColor:'#FFFFFF'},
  chatBadgeText:  {color:'#FFFFFF',fontSize:11,fontWeight:'800'},
  cancelJobBtn:   {borderRadius:12,padding:14,alignItems:'center',borderWidth:1.5,borderColor:'rgba(191,59,46,0.3)',backgroundColor:'#FDE9E7'},
  cancelJobText:  {color:'#BF3B2E',fontSize:15,fontWeight:'700'},
});
