// app/referral.tsx
// Referral & Invite screen — shown to both parents and sitters
// global.currentUser must be set; user_type inferred from global.userType ('parent'|'sitter')
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Share, Alert,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';
const CREDIT_AMOUNT = 5;

export default function Referral() {
  const router    = useRouter();
  const user      = (global as any).currentUser || {};
  const userType  = (global as any).userType || 'parent'; // 'parent' | 'sitter'
  // Sitter auth returns u_id; parent auth returns id — handle both
  const userId    = user.id || (user as any).u_id || 0;

  const [code,    setCode]    = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=get_referral_code`, {
        user_type: userType,
        user_id:   userId,
      });
      if (res.data?.success) {
        const d = res.data.data;
        setCode(d.code);
        setCredits(parseFloat(d.credits) || 0);
        setCount(parseInt(d.count) || 0);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const copyCode = async () => {
    if (!code) return;
    try { await ExpoClipboard.setStringAsync(code); } catch { /* fallback silently */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareInvite = async () => {
    if (!code) return;
    const name = user.fname || (userType === 'parent' ? 'A parent' : 'A sitter');
    const roleMsg = userType === 'parent'
      ? `I use Sitters4Me to find trusted babysitters on demand. Sign up with my code and we both get $${CREDIT_AMOUNT} credit!`
      : `I earn money babysitting with Sitters4Me. Join as a sitter with my code and we both get $${CREDIT_AMOUNT} credit!`;
    try {
      await Share.share({
        message: `${roleMsg}\n\nInvite code: ${code}\n\nDownload Sitters4Me and enter code ${code} when you sign up.`,
        title:   'Join Sitters4Me',
      });
    } catch {}
  };

  const roleLabel   = userType === 'parent' ? 'parents' : 'sitters';
  const targetLabel = userType === 'parent' ? 'friend' : 'fellow sitter';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Invite & Earn</Text>
          <View style={{ width: 60 }} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={s.loadBox}><ActivityIndicator color="#C93488" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Hero */}
          <LinearGradient
            colors={['#9B5BAB', '#C93488']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.hero}
          >
            <Text style={s.heroEmoji}>🎁</Text>
            <Text style={s.heroTitle}>Give ${CREDIT_AMOUNT}, Get ${CREDIT_AMOUNT}</Text>
            <Text style={s.heroSub}>
              Invite a {targetLabel} to join Sitters4Me.{'\n'}
              You both earn ${CREDIT_AMOUNT} credit when they sign up.
            </Text>
          </LinearGradient>

          {/* Your code */}
          <View style={s.codeCard}>
            <Text style={s.codeLabel}>YOUR INVITE CODE</Text>
            <TouchableOpacity style={s.codeBox} onPress={copyCode} activeOpacity={0.8}>
              <Text style={s.codeText}>{code || '—'}</Text>
              <View style={[s.copyBadge, copied && s.copyBadgeDone]}>
                <Text style={s.copyBadgeText}>{copied ? '✓ Copied!' : 'Copy'}</Text>
              </View>
            </TouchableOpacity>
            <Text style={s.codeHint}>Tap to copy · Share with friends</Text>
          </View>

          {/* Credits balance */}
          <View style={s.balanceCard}>
            <View style={s.balanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.balanceLabel}>Credits Earned</Text>
                <Text style={s.balanceNote}>Applied automatically to your next booking</Text>
              </View>
              <Text style={s.balanceAmount}>${credits.toFixed(2)}</Text>
            </View>
            {count > 0 && (
              <View style={s.balanceDivider} />
            )}
            {count > 0 && (
              <View style={s.balanceRow}>
                <Text style={s.balanceLabel}>Friends Joined</Text>
                <Text style={s.balanceStat}>{count} {count === 1 ? 'person' : 'people'}</Text>
              </View>
            )}
          </View>

          {/* Share button */}
          <TouchableOpacity onPress={shareInvite} activeOpacity={0.88} style={s.shareWrap}>
            <LinearGradient
              colors={['#ED1E76', '#C93488', '#9B5BAB']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.shareBtn}
            >
              <Text style={s.shareBtnText}>🚀  Share My Invite Code</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* How it works */}
          <View style={s.howCard}>
            <Text style={s.howTitle}>How It Works</Text>
            {[
              { step: '1', text: `Share your code with a ${targetLabel}` },
              { step: '2', text: `They sign up and enter your code` },
              { step: '3', text: `You both instantly get $${CREDIT_AMOUNT} credit` },
              { step: '4', text: `Credits apply automatically to platform fees` },
            ].map(item => (
              <View key={item.step} style={s.howRow}>
                <View style={s.howDot}>
                  <Text style={s.howDotText}>{item.step}</Text>
                </View>
                <Text style={s.howText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Fine print */}
          <Text style={s.finePrint}>
            Credits are applied to the Sitters4Me platform fee on completed bookings.
            One referral credit per new account. Credits do not expire.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F5F4F0' },
  header:           { paddingBottom: 16 },
  headerRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  backBtn:          { width: 60, paddingVertical: 6 },
  backBtnText:      { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerTitle:      { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },

  loadBox:          { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll:           { padding: 16, gap: 14 },

  hero:             { borderRadius: 20, padding: 28, alignItems: 'center', gap: 8 },
  heroEmoji:        { fontSize: 48 },
  heroTitle:        { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  heroSub:          { fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 22 },

  codeCard:         { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  codeLabel:        { fontSize: 11, fontWeight: '800', color: '#9B9FAE', letterSpacing: 1 },
  codeBox:          { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F5F4F0', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 2, borderColor: '#E5E2DA', alignSelf: 'stretch', justifyContent: 'space-between' },
  codeText:         { fontSize: 28, fontWeight: '900', color: '#0F1117', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  copyBadge:        { backgroundColor: '#E8F6FD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  copyBadgeDone:    { backgroundColor: '#D4EDE9' },
  copyBadgeText:    { fontSize: 13, fontWeight: '700', color: '#02A4E2' },
  codeHint:         { fontSize: 12, color: '#9B9FAE' },

  balanceCard:      { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  balanceRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel:     { fontSize: 15, fontWeight: '700', color: '#0F1117' },
  balanceNote:      { fontSize: 11, color: '#9B9FAE', marginTop: 2 },
  balanceAmount:    { fontSize: 28, fontWeight: '900', color: '#1A7F6E' },
  balanceDivider:   { height: 1, backgroundColor: '#F0EEE9' },
  balanceStat:      { fontSize: 20, fontWeight: '800', color: '#02A4E2' },

  shareWrap:        { borderRadius: 14, overflow: 'hidden' },
  shareBtn:         { padding: 17, alignItems: 'center' },
  shareBtnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  howCard:          { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  howTitle:         { fontSize: 16, fontWeight: '800', color: '#0F1117', marginBottom: 2 },
  howRow:           { flexDirection: 'row', alignItems: 'center', gap: 14 },
  howDot:           { width: 30, height: 30, borderRadius: 15, backgroundColor: '#C93488', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howDotText:       { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  howText:          { fontSize: 14, color: '#5A5F72', flex: 1, lineHeight: 20 },

  finePrint:        { fontSize: 11, color: '#C5C2BA', textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
});
