// app/parent-settings.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, Switch, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function ParentSettings() {
  const router = useRouter();
  const user   = global.currentUser || {};
  const [notifications, setNotifications] = useState(true);

  const logout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => {
        global.currentUser = null;
        global.activeJob   = null;
        router.replace('/');
      }},
    ]);
  };

  const initials = `${(user.fname||'?')[0]}${(user.lname||'?')[0]}`.toUpperCase();

  const item = (icon: string, label: string, sub: string, onPress: ()=>void, right?: React.ReactNode) => (
    <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={0.7}>
      <View style={s.itemIcon}><Text style={{fontSize:20}}>{icon}</Text></View>
      <View style={{flex:1}}>
        <Text style={s.itemLabel}>{label}</Text>
        {sub ? <Text style={s.itemSub}>{sub}</Text> : null}
      </View>
      {right || <Text style={s.chevron}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>My Account</Text>
          <View style={{width:36}} />
        </View>
        <View style={s.profileCard}>
          <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
          <View style={{flex:1}}>
            <Text style={s.profileName}>{user.fname} {user.lname}</Text>
            <Text style={s.profileEmail}>{user.email}</Text>
            <View style={s.badge}><Text style={s.badgeText}>Parent Account</Text></View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        <View style={s.section}>
          <Text style={s.sectionTitle}>ACCOUNT</Text>
          <View style={s.card}>
            {item('👤','Edit Profile','Update name, phone, address', () => router.push('/parent-profile-edit'))}
            {item('💳','Payment Method','Stripe & PayPal', () => router.push('/parent-payment-settings'))}
            {item('👶','My Children','Manage child profiles & ages', () => router.push('/children-profiles'))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>HISTORY & REVIEWS</Text>
          <View style={s.card}>
            {item('📋','Job History','View past babysitting sessions', () => router.push('/parent-history'))}
            {item('❤️','Favorite Sitters','Your saved sitters', () => router.push('/parent-favorites'))}
            {item('🎁','Invite & Earn','Refer friends, earn credits', () => router.push('/referral'))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>PREFERENCES</Text>
          <View style={s.card}>
            {item('🔔','Notifications','Job updates and alerts', () => {}, (
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#D8D5CE', true: '#C93488' }}
                thumbColor="#FFFFFF"
              />
            ))}
            {item('📍','Search Radius', `${user.search_radius || 10} miles`, () =>
              Alert.alert('Search Radius','Radius settings coming soon.'))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>SUPPORT</Text>
          <View style={s.card}>
            {item('❓','Help & FAQ','Common questions', () =>
              Alert.alert('Support','Email us at support@sitters4me.com'))}
            {item('📧','Contact Support','Get help from our team', () =>
              Alert.alert('Contact','support@sitters4me.com'))}
          </View>
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.85}>
          <Text style={{fontSize:20}}>🚪</Text>
          <Text style={s.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={s.version}>Sitters4Me v1.0 · {Platform.OS}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   {flex:1,backgroundColor:'#F5F4F0'},
  header:      {paddingBottom:24},
  headerRow:   {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:16},
  backBtn:     {width:36,height:36,alignItems:'center',justifyContent:'center'},
  backText:    {fontSize:32,color:'#FFFFFF',fontWeight:'300'},
  headerTitle: {flex:1,fontSize:18,fontWeight:'900',color:'#FFFFFF',textAlign:'center'},
  profileCard: {flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:20,paddingBottom:8},
  avatar:      {width:60,height:60,borderRadius:18,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center'},
  avatarText:  {fontSize:22,fontWeight:'900',color:'#FFFFFF'},
  profileName: {fontSize:18,fontWeight:'900',color:'#FFFFFF'},
  profileEmail:{fontSize:13,color:'rgba(255,255,255,0.8)',marginTop:2},
  badge:       {marginTop:6,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:20,paddingHorizontal:10,paddingVertical:3,alignSelf:'flex-start'},
  badgeText:   {fontSize:11,fontWeight:'700',color:'#FFFFFF'},
  scroll:      {flex:1,marginTop:-16},
  content:     {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:0},
  section:     {marginBottom:20},
  sectionTitle:{fontSize:11,fontWeight:'700',color:'#9B9FAE',letterSpacing:0.8,marginBottom:8,paddingHorizontal:4},
  card:        {backgroundColor:'#FFFFFF',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:'rgba(15,17,23,0.07)'},
  item:        {flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.06)'},
  itemIcon:    {width:36,height:36,backgroundColor:'#F5F4F0',borderRadius:10,alignItems:'center',justifyContent:'center'},
  itemLabel:   {fontSize:15,fontWeight:'600',color:'#0F1117'},
  itemSub:     {fontSize:12,color:'#9B9FAE',marginTop:1},
  chevron:     {fontSize:20,color:'#D8D5CE'},
  logoutBtn:   {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,backgroundColor:'#FFFFFF',borderRadius:14,padding:16,borderWidth:1.5,borderColor:'rgba(191,59,46,0.3)',marginTop:4,marginBottom:8},
  logoutText:  {fontSize:16,fontWeight:'800',color:'#BF3B2E'},
  version:     {textAlign:'center',fontSize:12,color:'#9B9FAE',marginTop:4},
});
