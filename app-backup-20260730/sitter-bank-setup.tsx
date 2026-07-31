// app/sitter-bank-setup.tsx
// Sitter enters bank info for direct deposit — paid every Friday
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

export default function SitterBankSetup() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [loading, setLoading]     = useState(false);
  const [checking, setChecking]   = useState(true);
  const [existing, setExisting]   = useState<any>(null);

  const [bankName, setBankName]   = useState('');
  const [routing, setRouting]     = useState('');
  const [account, setAccount]     = useState('');
  const [confirm, setConfirm]     = useState('');
  const [acctType, setAcctType]   = useState<'checking'|'savings'>('checking');

  useEffect(() => { loadExisting(); }, []);

  const loadExisting = async () => {
    setChecking(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=get_bank_account`, { sitter_id: user.id });
      if (res.data?.success && res.data?.data?.has_bank) {
        setExisting(res.data.data);
      }
    } catch { /* no existing */ }
    finally { setChecking(false); }
  };

  const validate = () => {
    if (!bankName.trim()) { Alert.alert('Missing Field', 'Please enter your bank name.'); return false; }
    if (routing.replace(/\D/g,'').length !== 9) { Alert.alert('Invalid Routing Number', 'Routing number must be exactly 9 digits.'); return false; }
    if (account.replace(/\D/g,'').length < 4) { Alert.alert('Invalid Account Number', 'Please enter a valid bank account number.'); return false; }
    if (account !== confirm) { Alert.alert('Account Mismatch', 'Account numbers do not match. Please re-enter.'); return false; }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=save_bank_account`, {
        sitter_id:      user.id,
        bank_name:      bankName.trim(),
        routing_number: routing.replace(/\D/g,''),
        account_number: account.replace(/\D/g,''),
        account_type:   acctType,
      });
      if (res.data?.success) {
        Alert.alert(
          '🏦 Bank Account Saved!',
          `Your ${acctType} account ending in ${res.data.data.last4} has been saved.\n\nYou will receive direct deposits every Friday for the previous week's work (Sunday–Friday).`,
          [{ text: 'Great!', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', res.data?.error || 'Could not save bank account. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Compute next pay Friday ────────────────────────────────────
  const nextPayFriday = (() => {
    const now  = new Date();
    const dow  = now.getDay(); // 0=Sun, 5=Fri
    const days = (5 - dow + 7) % 7 || 7;
    const fri  = new Date(now);
    fri.setDate(now.getDate() + days);
    return fri.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{ x:0, y:0 }} end={{ x:1, y:1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={s.headerTitle}>Direct Deposit Setup</Text>
            <Text style={s.headerSub}>Get paid every Friday</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{ flex:1 }}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {checking ? (
            <ActivityIndicator color="#C93488" style={{ marginVertical: 40 }} />
          ) : (
            <>
              {/* ── Pay cycle info ────────────────────────────── */}
              <View style={s.payCycleCard}>
                <Text style={s.payCycleTitle}>📅 How Pay Works</Text>
                <View style={s.payCycleRows}>
                  {[
                    { icon: '🗓️', label: 'Work period',   value: 'Sunday through Friday' },
                    { icon: '💳', label: 'Pay day',        value: 'Every Friday' },
                    { icon: '⏳', label: 'Pay cycle',      value: 'Previous Sunday–Friday work paid next Friday' },
                    { icon: '🏦', label: 'Next payment',   value: nextPayFriday },
                    { icon: '💰', label: 'Platform fee',   value: '15% deducted per job' },
                    { icon: '📧', label: 'Check option',   value: 'No bank account = mailed check' },
                  ].map(r => (
                    <View key={r.label} style={s.payCycleRow}>
                      <Text style={s.payCycleIcon}>{r.icon}</Text>
                      <Text style={s.payCycleLabel}>{r.label}</Text>
                      <Text style={s.payCycleVal}>{r.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Existing bank account ─────────────────────── */}
              {existing && (
                <View style={s.existingCard}>
                  <View style={s.existingRow}>
                    <Text style={s.existingIcon}>🏦</Text>
                    <View style={{ flex:1 }}>
                      <Text style={s.existingTitle}>{existing.bank_name}</Text>
                      <Text style={s.existingMeta}>
                        {existing.account_type === 'checking' ? 'Checking' : 'Savings'} ···· {existing.last4}
                      </Text>
                    </View>
                    <View style={s.existingBadge}>
                      <Text style={s.existingBadgeText}>✓ Active</Text>
                    </View>
                  </View>
                  <Text style={s.existingHint}>Fill out the form below to update your bank account.</Text>
                </View>
              )}

              {/* ── Security note ────────────────────────────── */}
              <View style={s.secNote}>
                <Text style={s.secNoteIcon}>🔒</Text>
                <Text style={s.secNoteText}>
                  Your bank details are stored securely and only used for weekly payouts. We follow PCI-DSS standards.
                </Text>
              </View>

              {/* ── Form ─────────────────────────────────────── */}
              <View style={s.form}>
                <Text style={s.formTitle}>{existing ? 'Update Bank Account' : 'Add Bank Account'}</Text>

                <View style={s.field}>
                  <Text style={s.label}>BANK NAME *</Text>
                  <TextInput
                    style={s.input}
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="e.g. Chase, Bank of America, Wells Fargo"
                    placeholderTextColor="#9B9FAE"
                  />
                </View>

                <View style={s.field}>
                  <Text style={s.label}>ACCOUNT TYPE *</Text>
                  <View style={s.typeRow}>
                    {(['checking','savings'] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[s.typeBtn, acctType===t && s.typeBtnOn]}
                        onPress={() => setAcctType(t)}
                      >
                        <Text style={[s.typeBtnText, acctType===t && s.typeBtnTextOn]}>
                          {t === 'checking' ? '💳 Checking' : '🏦 Savings'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={s.field}>
                  <Text style={s.label}>ROUTING NUMBER * (9 digits)</Text>
                  <TextInput
                    style={s.input}
                    value={routing}
                    onChangeText={t => setRouting(t.replace(/\D/g,'').slice(0,9))}
                    placeholder="e.g. 021000021"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="number-pad"
                    maxLength={9}
                  />
                  <Text style={s.hint}>Find this on the bottom-left of your check</Text>
                </View>

                <View style={s.field}>
                  <Text style={s.label}>ACCOUNT NUMBER *</Text>
                  <TextInput
                    style={s.input}
                    value={account}
                    onChangeText={t => setAccount(t.replace(/\D/g,''))}
                    placeholder="Your checking/savings account number"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="number-pad"
                    secureTextEntry
                  />
                </View>

                <View style={s.field}>
                  <Text style={s.label}>CONFIRM ACCOUNT NUMBER *</Text>
                  <TextInput
                    style={[s.input, confirm && confirm !== account && { borderColor: '#BF3B2E' }]}
                    value={confirm}
                    onChangeText={t => setConfirm(t.replace(/\D/g,''))}
                    placeholder="Re-enter account number"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="number-pad"
                    secureTextEntry
                  />
                  {confirm && confirm !== account && (
                    <Text style={s.mismatch}>Account numbers do not match</Text>
                  )}
                </View>

                <TouchableOpacity onPress={save} disabled={loading} activeOpacity={0.85}>
                  <LinearGradient
                    colors={['#C93488','#9B5BAB']}
                    start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                    style={[s.saveBtn, loading && { opacity: 0.6 }]}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={s.saveBtnText}>🏦  Save Bank Account</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.checkBtn}
                  onPress={() => Alert.alert(
                    'Receive a Check Instead?',
                    `If you prefer not to set up direct deposit, we will mail a physical check to your registered address every Friday.\n\nNext check: ${nextPayFriday}`,
                    [
                      { text: 'I\'ll Set Up Direct Deposit', style: 'cancel' },
                      { text: 'Send Me a Check', onPress: () => router.back() },
                    ]
                  )}
                  activeOpacity={0.85}
                >
                  <Text style={s.checkBtnText}>✉️  I prefer a mailed check instead</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex:1, backgroundColor:'#F5F4F0' },
  header:           { paddingBottom:16 },
  headerRow:        { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingTop:12 },
  backBtn:          { width:36, height:36, alignItems:'center', justifyContent:'center' },
  backText:         { fontSize:32, color:'#FFFFFF', fontWeight:'300' },
  headerTitle:      { fontSize:18, fontWeight:'900', color:'#FFFFFF' },
  headerSub:        { fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:2 },
  scroll:           { flex:1, marginTop:-16 },
  content:          { paddingTop:24, paddingHorizontal:16, paddingBottom:48, gap:16 },
  payCycleCard:     { backgroundColor:'#FFFFFF', borderRadius:16, padding:18, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  payCycleTitle:    { fontSize:16, fontWeight:'800', color:'#0F1117', marginBottom:12 },
  payCycleRows:     { gap:10 },
  payCycleRow:      { flexDirection:'row', alignItems:'center', gap:10 },
  payCycleIcon:     { fontSize:18, width:26 },
  payCycleLabel:    { fontSize:12, color:'#9B9FAE', fontWeight:'600', width:90 },
  payCycleVal:      { fontSize:13, color:'#0F1117', fontWeight:'600', flex:1 },
  existingCard:     { backgroundColor:'#D4EDE9', borderRadius:14, padding:16, borderWidth:1, borderColor:'rgba(26,127,110,0.2)', gap:8 },
  existingRow:      { flexDirection:'row', alignItems:'center', gap:12 },
  existingIcon:     { fontSize:26 },
  existingTitle:    { fontSize:15, fontWeight:'700', color:'#0F1117' },
  existingMeta:     { fontSize:12, color:'#5A5F72', marginTop:2 },
  existingBadge:    { backgroundColor:'#1A7F6E', borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  existingBadgeText:{ fontSize:11, fontWeight:'700', color:'#FFFFFF' },
  existingHint:     { fontSize:12, color:'#5A5F72' },
  secNote:          { flexDirection:'row', alignItems:'flex-start', gap:10, backgroundColor:'#F5F4F0', borderRadius:12, padding:14 },
  secNoteIcon:      { fontSize:18 },
  secNoteText:      { fontSize:13, color:'#5A5F72', lineHeight:20, flex:1 },
  form:             { backgroundColor:'#FFFFFF', borderRadius:16, padding:18, gap:14, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  formTitle:        { fontSize:17, fontWeight:'800', color:'#0F1117' },
  field:            { gap:6 },
  label:            { fontSize:11, fontWeight:'700', color:'#5A5F72', letterSpacing:0.6, textTransform:'uppercase' },
  hint:             { fontSize:12, color:'#9B9FAE' },
  input:            { backgroundColor:'#F5F4F0', borderRadius:10, borderWidth:1.5, borderColor:'rgba(15,17,23,0.1)', padding:14, fontSize:15, color:'#0F1117' },
  typeRow:          { flexDirection:'row', gap:10 },
  typeBtn:          { flex:1, padding:12, borderRadius:10, borderWidth:1.5, borderColor:'rgba(15,17,23,0.15)', alignItems:'center', backgroundColor:'#FFFFFF' },
  typeBtnOn:        { backgroundColor:'#C93488', borderColor:'#C93488' },
  typeBtnText:      { fontSize:14, fontWeight:'600', color:'#5A5F72' },
  typeBtnTextOn:    { color:'#FFFFFF' },
  mismatch:         { fontSize:12, color:'#BF3B2E', fontWeight:'600' },
  saveBtn:          { borderRadius:14, padding:16, alignItems:'center' },
  saveBtnText:      { color:'#FFFFFF', fontSize:16, fontWeight:'800' },
  checkBtn:         { padding:14, alignItems:'center', borderRadius:12, borderWidth:1.5, borderColor:'#E5E2DA' },
  checkBtnText:     { fontSize:14, fontWeight:'600', color:'#5A5F72' },
});
