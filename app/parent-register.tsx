// app/parent-register.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API            = 'https://sitters4me.com/api/auth.php';
const RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];

export default function ParentRegister() {
  const router = useRouter();
  const [step, setStep]         = useState(1);
  const [loading, setLoading]   = useState(false);

  // Step 1
  const [fname, setFname]       = useState('');
  const [lname, setLname]       = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  // Step 2
  const [kids, setKids]         = useState('1');
  const [address, setAddress]   = useState('');
  const [city, setCity]         = useState('');
  const [state, setState]       = useState('');
  const [zipcode, setZipcode]   = useState('');
  const [radius, setRadius]     = useState('10');

  // Step 3
  const [agreed, setAgreed]     = useState(false);

  const next = () => {
    if (step === 1) {
      if (!fname||!lname||!email||!phone||!password||!confirm)
        return Alert.alert('Missing Fields','Please fill in all required fields.');
      if (!/\S+@\S+\.\S+/.test(email))
        return Alert.alert('Invalid Email','Please enter a valid email address.');
      if (password.length < 6)
        return Alert.alert('Weak Password','Password must be at least 6 characters.');
      if (password !== confirm)
        return Alert.alert('Password Mismatch','Your passwords do not match. Please re-enter.');
    }
    if (step === 2) {
      if (!address||!city||!state||!zipcode)
        return Alert.alert('Missing Fields','Please fill in your complete address.');
    }
    setStep(v => v + 1);
  };

  const register = async () => {
    if (!agreed)
      return Alert.alert('Agreement Required','Please agree to the Terms & Conditions to create your account.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=parent_register`, {
        fname, lname,
        email: email.trim().toLowerCase(),
        password, phone,
        kids:          parseInt(kids) || 1,
        address, city, state, zipcode,
        search_radius: parseInt(radius),
      });
      if (res.data.success) {
        Alert.alert(
          '🎉 Account Created!',
          `A verification email has been sent to:\n\n${email}\n\nPlease click the link in the email to activate your account. You can then sign in and start booking sitters immediately — no admin approval needed!`,
          [{ text: 'Go to Sign In', onPress: () => router.replace('/parent-login') }]
        );
      } else {
        Alert.alert('Registration Failed', res.data.error || 'Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not connect. Please check your internet.');
    } finally { setLoading(false); }
  };

  const Btn = ({ label, onPress, loading: l }: any) => (
    <TouchableOpacity onPress={onPress} disabled={l} activeOpacity={0.85}>
      <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={[bs.btn, l&&{opacity:0.7}]}>
        {l ? <ActivityIndicator color="#fff" /> : <Text style={bs.btnText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={{flex:1}}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => step>1?setStep(v=>v-1):router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{alignItems:'center'}}>
            <Image source={require('../assets/logo.jpg')} style={s.headerLogo} resizeMode="contain" />
            <Text style={s.headerSub}>Parent Registration · Step {step} of 3</Text>
          </View>
          <View style={{width:36}} />
        </View>

        {/* White card */}
        <View style={s.card}>
          <View style={s.progBg}><View style={[s.progFill,{width:`${(step/3)*100}%` as any}]} /></View>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

              {/* ── STEP 1: Personal info ── */}
              {step===1 && <>
                <Text style={s.stepTitle}>Your Information</Text>
                <View style={s.row}>
                  <View style={{flex:1}}>
                    <Text style={s.label}>FIRST NAME *</Text>
                    <TextInput style={s.input} value={fname} onChangeText={setFname} placeholder="Jane" placeholderTextColor="#9B9FAE" />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.label}>LAST NAME *</Text>
                    <TextInput style={s.input} value={lname} onChangeText={setLname} placeholder="Smith" placeholderTextColor="#9B9FAE" />
                  </View>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>EMAIL ADDRESS *</Text>
                  <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="jane@example.com" placeholderTextColor="#9B9FAE" keyboardType="email-address" autoCapitalize="none" />
                  <Text style={s.hint}>⚠️ Verification email sent here. Must be real and active.</Text>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>PHONE NUMBER *</Text>
                  <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" placeholderTextColor="#9B9FAE" keyboardType="phone-pad" />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>PASSWORD *</Text>
                  <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Minimum 6 characters" placeholderTextColor="#9B9FAE" secureTextEntry />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>CONFIRM PASSWORD *</Text>
                  <TextInput style={s.input} value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" placeholderTextColor="#9B9FAE" secureTextEntry />
                </View>
                <Btn label="Continue →" onPress={next} />
              </>}

              {/* ── STEP 2: Location & preferences ── */}
              {step===2 && <>
                <Text style={s.stepTitle}>Location & Preferences</Text>
                <View style={s.field}>
                  <Text style={s.label}>STREET ADDRESS *</Text>
                  <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="123 Main Street" placeholderTextColor="#9B9FAE" />
                </View>
                <View style={s.row}>
                  <View style={{flex:2}}>
                    <Text style={s.label}>CITY *</Text>
                    <TextInput style={s.input} value={city} onChangeText={setCity} placeholder="Houston" placeholderTextColor="#9B9FAE" />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.label}>STATE *</Text>
                    <TextInput style={s.input} value={state} onChangeText={setState} placeholder="TX" placeholderTextColor="#9B9FAE" autoCapitalize="characters" maxLength={2} />
                  </View>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>ZIP CODE *</Text>
                  <TextInput style={s.input} value={zipcode} onChangeText={setZipcode} placeholder="77001" placeholderTextColor="#9B9FAE" keyboardType="number-pad" maxLength={5} />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>NUMBER OF CHILDREN</Text>
                  <TextInput style={s.input} value={kids} onChangeText={setKids} placeholder="e.g. 2" placeholderTextColor="#9B9FAE" keyboardType="number-pad" maxLength={2} />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>HOW FAR WILL YOU ACCEPT A SITTER FROM? *</Text>
                  <Text style={s.hint}>Sitters within this radius receive your real-time job requests</Text>
                  <View style={s.chips}>
                    {RADIUS_OPTIONS.map(r => (
                      <TouchableOpacity key={r} style={[s.chip, radius===String(r)&&s.chipOn]} onPress={()=>setRadius(String(r))}>
                        <Text style={[s.chipText, radius===String(r)&&{color:'#fff'}]}>{r} mi</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Btn label="Continue →" onPress={next} />
              </>}

              {/* ── STEP 3: Review & terms ── */}
              {step===3 && <>
                <Text style={s.stepTitle}>Review & Confirm</Text>

                {/* Summary card */}
                <View style={s.summaryCard}>
                  <Text style={s.summaryTitle}>Account Summary</Text>
                  {[
                    ['👤','Name',`${fname} ${lname}`],
                    ['📧','Email',email],
                    ['📱','Phone',phone],
                    ['📍','Location',`${city}, ${state} ${zipcode}`],
                    ['🔍','Search radius',`${radius} miles`],
                    ['👶','Children',`${kids} child${parseInt(kids)!==1?'ren':''}`],
                  ].map(([icon,label,value]) => (
                    <View key={label} style={s.summaryRow}>
                      <Text style={s.summaryIcon}>{icon}</Text>
                      <Text style={s.summaryLabel}>{label}:</Text>
                      <Text style={s.summaryValue}>{value}</Text>
                    </View>
                  ))}
                </View>

                {/* Email verification notice */}
                <View style={s.emailNotice}>
                  <Text style={s.emailNoticeTitle}>📧 Email Verification — No Admin Approval Needed!</Text>
                  <Text style={s.emailNoticeText}>
                    After creating your account:{'\n\n'}
                    1️⃣  We send a verification link to <Text style={{fontWeight:'700',color:'#C93488'}}>{email}</Text>{'\n'}
                    2️⃣  Click the link to activate your account{'\n'}
                    3️⃣  Sign in and start booking sitters immediately!{'\n\n'}
                    No waiting for admin approval. You're in control.
                  </Text>
                </View>

                <TouchableOpacity style={s.agreeRow} onPress={()=>setAgreed(v=>!v)}>
                  <View style={[s.checkbox, agreed&&s.checkboxOn]}>
                    {agreed&&<Text style={{color:'#fff',fontSize:13,fontWeight:'800'}}>✓</Text>}
                  </View>
                  <Text style={s.agreeText}>
                    I agree to the <Text style={{color:'#C93488',fontWeight:'700'}}>Terms & Conditions</Text> and <Text style={{color:'#02A4E2',fontWeight:'700'}}>Privacy Policy</Text>
                  </Text>
                </TouchableOpacity>

                <Btn label="Create Account & Send Verification Email" onPress={register} loading={loading} />
              </>}

            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1},
  header:          {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:12,paddingBottom:8},
  backBtn:         {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:        {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerLogo:      {width:100,height:34,backgroundColor:'rgba(255,255,255,0.9)',borderRadius:8,padding:2},
  headerSub:       {fontSize:11,color:'rgba(255,255,255,0.75)',marginTop:3},
  card:            {flex:1,backgroundColor:'#FFFFFF',borderTopLeftRadius:32,borderTopRightRadius:32,overflow:'hidden'},
  progBg:          {height:4,backgroundColor:'#EEECE7'},
  progFill:        {height:4,backgroundColor:'#C93488',borderRadius:2},
  content:         {padding:24,paddingBottom:48},
  stepTitle:       {fontSize:22,fontWeight:'900',color:'#0F1117',marginBottom:20,letterSpacing:-0.3},
  row:             {flexDirection:'row',gap:10},
  field:           {marginBottom:16},
  label:           {fontSize:11,fontWeight:'700',color:'#5A5F72',letterSpacing:0.6,marginBottom:6,textTransform:'uppercase'},
  hint:            {fontSize:12,color:'#9B9FAE',marginTop:4,lineHeight:18},
  input:           {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117',marginBottom:0},
  chips:           {flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},
  chip:            {paddingHorizontal:16,paddingVertical:9,borderRadius:20,borderWidth:1.5,borderColor:'rgba(15,17,23,0.15)',backgroundColor:'#FFFFFF'},
  chipOn:          {backgroundColor:'#C93488',borderColor:'#C93488'},
  chipText:        {fontSize:13,fontWeight:'600',color:'#5A5F72'},
  summaryCard:     {backgroundColor:'#F5F4F0',borderRadius:14,padding:18,marginBottom:16},
  summaryTitle:    {fontSize:14,fontWeight:'800',color:'#0F1117',marginBottom:12},
  summaryRow:      {flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  summaryIcon:     {fontSize:16,width:24},
  summaryLabel:    {fontSize:13,fontWeight:'600',color:'#5A5F72',width:80},
  summaryValue:    {fontSize:13,color:'#0F1117',flex:1},
  emailNotice:     {backgroundColor:'#FFF0F7',borderRadius:14,padding:16,marginBottom:16,borderWidth:1,borderColor:'rgba(201,52,136,0.15)'},
  emailNoticeTitle:{fontSize:14,fontWeight:'800',color:'#C93488',marginBottom:8},
  emailNoticeText: {fontSize:13,color:'#5A5F72',lineHeight:20},
  agreeRow:        {flexDirection:'row',alignItems:'flex-start',gap:10,marginBottom:16},
  checkbox:        {width:22,height:22,borderRadius:6,borderWidth:2,borderColor:'rgba(15,17,23,0.2)',alignItems:'center',justifyContent:'center',marginTop:1,flexShrink:0},
  checkboxOn:      {backgroundColor:'#C93488',borderColor:'#C93488'},
  agreeText:       {flex:1,fontSize:13,color:'#5A5F72',lineHeight:20},
});

const bs = StyleSheet.create({
  btn:    {borderRadius:12,padding:16,alignItems:'center',marginTop:8},
  btnText:{color:'#FFFFFF',fontSize:16,fontWeight:'800'},
});
