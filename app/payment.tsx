// app/payment.tsx — Parent pays sitter after job ends via PayPal
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const PAY_API = 'https://sitters4me.com/api/payments.php';

export default function PaymentScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams();

  const jobId      = params.job_id       as string || String(global.activeJob?.job_id  || '');
  const seconds    = parseInt(params.seconds as string || '0');
  const rate       = parseFloat(params.rate  as string || String(global.currentUser?.minrate || 15));
  const sitterId   = params.sitter_id    as string || String(global.activeJob?.sitter_id || '');
  const sitterName = params.sitter_name  as string || String(global.activeJob?.sitter_name || 'Your Sitter');

  const [calc,        setCalc]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [paying,      setPaying]      = useState(false);
  const [paid,        setPaid]        = useState(false);
  const [pendingOrder,setPendingOrder]= useState('');
  const [waitingReturn,setWaitingReturn]= useState(false);
  const appStateRef = useRef(AppState.currentState);

  const user = global.currentUser || {};

  useEffect(() => {
    calculatePayment();
    // Listen for app returning from browser after PayPal approval
    const sub = AppState.addEventListener('change', nextState => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App just came back to foreground
        if (pendingOrderRef.current && waitingReturnRef.current) {
          setWaitingReturn(false);
          confirmCapture(pendingOrderRef.current);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Use refs so AppState callback always has current values
  const pendingOrderRef   = useRef('');
  const waitingReturnRef  = useRef(false);

  useEffect(() => { pendingOrderRef.current  = pendingOrder;    }, [pendingOrder]);
  useEffect(() => { waitingReturnRef.current = waitingReturn;   }, [waitingReturn]);

  const calculatePayment = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${PAY_API}?action=calculate`, {
        job_id:      jobId || 0,
        seconds:     seconds || 3600,        // default 1hr if no timer
        hourly_rate: rate   || user.minrate || 15,
      });
      if (res.data.success) {
        setCalc(res.data.data);
      } else {
        // Build calc manually if API fails
        const hrs      = (seconds || 3600) / 3600;
        const subtotal = Math.round(hrs * (rate || 15) * 100) / 100;
        const fee      = Math.round(subtotal * 0.10 * 100) / 100;
        setCalc({
          hours_worked:  Math.round(hrs * 100) / 100,
          hourly_rate:   rate || 15,
          subtotal,
          platform_fee:  fee,
          total:         subtotal + fee,
          sitter_payout: subtotal,
          breakdown:     `${Math.round(hrs * 100) / 100}hrs × $${rate || 15}/hr`,
        });
      }
    } catch {
      const hrs      = (seconds || 3600) / 3600;
      const subtotal = Math.round(hrs * (rate || 15) * 100) / 100;
      const fee      = Math.round(subtotal * 0.10 * 100) / 100;
      setCalc({
        hours_worked:  Math.round(hrs * 100) / 100,
        hourly_rate:   rate || 15,
        subtotal,
        platform_fee:  fee,
        total:         subtotal + fee,
        sitter_payout: subtotal,
        breakdown:     '',
      });
    } finally {
      setLoading(false);
    }
  };

  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  // ── Step 1: Create PayPal order ─────────────────────────────
  const payNow = async () => {
    if (!calc) return;
    setPaying(true);
    try {
      const res = await axios.post(`${PAY_API}?action=create_order`, {
        job_id:        jobId || 0,
        parent_id:     user.id,
        sitter_id:     sitterId,
        amount:        calc.total,
        hours:         calc.hours_worked,
        rate:          calc.hourly_rate,
        platform_fee:  calc.platform_fee,
        sitter_payout: calc.sitter_payout,
      });

      if (!res.data.success) {
        Alert.alert('Payment Error', res.data.error || 'Could not start payment. Please try again.');
        setPaying(false);
        return;
      }

      const { order_id, approve_url } = res.data.data;
      if (!approve_url) {
        Alert.alert('Error', 'PayPal did not return an approval URL. Please try again.');
        setPaying(false);
        return;
      }

      setPendingOrder(order_id);
      pendingOrderRef.current   = order_id;

      // ── Step 2: Open PayPal in browser ───────────────────────
      // When parent approves and returns to app, AppState listener fires capturePayment
      setWaitingReturn(true);
      waitingReturnRef.current = true;
      await Linking.openURL(approve_url);

      // Show a manual confirm button in case AppState doesn't fire reliably
      setPaying(false);

    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not connect to payment service.');
      setPaying(false);
    }
  };

  // ── Step 3: Capture after PayPal approval ───────────────────
  const confirmCapture = async (oid?: string) => {
    const orderId = oid || pendingOrder;
    if (!orderId) {
      Alert.alert('Error', 'No pending payment found. Please try again.');
      return;
    }
    setPaying(true);
    try {
      // First check if order is actually approved
      const checkRes = await axios.post(`${PAY_API}?action=check_order`, { order_id: orderId });
      const orderStatus = checkRes.data?.data?.status || '';

      if (orderStatus === 'COMPLETED') {
        // Already captured (shouldn't happen but handle gracefully)
        setPaid(true); setPaying(false);
        showSuccessAlert();
        return;
      }

      if (orderStatus !== 'APPROVED') {
        Alert.alert(
          'Not Approved Yet',
          `Payment status: ${orderStatus || 'Unknown'}.\n\nHave you approved the payment in PayPal?`,
          [
            { text: 'I Approved It', onPress: () => captureNow(orderId) },
            { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          ]
        );
        return;
      }

      await captureNow(orderId);
    } catch {
      // If check_order fails, try capture anyway
      await captureNow(orderId);
    }
  };

  const captureNow = async (orderId: string) => {
    try {
      const res = await axios.post(`${PAY_API}?action=capture`, {
        order_id: orderId,
        job_id:   jobId || 0,
      });
      if (res.data.success) {
        setPaid(true);
        setPaying(false);
        setPendingOrder('');
        setWaitingReturn(false);
        pendingOrderRef.current  = '';
        waitingReturnRef.current = false;
        showSuccessAlert();
      } else {
        Alert.alert('Payment Issue', res.data.error || 'Could not confirm payment. Contact support if charged.');
        setPaying(false);
      }
    } catch {
      Alert.alert('Error', 'Could not confirm payment. Please contact support@sitters4me.com');
      setPaying(false);
    }
  };

  const showSuccessAlert = () => {
    Alert.alert(
      '💚 Payment Complete!',
      `$${calc?.total?.toFixed(2) || '0.00'} paid successfully.\n${sitterName} earned $${calc?.sitter_payout?.toFixed(2) || '0.00'}.\n\nThank you for using Sitters4Me!`,
      [
        { text: '⭐ Leave a Review', onPress: () => router.push({
            pathname: '/rate-sitter',
            params: { sitter_id: sitterId, sitter_name: sitterName, job_id: jobId },
          })
        },
        { text: 'Done', onPress: () => router.replace('/parent-home') },
      ]
    );
  };

  const skipPayment = () => {
    Alert.alert(
      'Skip Payment?',
      'The sitter will not be paid until you complete payment. Pay now?',
      [
        { text: 'Pay Now', style: 'cancel' },
        { text: 'Skip for Now', onPress: () => router.replace('/parent-home') },
      ]
    );
  };

  const fname = (sitterName || '').split(' ')[0];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1A7F6E','#02A4E2','#0270C8']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>💳 Pay Your Sitter</Text>
            <Text style={s.headerSub}>Secure payment via PayPal</Text>
          </View>
          <View style={{width:36}} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {loading ? (
          <View style={s.loadBox}>
            <ActivityIndicator size="large" color="#1A7F6E" />
            <Text style={s.loadText}>Calculating payment...</Text>
          </View>
        ) : paid ? (
          <View style={s.paidCard}>
            <Text style={{fontSize:64}}>✅</Text>
            <Text style={s.paidTitle}>Payment Complete!</Text>
            <Text style={s.paidSub}>Thank you for using Sitters4Me</Text>
            <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/parent-home')} activeOpacity={0.85}>
              <Text style={s.doneBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        ) : calc ? (
          <>
            {/* Sitter card */}
            <View style={s.sitterCard}>
              <View style={s.sitterAv}>
                <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                <Text style={s.sitterAvText}>
                  {sitterName.split(' ').map((n:string)=>n[0]||'').join('').toUpperCase().slice(0,2)}
                </Text>
              </View>
              <View style={{flex:1}}>
                <Text style={s.sitterName}>{sitterName}</Text>
                <Text style={s.sitterSub}>Your babysitter today</Text>
              </View>
            </View>

            {/* Time worked */}
            {seconds > 0 && (
              <View style={s.timeCard}>
                <Text style={s.timeLabel}>TIME WORKED</Text>
                <Text style={s.timeDisplay}>{fmt(seconds)}</Text>
                <Text style={s.timeHours}>{calc.hours_worked} hours</Text>
              </View>
            )}

            {/* Breakdown */}
            <View style={s.breakdownCard}>
              <Text style={s.breakdownTitle}>Payment Breakdown</Text>
              <View style={s.bRow}>
                <Text style={s.bLabel}>Hourly rate</Text>
                <Text style={s.bVal}>${parseFloat(calc.hourly_rate).toFixed(2)}/hr</Text>
              </View>
              <View style={s.bRow}>
                <Text style={s.bLabel}>Hours worked</Text>
                <Text style={s.bVal}>{calc.hours_worked} hrs</Text>
              </View>
              <View style={s.bRow}>
                <Text style={s.bLabel}>{fname}'s earnings</Text>
                <Text style={s.bVal}>${parseFloat(calc.sitter_payout).toFixed(2)}</Text>
              </View>
              <View style={s.bRow}>
                <Text style={s.bLabel}>Platform fee (10%)</Text>
                <Text style={s.bVal}>${parseFloat(calc.platform_fee).toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.bRow}>
                <Text style={s.totalLabel}>Total Due</Text>
                <Text style={s.totalVal}>${parseFloat(calc.total).toFixed(2)}</Text>
              </View>
            </View>

            {/* ── WAITING FOR RETURN FROM PAYPAL ── */}
            {waitingReturn && !paying && (
              <View style={s.waitingCard}>
                <Text style={s.waitingIcon}>⏳</Text>
                <Text style={s.waitingTitle}>Waiting for PayPal approval...</Text>
                <Text style={s.waitingSub}>
                  Complete the payment in your browser, then tap the button below to confirm.
                </Text>
                <TouchableOpacity
                  style={s.confirmBtn}
                  onPress={() => confirmCapture()}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#1A7F6E','#0D5C51']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.confirmBtnGrad}>
                    <Text style={s.confirmBtnText}>✓ I Approved — Confirm Payment</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setWaitingReturn(false); waitingReturnRef.current = false; }} style={{marginTop:10}}>
                  <Text style={{color:'#9B9FAE',fontSize:13,textAlign:'center'}}>Cancel — try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── PAY NOW BUTTON (shown when not waiting) ── */}
            {!waitingReturn && (
              <>
                <TouchableOpacity onPress={payNow} disabled={paying} activeOpacity={0.85}>
                  <View style={[s.paypalBtn, paying && {opacity:0.7}]}>
                    {paying
                      ? <><ActivityIndicator color="#003087" /><Text style={[s.paypalText,{marginLeft:10}]}>Opening PayPal...</Text></>
                      : <><Text style={s.paypalLogo}>PayPal</Text><Text style={s.paypalText}>Pay ${parseFloat(calc.total).toFixed(2)}</Text></>
                    }
                  </View>
                </TouchableOpacity>

                <Text style={s.secureText}>🔒 You will be redirected to PayPal to complete payment securely</Text>

                <TouchableOpacity onPress={skipPayment} style={{alignItems:'center',marginTop:4}}>
                  <Text style={{color:'#9B9FAE',fontSize:13}}>Pay later</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <View style={s.loadBox}>
            <Text style={{fontSize:36}}>⚠️</Text>
            <Text style={{fontSize:15,color:'#5A5F72',textAlign:'center',marginTop:8}}>
              Could not load payment details.
            </Text>
            <TouchableOpacity style={s.retryBtn} onPress={calculatePayment} activeOpacity={0.85}>
              <Text style={s.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
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
  backText:       {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:    {fontSize:20,fontWeight:'900',color:'#FFFFFF'},
  headerSub:      {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  scroll:         {flex:1,marginTop:-16},
  content:        {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  loadBox:        {alignItems:'center',paddingVertical:48,gap:12},
  loadText:       {fontSize:14,color:'#5A5F72'},
  paidCard:       {backgroundColor:'#D4EDE9',borderRadius:20,padding:32,alignItems:'center',gap:12},
  paidTitle:      {fontSize:24,fontWeight:'900',color:'#1A7F6E'},
  paidSub:        {fontSize:14,color:'#1A7F6E'},
  doneBtn:        {marginTop:8,backgroundColor:'#1A7F6E',borderRadius:12,paddingVertical:12,paddingHorizontal:32},
  doneBtnText:    {color:'#FFFFFF',fontSize:15,fontWeight:'700'},
  sitterCard:     {backgroundColor:'#FFFFFF',borderRadius:14,padding:16,flexDirection:'row',alignItems:'center',gap:14,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  sitterAv:       {width:52,height:52,borderRadius:16,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  sitterAvText:   {fontSize:18,fontWeight:'800',color:'#FFFFFF',zIndex:1},
  sitterName:     {fontSize:17,fontWeight:'800',color:'#0F1117'},
  sitterSub:      {fontSize:13,color:'#9B9FAE',marginTop:2},
  timeCard:       {backgroundColor:'#2C3E50',borderRadius:16,padding:24,alignItems:'center',gap:4},
  timeLabel:      {fontSize:11,fontWeight:'700',color:'rgba(255,255,255,0.6)',letterSpacing:1.5},
  timeDisplay:    {fontSize:48,fontWeight:'900',color:'#FFFFFF',letterSpacing:-2},
  timeHours:      {fontSize:14,color:'rgba(255,255,255,0.7)'},
  breakdownCard:  {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,gap:10,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  breakdownTitle: {fontSize:16,fontWeight:'800',color:'#0F1117',marginBottom:4},
  bRow:           {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  bLabel:         {fontSize:14,color:'#5A5F72'},
  bVal:           {fontSize:14,color:'#0F1117',fontWeight:'600'},
  divider:        {height:1,backgroundColor:'rgba(15,17,23,0.1)',marginVertical:4},
  totalLabel:     {fontSize:16,fontWeight:'900',color:'#0F1117'},
  totalVal:       {fontSize:24,fontWeight:'900',color:'#1A7F6E'},
  // Waiting state
  waitingCard:    {backgroundColor:'#F5F4F0',borderRadius:16,padding:20,alignItems:'center',gap:10,borderWidth:1.5,borderColor:'rgba(26,127,110,0.3)'},
  waitingIcon:    {fontSize:40},
  waitingTitle:   {fontSize:16,fontWeight:'800',color:'#0F1117',textAlign:'center'},
  waitingSub:     {fontSize:13,color:'#5A5F72',textAlign:'center',lineHeight:20},
  confirmBtn:     {alignSelf:'stretch',borderRadius:12,overflow:'hidden',marginTop:4},
  confirmBtnGrad: {padding:16,alignItems:'center'},
  confirmBtnText: {color:'#FFFFFF',fontSize:15,fontWeight:'800'},
  // PayPal button
  paypalBtn:      {backgroundColor:'#FFC439',borderRadius:14,padding:17,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,shadowColor:'#F5A623',shadowOffset:{width:0,height:4},shadowOpacity:0.4,shadowRadius:8,elevation:6},
  paypalLogo:     {fontSize:18,fontWeight:'900',color:'#003087',fontStyle:'italic'},
  paypalText:     {fontSize:16,fontWeight:'800',color:'#003087'},
  secureText:     {fontSize:12,color:'#9B9FAE',textAlign:'center'},
  retryBtn:       {marginTop:12,backgroundColor:'#F5F4F0',borderRadius:10,paddingVertical:10,paddingHorizontal:24,borderWidth:1,borderColor:'#E5E2DA'},
  retryText:      {fontSize:14,fontWeight:'700',color:'#5A5F72'},
});
