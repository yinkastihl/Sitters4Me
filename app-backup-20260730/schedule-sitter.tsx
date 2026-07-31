// app/schedule-sitter.tsx — Parent schedules a sitter for a future date
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, StatusBar, Alert, ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API = 'https://sitters4me.com/api/jobs.php';

const DURATIONS = ['2 hrs','3 hrs','4 hrs','5 hrs','6 hrs','8 hrs','Full day'];
const TIMES     = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
                   '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
                   '6:00 PM','7:00 PM','8:00 PM','9:00 PM'];

// Generate next 30 days
function getNext30Days() {
  const days = [];
  const now  = new Date();
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 1; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push({
      label:    dayNames[d.getDay()],
      date:     d.getDate(),
      month:    monthNames[d.getMonth()],
      full:     `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      dayOfWeek:d.getDay(),
    });
  }
  return days;
}

export default function ScheduleSitter() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [selectedDay,  setSelectedDay]  = useState<any>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [duration,     setDuration]     = useState('');
  const [kids,         setKids]         = useState(String(user.kids || 1));
  const [notes,        setNotes]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [step,         setStep]         = useState<'date'|'time'|'details'>('date');

  const days = getNext30Days();
  const isWeekend = (d: any) => d.dayOfWeek === 0 || d.dayOfWeek === 6;

  const goToTime = () => {
    if (!selectedDay) return Alert.alert('Select a Date', 'Please select a date first.');
    setStep('time');
  };

  const goToDetails = () => {
    if (!selectedTime) return Alert.alert('Select a Time', 'Please select a start time.');
    if (!duration)     return Alert.alert('Select Duration', 'Please select how long you need a sitter.');
    setStep('details');
  };

  const submit = async () => {
    if (!selectedDay || !selectedTime || !duration)
      return Alert.alert('Missing Info', 'Please complete all required fields.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=schedule_job`, {
        parent_id:    user.id,
        date:         selectedDay.full,
        start_time:   selectedTime,
        duration:     duration,
        kids:         parseInt(kids) || 1,
        notes:        notes.trim(),
        address:      user.address || '',
        city:         user.city    || '',
        state:        user.state   || '',
        latitude:     0,
        longitude:    0,
        search_radius: user.search_radius || 10,
      });
      if (res.data.success) {
        Alert.alert(
          '📅 Booking Confirmed!',
          `Your babysitter is scheduled for:\n\n📅 ${selectedDay.full}\n⏰ ${selectedTime}\n⌛ ${duration}\n\nNearby sitters will be notified. You will receive confirmation shortly.`,
          [{ text: 'View My Bookings', onPress: () => router.replace('/parent-home') }]
        );
      } else {
        Alert.alert('Error', res.data.error || 'Could not create booking. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet connection.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#02A4E2','#0270C8','#9B5BAB','#C93488']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => step==='date' ? router.back() : setStep(step==='time'?'date':'time')} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Schedule a Sitter</Text>
            <Text style={s.headerSub}>
              {step==='date' ? 'Step 1 of 3 — Pick a date'
               : step==='time' ? 'Step 2 of 3 — Pick a time'
               : 'Step 3 of 3 — Final details'}
            </Text>
          </View>
          <View style={{width:36}} />
        </View>

        {/* Progress */}
        <View style={s.progBg}>
          <View style={[s.progFill, {width: step==='date'?'33%':step==='time'?'66%':'100%'}]} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* STEP 1 — DATE */}
        {step === 'date' && (
          <>
            <Text style={s.stepTitle}>When do you need a sitter?</Text>
            {selectedDay && (
              <View style={s.selectedBanner}>
                <Text style={s.selectedBannerText}>
                  ✓ Selected: {selectedDay.full}
                </Text>
              </View>
            )}
            <View style={s.calendarGrid}>
              {days.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.dayBtn,
                    selectedDay?.full === d.full && s.dayBtnSelected,
                    isWeekend(d) && s.dayBtnWeekend,
                  ]}
                  onPress={() => setSelectedDay(d)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.dayLabel, selectedDay?.full===d.full && {color:'#fff'}]}>
                    {d.label}
                  </Text>
                  <Text style={[s.dayDate, selectedDay?.full===d.full && {color:'#fff'}]}>
                    {d.date}
                  </Text>
                  <Text style={[s.dayMonth, selectedDay?.full===d.full && {color:'rgba(255,255,255,0.8)'}]}>
                    {d.month}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={goToTime} activeOpacity={0.85}>
              <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.nextBtn}>
                <Text style={s.nextBtnText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 2 — TIME + DURATION */}
        {step === 'time' && (
          <>
            <Text style={s.stepTitle}>What time?</Text>
            <View style={s.selectedBanner}>
              <Text style={s.selectedBannerText}>📅 {selectedDay?.full}</Text>
            </View>

            <Text style={s.subLabel}>START TIME</Text>
            <View style={s.timeGrid}>
              {TIMES.map(t => (
                <TouchableOpacity key={t}
                  style={[s.timeBtn, selectedTime===t && s.timeBtnSelected]}
                  onPress={() => setSelectedTime(t)} activeOpacity={0.8}>
                  <Text style={[s.timeBtnText, selectedTime===t && {color:'#fff'}]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.subLabel,{marginTop:16}]}>HOW LONG DO YOU NEED A SITTER?</Text>
            <View style={s.durationGrid}>
              {DURATIONS.map(d => (
                <TouchableOpacity key={d}
                  style={[s.durationBtn, duration===d && s.durationBtnSelected]}
                  onPress={() => setDuration(d)} activeOpacity={0.8}>
                  <Text style={[s.durationBtnText, duration===d && {color:'#fff'}]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={goToDetails} activeOpacity={0.85}>
              <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.nextBtn}>
                <Text style={s.nextBtnText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3 — DETAILS */}
        {step === 'details' && (
          <>
            <Text style={s.stepTitle}>Final Details</Text>

            {/* Summary */}
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Booking Summary</Text>
              {[
                ['📅','Date',    selectedDay?.full],
                ['⏰','Time',    selectedTime],
                ['⌛','Duration',duration],
                ['📍','Location',`${user.city||'—'}${user.state?', '+user.state:''}`],
              ].map(([icon,label,val]) => (
                <View key={label} style={s.summaryRow}>
                  <Text style={s.summaryIcon}>{icon}</Text>
                  <Text style={s.summaryLabel}>{label}</Text>
                  <Text style={s.summaryVal}>{val}</Text>
                </View>
              ))}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Number of Children</Text>
              <View style={s.kidsRow}>
                {[1,2,3,4,5].map(n => (
                  <TouchableOpacity key={n}
                    style={[s.kidsBtn, kids===String(n) && s.kidsBtnSelected]}
                    onPress={() => setKids(String(n))} activeOpacity={0.8}>
                    <Text style={[s.kidsBtnText, kids===String(n) && {color:'#fff'}]}>{n}</Text>
                    <Text style={[s.kidsBtnSub, kids===String(n) && {color:'rgba(255,255,255,0.8)'}]}>
                      {n===1?'child':'kids'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Special Notes</Text>
              <Text style={s.cardSub}>Optional — allergies, bedtime routine, special instructions</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Emma is allergic to peanuts. Bedtime at 8pm. Snacks in the fridge."
                placeholderTextColor="#9B9FAE"
                multiline numberOfLines={4}
                textAlignVertical="top"
                maxLength={300}
              />
            </View>

            <TouchableOpacity onPress={submit} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#C93488','#9B5BAB']} start={{x:0,y:0}} end={{x:1,y:0}}
                style={[s.nextBtn, loading && {opacity:0.7}]}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.nextBtnText}>📅 Confirm Booking</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:         {flex:1,backgroundColor:'#F5F4F0'},
  header:            {paddingBottom:0},
  headerRow:         {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:12},
  backBtn:           {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:          {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:       {fontSize:18,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  headerSub:         {fontSize:12,color:'rgba(255,255,255,0.8)',marginTop:2},
  progBg:            {height:4,backgroundColor:'rgba(255,255,255,0.25)'},
  progFill:          {height:4,backgroundColor:'#FFFFFF',borderRadius:2},
  scroll:            {flex:1},
  content:           {padding:16,paddingBottom:48,gap:14},
  stepTitle:         {fontSize:22,fontWeight:'900',color:'#0F1117',marginTop:8,letterSpacing:-0.3},
  selectedBanner:    {backgroundColor:'#D4EDE9',borderRadius:10,padding:12,borderWidth:1,borderColor:'rgba(26,127,110,0.2)'},
  selectedBannerText:{fontSize:14,fontWeight:'700',color:'#1A7F6E'},
  subLabel:          {fontSize:11,fontWeight:'700',color:'#5A5F72',letterSpacing:0.6,textTransform:'uppercase'},
  calendarGrid:      {flexDirection:'row',flexWrap:'wrap',gap:8},
  dayBtn:            {width:'13.5%',aspectRatio:0.85,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E5E2DA',gap:1},
  dayBtnSelected:    {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  dayBtnWeekend:     {backgroundColor:'#F5F4F0'},
  dayLabel:          {fontSize:9,fontWeight:'700',color:'#9B9FAE',textTransform:'uppercase'},
  dayDate:           {fontSize:16,fontWeight:'900',color:'#0F1117'},
  dayMonth:          {fontSize:9,color:'#9B9FAE'},
  timeGrid:          {flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},
  timeBtn:           {paddingHorizontal:12,paddingVertical:9,borderRadius:20,borderWidth:1.5,borderColor:'#E5E2DA',backgroundColor:'#FFFFFF'},
  timeBtnSelected:   {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  timeBtnText:       {fontSize:13,fontWeight:'600',color:'#5A5F72'},
  durationGrid:      {flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},
  durationBtn:       {paddingHorizontal:16,paddingVertical:10,borderRadius:20,borderWidth:1.5,borderColor:'#E5E2DA',backgroundColor:'#FFFFFF'},
  durationBtnSelected:{backgroundColor:'#C93488',borderColor:'#C93488'},
  durationBtnText:   {fontSize:13,fontWeight:'600',color:'#5A5F72'},
  nextBtn:           {borderRadius:14,padding:17,alignItems:'center',marginTop:8},
  nextBtnText:       {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
  summaryCard:       {backgroundColor:'#FFFFFF',borderRadius:14,padding:18,gap:10,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  summaryTitle:      {fontSize:15,fontWeight:'800',color:'#0F1117',marginBottom:4},
  summaryRow:        {flexDirection:'row',alignItems:'center',gap:8},
  summaryIcon:       {fontSize:16,width:24},
  summaryLabel:      {fontSize:13,color:'#9B9FAE',width:72},
  summaryVal:        {fontSize:13,fontWeight:'600',color:'#0F1117',flex:1},
  card:              {backgroundColor:'#FFFFFF',borderRadius:14,padding:18,gap:8,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  cardTitle:         {fontSize:15,fontWeight:'800',color:'#0F1117'},
  cardSub:           {fontSize:13,color:'#9B9FAE'},
  kidsRow:           {flexDirection:'row',gap:8,marginTop:4},
  kidsBtn:           {flex:1,alignItems:'center',paddingVertical:12,borderRadius:12,borderWidth:1.5,borderColor:'#E5E2DA',backgroundColor:'#FFFFFF'},
  kidsBtnSelected:   {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  kidsBtnText:       {fontSize:18,fontWeight:'900',color:'#0F1117'},
  kidsBtnSub:        {fontSize:10,color:'#9B9FAE',marginTop:2},
  notesInput:        {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:14,color:'#0F1117',minHeight:100},
});
