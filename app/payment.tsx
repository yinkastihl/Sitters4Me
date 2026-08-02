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
  const numKids    = parseInt(params.kids as string || String(global.activeJob?.kids || 1));
  const childAges  = (params.child_ages as string) || (global.activeJob?.child_ages as string) || '';

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
      // ── BILLING RULES ──
      // 1. Base rate = sitter hourly rate
      // 2. Each additional child after the 1st adds $5/hr
      // 3. Minimum charge = 2 hours (any time within first 2 hrs rounds to 2 hrs)
      // 4. After 2 hours, charge per minute

      const actualSeconds = seconds || 7200; // default 2hrs if no timer
      const baseRate      = rate || 15;
      const kids          = numKids || 1;
      const extraKidsRate = (kids > 1) ? (kids - 1) * 5 : 0; // $5 per extra child
      const totalRate     = baseRate + extraKidsRate;

      // Calculate billable hours
      let billableHours: number;
      const MIN_HOURS = 2;
      const rawHours  = actualSeconds / 3600;

      if (rawHours <= MIN_HOURS) {
        // Any time within first 2 hours = charged full 2 hours
        billableHours = MIN_HOURS;
      } else {
        // First 2 hours + per-minute for extra time
        const extraSeconds = actualSeconds - (MIN_HOURS * 3600);
        const extraMinutes = Math.ceil(extraSeconds / 60); // round up to next minute
        billableHours = MIN_HOURS + (extraMinutes / 60);
      }

      const subtotal    = Math.round(billableHours * totalRate * 100) / 100;
      const platformFee = Math.round(subtotal * 0.10 * 100) / 100;
      const total       = Math.round((subtotal + platformFee) * 100) / 100;

      // Build breakdown text
      let breakdown = `$${totalRate.toFixed(2)}/hr`;
      if (kids > 1) breakdown += ` ($${baseRate} base + $${extraKidsRate} for ${kids - 1} extra child${kids > 2 ? 'ren' : ''})`;
      if (rawHours <= MIN_HOURS) {
        breakdown += ` x ${MIN_HOURS} hrs (2-hr minimum)`;
      } else {
        const extraMins = Math.ceil((actualSeconds - MIN_HOURS * 3600) / 60);
        breakdown += ` x 2 hrs + ${extraMins} min`;
      }

      setCalc({
        hours_worked:    Math.round(billableHours * 100) / 100,
        actual_time:     rawHours,
        hourly_rate:     totalRate,
        base_rate:       baseRate,
        extra_kids_rate: extraKidsRate,
        kids:            kids,
        subtotal,
        platform_fee:    platformFee,
        total,
        sitter_payout:   subtotal,
        breakdown,
        min_applied:     rawHours < MIN_HOURS,
      });
    } catch {
      const hrs      = Math.max(2, (seconds || 7200) / 3600);
      const subtotal = Math.round(hrs * (rate || 15) * 100) / 100;
      const fee      = Math.round(subtotal * 0.10 * 100) / 100;
      setCalc({
        hours_worked: hrs, hourly_rate: rate || 15, subtotal,
        platform_fee: fee, total: subtotal + fee, sitter_payout: subtotal,
        breakdown: '', kids: numKids || 1, base_rate: rate || 15, extra_kids_rate: 0,
        min_applied: false, actual_time: hrs,
      });
    } finally { setLoading(false); }
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
      console.log('Creating PayPal order:', { job_id: jobId, parent_id: user.id, amount: calc.total });
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

      console.log('create_order response:', JSON.stringify(res.data));

      if (!res.data.success) {
        Alert.alert('Payment Error', res.data.error || 'Could not start payment. Please try again.');
        setPaying(false);
        return;
      }

      const { order_id, approve_url } = res.data.data;
      if (!approve_url) {
        Alert.alert('Error', 'PayPal did not return an approval URL.\n\nDebug: ' + JSON.stringify(res.data.data).slice(0, 200));
        setPaying(false);
        return;
      }

      console.log('PayPal order created:', order_id, 'Approve URL:', approve_url);
      setPendingOrder(order_id);
      pendingOrderRef.current = order_id;

      // Open PayPal approval page in browser
      setWaitingReturn(true);
      waitingReturnRef.current = true;
      await Linking.openURL(approve_url);
      setPaying(false);

    } catch (e: any) {
      console.log('PayPal error:', e?.response?.data || e?.message);
      Alert.alert('Error', e?.response?.data?.error || e?.message || 'Could not connect to payment service.');
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
      console.log('Checking order status:', orderId);
      const checkRes = await axios.post(`${PAY_API}?action=check_order`, { order_id: orderId });
      const orderStatus = checkRes.data?.data?.status || '';
      console.log('Order status:', orderStatus, JSON.stringify(checkRes.data).slice(0, 300));

      if (orderStatus === 'COMPLETED') {
        setPaid(true); setPaying(false);
        showSuccessAlert();
        return;
      }

      if (orderStatus === 'APPROVED') {
        // Order is approved — capture it now
        console.log('Order APPROVED — capturing...');
        await captureNow(orderId);
        return;
      }

      if (orderStatus === 'CREATED') {
        // User hasn't approved yet in PayPal
        Alert.alert(
          'Not Approved Yet',
          'It looks like you haven\'t approved the payment in PayPal yet.\n\nTap "Pay Again" to open PayPal and approve the payment.',
          [
            { text: 'Pay Again', onPress: async () => {
              setPaying(false);
              // Re-open the approval URL
              try {
                const res = await axios.post(`${PAY_API}?action=check_order`, { order_id: orderId });
                const links = res.data?.data?.order?.links || [];
                const approveLink = links.find((l:any) => l.rel === 'approve' || l.rel === 'payer-action');
                if (approveLink?.href) {
                  setWaitingReturn(true);
                  waitingReturnRef.current = true;
                  await Linking.openURL(approveLink.href);
                }
              } catch {}
            }},
            { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          ]
        );
        return;
      }

      // Unknown status
      Alert.alert(
        'Payment Status: ' + orderStatus,
        'Would you like to try capturing anyway?',
        [
          { text: 'Try Capture', onPress: () => captureNow(orderId) },
          { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
        ]
      );
    } catch (e: any) {
      console.log('check_order error:', e?.response?.data || e?.message);
      // If check fails, try capture anyway
      await captureNow(orderId);
    }
  };

  const captureNow = async (orderId: string) => {
    try {
      console.log('Capturing order:', orderId);
      const res = await axios.post(`${PAY_API}?action=capture`, {
        order_id: orderId,
        job_id:   jobId || 0,
      });
      console.log('Capture response:', JSON.stringify(res.data));
      if (res.data.success) {
        setPaid(true);
        setPaying(false);
        setPendingOrder('');
        setWaitingReturn(false);
        pendingOrderRef.current  = '';
        waitingReturnRef.current = false;
        showSuccessAlert();
      } else {
        Alert.alert('Payment Issue', res.data.error || 'Could not confirm payment.\n\nDebug: ' + JSON.stringify(res.data).slice(0, 200));
        setPaying(false);
      }
    } catch (e: any) {
      console.log('Capture error:', e?.response?.data || e?.message);
      Alert.alert('Error', 'Could not confirm payment: ' + (e?.response?.data?.error || e?.message || 'Unknown'));
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

              {calc.kids > 1 && (
                <>
                  <View style={s.bRow}>
                    <Text style={s.bLabel}>Base rate</Text>
                    <Text style={s.bVal}>${parseFloat(calc.base_rate).toFixed(2)}/hr</Text>
                  </View>
                  <View style={s.bRow}>
                    <Text style={s.bLabel}>Extra children ({calc.kids - 1})</Text>
                    <Text style={s.bVal}>+${parseFloat(calc.extra_kids_rate).toFixed(2)}/hr</Text>
                  </View>
                  <View style={s.bRow}>
                    <Text style={{fontSize:14,color:'#0F1117',fontWeight:'700'}}>Effective rate</Text>
                    <Text style={{fontSize:14,color:'#02A4E2',fontWeight:'800'}}>${parseFloat(calc.hourly_rate).toFixed(2)}/hr</Text>
                  </View>
                </>
              )}
              {calc.kids <= 1 && (
                <View style={s.bRow}>
                  <Text style={s.bLabel}>Hourly rate</Text>
                  <Text style={s.bVal}>${parseFloat(calc.hourly_rate).toFixed(2)}/hr</Text>
                </View>
              )}

              <View style={s.bRow}>
                <Text style={s.bLabel}>Children</Text>
                <Text style={s.bVal}>{calc.kids || 1}{childAges ? ` (${childAges})` : ''}</Text>
              </View>

              <View style={s.bRow}>
                <Text style={s.bLabel}>Actual time</Text>
                <Text style={s.bVal}>{fmt(seconds)}</Text>
              </View>
              <View style={s.bRow}>
                <Text style={s.bLabel}>Billable hours</Text>
                <Text style={s.bVal}>{calc.hours_worked} hrs{calc.min_applied ? ' (2-hr min)' : ''}</Text>
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
              {calc.breakdown ? <Text style={{fontSize:11,color:'#9B9FAE',marginTop:4}}>{calc.breakdown}</Text> : null}
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
