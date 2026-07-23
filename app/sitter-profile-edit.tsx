// app/sitter-profile-edit.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API       = 'https://sitters4me.com/api/jobs.php';
const SUPPORT_EMAIL  = 'support@sitters4me.com';

export default function SitterProfileEdit() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);

  // Editable fields (name is READ-ONLY — change via support)
  const [minRate,        setMinRate]        = useState('');
  const [maxRate,        setMaxRate]        = useState('');
  const [addChildRate,   setAddChildRate]   = useState('');
  const [workDistance,   setWorkDistance]   = useState('');
  const [about,          setAbout]          = useState('');
  const [certifications, setCerts]          = useState('');

  // Specialization badges
  const [badgeCpr,          setBadgeCpr]          = useState(false);
  const [badgeInfant,       setBadgeInfant]       = useState(false);
  const [badgeSpecialNeeds, setBadgeSpecialNeeds] = useState(false);
  const [badgeMultilingual, setBadgeMultilingual] = useState(false);

  // Display-only
  const displayName = `${user.fname || ''} ${user.lname || ''}`.trim() || 'Your Name';

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_profile`, {
        sitter_id: user.id,
      });
      if (res.data?.success && res.data?.data) {
        const d = res.data.data;
        setMinRate(String(d.minrate        || '15'));
        setMaxRate(String(d.maxrate        || '25'));
        setAddChildRate(String(d.additional_child_rate || '2'));
        setWorkDistance(String(d.work_distance         || '10'));
        setAbout(d.about || '');
        setCerts(d.certifications || '');
        setBadgeCpr(d.badge_cpr == 1 || d.badge_cpr === true);
        setBadgeInfant(d.badge_infant == 1 || d.badge_infant === true);
        setBadgeSpecialNeeds(d.badge_special_needs == 1 || d.badge_special_needs === true);
        setBadgeMultilingual(d.badge_multilingual == 1 || d.badge_multilingual === true);
      } else {
        applyUserDefaults();
      }
    } catch {
      applyUserDefaults();
    } finally {
      setLoading(false);
    }
  };

  const applyUserDefaults = () => {
    setMinRate(String(user.minrate       || '15'));
    setMaxRate(String(user.maxrate       || '25'));
    setAddChildRate('2');
    setWorkDistance(String(user.work_distance || '10'));
    setAbout(user.about || '');
  };

  const handleSave = async () => {
    const min  = parseFloat(minRate)      || 0;
    const max  = parseFloat(maxRate)      || 0;
    const add  = parseFloat(addChildRate) || 0;
    const dist = parseInt(workDistance)   || 5;

    if (min <= 0) {
      Alert.alert('Invalid Rate', 'Minimum rate must be greater than $0/hr.');
      return;
    }
    if (max < min) {
      Alert.alert('Invalid Rate', 'Maximum rate cannot be less than the minimum rate.');
      return;
    }
    if (add < 0) {
      Alert.alert('Invalid Rate', 'Additional child charge cannot be negative.');
      return;
    }
    if (dist < 1 || dist > 100) {
      Alert.alert('Invalid Distance', 'Work distance must be between 1 and 100 miles.');
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=update_sitter_profile`, {
        sitter_id:             user.id,
        minrate:               min,
        maxrate:               max,
        additional_child_rate: add,
        work_distance:         dist,
        about:                 about.trim(),
        certifications:        certifications.trim(),
        badge_cpr:             badgeCpr ? 1 : 0,
        badge_infant:          badgeInfant ? 1 : 0,
        badge_special_needs:   badgeSpecialNeeds ? 1 : 0,
        badge_multilingual:    badgeMultilingual ? 1 : 0,
      });

      if (res.data?.success) {
        // Update global user object so home screen reflects changes immediately
        if (global.currentUser) {
          global.currentUser.minrate       = min;
          global.currentUser.maxrate       = max;
          global.currentUser.work_distance = dist;
          global.currentUser.about         = about.trim();
        }
        Alert.alert('Profile Updated ✓', 'Your profile has been saved.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Server returned a proper error message — show it
        Alert.alert('Could Not Save', res.data?.error || 'An error occurred. Please try again.');
      }
    } catch (e: any) {
      // Axios throws for non-2xx — try to extract the server message if available
      const serverMsg = e?.response?.data?.error;
      if (serverMsg) {
        Alert.alert('Could Not Save', serverMsg);
      } else {
        Alert.alert(
          'Connection Error',
          'Could not reach the server. Please check your internet connection and try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const requestNameChange = () => {
    const subject = encodeURIComponent('Name Change Request');
    const body    = encodeURIComponent(
      `Hi Sitters4Me Support,\n\nI would like to update my display name.\n\nAccount email: ${user.email || ''}\nCurrent name: ${displayName}\nRequested name: \n\nThank you.`
    );
    const mailUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    Linking.openURL(mailUrl).catch(() => {
      Alert.alert(
        'Contact Support',
        `To change your name, please email us at:\n\n${SUPPORT_EMAIL}\n\nInclude your account email and the name you'd like to use.`,
        [{ text: 'OK' }]
      );
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <LinearGradient
          colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.header}
        >
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit Profile</Text>
        </LinearGradient>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#C93488" />
          <Text style={s.loadingTxt}>Loading your profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* HEADER */}
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Profile</Text>
        <Text style={s.headerSub}>Update your rates and information</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── NAME (READ-ONLY) ──────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Your Name</Text>
            <View style={s.lockedRow}>
              <View style={s.lockedLeft}>
                <Text style={s.lockedIcon}>🔒</Text>
                <View>
                  <Text style={s.lockedName}>{displayName}</Text>
                  <Text style={s.lockedHint}>Name changes require identity verification</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={s.supportBtn} onPress={requestNameChange} activeOpacity={0.8}>
              <Text style={s.supportBtnTxt}>📧  Request a Name Change via Support</Text>
            </TouchableOpacity>
          </View>

          {/* ── ABOUT ME ──────────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>About Me</Text>
            <Text style={s.sectionSub}>Tell parents about your experience and personality</Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={about}
              onChangeText={setAbout}
              placeholder="Share your experience with children, certifications (CPR, first aid), hobbies, languages spoken, or anything that helps parents feel confident choosing you…"
              placeholderTextColor="#9B9FAE"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={s.charCount}>{about.length} / 500</Text>
          </View>

          {/* ── LICENSES & CERTIFICATIONS ────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Licenses & Certifications</Text>
            <Text style={s.sectionSub}>Displayed on your profile to help parents trust you faster</Text>
            <TextInput
              style={[s.input, { height: 70, textAlignVertical: 'top' }]}
              value={certifications}
              onChangeText={setCerts}
              placeholder="e.g. CPR by Red Cross, First Aid, Early Childhood Education, Nursing Student…"
              placeholderTextColor="#9B9FAE"
              multiline
              numberOfLines={3}
              maxLength={255}
            />
            <Text style={s.charCount}>{certifications.length} / 255</Text>
          </View>

          {/* ── HOURLY RATES ──────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Hourly Rates</Text>
            <Text style={s.sectionSub}>Parents see your rate range when browsing sitters</Text>

            <View style={s.fieldRow}>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Minimum Rate</Text>
                <View style={s.prefixInput}>
                  <Text style={s.prefix}>$</Text>
                  <TextInput
                    style={[s.input, s.prefixInner]}
                    value={minRate}
                    onChangeText={setMinRate}
                    placeholder="15"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                  <Text style={s.suffix}>/hr</Text>
                </View>
              </View>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Maximum Rate</Text>
                <View style={s.prefixInput}>
                  <Text style={s.prefix}>$</Text>
                  <TextInput
                    style={[s.input, s.prefixInner]}
                    value={maxRate}
                    onChangeText={setMaxRate}
                    placeholder="25"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                  <Text style={s.suffix}>/hr</Text>
                </View>
              </View>
            </View>

            {/* Additional child charge */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Additional Child / Sibling Charge</Text>
              <Text style={s.fieldHint}>Extra amount added per additional child beyond the first</Text>
              <View style={s.prefixInput}>
                <Text style={s.prefix}>$</Text>
                <TextInput
                  style={[s.input, s.prefixInner]}
                  value={addChildRate}
                  onChangeText={setAddChildRate}
                  placeholder="2.00"
                  placeholderTextColor="#9B9FAE"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
                <Text style={s.suffix}>/hr per extra child</Text>
              </View>
            </View>

            {/* Rate preview */}
            {(() => {
              const min = parseFloat(minRate) || 0;
              const max = parseFloat(maxRate) || 0;
              const add = parseFloat(addChildRate) || 0;
              if (min <= 0) return null;
              return (
                <View style={s.ratePreview}>
                  <Text style={s.ratePreviewTitle}>💡 Rate Preview</Text>
                  <Text style={s.ratePreviewRow}>
                    1 child, 1 hour: <Text style={s.ratePreviewVal}>${min.toFixed(2)}</Text>
                  </Text>
                  {add > 0 && (
                    <Text style={s.ratePreviewRow}>
                      2 children, 1 hour: <Text style={s.ratePreviewVal}>${(min + add).toFixed(2)}</Text>
                    </Text>
                  )}
                  {max > min && (
                    <Text style={s.ratePreviewRow}>
                      Your displayed range: <Text style={s.ratePreviewVal}>${min.toFixed(0)}–${max.toFixed(0)}/hr</Text>
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>

          {/* ── WORK DISTANCE ─────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Work Distance</Text>
            <Text style={s.sectionSub}>Maximum distance from your location to accept jobs</Text>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Max Travel Distance</Text>
              <View style={s.prefixInput}>
                <TextInput
                  style={[s.input, s.prefixInner]}
                  value={workDistance}
                  onChangeText={setWorkDistance}
                  placeholder="10"
                  placeholderTextColor="#9B9FAE"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
                <Text style={s.suffix}>miles</Text>
              </View>
            </View>

            {/* Quick-select chips */}
            <View style={s.chipRow}>
              {['5', '10', '15', '25', '50'].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.chip, workDistance === d && s.chipActive]}
                  onPress={() => setWorkDistance(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipTxt, workDistance === d && s.chipTxtActive]}>{d} mi</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── SPECIALIZATION BADGES ─────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Specializations</Text>
            <Text style={s.sectionSub}>Help parents find you for their specific needs</Text>

            {([
              { key: 'cpr',           label: '❤️  CPR Certified',        desc: 'You hold a valid CPR / AED certification',      val: badgeCpr,          set: setBadgeCpr,          color: '#1A5FA8', bg: '#D6E8F8', border: '#A3C8EE' },
              { key: 'infant',        label: '🍼  Infant Care',           desc: 'Comfortable with babies under 12 months',        val: badgeInfant,       set: setBadgeInfant,       color: '#6B3FA0', bg: '#EAD9F7', border: '#C4A0E8' },
              { key: 'special_needs', label: '🌟  Special Needs',         desc: 'Experience with children who have special needs', val: badgeSpecialNeeds, set: setBadgeSpecialNeeds, color: '#A05A00', bg: '#FDECD0', border: '#F5C880' },
              { key: 'multilingual',  label: '🌍  Multilingual',          desc: 'Speak more than one language',                   val: badgeMultilingual, set: setBadgeMultilingual, color: '#0A7A6A', bg: '#D0F0EC', border: '#80D5CB' },
            ] as const).map(item => (
              <TouchableOpacity
                key={item.key}
                style={[s.badgeToggleRow, item.val && { backgroundColor: item.bg, borderColor: item.border }]}
                onPress={() => (item.set as any)(!item.val)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.badgeToggleLabel, item.val && { color: item.color }]}>{item.label}</Text>
                  <Text style={s.badgeToggleDesc}>{item.desc}</Text>
                </View>
                <View style={[s.badgeToggleCheck, item.val && { backgroundColor: item.color, borderColor: item.color }]}>
                  {item.val && <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── AVAILABILITY SHORTCUT ─────────────────────── */}
          <TouchableOpacity
            onPress={() => router.push('/sitter-availability')}
            style={s.saveWrap}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#02A4E2', '#0270C8']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.saveBtn}
            >
              <Text style={s.saveBtnTxt}>📅  Set My Availability</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 4 }} />

          {/* ── SAVE BUTTON ───────────────────────────────── */}
          <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85} style={s.saveWrap}>
            <LinearGradient
              colors={['#C93488', '#9B5BAB']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.saveBtn}
            >
              {saving
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.saveBtnTxt}>💾  Save Profile</Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={s.cancelBtn} activeOpacity={0.7}>
            <Text style={s.cancelBtnTxt}>Cancel</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F5F4F0' },

  // Header
  header:           { paddingTop: 14, paddingBottom: 24, paddingHorizontal: 20 },
  backBtn:          { marginBottom: 10 },
  backTxt:          { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600' },
  headerTitle:      { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub:        { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // Loading
  loadingWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt:       { fontSize: 15, color: '#5A5F72', fontWeight: '500' },

  // Scroll / layout
  scroll:           { flex: 1, marginTop: -12 },
  content:          { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 48, gap: 16 },

  // Section card
  section:          { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: 'rgba(15,17,23,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sectionTitle:     { fontSize: 17, fontWeight: '800', color: '#0F1117', letterSpacing: -0.2 },
  sectionSub:       { fontSize: 13, color: '#9B9FAE', marginTop: -6 },

  // Locked name row
  lockedRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(15,17,23,0.08)' },
  lockedLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  lockedIcon:       { fontSize: 20 },
  lockedName:       { fontSize: 16, fontWeight: '700', color: '#0F1117' },
  lockedHint:       { fontSize: 12, color: '#9B9FAE', marginTop: 2 },
  supportBtn:       { backgroundColor: 'rgba(201,52,136,0.08)', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,52,136,0.25)' },
  supportBtnTxt:    { color: '#C93488', fontSize: 14, fontWeight: '700' },

  // Field
  fieldRow:         { flexDirection: 'row', gap: 10 },
  field:            { gap: 6 },
  fieldLabel:       { fontSize: 13, fontWeight: '700', color: '#5A5F72' },
  fieldHint:        { fontSize: 12, color: '#9B9FAE', marginTop: -4 },
  input:            { backgroundColor: '#F5F4F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#0F1117', fontWeight: '500', borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)' },
  textArea:         { height: 110, paddingTop: 12 },
  charCount:        { fontSize: 11, color: '#9B9FAE', textAlign: 'right' },

  // Prefix input wrapper
  prefixInput:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', overflow: 'hidden' },
  prefix:           { paddingLeft: 12, fontSize: 16, fontWeight: '700', color: '#5A5F72' },
  prefixInner:      { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 4 },
  suffix:           { paddingRight: 12, fontSize: 13, color: '#9B9FAE', fontWeight: '600' },

  // Rate preview box
  ratePreview:      { backgroundColor: 'rgba(2,164,226,0.06)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(2,164,226,0.2)', gap: 4 },
  ratePreviewTitle: { fontSize: 13, fontWeight: '700', color: '#02A4E2', marginBottom: 2 },
  ratePreviewRow:   { fontSize: 13, color: '#5A5F72' },
  ratePreviewVal:   { fontWeight: '800', color: '#0F1117' },

  // Distance chips
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:             { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F4F0', borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.12)' },
  chipActive:       { backgroundColor: '#02A4E2', borderColor: '#02A4E2' },
  chipTxt:          { fontSize: 13, fontWeight: '700', color: '#5A5F72' },
  chipTxtActive:    { color: '#FFFFFF' },

  // Badge toggles
  badgeToggleRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', gap: 12 },
  badgeToggleLabel: { fontSize: 15, fontWeight: '700', color: '#0F1117' },
  badgeToggleDesc:  { fontSize: 12, color: '#9B9FAE', marginTop: 2 },
  badgeToggleCheck: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#D9D6CE', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },

  // Save / Cancel
  saveWrap:         { marginTop: 6 },
  saveBtn:          { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnTxt:       { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  cancelBtn:        { alignItems: 'center', paddingVertical: 12 },
  cancelBtnTxt:     { fontSize: 15, color: '#9B9FAE', fontWeight: '600' },
});
