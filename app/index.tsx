// app/(tabs)/index.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

const { height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.gradient}>

        {/* HERO — logo centered */}
        <View style={s.hero}>
          <View style={s.logoCard}>
            <Image source={require('../assets/logo.jpg')} style={s.logo} resizeMode="contain" />
          </View>
          <Text style={s.tagline}>Trusted babysitters,{'\n'}right when you need them</Text>
        </View>

        {/* BOTTOM SHEET */}
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Get Started</Text>
          <Text style={s.sheetSub}>Choose your account type to continue</Text>

          {/* Parent button */}
          <TouchableOpacity style={s.card} onPress={() => router.push('/parent-login')} activeOpacity={0.85}>
            <LinearGradient colors={['#ED1E76','#C93488']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.cardInner}>
              <Text style={s.cardEmoji}>👨‍👩‍👧</Text>
              <View style={{flex:1}}>
                <Text style={s.cardTitle}>I'm a Parent</Text>
                <Text style={s.cardSub}>Find trusted babysitters near me</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Sitter button */}
          <TouchableOpacity style={s.card} onPress={() => router.push('/sitter-login')} activeOpacity={0.85}>
            <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.cardInner}>
              <Text style={s.cardEmoji}>🍼</Text>
              <View style={{flex:1}}>
                <Text style={s.cardTitle}>I'm a Babysitter</Text>
                <Text style={s.cardSub}>Find jobs and earn on my schedule</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={s.terms}>
            By continuing you agree to our{' '}
            <Text style={{color:'#C93488',fontWeight:'700'}}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={{color:'#02A4E2',fontWeight:'700'}}>Privacy Policy</Text>
          </Text>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  {flex:1},
  gradient:   {flex:1},
  hero:       {flex:1, alignItems:'center', justifyContent:'center', gap:22, paddingTop:20},
  logoCard:   {backgroundColor:'rgba(255,255,255,0.95)', borderRadius:24, padding:14, shadowColor:'#000', shadowOffset:{width:0,height:8}, shadowOpacity:0.3, shadowRadius:20, elevation:12},
  logo:       {width:200, height:140},
  tagline:    {fontSize:17, color:'rgba(255,255,255,0.9)', textAlign:'center', lineHeight:26, fontWeight:'500'},
  sheet:      {backgroundColor:'#FFFFFF', borderTopLeftRadius:32, borderTopRightRadius:32, padding:28, paddingBottom:44, gap:14},
  sheetTitle: {fontSize:26, fontWeight:'900', color:'#0F1117', letterSpacing:-0.5},
  sheetSub:   {fontSize:15, color:'#5A5F72', marginBottom:4},
  card:       {borderRadius:16, overflow:'hidden', shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.2, shadowRadius:10, elevation:6},
  cardInner:  {flexDirection:'row', alignItems:'center', gap:14, padding:18},
  cardEmoji:  {fontSize:30},
  cardTitle:  {fontSize:17, fontWeight:'800', color:'#FFFFFF'},
  cardSub:    {fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:2},
  cardArrow:  {fontSize:28, color:'rgba(255,255,255,0.7)', fontWeight:'300'},
  terms:      {fontSize:12, color:'#9B9FAE', textAlign:'center', marginTop:4, lineHeight:18},
});
