// app/earnings.tsx — Sitter earnings history screen
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const PAY_API = 'https://sitters4me.com/api/payments.php';

export default function Earnings() {
  const router   = useRouter();
  const user     = global.currentUser || {};
  const [payments, setPayments] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<'all'|'week'|'month'>('month');

  useEffect(() => { loadEarnings(); }, []);

  const loadEarnings = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${PAY_API}?action=get_history`, {
        user_id: user.id, user_type: 'sitter',
      });
      if (res.data.success) setPayments(res.data.data || []);
    } catch {
      // fail silently — show empty state
    } finally { setLoading(false); }
  };

  const fmtDate = (dt: string) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  };

  const now = new Date();
  const filtered = payments.filter(p => {
    if (filter === 'all') return true;
    const d = new Date(p.created_at);
    if (filter === 'week') return (now.getTime()-d.getTime()) < 7*24*3600*1000;
    if (filter === 'month') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    return true;
  });

  const totalEarned = filtered.reduce((sum,p) => sum + parseFloat(p.sitter_payout||0), 0);
  const totalJobs   = filtered.length;
  const avgPerJob   = totalJobs > 0 ? totalEarned/totalJobs : 0;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#02A4E2','#0270C8','#9B5BAB']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>💰 My Earnings</Text>
          <View style={{width:36}} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Summary cards */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard,{backgroundColor:'#02A4E2'}]}>
            <Text style={s.summaryIcon}>💰</Text>
            <Text style={s.summaryAmount}>${totalEarned.toFixed(2)}</Text>
            <Text style={s.summaryLabel}>Total Earned</Text>
          </View>
          <View style={[s.summaryCard,{backgroundColor:'#1A7F6E'}]}>
            <Text style={s.summaryIcon}>💼</Text>
            <Text style={s.summaryAmount}>{totalJobs}</Text>
            <Text style={s.summaryLabel}>Jobs Completed</Text>
          </View>
          <View style={[s.summaryCard,{backgroundColor:'#C93488'}]}>
            <Text style={s.summaryIcon}>⭐</Text>
            <Text style={s.summaryAmount}>${avgPerJob.toFixed(2)}</Text>
            <Text style={s.summaryLabel}>Avg Per Job</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {(['week','month','all'] as const).map(f => (
            <TouchableOpacity key={f}
              style={[s.filterBtn, filter===f && s.filterBtnOn]}
              onPress={() => setFilter(f)} activeOpacity={0.8}>
              <Text style={[s.filterText, filter===f && s.filterTextOn]}>
                {f==='week'?'This Week':f==='month'?'This Month':'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Earnings list */}
        {loading ? (
          <View style={s.loadBox}>
            <ActivityIndicator color="#02A4E2" size="large" />
            <Text style={s.loadText}>Loading earnings...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>💳</Text>
            <Text style={s.emptyTitle}>No earnings yet</Text>
            <Text style={s.emptySub}>
              {filter==='week'?'No completed paid jobs this week'
               :filter==='month'?'No completed paid jobs this month'
               :'Complete jobs to see your earnings here'}
            </Text>
          </View>
        ) : (
          <>
            {filtered.map((p, i) => (
              <View key={p.id||i} style={s.earningCard}>
                <View style={s.earningLeft}>
                  <View style={s.earningAv}>
                    <LinearGradient colors={['#C93488','#9B5BAB']} style={StyleSheet.absoluteFill} />
                    <Text style={s.earningAvText}>
                      {((p.parent_fname||'?')[0]+(p.parent_lname||'?')[0]).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={s.earningName}>{p.parent_fname} {p.parent_lname}</Text>
                    <Text style={s.earningMeta}>
                      {p.hours_worked}hrs × ${parseFloat(p.hourly_rate).toFixed(2)}/hr
                    </Text>
                    <Text style={s.earningDate}>{fmtDate(p.created_at)}</Text>
                  </View>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={s.earningAmount}>${parseFloat(p.sitter_payout).toFixed(2)}</Text>
                  <View style={s.paidBadge}><Text style={s.paidBadgeText}>✓ Paid</Text></View>
                </View>
              </View>
            ))}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#F5F4F0'},
  header:          {paddingBottom:20},
  headerRow:       {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  backBtn:         {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:        {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:     {flex:1,fontSize:20,fontWeight:'900',color:'#FFFFFF',textAlign:'center'},
  scroll:          {flex:1,marginTop:-16},
  content:         {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  summaryRow:      {flexDirection:'row',gap:10},
  summaryCard:     {flex:1,borderRadius:14,padding:14,alignItems:'center',gap:4},
  summaryIcon:     {fontSize:22},
  summaryAmount:   {fontSize:20,fontWeight:'900',color:'#FFFFFF'},
  summaryLabel:    {fontSize:10,color:'rgba(255,255,255,0.8)',fontWeight:'600',textAlign:'center'},
  filterRow:       {flexDirection:'row',backgroundColor:'#FFFFFF',borderRadius:12,padding:4,borderWidth:1,borderColor:'#E5E2DA'},
  filterBtn:       {flex:1,paddingVertical:8,borderRadius:9,alignItems:'center'},
  filterBtnOn:     {backgroundColor:'#02A4E2'},
  filterText:      {fontSize:12,fontWeight:'600',color:'#5A5F72'},
  filterTextOn:    {color:'#FFFFFF'},
  loadBox:         {alignItems:'center',paddingVertical:48,gap:12},
  loadText:        {fontSize:14,color:'#5A5F72'},
  emptyBox:        {alignItems:'center',paddingVertical:48,gap:8},
  emptyIcon:       {fontSize:48},
  emptyTitle:      {fontSize:17,fontWeight:'800',color:'#0F1117'},
  emptySub:        {fontSize:13,color:'#9B9FAE',textAlign:'center',lineHeight:20},
  earningCard:     {backgroundColor:'#FFFFFF',borderRadius:14,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  earningLeft:     {flexDirection:'row',alignItems:'center',gap:12,flex:1},
  earningAv:       {width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0},
  earningAvText:   {fontSize:15,fontWeight:'800',color:'#FFFFFF',zIndex:1},
  earningName:     {fontSize:14,fontWeight:'700',color:'#0F1117'},
  earningMeta:     {fontSize:12,color:'#5A5F72',marginTop:2},
  earningDate:     {fontSize:11,color:'#9B9FAE',marginTop:1},
  earningAmount:   {fontSize:20,fontWeight:'900',color:'#1A7F6E'},
  paidBadge:       {backgroundColor:'#D4EDE9',borderRadius:20,paddingHorizontal:8,paddingVertical:2,marginTop:4},
  paidBadgeText:   {fontSize:11,fontWeight:'700',color:'#1A7F6E'},
});
