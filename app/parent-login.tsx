// app/parent-login.tsx — with email verification handling
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API = 'https://sitters4me.com/api/auth.php';

export default function ParentLogin() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);

  const login = async () => {
    if (!email.trim() || !password)
      return Alert.alert('Missing Fields', 'Please enter your email and password.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=parent_login`, {
        email: email.trim().toLowerCase(), password,
      });
      if (res.data.success) {
        global.currentUser = res.data.data;
        router.replace('/parent-home');
      } else {
        // Handle unverified email
        if (res.data.error && res.data.error.includes('verify your email')) {
          Alert.alert(
            '📧 Email Not Verified',
            'Please check your inbox and click the verification link we sent you.\n\nIf you did not receive it, tap Resend below.',
            [
              { text: 'Resend Email', onPress: () => router.push({ pathname: '/verify-email', params: { email: email.trim().toLowerCase(), user_type: 'parent' } }) },
              { text: 'OK' },
            ]
          );
        } else {
          Alert.alert('Login Failed', res.data.error || 'Please check your credentials.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not connect. Please check your internet connection.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={{flex:1}}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Text style={s.backText}>‹</Text></TouchableOpacity>
          <View style={{flex:1, alignItems:'center'}}>
            <Text style={s.headerTitle}>Parent Sign In</Text>
            <Text style={s.headerSub}>Welcome back!</Text>
          </View>
          <View style={{width:36}} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
          <ScrollView contentContainerStyle={s.card} keyboardShouldPersistTaps="handled">
            <View style={s.field}>
              <Text style={s.label}>EMAIL ADDRESS</Text>
              <TextInput style={s.input} value={email} onChangeText={setEmail}
                placeholder="your@email.com" placeholderTextColor="#9B9FAE"
                keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View style={s.field}>
              <Text style={s.label}>PASSWORD</Text>
              <View style={s.passRow}>
                <TextInput style={[s.input,{flex:1,marginBottom:0}]} value={password}
                  onChangeText={setPassword} placeholder="••••••••"
                  placeholderTextColor="#9B9FAE" secureTextEntry={!showPass} />
                <TouchableOpacity style={{padding:14}} onPress={() => setShowPass(v=>!v)}>
                  <Text style={{fontSize:18}}>{showPass?'🙈':'👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => Alert.alert('Reset Password','A reset link will be sent to your email.')}>
              <Text style={s.forgot}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={login} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={[s.btn,loading&&{opacity:0.7}]}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <View style={s.divider}>
              <View style={s.divLine}/><Text style={s.divText}>New to Sitters4Me?</Text><View style={s.divLine}/>
            </View>
            <TouchableOpacity onPress={() => router.push('/parent-register')} activeOpacity={0.85}>
              <View style={s.outlineBtn}><Text style={s.outlineBtnText}>Create Parent Account →</Text></View>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      {flex:1},
  header:         {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:16,paddingBottom:12},
  backBtn:        {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:       {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:    {fontSize:22,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  headerSub:      {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  card:           {backgroundColor:'#FFFFFF',borderTopLeftRadius:32,borderTopRightRadius:32,padding:28,paddingBottom:48,flexGrow:1},
  field:          {marginBottom:16},
  label:          {fontSize:11,fontWeight:'700',color:'#5A5F72',letterSpacing:0.6,marginBottom:6,textTransform:'uppercase'},
  input:          {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117'},
  passRow:        {flexDirection:'row',alignItems:'center',backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)'},
  forgot:         {color:'#C93488',fontSize:13,fontWeight:'600',textAlign:'right',marginBottom:20,marginTop:-8},
  btn:            {borderRadius:12,padding:16,alignItems:'center'},
  btnText:        {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
  divider:        {flexDirection:'row',alignItems:'center',gap:10,marginVertical:20},
  divLine:        {flex:1,height:1,backgroundColor:'rgba(15,17,23,0.1)'},
  divText:        {color:'#9B9FAE',fontSize:13},
  outlineBtn:     {borderRadius:12,padding:15,alignItems:'center',borderWidth:2,borderColor:'#C93488'},
  outlineBtnText: {color:'#C93488',fontSize:15,fontWeight:'700'},
});
