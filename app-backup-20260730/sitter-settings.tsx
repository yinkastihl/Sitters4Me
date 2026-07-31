// app/sitter-settings.tsx — Sitter account settings with logout (Android + iOS)
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function SitterSettings() {
  const router = useRouter();
  const user   = global.currentUser || {};
  const [notifications, setNotifications] = useState(true);

  const logout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            global.currentUser = null;
            global.activeJob   = null;
            router.replace('/');
          },
        },
      ]
    );
  };

  const initials = `${(user.fname||'?')[0]}${(user.lname||'?')[0]}`.toUpperCase();

  const menuItem = (icon: string, label: string, sub: string, onPress: ()=>void, right?: React.ReactNode) => (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={s.menuIcon}><Text style={{fontSize:20}}>{icon}</Text></View>
      <View style={{flex:1}}>
        <Text style={s.menuLabel}>{label}</Text>
        {sub ? <Text style={s.menuSub}>{sub}</Text> : null}
      </View>
      {right || <Text style={s.menuChevron}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#02A4E2','#0270C8','#9B5BAB']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>My Account</Text>
          <View style={{width:36}} />
        </View>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{flex:1}}>
            <Text style={s.profileName}>{user.fname} {user.lname}</Text>
            <Text style={s.profileEmail}>{user.email}</Text>
            <View style={s.sitterBadge}><Text style={s.sitterBadgeText}>Babysitter · ${user.minrate || '—'}/hr</Text></View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Profile */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PROFILE</Text>
          <View style={s.menuCard}>
            {menuItem('👤','Edit Profile','Update bio, rates, distance', () =>
              Alert.alert('Coming Soon','Profile editing coming soon.'))}
            {menuItem('📅','My Availability','Set your weekly schedule', () =>
              router.push('/schedule-sitter'))}
            {menuItem('🏦','Payout Settings','Bank account for earnings', () =>
              Alert.alert('Coming Soon','Bank account setup coming soon.'))}
          </View>
        </View>

        {/* Job history */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>WORK</Text>
          <View style={s.menuCard}>
            {menuItem('💼','Job History','Past completed jobs', () =>
              Alert.alert('Coming Soon','Job history coming soon.'))}
            {menuItem('💰','My Earnings','Total earnings & payouts', () =>
              router.push('/earnings'))}
            {menuItem('⭐','My Reviews','Ratings from parents', () =>
              Alert.alert('Coming Soon','Reviews coming soon.'))}
          </View>
        </View>

        {/* Preferences */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PREFERENCES</Text>
          <View style={s.menuCard}>
            {menuItem('🔔','Job Notifications','Alerts for new job requests', () => {}, (
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#D8D5CE', true: '#02A4E2' }}
                thumbColor="#FFFFFF"
              />
            ))}
          </View>
        </View>

        {/* Support */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>SUPPORT</Text>
          <View style={s.menuCard}>
            {menuItem('❓','Help & FAQ','Common questions', () =>
              Alert.alert('Support','Email us at support@sitters4me.com'))}
            {menuItem('📧','Contact Support','Get help from our team', () =>
              Alert.alert('Contact','support@sitters4me.com'))}
          </View>
        </View>

        {/* ── LOGOUT — explicit button, works on Android + iOS ── */}
        <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.85}>
          <Text style={s.logoutIcon}>🚪</Text>
          <Text style={s.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={s.version}>Sitters4Me v1.0 · {Platform.OS}</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#F5F4F0'},
  header:          {paddingBottom:24},
  headerRow:       {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:16},
  backBtn:         {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:        {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle:     {flex:1,fontSize:18,fontWeight:'900',color:'#FFFFFF',textAlign:'center'},
  profileCard:     {flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:20,paddingBottom:8},
  avatar:          {width:60,height:60,borderRadius:18,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center'},
  avatarText:      {fontSize:22,fontWeight:'900',color:'#FFFFFF'},
  profileName:     {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  profileEmail:    {fontSize:13,color:'rgba(255,255,255,0.8)',marginTop:2},
  sitterBadge:     {marginTop:6,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:20,paddingHorizontal:10,paddingVertical:3,alignSelf:'flex-start'},
  sitterBadgeText: {fontSize:11,fontWeight:'700',color:'#FFFFFF'},
  scroll:          {flex:1,marginTop:-16},
  content:         {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:0},
  section:         {marginBottom:20},
  sectionTitle:    {fontSize:11,fontWeight:'700',color:'#9B9FAE',letterSpacing:0.8,marginBottom:8,paddingHorizontal:4},
  menuCard:        {backgroundColor:'#FFFFFF',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:'rgba(15,17,23,0.07)'},
  menuItem:        {flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.06)'},
  menuIcon:        {width:36,height:36,backgroundColor:'#F5F4F0',borderRadius:10,alignItems:'center',justifyContent:'center'},
  menuLabel:       {fontSize:15,fontWeight:'600',color:'#0F1117'},
  menuSub:         {fontSize:12,color:'#9B9FAE',marginTop:1},
  menuChevron:     {fontSize:20,color:'#D8D5CE'},
  logoutBtn:       {
    flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
    backgroundColor:'#FFFFFF', borderRadius:14, padding:16,
    borderWidth:1.5, borderColor:'rgba(191,59,46,0.3)',
    marginTop:4, marginBottom:8,
  },
  logoutIcon:      {fontSize:20},
  logoutText:      {fontSize:16,fontWeight:'800',color:'#BF3B2E'},
  version:         {textAlign:'center',fontSize:12,color:'#9B9FAE',marginTop:4},
});
