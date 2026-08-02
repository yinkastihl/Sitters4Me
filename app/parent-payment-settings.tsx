// app/parent-payment-settings.tsx — Stripe (card) + PayPal — Uber/Lyft style auto-charge
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { WebView } from 'react-native-webview';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';
const PAY_API  = 'https://sitters4me.com/api/payments.php';

export default function ParentPaymentSettings() {
  const router = useRouter();
  const user   = global.currentUser || {};
  const userId = user.id || user.user_id || user.parent_id || 0;

  const [loading, setLoading]             = useState(true);
  const [savedCard, setSavedCard]         = useState<any>(null);  // {brand, last4, exp}
  const [savedPaypal, setSavedPaypal]     = useState('');
  const [defaultMethod, setDefaultMethod] = useState('');  // 'stripe' or 'paypal'

  // Stripe card setup
  const [showCardSetup, setShowCardSetup] = useState(false);
  const [setupUrl, setSetupUrl]           = useState('');
  const [settingUpCard, setSettingUpCard] = useState(false);

  // PayPal email
  const [paypalEmail, setPaypalEmail]     = useState('');
  const [savingPaypal, setSavingPaypal]   = useState(false);

  // Payment history
  const [history, setHistory]             = useState<any[]>([]);

  useEffect(() => { loadPaymentMethods(); loadHistory(); }, []);

  const loadPaymentMethods = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=get_payment_methods`, { parent_id: userId });
      if (res.data.success) {
        const d = res.data.data;
        if (d.card_last4) setSavedCard({ brand: d.card_brand || 'Card', last4: d.card_last4, exp: d.card_exp || '' });
        if (d.paypal_email) { setSavedPaypal(d.paypal_email); setPaypalEmail(d.paypal_email); }
        setDefaultMethod(d.default_method || (d.card_last4 ? 'stripe' : d.paypal_email ? 'paypal' : ''));
      }
    } catch {}
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try {
      const res = await axios.post(`${JOBS_API}?action=get_history`, { user_id: userId, user_type: 'parent' });
      if (res.data.success) setHistory(res.data.data || []);
    } catch {}
  };

  // ── STRIPE: Open card setup in WebView ─────────────────────
  const startCardSetup = async () => {
    setSettingUpCard(true);
    try {
      const res = await axios.post(`${PAY_API}?action=create_setup_session`, { parent_id: userId });
      if (res.data.success && res.data.data?.url) {
        setSetupUrl(res.data.data.url);
        setShowCardSetup(true);
      } else {
        Alert.alert('Error', res.data.error || 'Could not start card setup.');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not connect to payment server.\n\n' + (e?.message || ''));
    }
    finally { setSettingUpCard(false); }
  };

  const onCardSetupComplete = async (url: string) => {
    if (url.includes('success') || url.includes('return')) {
      setShowCardSetup(false);
      Alert.alert('Card Added!', 'Your card has been saved securely. It will be charged automatically when jobs complete.');
      loadPaymentMethods();
    } else if (url.includes('cancel')) {
      setShowCardSetup(false);
    }
  };

  // ── PAYPAL: Save email ─────────────────────────────────────
  const savePaypalEmail = async () => {
    const trimmed = paypalEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@'))
      return Alert.alert('Invalid Email', 'Please enter a valid PayPal email address.');
    setSavingPaypal(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=save_payment_method`, {
        parent_id: userId, paypal_email: trimmed,
      });
      if (res.data.success) {
        setSavedPaypal(trimmed);
        if (!defaultMethod) setDefaultMethod('paypal');
        Alert.alert('Saved!', 'Your PayPal account has been linked.');
      } else Alert.alert('Error', res.data.error || 'Could not save.');
    } catch { Alert.alert('Error', 'Could not connect to server.'); }
    finally { setSavingPaypal(false); }
  };

  // ── Set default payment method ─────────────────────────────
  const setDefault = async (method: string) => {
    try {
      await axios.post(`${JOBS_API}?action=set_default_payment`, { parent_id: userId, method });
      setDefaultMethod(method);
    } catch {}
  };

  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString() : '';

  // ── Card setup WebView ─────────────────────────────────────
  if (showCardSetup && setupUrl) {
    return (
      <SafeAreaView style={{flex:1,backgroundColor:'#F5F4F0'}}>
        <View style={{flexDirection:'row',alignItems:'center',padding:16,backgroundColor:'#FFFFFF',borderBottomWidth:1,borderColor:'#E5E2DA'}}>
          <TouchableOpacity onPress={() => setShowCardSetup(false)} style={{padding:8}}>
            <Text style={{fontSize:16,color:'#C93488',fontWeight:'700'}}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{flex:1,textAlign:'center',fontSize:16,fontWeight:'800',color:'#0F1117'}}>Add Card</Text>
          <View style={{width:60}} />
        </View>
        <WebView
          source={{uri: setupUrl}}
          onNavigationStateChange={({url}) => onCardSetupComplete(url)}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={{flex:1}} color="#C93488" size="large" />}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>{'<'}</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Payment Methods</Text>
            <Text style={s.headerSub}>Auto-charged when jobs complete</Text>
          </View>
          <View style={{width:36}} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {loading ? (
          <View style={{alignItems:'center',paddingVertical:40}}>
            <ActivityIndicator size="large" color="#C93488" />
          </View>
        ) : (
          <>
            {/* How it works */}
            <View style={s.infoCard}>
              <Text style={s.infoTitle}>How payments work</Text>
              <Text style={s.infoText}>
                Just like Uber or Lyft, your saved payment method is charged automatically when the sitter completes the job. No buttons to press — it just works.
              </Text>
            </View>

            {/* ── CREDIT/DEBIT CARD (Stripe) ─────────────────── */}
            <View style={s.methodCard}>
              <View style={s.methodHeader}>
                <Text style={{fontSize:24}}>{'💳'}</Text>
                <View style={{flex:1}}>
                  <Text style={s.methodTitle}>Credit / Debit Card</Text>
                  <Text style={s.methodSub}>Visa, Mastercard, Amex, Discover</Text>
                </View>
                {savedCard && defaultMethod === 'stripe' && (
                  <View style={s.defaultBadge}><Text style={s.defaultBadgeText}>DEFAULT</Text></View>
                )}
              </View>

              {savedCard ? (
                <View style={s.savedMethod}>
                  <View style={s.cardRow}>
                    <Text style={s.cardBrand}>{savedCard.brand.toUpperCase()}</Text>
                    <Text style={s.cardDots}>**** **** ****</Text>
                    <Text style={s.cardLast4}>{savedCard.last4}</Text>
                  </View>
                  {savedCard.exp ? <Text style={s.cardExp}>Expires {savedCard.exp}</Text> : null}
                  <View style={s.methodActions}>
                    <TouchableOpacity style={s.changeBtn} onPress={startCardSetup}>
                      <Text style={s.changeBtnText}>Change Card</Text>
                    </TouchableOpacity>
                    {defaultMethod !== 'stripe' && (
                      <TouchableOpacity style={s.setDefaultBtn} onPress={() => setDefault('stripe')}>
                        <Text style={s.setDefaultText}>Set as Default</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={startCardSetup} disabled={settingUpCard} activeOpacity={0.85}>
                  <LinearGradient colors={['#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.addBtn}>
                    {settingUpCard
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.addBtnText}>+ Add Credit or Debit Card</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {/* ── PAYPAL ──────────────────────────────────────── */}
            <View style={s.methodCard}>
              <View style={s.methodHeader}>
                <Text style={{fontSize:24}}>{'🅿️'}</Text>
                <View style={{flex:1}}>
                  <Text style={s.methodTitle}>PayPal</Text>
                  <Text style={s.methodSub}>Link your PayPal account</Text>
                </View>
                {savedPaypal && defaultMethod === 'paypal' && (
                  <View style={s.defaultBadge}><Text style={s.defaultBadgeText}>DEFAULT</Text></View>
                )}
              </View>

              {savedPaypal ? (
                <View style={s.savedMethod}>
                  <Text style={s.savedPaypalText}>{savedPaypal}</Text>
                  <View style={s.methodActions}>
                    <TouchableOpacity style={s.changeBtn} onPress={() => { setSavedPaypal(''); setPaypalEmail(''); }}>
                      <Text style={s.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                    {defaultMethod !== 'paypal' && (
                      <TouchableOpacity style={s.setDefaultBtn} onPress={() => setDefault('paypal')}>
                        <Text style={s.setDefaultText}>Set as Default</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : (
                <View style={s.paypalSetup}>
                  <TextInput
                    style={s.input}
                    value={paypalEmail}
                    onChangeText={setPaypalEmail}
                    placeholder="your@paypal.com"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={savePaypalEmail}
                    disabled={savingPaypal || !paypalEmail.trim()}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#FFC439','#F5A623']}
                      start={{x:0,y:0}} end={{x:1,y:0}}
                      style={[s.addBtn, (!paypalEmail.trim() || savingPaypal) && {opacity:0.5}]}
                    >
                      {savingPaypal
                        ? <ActivityIndicator color="#003087" />
                        : <Text style={[s.addBtnText,{color:'#003087'}]}>Link PayPal Account</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── NO PAYMENT METHOD WARNING ────────────────────── */}
            {!savedCard && !savedPaypal && (
              <View style={s.warnCard}>
                <Text style={{fontSize:24}}>{'⚠️'}</Text>
                <Text style={s.warnText}>
                  Add a payment method to request babysitters. Your card or PayPal will be charged automatically when the job is completed.
                </Text>
              </View>
            )}

            {/* ── PAYMENT HISTORY ─────────────────────────────── */}
            <View style={s.histCard}>
              <Text style={s.histTitle}>Payment History</Text>
              {history.length === 0 ? (
                <Text style={s.histEmpty}>No payments yet</Text>
              ) : (
                history.map((p, i) => (
                  <View key={i} style={s.histRow}>
                    <View style={{flex:1}}>
                      <Text style={s.histName}>{p.sitter_fname || ''} {p.sitter_lname || ''}</Text>
                      <Text style={s.histDate}>{fmtDate(p.created_at)}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                      <Text style={s.histAmt}>${parseFloat(p.amount || 0).toFixed(2)}</Text>
                      <Text style={[s.histStatus, {color: p.status === 'captured' ? '#1A7F6E' : '#9B9FAE'}]}>{p.status}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Security note */}
            <View style={s.secureRow}>
              <Text style={{fontSize:20}}>{'🔒'}</Text>
              <Text style={s.secureText}>Card details are stored securely by Stripe. Sitters4Me never sees your full card number.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      {flex:1,backgroundColor:'#F5F4F0'},
  header:         {paddingBottom:20},
  headerRow:      {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  backBtn:        {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:       {fontSize:24,color:'#FFFFFF',fontWeight:'600'},
  headerTitle:    {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  headerSub:      {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  scroll:         {flex:1,marginTop:-16},
  content:        {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},

  infoCard:       {backgroundColor:'#E8F6FD',borderRadius:14,padding:16,borderWidth:1,borderColor:'rgba(2,164,226,0.25)',gap:6},
  infoTitle:      {fontSize:15,fontWeight:'800',color:'#0270C8'},
  infoText:       {fontSize:13,color:'#5A5F72',lineHeight:20},

  methodCard:     {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)',gap:14},
  methodHeader:   {flexDirection:'row',alignItems:'center',gap:12},
  methodTitle:    {fontSize:16,fontWeight:'800',color:'#0F1117'},
  methodSub:      {fontSize:12,color:'#9B9FAE',marginTop:1},
  defaultBadge:   {backgroundColor:'#D4EDE9',borderRadius:20,paddingHorizontal:10,paddingVertical:4},
  defaultBadgeText:{fontSize:10,fontWeight:'800',color:'#1A7F6E',letterSpacing:0.5},

  savedMethod:    {backgroundColor:'#F5F4F0',borderRadius:12,padding:14,gap:8},
  cardRow:        {flexDirection:'row',alignItems:'center',gap:8},
  cardBrand:      {fontSize:14,fontWeight:'800',color:'#0F1117',backgroundColor:'#E5E2DA',borderRadius:6,paddingHorizontal:8,paddingVertical:3},
  cardDots:       {fontSize:14,color:'#9B9FAE',letterSpacing:2},
  cardLast4:      {fontSize:16,fontWeight:'800',color:'#0F1117'},
  cardExp:        {fontSize:12,color:'#9B9FAE'},
  savedPaypalText:{fontSize:15,fontWeight:'700',color:'#003087'},

  methodActions:  {flexDirection:'row',gap:10,marginTop:4},
  changeBtn:      {borderRadius:8,paddingVertical:8,paddingHorizontal:16,borderWidth:1.5,borderColor:'#E5E2DA'},
  changeBtnText:  {fontSize:13,fontWeight:'700',color:'#5A5F72'},
  setDefaultBtn:  {borderRadius:8,paddingVertical:8,paddingHorizontal:16,backgroundColor:'#D4EDE9'},
  setDefaultText: {fontSize:13,fontWeight:'700',color:'#1A7F6E'},

  addBtn:         {borderRadius:12,padding:16,alignItems:'center'},
  addBtnText:     {color:'#FFFFFF',fontSize:15,fontWeight:'800'},

  paypalSetup:    {gap:10},
  input:          {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117'},

  warnCard:       {flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FDE9E7',borderRadius:14,padding:16,borderWidth:1,borderColor:'rgba(191,59,46,0.2)'},
  warnText:       {flex:1,fontSize:13,color:'#BF3B2E',lineHeight:20,fontWeight:'600'},

  histCard:       {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)',gap:8},
  histTitle:      {fontSize:16,fontWeight:'800',color:'#0F1117'},
  histEmpty:      {fontSize:13,color:'#9B9FAE',textAlign:'center',paddingVertical:12},
  histRow:        {flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.07)'},
  histName:       {fontSize:13,fontWeight:'600',color:'#0F1117'},
  histDate:       {fontSize:12,color:'#9B9FAE',marginTop:2},
  histAmt:        {fontSize:15,fontWeight:'800',color:'#0F1117'},
  histStatus:     {fontSize:11,fontWeight:'600',marginTop:2},

  secureRow:      {flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFFFFF',borderRadius:14,padding:16,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  secureText:     {flex:1,fontSize:12,color:'#9B9FAE',lineHeight:18},
});
