// app/verify-email.tsx — shown after registration, prompts user to check email
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const API = 'https://sitters4me.com/api/auth.php';

export default function VerifyEmail() {
  const router     = useRouter();
  const params     = useLocalSearchParams();
  const email      = params.email as string || '';
  const userType   = params.user_type as string || 'parent';
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const resend = async () => {
    setSending(true);
    try {
      const res = await axios.post(`${API}?action=resend_verification`, {
        email, user_type: userType,
      });
      if (res.data.success) {
        setSent(true);
        Alert.alert('Email Sent! ✉️', 'A new verification link has been sent to ' + email);
      } else {
        Alert.alert('Error', res.data.error || 'Could not resend email.');
      }
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet connection.');
    } finally { setSending(false); }
  };

  const isParent = userType === 'parent';
  const color    = isParent ? '#C93488' : '#02A4E2';

  return (
    <SafeAreaView style={s.container}>
      <LinearGradient
        colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={{flex:1}}
      >
        <View style={{height:60}} />
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Text style={{fontSize:56}}>📧</Text>
          </View>

          <Text style={s.title}>Check Your Email!</Text>
          <Text style={s.sub}>
            We've sent a verification link to:
          </Text>
          <View style={s.emailBox}>
            <Text style={[s.emailText, {color}]}>{email}</Text>
          </View>
          <Text style={s.instructions}>
            Click the link in the email to activate your account.{'\n\n'}
            {isParent
              ? '✅ Once verified, you can sign in and start booking sitters immediately — no admin approval needed!'
              : '✅ Once verified, your application will go to admin for review and background check.'}
          </Text>

          <View style={s.steps}>
            <View style={s.step}>
              <View style={[s.stepDot, {backgroundColor: '#1A7F6E'}]} />
              <Text style={s.stepText}>Account created ✓</Text>
            </View>
            <View style={s.step}>
              <View style={[s.stepDot, {backgroundColor: color}]} />
              <Text style={s.stepText}>Verify your email ← check inbox now</Text>
            </View>
            {isParent ? (
              <View style={s.step}>
                <View style={[s.stepDot, {backgroundColor: '#D1D5DB'}]} />
                <Text style={[s.stepText, {color:'#9B9FAE'}]}>Sign in and book sitters 🎉</Text>
              </View>
            ) : (
              <>
                <View style={s.step}>
                  <View style={[s.stepDot, {backgroundColor:'#D1D5DB'}]} />
                  <Text style={[s.stepText,{color:'#9B9FAE'}]}>Admin review + background check</Text>
                </View>
                <View style={s.step}>
                  <View style={[s.stepDot,{backgroundColor:'#D1D5DB'}]} />
                  <Text style={[s.stepText,{color:'#9B9FAE'}]}>Account activated — start earning! 🎉</Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[s.resendBtn, {borderColor: color}]}
            onPress={resend}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color={color} />
              : <Text style={[s.resendText, {color}]}>
                  {sent ? '✓ Email Resent' : '↩ Resend Verification Email'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={{marginTop:14}}
            onPress={() => router.replace(isParent ? '/parent-login' : '/sitter-login')}
          >
            <Text style={s.loginLink}>Already verified? Sign In →</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   {flex:1},
  card:        {flex:1, backgroundColor:'#FFFFFF', borderTopLeftRadius:32, borderTopRightRadius:32, padding:28, alignItems:'center'},
  iconWrap:    {width:100, height:100, backgroundColor:'#FFF0F7', borderRadius:50, alignItems:'center', justifyContent:'center', marginBottom:20},
  title:       {fontSize:26, fontWeight:'900', color:'#0F1117', textAlign:'center', marginBottom:10, letterSpacing:-0.5},
  sub:         {fontSize:14, color:'#5A5F72', textAlign:'center'},
  emailBox:    {backgroundColor:'#F5F4F0', borderRadius:10, paddingHorizontal:20, paddingVertical:10, marginTop:8, marginBottom:16},
  emailText:   {fontSize:15, fontWeight:'700', textAlign:'center'},
  instructions:{fontSize:13, color:'#5A5F72', textAlign:'center', lineHeight:20, marginBottom:24},
  steps:       {backgroundColor:'#F5F4F0', borderRadius:14, padding:18, gap:12, alignSelf:'stretch', marginBottom:20},
  step:        {flexDirection:'row', alignItems:'center', gap:10},
  stepDot:     {width:10, height:10, borderRadius:5, flexShrink:0},
  stepText:    {fontSize:13, color:'#0F1117', fontWeight:'500', flex:1},
  resendBtn:   {borderRadius:12, paddingVertical:13, paddingHorizontal:28, borderWidth:2, alignSelf:'stretch', alignItems:'center'},
  resendText:  {fontSize:14, fontWeight:'700'},
  loginLink:   {color:'#9B9FAE', fontSize:13, textAlign:'center'},
});
