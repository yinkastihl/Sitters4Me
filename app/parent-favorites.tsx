// app/parent-favorites.tsx
// Parent's saved / favorite sitters screen
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  StatusBar, ActivityIndicator, Image, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

function StarRow({ rating, size = 13 }: { rating: number; size?: number }) {
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

export default function ParentFavorites() {
  const router = useRouter();
  const user   = (global as any).currentUser || {};

  const [sitters,    setSitters]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removing,   setRemoving]   = useState<number | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!user.id) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=get_favorites`, {
        parent_id: user.id,
      });
      if (res.data?.success) {
        setSitters(res.data.data || []);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [user.id]);

  useEffect(() => { load(); }, []);

  const removeFavorite = async (sitter: any) => {
    Alert.alert(
      `Remove ${sitter.fname}?`,
      'They will be removed from your saved sitters.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemoving(sitter.id);
            try {
              await axios.post(`${JOBS_API}?action=remove_favorite`, {
                parent_id: user.id,
                sitter_id: sitter.id,
              });
              setSitters(prev => prev.filter(s => s.id !== sitter.id));
            } catch {
              Alert.alert('Error', 'Could not remove. Please try again.');
            } finally {
              setRemoving(null);
            }
          },
        },
      ]
    );
  };

  const viewProfile = (sitter: any) => {
    (global as any).viewSitter = sitter;
    router.push('/sitter-profile-view');
  };

  const bookSitter = (sitter: any) => {
    (global as any).viewSitter = sitter;
    router.push('/sitter-profile-view');
    // Profile view has a "Request Now" CTA
  };

  const renderSitter = ({ item: st }: { item: any }) => {
    const isOnline   = st.online === 1 || st.online === '1' || st.online === true;
    const avgRating  = parseFloat(st.avg_rating) || 0;
    const reviewCnt  = parseInt(st.review_count) || 0;
    const initials   = `${(st.fname || '?')[0]}${(st.lname || '?')[0]}`.toUpperCase();

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => viewProfile(st)}
        activeOpacity={0.88}
      >
        {/* Avatar */}
        <View style={s.avatarWrap}>
          {st.image
            ? <Image source={{ uri: `https://sitters4me.com/uploads/${st.image}` }} style={s.avatar} />
            : (
              <LinearGradient colors={['#C93488', '#9B5BAB', '#02A4E2']} style={s.avatarGrad}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )
          }
          <View style={[s.onlineDot, { backgroundColor: isOnline ? '#22C55E' : '#9B9FAE' }]} />
        </View>

        {/* Info */}
        <View style={s.info}>
          <View style={s.nameRow}>
            <Text style={s.name}>{st.fname} {st.lname}</Text>
            {st.bgcheck === 'Y' && (
              <View style={s.bgBadge}>
                <Text style={s.bgBadgeText}>✓ BG</Text>
              </View>
            )}
          </View>

          <Text style={s.rate}>${st.minrate}/hr</Text>

          <View style={s.ratingRow}>
            {avgRating > 0
              ? <>
                  <StarRow rating={avgRating} />
                  <Text style={s.ratingText}>{avgRating.toFixed(1)}</Text>
                  <Text style={s.reviewCount}>({reviewCnt})</Text>
                </>
              : <Text style={s.noRating}>No ratings yet</Text>
            }
          </View>

          <Text style={s.onlineLabel}>
            {isOnline ? '🟢 Online now' : '⚫ Offline'}
          </Text>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.bookBtn}
            onPress={() => bookSitter(st)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={isOnline ? ['#ED1E76', '#C93488'] : ['#9B9FAE', '#7A7F8E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.bookBtnGrad}
            >
              <Text style={s.bookBtnText}>{isOnline ? '🍼 Book' : 'View'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => removeFavorite(st)}
            disabled={removing === st.id}
          >
            {removing === st.id
              ? <ActivityIndicator color="#C93488" size="small" />
              : <Text style={s.removeBtnText}>♥</Text>
            }
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Favorite Sitters</Text>
          <View style={{ width: 60 }} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color="#C93488" size="large" />
          <Text style={s.loadingText}>Loading your favorites…</Text>
        </View>
      ) : sitters.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>❤️</Text>
          <Text style={s.emptyTitle}>No Favorite Sitters Yet</Text>
          <Text style={s.emptySub}>
            After booking a sitter, tap the heart icon on their profile to save them here for quick re-booking.
          </Text>
          <TouchableOpacity style={s.findBtn} onPress={() => router.back()}>
            <LinearGradient
              colors={['#ED1E76', '#C93488']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.findBtnGrad}
            >
              <Text style={s.findBtnText}>Find a Sitter 🍼</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={s.countLabel}>
            {sitters.length} saved sitter{sitters.length !== 1 ? 's' : ''}
          </Text>
          <FlatList
            data={sitters}
            keyExtractor={it => String(it.id)}
            renderItem={renderSitter}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor="#C93488"
              />
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F5F4F0' },
  header:          { paddingBottom: 16 },
  headerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  backBtn:         { width: 60, paddingVertical: 6 },
  backBtnText:     { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerTitle:     { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },

  loadingBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:     { fontSize: 14, color: '#5A5F72' },

  emptyBox:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon:       { fontSize: 56 },
  emptyTitle:      { fontSize: 20, fontWeight: '900', color: '#0F1117', textAlign: 'center' },
  emptySub:        { fontSize: 14, color: '#5A5F72', textAlign: 'center', lineHeight: 22 },
  findBtn:         { borderRadius: 14, overflow: 'hidden', marginTop: 8, alignSelf: 'stretch' },
  findBtnGrad:     { padding: 16, alignItems: 'center' },
  findBtnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  countLabel:      { fontSize: 13, fontWeight: '700', color: '#9B9FAE', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },

  list:            { padding: 16, gap: 12, paddingBottom: 32 },
  card:            { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },

  avatarWrap:      { position: 'relative', flexShrink: 0 },
  avatar:          { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#F0EEE9' },
  avatarGrad:      { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  avatarInitials:  { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  onlineDot:       { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF' },

  info:            { flex: 1, gap: 3 },
  nameRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name:            { fontSize: 15, fontWeight: '800', color: '#0F1117' },
  bgBadge:         { backgroundColor: '#D4EDE9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  bgBadgeText:     { fontSize: 10, fontWeight: '700', color: '#1A7F6E' },
  rate:            { fontSize: 14, fontWeight: '700', color: '#02A4E2' },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText:      { fontSize: 12, fontWeight: '700', color: '#0F1117' },
  reviewCount:     { fontSize: 11, color: '#9B9FAE' },
  noRating:        { fontSize: 11, color: '#9B9FAE' },
  onlineLabel:     { fontSize: 11, color: '#5A5F72' },

  actions:         { gap: 8, alignItems: 'center' },
  bookBtn:         { borderRadius: 10, overflow: 'hidden' },
  bookBtnGrad:     { paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  bookBtnText:     { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  removeBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  removeBtnText:   { fontSize: 22, color: '#C93488' },
});
