// app/sitter-login.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const API      = 'https://sitters4me.com/api/auth.php';
const JOBS_API = 'https://sitters4me.com/api/jobs.php';

async function registerForPush(): Promise<string | null> {
  // Push tokens only work in a development build or production — not Expo Go
  if (Constants.appOwnership === 'expo') return null;
  try {
    if (require('react-native').Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:      'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C93488',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch (e) {
    console.warn('Push token error:', e);
    return null;
  }
}

export default function SitterLogin() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);

  const login = async () => {
    if (!email.trim() || !password)
      return Alert.alert('Missing Fields','Please enter your email and password.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=sitter_login`, { email:email.trim().toLowerCase(), password });
      if (res.data.success) {
        global.currentUser = res.data.data;
        const u = res.data.data;
        // Register for push notifications and save token to server
        const pushToken = await registerForPush();
        if (pushToken && u?.id) {
          axios.post(`${JOBS_API}?action=save_push_token`, {
            user_type:  'sitter',
            user_id:    u.id,
            push_token: pushToken,
          }).catch(() => {}); // fire-and-forget
        }
        // Route based on account status
        if (u.status === 'pending' || u.status === 'inactive') {
          return router.replace('/sitter-pending');
        }
        // Active sitter - go to home regardless of bgcheck
        router.replace('/sitter-home');
      } else {
        Alert.alert('Login Failed', res.data.error || 'Please check your credentials.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not connect. Please check your internet.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={{flex:1}}>
        <View style={s.header}>
          <TouchableOpacity onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹</Text></TouchableOpacity>
          <Image source={require('../assets/logo.jpg')} style={s.headerLogo} resizeMode="contain" />
          <View style={{width:36}} />
        </View>
        <View style={s.heroText}>
          <Text style={s.heroTitle}>Sitter Sign In</Text>
          <Text style={s.heroSub}>Welcome back! Ready to find jobs?</Text>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
          <ScrollView contentContainerStyle={s.card} keyboardShouldPersistTaps="handled">
            <View style={s.field}>
              <Text style={s.label}>EMAIL ADDRESS</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor="#9B9FAE" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={s.field}>
              <Text style={s.label}>PASSWORD</Text>
              <View style={s.passRow}>
                <TextInput style={[s.input,{flex:1,marginBottom:0}]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#9B9FAE" secureTextEntry={!showPass} />
                <TouchableOpacity style={{padding:14}} onPress={()=>setShowPass(v=>!v)}>
                  <Text style={{fontSize:18}}>{showPass?'🙈':'👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => { (global as any).resetUserType = 'sitter'; router.push('/reset-password'); }}>
              <Text style={s.forgot}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={login} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={[s.btn,loading&&{opacity:0.7}]}>
                {loading?<ActivityIndicator color="#fff"/>:<Text style={s.btnText}>Sign In</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <View style={s.divider}>
              <View style={s.divLine}/><Text style={s.divText}>New babysitter?</Text><View style={s.divLine}/>
            </View>
            <TouchableOpacity onPress={()=>router.push('/sitter-register')} activeOpacity={0.85}>
              <View style={s.outlineBtn}><Text style={s.outlineBtnText}>Create Sitter Account →</Text></View>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      {flex:1},
  header:         {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:12,paddingBottom:6},
  back:           {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:       {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerLogo:     {width:100,height:36,backgroundColor:'rgba(255,255,255,0.9)',borderRadius:8,padding:2},
  heroText:       {alignItems:'center',gap:6,paddingVertical:14},
  heroTitle:      {fontSize:24,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  heroSub:        {fontSize:14,color:'rgba(255,255,255,0.85)'},
  card:           {backgroundColor:'#FFFFFF',borderTopLeftRadius:32,borderTopRightRadius:32,padding:28,paddingBottom:48,flexGrow:1},
  field:          {marginBottom:16},
  label:          {fontSize:11,fontWeight:'700',color:'#5A5F72',letterSpacing:0.6,marginBottom:6,textTransform:'uppercase'},
  input:          {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117'},
  passRow:        {flexDirection:'row',alignItems:'center',backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)'},
  forgot:         {color:'#02A4E2',fontSize:13,fontWeight:'600',textAlign:'right',marginBottom:20,marginTop:-8},
  btn:            {borderRadius:12,padding:16,alignItems:'center'},
  btnText:        {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
  divider:        {flexDirection:'row',alignItems:'center',gap:10,marginVertical:20},
  divLine:        {flex:1,height:1,backgroundColor:'rgba(15,17,23,0.1)'},
  divText:        {color:'#9B9FAE',fontSize:13},
  outlineBtn:     {borderRadius:12,padding:15,alignItems:'center',borderWidth:2,borderColor:'#02A4E2'},
  outlineBtnText: {color:'#02A4E2',fontSize:15,fontWeight:'700'},
});
