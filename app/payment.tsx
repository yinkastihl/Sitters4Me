// app/payment.tsx — Payment screen shown to parent after job ends
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const PAY_API = 'https://sitters4me.com/api/payments.php';

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const jobId     = params.job_id      as string || '';
  const seconds   = parseInt(params.seconds as string || '0');
  const rate      = parseFloat(params.rate  as string || '0');
  const sitterId  = params.sitter_id   as string || '';
  const sitterName= params.sitter_name as string || 'Sitter';

  const [calc,     setCalc]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [paying,   setPaying]   = useState(false);
  const [paid,     setPaid]     = useState(false);
  const [orderId,  setOrderId]  = useState('');

  const user = global.currentUser || {};

  useEffect(() => { calculatePayment(); }, []);

  const calculatePayment = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${PAY_API}?action=calculate`, {
        job_id:      jobId,
        seconds:     seconds,
        hourly_rate: rate || user.minrate || 15,
      });
      if (res.data.success) setCalc(res.data.data);
      else Alert.alert('Error', res.data.error || 'Could not calculate payment');
    } catch {
      Alert.alert('Error', 'Could not connect. Please try again.');
    } finally { setLoading(false); }
  };

  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const payNow = async () => {
    if (!calc) return;
    setPaying(true);
    try {
      const res = await axios.post(`${PAY_API}?action=create_order`, {
        job_id:       jobId,
        parent_id:    user.id,
        sitter_id:    sitterId,
        amount:       calc.total,
        hours:        calc.hours_worked,
        rate:         calc.hourly_rate,
        platform_fee: calc.platform_fee,
        sitter_payout:calc.sitter_payout,
      });

      if (!res.data.success) {
        Alert.alert('Payment Error', res.data.error || 'Could not start payment.');
        setPaying(false);
        return;
      }

      setOrderId(res.data.data.order_id);
      const approveUrl = res.data.data.approve_url;

      if (approveUrl) {
        // Open PayPal in browser
        await Linking.openURL(approveUrl);
        // After returning from PayPal, capture the payment
        Alert.alert(
          'Complete Payment',
          'Did you complete the payment in PayPal?',
          [
            { text: 'Yes, Capture Payment', onPress: () => capturePayment(res.data.data.order_id) },
            { text: 'Cancel', style: 'cancel', onPress: () => setPaying(false) },
          ]
        );
      } else {
        Alert.alert('Error', 'Could not get PayPal approval URL.');
        setPaying(false);
      }
    } catch {
      Alert.alert('Error', 'Could not connect to payment service.');
      setPaying(false);
    }
  };

  const capturePayment = async (oid: string) => {
    try {
      const res = await axios.post(`${PAY_API}?action=capture`, {
        order_id: oid || orderId,
        job_id:   jobId,
      });
      if (res.data.success) {
        setPaid(true);
        setPaying(false);
        Alert.alert(
          '💚 Payment Complete!',
          `$${calc?.total} has been paid.\n${sitterName} earned $${calc?.sitter_payout}.\n\nThank you for using Sitters4Me!`,
          [{
            text: 'Leave a Review', onPress: () => router.push({
              pathname: '/rate-sitter',
              params: { sitter_id: sitterId, sitter_name: sitterName, job_id: jobId },
            })
          }, {
            text: 'Done', onPress: () => router.replace('/parent-home'),
          }]
        );
      } else {
        Alert.alert('Payment Issue', res.data.error || 'Please contact support if money was charged.');
        setPaying(false);
      }
    } catch {
      Alert.alert('Error', 'Could not confirm payment. Please contact support.');
      setPaying(false);
    }
  };

  const skipPayment = () => {
    Alert.alert(
      'Skip Payment?',
      'You can pay later through your job history. The sitter will be notified.',
      [
        { text: 'Pay Now', style: 'cancel' },
        { text: 'Pay Later', onPress: () => router.push({
            pathname: '/rate-sitter',
            params: { sitter_id: sitterId, sitter_name: sitterName, job_id: jobId },
          })
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1A7F6E','#02A4E2','#0270C8']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>💳 Pay Your Sitter</Text>
            <Text style={s.headerSub}>Job complete — secure payment via PayPal</Text>
          </View>
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
            <Text style={s.paidIcon}>✅</Text>
            <Text style={s.paidTitle}>Payment Complete!</Text>
            <Text style={s.paidSub}>Thank you for using Sitters4Me</Text>
          </View>
        ) : calc ? (
          <>
            {/* Sitter name */}
            <View style={s.sitterCard}>
              <View style={s.sitterAv}>
                <LinearGradient colors={['#02A4E2','#0270C8']} style={StyleSheet.absoluteFill} />
                <Text style={s.sitterAvText}>
                  {sitterName.split(' ').map((n:string)=>n[0]).join('').toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={s.sitterName}>{sitterName}</Text>
                <Text style={s.sitterSub}>Your babysitter today</Text>
              </View>
            </View>

            {/* Time worked */}
            <View style={s.timeCard}>
              <Text style={s.timeLabel}>TIME WORKED</Text>
              <Text style={s.timeDisplay}>{fmt(seconds)}</Text>
              <Text style={s.timeHours}>{calc.hours_worked} hours</Text>
            </View>

            {/* Payment breakdown */}
            <View style={s.breakdownCard}>
              <Text style={s.breakdownTitle}>Payment Breakdown</Text>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>Hourly rate</Text>
                <Text style={s.breakdownVal}>${parseFloat(calc.hourly_rate).toFixed(2)}/hr</Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>Hours worked</Text>
                <Text style={s.breakdownVal}>{calc.hours_worked} hrs</Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>Sitter earnings</Text>
                <Text style={s.breakdownVal}>${parseFloat(calc.sitter_payout).toFixed(2)}</Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>Service fee (10%)</Text>
                <Text style={s.breakdownVal}>${parseFloat(calc.platform_fee).toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.breakdownRow}>
                <Text style={s.totalLabel}>Total Due</Text>
                <Text style={s.totalVal}>${parseFloat(calc.total).toFixed(2)}</Text>
              </View>
            </View>

            {/* PayPal button */}
            <TouchableOpacity onPress={payNow} disabled={paying} activeOpacity={0.85}>
              <View style={[s.paypalBtn, paying && {opacity:0.7}]}>
                {paying
                  ? <ActivityIndicator color="#003087" />
                  : <>
                      <Text style={s.paypalIcon}>🔵</Text>
                      <Text style={s.paypalText}>Pay ${parseFloat(calc.total).toFixed(2)} with PayPal</Text>
                    </>
                }
              </View>
            </TouchableOpacity>

            <View style={s.secureRow}>
              <Text style={s.secureText}>🔒 Secured by PayPal · Your card info is never stored</Text>
            </View>

            <TouchableOpacity onPress={skipPayment} style={{marginTop:8,alignItems:'center'}}>
              <Text style={{color:'#9B9FAE',fontSize:13}}>Pay later</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={s.loadBox}>
            <Text style={{fontSize:36,marginBottom:12}}>⚠️</Text>
            <Text style={{fontSize:15,color:'#5A5F72',textAlign:'center'}}>
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
  headerTitle:    {fontSize:20,fontWeight:'900',color:'#FFFFFF'},
  headerSub:      {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  scroll:         {flex:1,marginTop:-16},
  content:        {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  loadBox:        {alignItems:'center',paddingVertical:48,gap:12},
  loadText:       {fontSize:14,color:'#5A5F72'},
  paidCard:       {backgroundColor:'#D4EDE9',borderRadius:20,padding:32,alignItems:'center',gap:10},
  paidIcon:       {fontSize:64},
  paidTitle:      {fontSize:24,fontWeight:'900',color:'#1A7F6E'},
  paidSub:        {fontSize:14,color:'#1A7F6E'},
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
  breakdownRow:   {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  breakdownLabel: {fontSize:14,color:'#5A5F72'},
  breakdownVal:   {fontSize:14,color:'#0F1117',fontWeight:'600'},
  divider:        {height:1,backgroundColor:'rgba(15,17,23,0.1)',marginVertical:4},
  totalLabel:     {fontSize:16,fontWeight:'900',color:'#0F1117'},
  totalVal:       {fontSize:24,fontWeight:'900',color:'#1A7F6E'},
  paypalBtn:      {backgroundColor:'#FFC439',borderRadius:14,padding:17,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},
  paypalIcon:     {fontSize:22},
  paypalText:     {fontSize:16,fontWeight:'800',color:'#003087'},
  secureRow:      {alignItems:'center'},
  secureText:     {fontSize:12,color:'#9B9FAE',textAlign:'center'},
  retryBtn:       {marginTop:12,backgroundColor:'#F5F4F0',borderRadius:10,paddingVertical:10,paddingHorizontal:24,borderWidth:1,borderColor:'#E5E2DA'},
  retryText:      {fontSize:14,fontWeight:'700',color:'#5A5F72'},
});
