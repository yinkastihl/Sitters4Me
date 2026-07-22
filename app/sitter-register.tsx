// app/sitter-register.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API           = 'https://sitters4me.com/api/auth.php';
const CHECKR_API    = 'https://sitters4me.com/api/checkr.php';
const DIST_OPTIONS  = [5, 10, 15, 20, 25, 30];

export default function SitterRegister() {
  const router = useRouter();
  const [step, setStep]           = useState(1);
  const [loading, setLoading]     = useState(false);

  // Step 1 — Personal info (NO SSN — Checkr collects it)
  const [fname, setFname]         = useState('');
  const [lname, setLname]         = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [dob, setDob]             = useState('');
  const [gender, setGender]       = useState('');

  // Step 2 — Location & rates
  const [address, setAddress]     = useState('');
  const [city, setCity]           = useState('');
  const [state, setState]         = useState('');
  const [zipcode, setZipcode]     = useState('');
  const [minrate, setMinrate]     = useState('15');
  const [maxrate, setMaxrate]     = useState('25');
  const [distance, setDistance]   = useState('10');
  const [exp, setExp]             = useState('');

  // Step 3 — Bio & consent
  const [about, setAbout]         = useState('');
  const [agreedBG, setAgreedBG]   = useState(false);
  const [agreed, setAgreed]       = useState(false);

  const next = () => {
    if (step===1) {
      if (!fname||!lname||!email||!phone||!password||!confirm||!dob)
        return Alert.alert('Missing Fields','Please fill in all required fields.');
      if (!/\S+@\S+\.\S+/.test(email))
        return Alert.alert('Invalid Email','Please enter a valid email address.');
      if (password.length < 6)
        return Alert.alert('Weak Password','Password must be at least 6 characters.');
      if (password !== confirm)
        return Alert.alert('Password Mismatch','Your passwords do not match.');
      // Parse MM/DD/YYYY safely without timezone issues
      const dobParts = dob.split('/');
      if (dobParts.length !== 3)
        return Alert.alert('Invalid Date', 'Please enter date of birth as MM/DD/YYYY');
      const dobMonth = parseInt(dobParts[0]) - 1;
      const dobDay   = parseInt(dobParts[1]);
      const dobYear  = parseInt(dobParts[2]);
      if (isNaN(dobMonth)||isNaN(dobDay)||isNaN(dobYear)||dobYear<1900)
        return Alert.alert('Invalid Date', 'Please enter a valid date of birth as MM/DD/YYYY');
      const birth   = new Date(dobYear, dobMonth, dobDay);
      const today   = new Date();
      let age       = today.getFullYear() - birth.getFullYear();
      const mDiff   = today.getMonth() - birth.getMonth();
      if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) age--;
      if (age < 18)
        return Alert.alert('Age Requirement','You must be at least 18 years old to register as a babysitter on Sitters4Me.');
    }
    if (step===2) {
      if (!address||!city||!state||!zipcode)
        return Alert.alert('Missing Fields','Please fill in your complete address.');
      if (!minrate||parseFloat(minrate)<10)
        return Alert.alert('Rate Too Low','Your minimum rate must be at least $10/hr.');
    }
    setStep(v=>v+1);
  };

  const register = async () => {
    if (!agreedBG)
      return Alert.alert('Background Check Consent Required','You must consent to the background check conducted by Checkr. This is required for all Sitters4Me babysitters.');
    if (!agreed)
      return Alert.alert('Agreement Required','Please agree to the Terms & Conditions to create your account.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=sitter_register`, {
        fname, lname,
        email:         email.trim().toLowerCase(),
        password, phone, dob, gender,
        address, city, state, zipcode,
        minrate:       parseFloat(minrate),
        maxrate:       parseFloat(maxrate||'25'),
        work_distance: parseInt(distance),
        total_exp:     parseInt(exp)||0,
        about,
      });
      if (res.data.success) {
        global.currentUser = res.data.data;
        const sitterId = res.data.data?.id;

        // Trigger Checkr background check — fire-and-forget, don't block navigation
        if (sitterId) {
          axios.post(`${CHECKR_API}?action=initiate_check`, { sitter_id: sitterId })
            .then(checkrRes => {
              if (checkrRes.data?.success) {
                // Store invitation URL so pending screen can show it
                const invUrl = checkrRes.data?.data?.invitation_url;
                if (invUrl) {
                  global.currentUser = { ...global.currentUser, checkr_invitation_url: invUrl };
                }
              }
            })
            .catch(() => {}); // non-fatal — pending screen polls status
        }

        router.replace('/sitter-pending');
      } else {
        Alert.alert('Registration Failed', res.data.error||'Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error||'Could not connect. Please check your internet.');
    } finally { setLoading(false); }
  };

  const Btn = ({label, onPress, loading:l, color}:any) => (
    <TouchableOpacity onPress={onPress} disabled={l} activeOpacity={0.85}>
      <LinearGradient colors={color||['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={[bs.btn,l&&{opacity:0.7}]}>
        {l?<ActivityIndicator color="#fff"/>:<Text style={bs.btnText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={{flex:1}}>
        <View style={s.header}>
          <TouchableOpacity onPress={()=>step>1?setStep(v=>v-1):router.back()} style={s.back}><Text style={s.backText}>‹</Text></TouchableOpacity>
          <View style={{alignItems:'center'}}>
            <Image source={require('../assets/logo.jpg')} style={s.headerLogo} resizeMode="contain" />
            <Text style={s.headerSub}>Sitter Registration · Step {step} of 3</Text>
          </View>
          <View style={{width:36}} />
        </View>

        <View style={s.card}>
          <View style={s.progBg}><View style={[s.progFill,{width:`${(step/3)*100}%` as any}]} /></View>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}>
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

              {/* STEP 1 */}
              {step===1 && <>
                <Text style={s.stepTitle}>Personal Information</Text>

                {/* Key notice about SSN */}
                <View style={s.noticeBox}>
                  <Text style={s.noticeTitle}>🛡️ About the Background Check</Text>
                  <Text style={s.noticeText}>
                    ✅ <Text style={{fontWeight:'700'}}>No SSN required here</Text> — Our partner Checkr collects your Social Security Number directly through their secure, encrypted portal after registration.{'\n\n'}
                    You must be <Text style={{fontWeight:'700'}}>18 years or older</Text> to register as a sitter.
                  </Text>
                </View>

                <View style={s.row}>
                  <View style={{flex:1}}><Text style={s.label}>FIRST NAME *</Text><TextInput style={s.input} value={fname} onChangeText={setFname} placeholder="Sarah" placeholderTextColor="#9B9FAE" /></View>
                  <View style={{flex:1}}><Text style={s.label}>LAST NAME *</Text><TextInput style={s.input} value={lname} onChangeText={setLname} placeholder="Jones" placeholderTextColor="#9B9FAE" /></View>
                </View>

                <View style={s.field}>
                  <Text style={s.label}>DATE OF BIRTH * (18+ only)</Text>
                  <TextInput style={s.input} value={dob} onChangeText={setDob} placeholder="MM/DD/YYYY" placeholderTextColor="#9B9FAE" />
                </View>

                <View style={s.field}>
                  <Text style={s.label}>GENDER</Text>
                  <View style={s.genderRow}>
                    {['Female','Male'].map(g=>(
                      <TouchableOpacity key={g} style={[s.gBtn,gender===g&&s.gBtnOn]} onPress={()=>setGender(g)}>
                        <Text style={[s.gBtnText,gender===g&&{color:'#fff'}]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={s.field}>
                  <Text style={s.label}>EMAIL ADDRESS *</Text>
                  <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor="#9B9FAE" keyboardType="email-address" autoCapitalize="none" />
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

              {/* STEP 2 */}
              {step===2 && <>
                <Text style={s.stepTitle}>Location & Rates</Text>
                <View style={s.field}>
                  <Text style={s.label}>STREET ADDRESS *</Text>
                  <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="123 Main Street" placeholderTextColor="#9B9FAE" />
                </View>
                <View style={s.row}>
                  <View style={{flex:2}}><Text style={s.label}>CITY *</Text><TextInput style={s.input} value={city} onChangeText={setCity} placeholder="Houston" placeholderTextColor="#9B9FAE" /></View>
                  <View style={{flex:1}}><Text style={s.label}>STATE *</Text><TextInput style={s.input} value={state} onChangeText={setState} placeholder="TX" placeholderTextColor="#9B9FAE" autoCapitalize="characters" maxLength={2} /></View>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>ZIP CODE *</Text>
                  <TextInput style={s.input} value={zipcode} onChangeText={setZipcode} placeholder="77001" placeholderTextColor="#9B9FAE" keyboardType="number-pad" maxLength={5} />
                </View>
                <View style={s.row}>
                  <View style={{flex:1}}><Text style={s.label}>MIN RATE ($/HR) *</Text><TextInput style={s.input} value={minrate} onChangeText={setMinrate} placeholder="15" placeholderTextColor="#9B9FAE" keyboardType="decimal-pad" /></View>
                  <View style={{flex:1}}><Text style={s.label}>MAX RATE ($/HR)</Text><TextInput style={s.input} value={maxrate} onChangeText={setMaxrate} placeholder="25" placeholderTextColor="#9B9FAE" keyboardType="decimal-pad" /></View>
                </View>
                <View style={s.field}>
                  <Text style={s.label}>YEARS OF EXPERIENCE</Text>
                  <TextInput style={s.input} value={exp} onChangeText={setExp} placeholder="e.g. 3" placeholderTextColor="#9B9FAE" keyboardType="number-pad" maxLength={2} />
                </View>
                <View style={s.field}>
                  <Text style={s.label}>HOW FAR WILL YOU TRAVEL FOR A JOB? *</Text>
                  <Text style={s.hint}>Jobs within this radius will be sent to you first — you can always decline</Text>
                  <View style={s.chips}>
                    {DIST_OPTIONS.map(d=>(
                      <TouchableOpacity key={d} style={[s.chip,distance===String(d)&&s.chipOn]} onPress={()=>setDistance(String(d))}>
                        <Text style={[s.chipText,distance===String(d)&&{color:'#fff'}]}>{d} mi</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Btn label="Continue →" onPress={next} />
              </>}

              {/* STEP 3 */}
              {step===3 && <>
                <Text style={s.stepTitle}>Bio & Consent</Text>

                <View style={s.field}>
                  <Text style={s.label}>ABOUT YOU (OPTIONAL)</Text>
                  <TextInput style={[s.input,{height:110,textAlignVertical:'top'}]} value={about} onChangeText={setAbout}
                    placeholder="Tell parents about your experience, any certifications, and why you love babysitting..." placeholderTextColor="#9B9FAE" multiline numberOfLines={4} />
                </View>

                {/* Background check — detailed explanation, no SSN mention */}
                <View style={s.bgBox}>
                  <Text style={s.bgTitle}>🛡️ Background Check — What Happens Next</Text>
                  <Text style={s.bgText}>
                    After you register, here's what happens:{'\n\n'}
                    <Text style={{fontWeight:'700'}}>1. Admin reviews your application</Text>{'\n'}
                    Usually within 1 business day{'\n\n'}
                    <Text style={{fontWeight:'700'}}>2. Checkr emails you a background check invitation</Text>{'\n'}
                    Checkr (our secure partner) will email you a link. They collect your SSN and other info directly through their encrypted portal — we never see or store your SSN.{'\n\n'}
                    <Text style={{fontWeight:'700'}}>3. Results in 1–5 business days</Text>{'\n'}
                    The check covers criminal history, sex offender registry & identity verification.{'\n\n'}
                    <Text style={{fontWeight:'700'}}>4. Account activated!</Text>{'\n'}
                    Once cleared, you can go online and start accepting jobs.
                  </Text>
                </View>

                <TouchableOpacity style={s.agreeRow} onPress={()=>setAgreedBG(v=>!v)}>
                  <View style={[s.cb,agreedBG&&s.cbOn]}>{agreedBG&&<Text style={{color:'#fff',fontSize:13,fontWeight:'800'}}>✓</Text>}</View>
                  <Text style={s.agreeText}>
                    I consent to a background check conducted by Checkr and understand that Checkr — not Sitters4Me — will collect my personal information including SSN through their secure portal. My account activates only after the check is cleared and admin approval is received.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.agreeRow} onPress={()=>setAgreed(v=>!v)}>
                  <View style={[s.cb,agreed&&s.cbOn]}>{agreed&&<Text style={{color:'#fff',fontSize:13,fontWeight:'800'}}>✓</Text>}</View>
                  <Text style={s.agreeText}>
                    I agree to the <Text style={{color:'#02A4E2',fontWeight:'700'}}>Terms & Conditions</Text> and <Text style={{color:'#02A4E2',fontWeight:'700'}}>Privacy Policy</Text>
                  </Text>
                </TouchableOpacity>

                <Btn label="Create Sitter Account" onPress={register} loading={loading} />
              </>}

            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    {flex:1},
  header:       {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:12,paddingBottom:8},
  back:         {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:     {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerLogo:   {width:100,height:34,backgroundColor:'rgba(255,255,255,0.9)',borderRadius:8,padding:2},
  headerSub:    {fontSize:11,color:'rgba(255,255,255,0.75)',marginTop:3},
  card:         {flex:1,backgroundColor:'#FFFFFF',borderTopLeftRadius:32,borderTopRightRadius:32,overflow:'hidden'},
  progBg:       {height:4,backgroundColor:'#EEECE7'},
  progFill:     {height:4,backgroundColor:'#02A4E2',borderRadius:2},
  content:      {padding:24,paddingBottom:48},
  stepTitle:    {fontSize:22,fontWeight:'900',color:'#0F1117',marginBottom:16,letterSpacing:-0.3},
  noticeBox:    {backgroundColor:'#E8F6FD',borderRadius:12,padding:14,marginBottom:16,borderWidth:1,borderColor:'rgba(2,164,226,0.2)'},
  noticeTitle:  {fontSize:13,fontWeight:'800',color:'#1C5EA8',marginBottom:6},
  noticeText:   {fontSize:13,color:'#1C5EA8',lineHeight:20},
  row:          {flexDirection:'row',gap:10},
  field:        {marginBottom:16},
  label:        {fontSize:11,fontWeight:'700',color:'#5A5F72',letterSpacing:0.6,marginBottom:6,textTransform:'uppercase'},
  hint:         {fontSize:12,color:'#9B9FAE',marginBottom:8},
  input:        {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:15,color:'#0F1117',marginBottom:0},
  genderRow:    {flexDirection:'row',flexWrap:'wrap',gap:8},
  gBtn:         {paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1.5,borderColor:'rgba(15,17,23,0.15)',backgroundColor:'#FFFFFF'},
  gBtnOn:       {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  gBtnText:     {fontSize:12,fontWeight:'600',color:'#5A5F72'},
  chips:        {flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:         {paddingHorizontal:16,paddingVertical:9,borderRadius:20,borderWidth:1.5,borderColor:'rgba(15,17,23,0.15)',backgroundColor:'#FFFFFF'},
  chipOn:       {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  chipText:     {fontSize:13,fontWeight:'600',color:'#5A5F72'},
  bgBox:        {backgroundColor:'#E8F6FD',borderRadius:14,padding:16,marginBottom:16,borderWidth:1,borderColor:'rgba(2,164,226,0.2)'},
  bgTitle:      {fontSize:14,fontWeight:'800',color:'#1C5EA8',marginBottom:8},
  bgText:       {fontSize:13,color:'#1C5EA8',lineHeight:20},
  agreeRow:     {flexDirection:'row',alignItems:'flex-start',gap:10,marginBottom:14},
  cb:           {width:22,height:22,borderRadius:6,borderWidth:2,borderColor:'rgba(15,17,23,0.2)',alignItems:'center',justifyContent:'center',marginTop:1,flexShrink:0},
  cbOn:         {backgroundColor:'#02A4E2',borderColor:'#02A4E2'},
  agreeText:    {flex:1,fontSize:13,color:'#5A5F72',lineHeight:20},
});

const bs = StyleSheet.create({
  btn:    {borderRadius:12,padding:16,alignItems:'center',marginTop:8},
  btnText:{color:'#FFFFFF',fontSize:16,fontWeight:'800'},
});
