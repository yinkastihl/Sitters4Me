// app/sitter-profile-view.tsx
// Full sitter profile screen — parents navigate here from map chips / drawer
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Image, Alert, Linking, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseServerDt = (s: string): Date | null => {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
};
const fmtDate = (s: string) => {
  const d = parseServerDt(s);
  return d
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
};

function StarRow({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? '#F4A800' : '#D9D6CE' }}>
          ★
        </Text>
      ))}
    </View>
  );
}

export default function SitterProfileView() {
  const router  = useRouter();
  const sitter  = (global as any).viewSitter || {};
  const parent  = (global as any).currentUser || {};

  const [profile,   setProfile]   = useState<any>(sitter);
  const [reviews,   setReviews]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [isFav,     setIsFav]     = useState(false);
  const [favLoading,setFavLoading]= useState(false);

  const initials = `${(sitter.fname || '?')[0]}${(sitter.lname || '?')[0]}`.toUpperCase();

  const loadProfile = useCallback(async () => {
    if (!sitter.id) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_profile`, {
        sitter_id: sitter.id,
      });
      if (res.data?.success) {
        const d = res.data.data;
        setProfile(d);
        setReviews(d.reviews || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [sitter.id]);

  // Check if already favorited
  const checkFavorite = useCallback(async () => {
    if (!parent.id || !sitter.id) return;
    try {
      const res = await axios.post(`${JOBS_API}?action=get_favorites`, {
        parent_id: parent.id,
      });
      if (res.data?.success) {
        const favIds = (res.data.data || []).map((f: any) => f.id);
        setIsFav(favIds.includes(sitter.id));
      }
    } catch {}
  }, [parent.id, sitter.id]);

  useEffect(() => {
    loadProfile();
    checkFavorite();
  }, []);

  const toggleFavorite = async () => {
    if (favLoading) return;
    setFavLoading(true);
    try {
      const action = isFav ? 'remove_favorite' : 'save_favorite';
      await axios.post(`${JOBS_API}?action=${action}`, {
        parent_id: parent.id,
        sitter_id: sitter.id,
      });
      setIsFav(!isFav);
    } catch {
      Alert.alert('Error', 'Could not update favorites. Please try again.');
    } finally {
      setFavLoading(false);
    }
  };

  const bookNow = () => {
    // Go back to home and trigger booking
    (global as any).requestSitterOnReturn = sitter;
    router.back();
    // Small delay so home screen mounts before we show the booking modal
    setTimeout(() => {
      (global as any).triggerBooking?.();
    }, 400);
  };

  const avgRating    = parseFloat(profile.avg_rating) || 0;
  const reviewCount  = parseInt(profile.review_count) || 0;
  const isOnline     = profile.online === 1 || profile.online === '1' || profile.online === true;

  const [showContactModal, setShowContactModal] = useState(false);

  const phone = profile.cellphone || sitter.cellphone || null;

  const callSitter = () => {
    if (!phone) return Alert.alert('No Phone', 'Phone number not available for this sitter.');
    Linking.openURL(`tel:${phone.replace(/\D/g,'')}`);
  };

  const textSitter = () => {
    if (!phone) return Alert.alert('No Phone', 'Phone number not available for this sitter.');
    Linking.openURL(`sms:${phone.replace(/\D/g,'')}`);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Sitter Profile</Text>
          <TouchableOpacity onPress={toggleFavorite} style={s.favBtn} disabled={favLoading}>
            {favLoading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={s.favBtnText}>{isFav ? '♥' : '♡'}</Text>
            }
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color="#C93488" size="large" />
          <Text style={s.loadingText}>Loading profile…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Avatar + Name card ── */}
          <View style={s.heroCard}>
            <View style={s.avatarWrap}>
              {profile.image
                ? <Image source={{ uri: `https://sitters4me.com/uploads/${profile.image}` }} style={s.avatar} />
                : (
                  <LinearGradient colors={['#C93488', '#9B5BAB', '#02A4E2']} style={s.avatarGrad}>
                    <Text style={s.avatarInitials}>{initials}</Text>
                  </LinearGradient>
                )
              }
              {/* Online dot */}
              <View style={[s.onlineDot, { backgroundColor: isOnline ? '#22C55E' : '#9B9FAE' }]} />
            </View>

            <Text style={s.heroName}>{profile.fname} {profile.lname}</Text>

            {/* Age · City, State · Online status */}
            <View style={s.heroMetaRow}>
              {!!profile.age && (
                <Text style={s.heroMeta}>{profile.age} yrs</Text>
              )}
              {!!profile.age && !!(profile.city || profile.state) && (
                <Text style={s.heroMetaDot}>·</Text>
              )}
              {!!(profile.city || profile.state) && (
                <Text style={s.heroMeta}>
                  {[profile.city, profile.state].filter(Boolean).join(', ')}
                </Text>
              )}
              {!!(profile.age || profile.city || profile.state) && (
                <Text style={s.heroMetaDot}>·</Text>
              )}
              <Text style={[s.heroMeta, { color: isOnline ? '#22C55E' : '#9B9FAE' }]}>
                {isOnline ? '🟢 Online' : '⚫ Offline'}
              </Text>
            </View>

            {/* Rating row */}
            <View style={s.ratingRow}>
              <StarRow rating={avgRating} size={20} />
              <Text style={s.ratingNum}>
                {avgRating > 0 ? avgRating.toFixed(1) : 'No ratings yet'}
              </Text>
              {reviewCount > 0 && (
                <Text style={s.ratingCount}>({reviewCount} review{reviewCount !== 1 ? 's' : ''})</Text>
              )}
            </View>

            {/* Badges row */}
            <View style={s.badgesRow}>
              <View style={s.badge}>
                <Text style={s.badgeText}>💰 ${profile.minrate}/hr</Text>
              </View>
              {!!profile.experience_years && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>🏅 {profile.experience_years} yr{profile.experience_years != 1 ? 's' : ''} exp</Text>
                </View>
              )}
              {profile.bgcheck === 'Y' && (
                <View style={[s.badge, s.badgeGreen]}>
                  <Text style={[s.badgeText, { color: '#1A7F6E' }]}>✓ BG Cleared</Text>
                </View>
              )}
              {sitter.distance_away && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>📍 {parseFloat(sitter.distance_away).toFixed(1)} mi away</Text>
                </View>
              )}
            </View>

            {/* Specialization badges */}
            {(profile.badge_cpr == 1 || profile.badge_infant == 1 || profile.badge_special_needs == 1 || profile.badge_multilingual == 1) && (
              <View style={[s.badgesRow, { marginTop: 8 }]}>
                {profile.badge_cpr == 1 && (
                  <View style={[s.badge, s.badgeBlue]}>
                    <Text style={[s.badgeText, { color: '#1A5FA8' }]}>❤️ CPR Certified</Text>
                  </View>
                )}
                {profile.badge_infant == 1 && (
                  <View style={[s.badge, s.badgePurple]}>
                    <Text style={[s.badgeText, { color: '#6B3FA0' }]}>🍼 Infant Care</Text>
                  </View>
                )}
                {profile.badge_special_needs == 1 && (
                  <View style={[s.badge, s.badgeOrange]}>
                    <Text style={[s.badgeText, { color: '#A05A00' }]}>🌟 Special Needs</Text>
                  </View>
                )}
                {profile.badge_multilingual == 1 && (
                  <View style={[s.badge, s.badgeTeal]}>
                    <Text style={[s.badgeText, { color: '#0A7A6A' }]}>🌍 Multilingual</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── About ── */}
          {!!profile.about && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>About</Text>
              <Text style={s.aboutText}>{profile.about}</Text>
            </View>
          )}

          {/* ── Experience / Certifications ── */}
          {(!!profile.experience_years || !!profile.certifications) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Experience & Certifications</Text>
              {!!profile.experience_years && (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>🏅</Text>
                  <Text style={s.infoText}>{profile.experience_years} year{profile.experience_years != 1 ? 's' : ''} of experience</Text>
                </View>
              )}
              {!!profile.certifications && (
                <View style={s.infoRow}>
                  <Text style={s.infoIcon}>📋</Text>
                  <Text style={s.infoText}>{profile.certifications}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Reviews ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Reviews {reviewCount > 0 ? `(${reviewCount})` : ''}
            </Text>

            {reviews.length === 0 ? (
              <View style={s.emptyReviews}>
                <Text style={s.emptyReviewsIcon}>⭐</Text>
                <Text style={s.emptyReviewsText}>No reviews yet</Text>
                <Text style={s.emptyReviewsSub}>Be the first to book and leave a review!</Text>
              </View>
            ) : (
              reviews.map((rev, i) => (
                <View key={rev.id || i} style={[s.reviewCard, i > 0 && s.reviewCardBorder]}>
                  <View style={s.reviewHeader}>
                    <View style={s.reviewAv}>
                      <Text style={s.reviewAvText}>
                        {(rev.parent_fname || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reviewName}>
                        {rev.parent_fname} {rev.parent_lname ? rev.parent_lname[0] + '.' : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <StarRow rating={rev.rating} size={13} />
                        <Text style={s.reviewDate}>{fmtDate(rev.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                  {!!rev.review_text && (
                    <Text style={s.reviewText}>"{rev.review_text}"</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Bottom spacer for CTA */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── Fixed bottom CTA ── */}
      {!loading && (
        <View style={s.ctaBar}>
          <TouchableOpacity style={s.interviewBtn} onPress={() => setShowContactModal(true)}>
            <Text style={s.interviewBtnText}>📞 Contact</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} onPress={bookNow} activeOpacity={0.88}>
            <LinearGradient
              colors={['#ED1E76', '#C93488', '#9B5BAB']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.bookBtn}
            >
              <Text style={s.bookBtnText}>
                {isOnline ? 'Request Now 🍼' : 'Request When Online'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Contact modal ── */}
      <Modal visible={showContactModal} transparent animationType="slide" onRequestClose={() => setShowContactModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowContactModal(false)}>
          <View style={s.contactSheet}>
            <Text style={s.contactSheetTitle}>Contact {profile.fname || 'Sitter'}</Text>
            <Text style={s.contactSheetSub}>Reach out before booking to ask questions</Text>

            <TouchableOpacity style={s.contactOption} onPress={() => { setShowContactModal(false); callSitter(); }} activeOpacity={0.8}>
              <Text style={s.contactOptionIcon}>📞</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.contactOptionTitle}>Call</Text>
                <Text style={s.contactOptionSub}>{phone || 'Phone not available'}</Text>
              </View>
              <Text style={s.contactOptionChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.contactOption} onPress={() => { setShowContactModal(false); textSitter(); }} activeOpacity={0.8}>
              <Text style={s.contactOptionIcon}>💬</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.contactOptionTitle}>Text Message</Text>
                <Text style={s.contactOptionSub}>{phone || 'Phone not available'}</Text>
              </View>
              <Text style={s.contactOptionChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.contactOption, { borderBottomWidth: 0 }]} onPress={() => { setShowContactModal(false); bookNow(); }} activeOpacity={0.8}>
              <Text style={s.contactOptionIcon}>💼</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.contactOptionTitle}>Book Directly</Text>
                <Text style={s.contactOptionSub}>Skip the interview — request now</Text>
              </View>
              <Text style={s.contactOptionChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.contactDismiss} onPress={() => setShowContactModal(false)}>
              <Text style={s.contactDismissText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F5F4F0' },
  header:          { paddingBottom: 16 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 12 },
  backBtn:         { paddingVertical: 6, paddingRight: 12 },
  backBtnText:     { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerTitle:     { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  favBtn:          { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  favBtnText:      { fontSize: 26, color: '#FFFFFF' },

  loadingBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:     { fontSize: 14, color: '#5A5F72' },

  scroll:          { padding: 16 },

  heroCard:        { backgroundColor: '#FFFFFF', borderRadius: 20, alignItems: 'center', padding: 24, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4 },
  avatarWrap:      { position: 'relative', marginBottom: 12 },
  avatar:          { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#C93488' },
  avatarGrad:      { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(201,52,136,0.3)' },
  avatarInitials:  { fontSize: 36, fontWeight: '900', color: '#FFFFFF' },
  onlineDot:       { position: 'absolute', bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#FFFFFF' },
  heroName:        { fontSize: 22, fontWeight: '900', color: '#0F1117', marginBottom: 6 },
  heroMetaRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginBottom: 10 },
  heroMeta:        { fontSize: 13, color: '#5A5F72', fontWeight: '600' },
  heroMetaDot:     { fontSize: 13, color: '#C5C2BA' },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  ratingNum:       { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  ratingCount:     { fontSize: 13, color: '#9B9FAE' },
  badgesRow:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge:           { backgroundColor: '#F5F4F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#E5E2DA' },
  badgeGreen:      { backgroundColor: '#D4EDE9', borderColor: '#A8D5CD' },
  badgeBlue:       { backgroundColor: '#D6E8F8', borderColor: '#A3C8EE' },
  badgePurple:     { backgroundColor: '#EAD9F7', borderColor: '#C4A0E8' },
  badgeOrange:     { backgroundColor: '#FDECD0', borderColor: '#F5C880' },
  badgeTeal:       { backgroundColor: '#D0F0EC', borderColor: '#80D5CB' },
  badgeText:       { fontSize: 13, fontWeight: '600', color: '#5A5F72' },

  section:         { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  sectionTitle:    { fontSize: 16, fontWeight: '800', color: '#0F1117', marginBottom: 10 },
  aboutText:       { fontSize: 14, color: '#5A5F72', lineHeight: 22 },
  infoRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  infoIcon:        { fontSize: 18 },
  infoText:        { fontSize: 14, color: '#5A5F72', flex: 1, lineHeight: 22 },

  emptyReviews:    { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyReviewsIcon:{ fontSize: 36 },
  emptyReviewsText:{ fontSize: 15, fontWeight: '700', color: '#0F1117' },
  emptyReviewsSub: { fontSize: 13, color: '#9B9FAE', textAlign: 'center' },

  reviewCard:      { paddingVertical: 12 },
  reviewCardBorder:{ borderTopWidth: 1, borderTopColor: '#F0EEE9' },
  reviewHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  reviewAv:        { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E8F4FB', alignItems: 'center', justifyContent: 'center' },
  reviewAvText:    { fontSize: 13, fontWeight: '700', color: '#02A4E2' },
  reviewName:      { fontSize: 13, fontWeight: '700', color: '#0F1117', marginBottom: 3 },
  reviewDate:      { fontSize: 11, color: '#9B9FAE' },
  reviewText:      { fontSize: 13, color: '#5A5F72', lineHeight: 20, fontStyle: 'italic', paddingLeft: 44 },

  ctaBar:              { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: '#F0EEE9', shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 8 },
  interviewBtn:        { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E2DA', justifyContent: 'center' },
  interviewBtnText:    { fontSize: 14, fontWeight: '700', color: '#5A5F72' },
  bookBtn:             { borderRadius: 12, padding: 14, alignItems: 'center' },
  bookBtnText:         { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Contact modal
  modalOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  contactSheet:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  contactSheetTitle:   { fontSize: 19, fontWeight: '900', color: '#0F1117', textAlign: 'center', marginBottom: 4 },
  contactSheetSub:     { fontSize: 13, color: '#9B9FAE', textAlign: 'center', marginBottom: 20 },
  contactOption:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F0EEE9' },
  contactOptionIcon:   { fontSize: 26, width: 36, textAlign: 'center' },
  contactOptionTitle:  { fontSize: 16, fontWeight: '700', color: '#0F1117' },
  contactOptionSub:    { fontSize: 12, color: '#9B9FAE', marginTop: 2 },
  contactOptionChevron:{ fontSize: 22, color: '#C5C2BA', fontWeight: '300' },
  contactDismiss:      { marginTop: 16, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#F5F4F0' },
  contactDismissText:  { fontSize: 15, fontWeight: '700', color: '#5A5F72' },
});
