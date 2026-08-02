// app/rate-sitter.tsx — Parent rates sitter after job completes
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, StatusBar, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const API = 'https://sitters4me.com/api/jobs.php';

const CATEGORIES = [
  { key: 'punctual',     label: 'Punctuality',      icon: '⏰' },
  { key: 'caring',       label: 'Care & Attention',  icon: '❤️' },
  { key: 'responsible',  label: 'Responsibility',    icon: '🛡️' },
  { key: 'communication',label: 'Communication',     icon: '💬' },
];

export default function RateSitter() {
  const router  = useRouter();
  const params  = useLocalSearchParams();
  const sitterId   = params.sitter_id   as string || String((global as any).activeJob?.sitter_id || '') || '';
  const sitterName = params.sitter_name as string || (global as any).activeJob?.sitter_name || 'your sitter';
  const sitterImg  = params.sitter_image as string || '';
  const jobId      = params.job_id      as string || String((global as any).activeJob?.job_id || (global as any).activeJob?.id || '') || '';

  const [overall,   setOverall]   = useState(0);
  const [hovered,   setHovered]   = useState(0);
  const [cats,      setCats]      = useState<Record<string,number>>({});
  const [review,    setReview]    = useState('');
  const [recommend, setRecommend] = useState<boolean|null>(null);
  const [loading,   setLoading]   = useState(false);

  const user = global.currentUser || {};
  const fname = (sitterName || '').split(' ')[0];
  const initials = sitterName.split(' ').map((n:string)=>n[0]||'').join('').toUpperCase().slice(0,2);

  const setCat = (key: string, val: number) =>
    setCats(prev => ({ ...prev, [key]: val }));

  const submit = async () => {
    if (overall === 0)
      return Alert.alert('Rating Required', 'Please select an overall star rating before submitting.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=rate_sitter`, {
        job_id:      jobId,
        parent_id:   user.id,
        sitter_id:   sitterId,
        rating:      overall,
        note:        review.trim(),
        recommend:   recommend,
        categories:  cats,
      });
      if (res.data.success) {
        Alert.alert(
          '⭐ Thank You!',
          `Your review for ${fname} has been submitted. Reviews help other parents find great sitters!`,
          [{ text: 'Done', onPress: () => router.replace('/parent-home') }]
        );
      } else {
        Alert.alert('Error', res.data.error || 'Could not submit review. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet connection.');
    } finally { setLoading(false); }
  };

  const skip = () => {
    Alert.alert(
      'Skip Review?',
      'Your feedback helps other parents find great sitters. Are you sure you want to skip?',
      [
        { text: 'Leave a Review', style: 'cancel' },
        { text: 'Skip', onPress: () => router.replace('/parent-home') },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#F5A623','#C8912A','#9B5BAB','#C93488']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Rate Your Sitter</Text>
            <Text style={s.headerSub}>How was your experience with {fname}?</Text>
          </View>
          <TouchableOpacity onPress={skip} style={s.skipBtn}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Sitter avatar */}
        <View style={s.sitterCard}>
          {sitterImg
            ? <Image source={{uri:`https://sitters4me.com/uploads/${sitterImg}`}} style={s.avatar} />
            : <LinearGradient colors={['#02A4E2','#0270C8']} style={s.avatarFallback}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </LinearGradient>
          }
          <Text style={s.sitterName}>{sitterName}</Text>
          <Text style={s.sitterSub}>Your babysitter</Text>
        </View>

        {/* Overall star rating */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Overall Rating</Text>
          <Text style={s.cardSub}>How would you rate {fname} overall?</Text>
          <View style={s.stars}>
            {[1,2,3,4,5].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setOverall(n)}
                onPressIn={() => setHovered(n)}
                onPressOut={() => setHovered(0)}
                activeOpacity={0.7}
              >
                <Text style={[s.star, (hovered||overall) >= n && s.starFilled]}>
                  {(hovered||overall) >= n ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {overall > 0 && (
            <Text style={s.ratingLabel}>
              {['','😞 Poor','😐 Fair','🙂 Good','😊 Great','🌟 Excellent!'][overall]}
            </Text>
          )}
        </View>

        {/* Category ratings */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Rate by Category</Text>
          <Text style={s.cardSub}>Optional — tap stars for each category</Text>
          {CATEGORIES.map(cat => (
            <View key={cat.key} style={s.catRow}>
              <Text style={s.catIcon}>{cat.icon}</Text>
              <Text style={s.catLabel}>{cat.label}</Text>
              <View style={s.catStars}>
                {[1,2,3,4,5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setCat(cat.key, n)} activeOpacity={0.7}>
                    <Text style={[s.catStar, (cats[cat.key]||0) >= n && s.catStarFilled]}>
                      {(cats[cat.key]||0) >= n ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Would you recommend? */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Would you hire {fname} again?</Text>
          <View style={s.recommendRow}>
            <TouchableOpacity
              style={[s.recommendBtn, recommend===true && s.recommendBtnYes]}
              onPress={() => setRecommend(true)}
              activeOpacity={0.85}
            >
              <Text style={s.recommendIcon}>👍</Text>
              <Text style={[s.recommendText, recommend===true && {color:'#1A7F6E',fontWeight:'800'}]}>
                Yes, definitely!
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.recommendBtn, recommend===false && s.recommendBtnNo]}
              onPress={() => setRecommend(false)}
              activeOpacity={0.85}
            >
              <Text style={s.recommendIcon}>👎</Text>
              <Text style={[s.recommendText, recommend===false && {color:'#BF3B2E',fontWeight:'800'}]}>
                Not this time
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Written review */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Write a Review</Text>
          <Text style={s.cardSub}>Optional — share your experience with other parents</Text>
          <TextInput
            style={s.reviewInput}
            value={review}
            onChangeText={setReview}
            placeholder={`How was ${fname}? Was she/he on time, caring with the kids, easy to communicate with?`}
            placeholderTextColor="#9B9FAE"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={s.charCount}>{review.length}/500</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity onPress={submit} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={['#F5A623','#C8912A']} start={{x:0,y:0}} end={{x:1,y:0}}
            style={[s.submitBtn, loading && {opacity:0.7}]}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>⭐ Submit Review</Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={skip} style={{marginTop:12,alignItems:'center'}}>
          <Text style={{color:'#9B9FAE',fontSize:13}}>Skip for now</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        {flex:1,backgroundColor:'#F5F4F0'},
  header:           {paddingBottom:20},
  headerRow:        {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  headerTitle:      {fontSize:20,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  headerSub:        {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  skipBtn:          {paddingHorizontal:12,paddingVertical:6},
  skipText:         {color:'rgba(255,255,255,0.8)',fontSize:14,fontWeight:'600'},
  scroll:           {flex:1,marginTop:-16},
  content:          {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  sitterCard:       {backgroundColor:'#FFFFFF',borderRadius:16,padding:24,alignItems:'center',gap:8,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  avatar:           {width:80,height:80,borderRadius:40,marginBottom:4},
  avatarFallback:   {width:80,height:80,borderRadius:40,alignItems:'center',justifyContent:'center',marginBottom:4},
  avatarInitials:   {fontSize:28,fontWeight:'800',color:'#FFFFFF'},
  sitterName:       {fontSize:20,fontWeight:'900',color:'#0F1117'},
  sitterSub:        {fontSize:13,color:'#9B9FAE'},
  card:             {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)',gap:8},
  cardTitle:        {fontSize:16,fontWeight:'800',color:'#0F1117'},
  cardSub:          {fontSize:13,color:'#9B9FAE',marginBottom:4},
  stars:            {flexDirection:'row',justifyContent:'center',gap:8,paddingVertical:8},
  star:             {fontSize:44,color:'#D1D5DB'},
  starFilled:       {color:'#F5A623'},
  ratingLabel:      {fontSize:15,fontWeight:'700',color:'#F5A623',textAlign:'center',marginTop:4},
  catRow:           {flexDirection:'row',alignItems:'center',gap:10,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'rgba(15,17,23,0.06)'},
  catIcon:          {fontSize:20,width:28},
  catLabel:         {fontSize:13,color:'#0F1117',fontWeight:'600',flex:1},
  catStars:         {flexDirection:'row',gap:4},
  catStar:          {fontSize:22,color:'#D1D5DB'},
  catStarFilled:    {color:'#F5A623'},
  recommendRow:     {flexDirection:'row',gap:10,marginTop:4},
  recommendBtn:     {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#F5F4F0',borderRadius:12,padding:14,borderWidth:1.5,borderColor:'#E5E2DA'},
  recommendBtnYes:  {backgroundColor:'#D4EDE9',borderColor:'#1A7F6E'},
  recommendBtnNo:   {backgroundColor:'#FDE9E7',borderColor:'#BF3B2E'},
  recommendIcon:    {fontSize:20},
  recommendText:    {fontSize:13,color:'#5A5F72',fontWeight:'600'},
  reviewInput:      {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:14,color:'#0F1117',minHeight:120},
  charCount:        {fontSize:12,color:'#9B9FAE',textAlign:'right'},
  submitBtn:        {borderRadius:14,padding:17,alignItems:'center'},
  submitBtnText:    {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
});
