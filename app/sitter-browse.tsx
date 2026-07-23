// app/sitter-browse.tsx
// Browse ALL sitters in the parent's area — online and offline.
// Parents can search, filter by specialization, and tap to view any profile.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  StatusBar, ActivityIndicator, TextInput, ScrollView,
  RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

function StarRow({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? '#F4A800' : '#D9D6CE' }}>★</Text>
      ))}
    </View>
  );
}

type Sitter = {
  id: number;
  fname: string;
  lname: string;
  minrate: number;
  avg_rating: number;
  review_count: number;
  online: number;
  distance_away: number;
  image: string | null;
  bgcheck: string;
  checkr_status: string;
  experience_years: number | null;
  about: string | null;
  city: string | null;
  badge_cpr: number;
  badge_infant: number;
  badge_special_needs: number;
  badge_multilingual: number;
};

const FILTERS = [
  { key: 'online_only',   label: '🟢 Online Now' },
  { key: 'filter_cpr',    label: '❤️ CPR' },
  { key: 'filter_infant', label: '🍼 Infant' },
  { key: 'filter_sn',     label: '🌟 Special Needs' },
  { key: 'filter_multi',  label: '🌍 Multilingual' },
];

export default function SitterBrowse() {
  const router  = useRouter();
  const user    = (global as any).currentUser || {};
  const loc     = (global as any).lastParentLoc || { latitude: 29.7604, longitude: -95.3698 };

  const [sitters,   setSitters]   = useState<Sitter[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [search,    setSearch]    = useState('');
  const [filters,   setFilters]   = useState<Record<string, boolean>>({
    online_only: false,
    filter_cpr: false,
    filter_infant: false,
    filter_sn: false,
    filter_multi: false,
  });
  const searchTimeout = useRef<any>(null);

  const load = useCallback(async (opts?: { isRefresh?: boolean; searchVal?: string; filtersVal?: typeof filters }) => {
    const q      = opts?.searchVal  ?? search;
    const f      = opts?.filtersVal ?? filters;
    if (!opts?.isRefresh) setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=browse_sitters`, {
        lat:          loc.latitude,
        lng:          loc.longitude,
        radius:       user.search_radius || 25,
        search:       q,
        online_only:  f.online_only  ? 1 : 0,
        filter_cpr:   f.filter_cpr   ? 1 : 0,
        filter_infant:f.filter_infant ? 1 : 0,
        filter_sn:    f.filter_sn    ? 1 : 0,
        filter_multi: f.filter_multi  ? 1 : 0,
        limit: 60,
      });
      if (res.data?.success) setSitters(res.data.data || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [search, filters, loc]);

  useEffect(() => { load(); }, []);

  const onSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load({ searchVal: val }), 400);
  };

  const toggleFilter = (key: string) => {
    const next = { ...filters, [key]: !filters[key] };
    setFilters(next);
    load({ filtersVal: next });
  };

  const viewProfile = (sitter: Sitter) => {
    (global as any).viewSitter = sitter;
    router.push('/sitter-profile-view');
  };

  const renderSitter = ({ item: st }: { item: Sitter }) => {
    const initials = `${(st.fname || '?')[0]}${(st.lname || '?')[0]}`.toUpperCase();
    const isOnline = st.online === 1;
    const hasBadges = st.badge_cpr || st.badge_infant || st.badge_special_needs || st.badge_multilingual;
    const bgCleared = st.bgcheck === 'Y' || st.checkr_status === 'clear';

    return (
      <TouchableOpacity style={s.card} onPress={() => viewProfile(st)} activeOpacity={0.85}>
        {/* Photo / avatar */}
        <View style={s.cardAvWrap}>
          {st.image
            ? <Image source={{ uri: `https://sitters4me.com/uploads/${st.image}` }} style={s.cardAv} />
            : (
              <LinearGradient colors={['#9B5BAB', '#C93488']} style={s.cardAv}>
                <Text style={s.cardAvText}>{initials}</Text>
              </LinearGradient>
            )
          }
          {/* Online dot */}
          <View style={[s.onlineDot, isOnline ? s.onlineDotOn : s.onlineDotOff]} />
        </View>

        {/* Info */}
        <View style={s.cardBody}>
          <View style={s.cardNameRow}>
            <Text style={s.cardName}>{st.fname} {st.lname}</Text>
            {bgCleared && (
              <View style={s.bgBadge}>
                <Text style={s.bgBadgeText}>✓ BG</Text>
              </View>
            )}
          </View>

          <View style={s.cardRateRow}>
            <Text style={s.cardRate}>${st.minrate}/hr</Text>
            {st.distance_away != null && st.distance_away > 0 && (
              <Text style={s.cardDist}>· {st.distance_away} mi away</Text>
            )}
          </View>

          {st.avg_rating > 0 ? (
            <View style={s.cardRatingRow}>
              <StarRow rating={st.avg_rating} />
              <Text style={s.cardRatingCount}>({st.review_count})</Text>
            </View>
          ) : (
            <Text style={s.cardNoRating}>No reviews yet</Text>
          )}

          {/* Status pill */}
          <View style={[s.statusPill, isOnline ? s.statusPillOn : s.statusPillOff]}>
            <Text style={[s.statusPillText, isOnline ? s.statusPillTextOn : s.statusPillTextOff]}>
              {isOnline ? '🟢 Online Now' : '⚫ Offline'}
            </Text>
          </View>

          {/* Specialization badges */}
          {hasBadges ? (
            <View style={s.cardBadgeRow}>
              {st.badge_cpr           === 1 && <Text style={s.miniBadge}>❤️</Text>}
              {st.badge_infant        === 1 && <Text style={s.miniBadge}>🍼</Text>}
              {st.badge_special_needs === 1 && <Text style={s.miniBadge}>🌟</Text>}
              {st.badge_multilingual  === 1 && <Text style={s.miniBadge}>🌍</Text>}
            </View>
          ) : null}
        </View>

        <Text style={s.cardChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const onlineCount = sitters.filter(s => s.online === 1).length;

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
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Browse Sitters</Text>
            {!loading && (
              <Text style={s.headerSub}>
                {sitters.length} sitter{sitters.length !== 1 ? 's' : ''} nearby
                {onlineCount > 0 ? ` · ${onlineCount} online` : ''}
              </Text>
            )}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Search bar */}
        <View style={s.searchWrap}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search by name…"
            placeholderTextColor="rgba(255,255,255,0.55)"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterChip, filters[f.key] && s.filterChipOn]}
              onPress={() => toggleFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterChipText, filters[f.key] && s.filterChipTextOn]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* Results */}
      {loading ? (
        <View style={s.loadBox}>
          <ActivityIndicator size="large" color="#C93488" />
          <Text style={s.loadText}>Finding sitters near you…</Text>
        </View>
      ) : (
        <FlatList
          data={sitters}
          keyExtractor={item => String(item.id)}
          renderItem={renderSitter}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load({ isRefresh: true }); }}
              tintColor="#C93488"
            />
          }
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>🔍</Text>
              <Text style={s.emptyTitle}>No sitters found</Text>
              <Text style={s.emptySub}>
                {Object.values(filters).some(Boolean) || search
                  ? 'Try removing some filters or clearing the search.'
                  : 'No sitters have registered in your area yet.'}
              </Text>
            </View>
          }
          // Section header before offline sitters
          ItemSeparatorComponent={() => null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F5F4F0' },

  // Header
  header:      { paddingBottom: 12 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  backBtn:     { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:    { fontSize: 32, color: '#FFFFFF', fontWeight: '300', lineHeight: 36 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 12, height: 40 },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#FFFFFF' },

  // Filter chips
  filterRow:      { paddingHorizontal: 16, paddingBottom: 4, gap: 8 },
  filterChip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  filterChipOn:   { backgroundColor: '#FFFFFF' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  filterChipTextOn:{ fontSize: 13, fontWeight: '700', color: '#C93488' },

  // Load
  loadBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText:  { fontSize: 15, color: '#9B9FAE' },

  // List
  list:      { padding: 12, gap: 10, paddingBottom: 40 },

  // Card
  card:       { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardAvWrap: { position: 'relative', flexShrink: 0 },
  cardAv:     { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardAvText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  onlineDot:  { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', position: 'absolute', bottom: 0, right: 0 },
  onlineDotOn:  { backgroundColor: '#22C55E' },
  onlineDotOff: { backgroundColor: '#9B9FAE' },

  cardBody:   { flex: 1 },
  cardNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName:   { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  bgBadge:    { backgroundColor: '#D4EDE9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bgBadgeText:{ fontSize: 10, fontWeight: '700', color: '#1A7F6E' },

  cardRateRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cardRate:       { fontSize: 14, fontWeight: '700', color: '#C93488' },
  cardDist:       { fontSize: 12, color: '#9B9FAE' },

  cardRatingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardRatingCount:{ fontSize: 11, color: '#9B9FAE' },
  cardNoRating:   { fontSize: 11, color: '#C5C2BA', marginTop: 4 },

  statusPill:     { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  statusPillOn:   { backgroundColor: '#DCFCE7' },
  statusPillOff:  { backgroundColor: '#F5F4F0' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusPillTextOn:  { color: '#16A34A' },
  statusPillTextOff: { color: '#9B9FAE' },

  cardBadgeRow:   { flexDirection: 'row', gap: 4, marginTop: 4 },
  miniBadge:      { fontSize: 14 },

  cardChevron:    { fontSize: 22, color: '#C5C2BA', fontWeight: '300' },

  // Empty
  emptyBox:   { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F1117' },
  emptySub:   { fontSize: 14, color: '#9B9FAE', textAlign: 'center', lineHeight: 21 },
});
