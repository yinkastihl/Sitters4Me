// app/parent-payment-settings.tsx — PayPal only (no Stripe)
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const PAY_API = 'https://sitters4me.com/api/payments.php';

export default function ParentPaymentSettings() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [currentEmail, setCurrentEmail] = useState('');
  const [newEmail,     setNewEmail]     = useState('');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [testResult,   setTestResult]   = useState('');
  const [history,      setHistory]      = useState<any[]>([]);
  const [histLoading,  setHistLoading]  = useState(false);

  useEffect(() => { load(); loadHistory(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${PAY_API}?action=get_payment_method`, { parent_id: user.id });
      if (res.data.success) {
        const email = res.data.data.paypal_email || '';
        setCurrentEmail(email);
        setNewEmail(email);
      }
    } catch {} finally { setLoading(false); }
  };

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const res = await axios.post(`${PAY_API}?action=get_history`, { user_id: user.id, user_type: 'parent' });
      if (res.data.success) setHistory(res.data.data || []);
    } catch {} finally { setHistLoading(false); }
  };

  const save = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@'))
      return Alert.alert('Invalid Email', 'Please enter a valid PayPal email address.');
    setSaving(true); setSaved(false);
    try {
      const res = await axios.post(`${PAY_API}?action=save_payment_method`, {
        parent_id: user.id, paypal_email: trimmed,
      });
      if (res.data.success) {
        setCurrentEmail(trimmed); setNewEmail(trimmed); setSaved(true);
        Alert.alert('✅ Saved!', 'Your PayPal email has been updated.');
      } else Alert.alert('Error', res.data.error || 'Could not save. Try again.');
    } catch { Alert.alert('Error', 'Could not connect.'); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true); setTestResult('');
    try {
      const res = await axios.get(`${PAY_API}?action=test`);
      const d   = res.data?.data || {};
      setTestResult(d.paypal_token === 'OK'
        ? `✅ Connected · ${(d.paypal_env||'').toUpperCase()}`
        : `❌ Failed — ${d.paypal_token}`);
    } catch { setTestResult('❌ Could not reach payment server'); }
    finally { setTesting(false); }
  };

  const fmtAmt = (n: any) => `$${parseFloat(n||0).toFixed(2)}`;
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString() : '—';

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>💳 Payment Method</Text>
            <Text style={s.headerSub}>PayPal — Secure payments</Text>
          </View>
          <View style={{width:36}} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* How it works */}
        <View style={s.card}>
          <Text style={s.cardTitle}>How Payments Work</Text>
          {[
            ['🍼','Sitter completes job and stops timer'],
            ['🧮','App calculates time × rate + 10% fee'],
            ['🔵','You tap Pay — PayPal opens in browser'],
            ['✅','Approve in PayPal — return to app'],
            ['🎉','Payment confirmed, sitter gets paid'],
          ].map(([icon,text])=>(
            <View key={text} style={s.howRow}>
              <Text style={s.howIcon}>{icon}</Text>
              <Text style={s.howText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* PayPal email */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Your PayPal Email</Text>
          <Text style={s.cardSub}>Payments will be sent from this PayPal account.</Text>

          {loading ? <ActivityIndicator color="#C93488" style={{marginVertical:16}} /> : (
            <>
              {currentEmail ? (
                <View style={s.currentBox}>
                  <Text style={s.currentLabel}>Current PayPal Email</Text>
                  <Text style={s.currentVal}>{currentEmail}</Text>
                  <View style={s.savedPill}><Text style={s.savedPillText}>✓ Saved</Text></View>
                </View>
              ) : (
                <View style={s.warnBox}>
                  <Text style={s.warnText}>⚠️ No PayPal email saved yet</Text>
                </View>
              )}
              <Text style={s.fieldLabel}>{currentEmail ? 'UPDATE EMAIL' : 'ADD PAYPAL EMAIL'}</Text>
              <TextInput
                style={s.input}
                value={newEmail}
                onChangeText={t => { setNewEmail(t); setSaved(false); }}
                placeholder="your@paypal.com"
                placeholderTextColor="#9B9FAE"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={save}
                disabled={saving || !newEmail.trim() || newEmail.trim().toLowerCase()===currentEmail}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={saved ? ['#1A7F6E','#0D5C51'] : ['#C93488','#9B5BAB']}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={[s.saveBtn, (saving||!newEmail.trim()||newEmail.trim().toLowerCase()===currentEmail)&&{opacity:0.5}]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.saveBtnText}>{saved?'✓ Saved':currentEmail?'Update PayPal Email':'Save PayPal Email'}</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Test connection */}
        <View style={s.sandboxCard}>
          <Text style={s.sandboxTitle}>🧪 PayPal Sandbox (Test Mode)</Text>
          <Text style={s.sandboxBody}>
            The app is in sandbox mode — test payments only, no real money.{'\n\n'}
            To test: use your sandbox Personal account from developer.paypal.com
          </Text>
          <TouchableOpacity style={s.testBtn} onPress={testConnection} disabled={testing}>
            {testing ? <ActivityIndicator color="#A0700A" size="small" /> : <Text style={s.testBtnText}>🔌 Test PayPal Connection</Text>}
          </TouchableOpacity>
          {testResult ? <Text style={s.testResult}>{testResult}</Text> : null}
        </View>

        {/* Payment history */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Payment History</Text>
          {histLoading ? <ActivityIndicator color="#C93488" style={{marginVertical:12}} /> :
           history.length === 0 ? <Text style={s.emptyText}>No payments yet</Text> :
           history.map((p, i) => (
            <View key={i} style={s.histRow}>
              <View style={{flex:1}}>
                <Text style={s.histSitter}>Sitter: {p.sitter_fname||''} {p.sitter_lname||''}</Text>
                <Text style={s.histDate}>{fmtDate(p.created_at)}</Text>
              </View>
              <View style={{alignItems:'flex-end'}}>
                <Text style={s.histAmt}>{fmtAmt(p.amount)}</Text>
                <Text style={[s.histStatus,{color:p.status==='captured'?'#1A7F6E':'#9B9FAE'}]}>{p.status}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Security note */}
        <View style={s.secureCard}>
          <Text style={{fontSize:26}}>🔒</Text>
          <View style={{flex:1}}>
            <Text style={s.secureTitle}>Secure Payments</Text>
            <Text style={s.secureSub}>Card details are never stored. All payments processed by PayPal.</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    {flex:1,backgroundColor:'#F5F4F0'},
  header:       {paddingBottom:20},
  headerRow:    {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  backBtn:      {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:     {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:  {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  headerSub:    {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  scroll:       {flex:1,marginTop:-16},
  content:      {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  card:         {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)',gap:10},
  cardTitle:    {fontSize:16,fontWeight:'800',color:'#0F1117'},
  cardSub:      {fontSize:13,color:'#5A5F72',lineHeight:20},
  howRow:       {flexDirection:'row',alignItems:'flex-start',gap:10},
  howIcon:      {fontSize:18,width:28},
  howText:      {fontSize:13,color:'#5A5F72',flex:1,lineHeight:20},
  currentBox:   {backgroundColor:'#F5F4F0',borderRadius:12,padding:14,gap:4},
  currentLabel: {fontSize:11,fontWeight:'700',color:'#9B9FAE',textTransform:'uppercase',letterSpacing:0.6},
  currentVal:   {fontSize:15,fontWeight:'700',color:'#0F1117'},
  savedPill:    {backgroundColor:'#D4EDE9',borderRadius:20,paddingHorizontal:10,paddingVertical:3,alignSelf:'flex-start',marginTop:4},
  savedPillText:{fontSize:11,fontWeight:'700',color:'#1A7F6E'},
  warnBox:      {backgroundColor:'#FDE9E7',borderRadius:12,padding:14,borderWidth:1,borderColor:'rgba(191,59,46,0.2)'},
  warnText:     {fontSize:14,fontWeight:'700',color:'#BF3B2E'},
  fieldLabel:   {fontSize:11,fontWeight:'700',color:'#5A5F72',textTransform:'uppercase',letterSpacing:0.6},
  input:        {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117'},
  saveBtn:      {borderRadius:12,padding:16,alignItems:'center'},
  saveBtnText:  {color:'#FFFFFF',fontSize:15,fontWeight:'800'},
  sandboxCard:  {backgroundColor:'#FFFBF0',borderRadius:16,padding:18,borderWidth:1.5,borderColor:'rgba(245,166,35,0.4)',gap:10},
  sandboxTitle: {fontSize:15,fontWeight:'800',color:'#A0700A'},
  sandboxBody:  {fontSize:13,color:'#5A5F72',lineHeight:22},
  testBtn:      {backgroundColor:'#FFF0E0',borderRadius:10,padding:12,alignItems:'center',borderWidth:1,borderColor:'rgba(245,166,35,0.4)'},
  testBtnText:  {fontSize:13,fontWeight:'700',color:'#A0700A'},
  testResult:   {fontSize:13,color:'#5A5F72',textAlign:'center'},
  emptyText:    {fontSize:13,color:'#9B9FAE',textAlign:'center',paddingVertical:12},
  histRow:      {flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.07)'},
  histSitter:   {fontSize:13,fontWeight:'600',color:'#0F1117'},
  histDate:     {fontSize:12,color:'#9B9FAE',marginTop:2},
  histAmt:      {fontSize:15,fontWeight:'800',color:'#0F1117'},
  histStatus:   {fontSize:11,fontWeight:'600',marginTop:2},
  secureCard:   {flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFFFFF',borderRadius:14,padding:16,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  secureTitle:  {fontSize:14,fontWeight:'700',color:'#0F1117'},
  secureSub:    {fontSize:12,color:'#9B9FAE',marginTop:2,lineHeight:18},
});
