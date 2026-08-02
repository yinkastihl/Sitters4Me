// app/rate-parent.tsx — Sitter rates parent after job completes
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const API = 'https://sitters4me.com/api/jobs.php';

export default function RateParent() {
  const router  = useRouter();
  const params  = useLocalSearchParams();
  const parentId   = params.parent_id   as string || String((global as any).activeJob?.parent_id || '') || '';
  const parentName = params.parent_name as string || (global as any).activeJob?.parent_name || 'the parent';
  const jobId      = params.job_id      as string || String((global as any).activeJob?.job_id || (global as any).activeJob?.id || '') || '';

  const [rating,  setRating]  = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review,  setReview]  = useState('');
  const [wouldReturn, setWouldReturn] = useState<boolean|null>(null);
  const [loading, setLoading] = useState(false);

  const user  = global.currentUser || {};
  const fname = (parentName || '').split(' ')[0];
  const initials = parentName.split(' ').map((n:string)=>n[0]||'').join('').toUpperCase().slice(0,2);

  const submit = async () => {
    if (rating === 0)
      return Alert.alert('Rating Required', 'Please select a star rating before submitting.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}?action=rate_parent`, {
        job_id:     jobId,
        sitter_id:  user.id,
        parent_id:  parentId,
        rating,
        note:       review.trim(),
        would_return: wouldReturn,
      });
      if (res.data.success) {
        Alert.alert('⭐ Thank You!', 'Your review has been submitted!',
          [{ text: 'Done', onPress: () => router.replace('/sitter-home') }]);
      } else {
        Alert.alert('Error', res.data.error || 'Could not submit. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not connect. Please check your internet.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#02A4E2','#0270C8','#9B5BAB']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={s.headerTitle}>Rate This Family</Text>
            <Text style={s.headerSub}>How was working with {fname}?</Text>
          </View>
          <TouchableOpacity onPress={() => router.replace('/sitter-home')} style={s.skipBtn}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Parent avatar */}
        <View style={s.parentCard}>
          <LinearGradient colors={['#C93488','#9B5BAB']} style={s.avatar}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </LinearGradient>
          <Text style={s.parentName}>{parentName}</Text>
          <Text style={s.parentSub}>Parent</Text>
        </View>

        {/* Star rating */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Overall Experience</Text>
          <Text style={s.cardSub}>How was working with this family?</Text>
          <View style={s.stars}>
            {[1,2,3,4,5].map(n => (
              <TouchableOpacity key={n}
                onPress={() => setRating(n)}
                onPressIn={() => setHovered(n)}
                onPressOut={() => setHovered(0)}
                activeOpacity={0.7}>
                <Text style={[s.star, (hovered||rating) >= n && s.starFilled]}>
                  {(hovered||rating) >= n ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={s.ratingLabel}>
              {['','😞 Poor','😐 Fair','🙂 Good','😊 Great','🌟 Excellent!'][rating]}
            </Text>
          )}
        </View>

        {/* Would you return? */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Would you work with this family again?</Text>
          <View style={s.recommendRow}>
            <TouchableOpacity
              style={[s.recommendBtn, wouldReturn===true && s.recommendBtnYes]}
              onPress={() => setWouldReturn(true)} activeOpacity={0.85}>
              <Text style={s.recommendIcon}>👍</Text>
              <Text style={[s.recommendText, wouldReturn===true && {color:'#1A7F6E',fontWeight:'800'}]}>Yes!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.recommendBtn, wouldReturn===false && s.recommendBtnNo]}
              onPress={() => setWouldReturn(false)} activeOpacity={0.85}>
              <Text style={s.recommendIcon}>👎</Text>
              <Text style={[s.recommendText, wouldReturn===false && {color:'#BF3B2E',fontWeight:'800'}]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Written review */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Leave a Comment</Text>
          <Text style={s.cardSub}>Optional — help other sitters know what to expect</Text>
          <TextInput
            style={s.reviewInput}
            value={review}
            onChangeText={setReview}
            placeholder="Were the kids well-behaved? Was the parent respectful and communicative? Would you recommend this family?"
            placeholderTextColor="#9B9FAE"
            multiline numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={s.charCount}>{review.length}/500</Text>
        </View>

        <TouchableOpacity onPress={submit} disabled={loading} activeOpacity={0.85}>
          <LinearGradient colors={['#02A4E2','#0270C8']} start={{x:0,y:0}} end={{x:1,y:0}}
            style={[s.submitBtn, loading && {opacity:0.7}]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>⭐ Submit Review</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/sitter-home')} style={{marginTop:12,alignItems:'center'}}>
          <Text style={{color:'#9B9FAE',fontSize:13}}>Skip for now</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#F5F4F0'},
  header:          {paddingBottom:20},
  headerRow:       {flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:14,paddingBottom:6},
  headerTitle:     {fontSize:20,fontWeight:'900',color:'#FFFFFF',letterSpacing:-0.3},
  headerSub:       {fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:2},
  skipBtn:         {paddingHorizontal:12,paddingVertical:6},
  skipText:        {color:'rgba(255,255,255,0.8)',fontSize:14,fontWeight:'600'},
  scroll:          {flex:1,marginTop:-16},
  content:         {paddingTop:24,paddingHorizontal:16,paddingBottom:48,gap:14},
  parentCard:      {backgroundColor:'#FFFFFF',borderRadius:16,padding:24,alignItems:'center',gap:8,borderWidth:1,borderColor:'rgba(15,17,23,0.09)'},
  avatar:          {width:80,height:80,borderRadius:40,alignItems:'center',justifyContent:'center',marginBottom:4},
  avatarInitials:  {fontSize:28,fontWeight:'800',color:'#FFFFFF'},
  parentName:      {fontSize:20,fontWeight:'900',color:'#0F1117'},
  parentSub:       {fontSize:13,color:'#9B9FAE'},
  card:            {backgroundColor:'#FFFFFF',borderRadius:16,padding:18,borderWidth:1,borderColor:'rgba(15,17,23,0.09)',gap:8},
  cardTitle:       {fontSize:16,fontWeight:'800',color:'#0F1117'},
  cardSub:         {fontSize:13,color:'#9B9FAE',marginBottom:4},
  stars:           {flexDirection:'row',justifyContent:'center',gap:8,paddingVertical:8},
  star:            {fontSize:44,color:'#D1D5DB'},
  starFilled:      {color:'#F5A623'},
  ratingLabel:     {fontSize:15,fontWeight:'700',color:'#F5A623',textAlign:'center',marginTop:4},
  recommendRow:    {flexDirection:'row',gap:10,marginTop:4},
  recommendBtn:    {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#F5F4F0',borderRadius:12,padding:14,borderWidth:1.5,borderColor:'#E5E2DA'},
  recommendBtnYes: {backgroundColor:'#D4EDE9',borderColor:'#1A7F6E'},
  recommendBtnNo:  {backgroundColor:'#FDE9E7',borderColor:'#BF3B2E'},
  recommendIcon:   {fontSize:20},
  recommendText:   {fontSize:13,color:'#5A5F72',fontWeight:'600'},
  reviewInput:     {backgroundColor:'#F5F4F0',borderRadius:10,borderWidth:1.5,borderColor:'rgba(15,17,23,0.1)',padding:14,fontSize:14,color:'#0F1117',minHeight:120},
  charCount:       {fontSize:12,color:'#9B9FAE',textAlign:'right'},
  submitBtn:       {borderRadius:14,padding:17,alignItems:'center'},
  submitBtnText:   {color:'#FFFFFF',fontSize:16,fontWeight:'800'},
});
