// app/children-profiles.tsx
// Parent manages their children's profiles — saved info auto-fills every booking
// and is shared with the sitter when they arrive on the job.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Alert, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

const COMMON_ALLERGIES = ['Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat/Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Bee stings', 'Penicillin', 'Latex'];

const ageLabel = (age: number | null) => {
  if (age === null || age === undefined) return 'Age unknown';
  if (age === 0) return 'Infant (< 1 yr)';
  return `${age} yr${age !== 1 ? 's' : ''}`;
};

// ── Allergy chip toggle ────────────────────────────────────────
function AllergyChips({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (a: string) =>
    onChange(selected.includes(a) ? selected.filter(x => x !== a) : [...selected, a]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {COMMON_ALLERGIES.map(a => {
        const on = selected.includes(a);
        return (
          <TouchableOpacity
            key={a}
            onPress={() => toggle(a)}
            style={[s.allergyChip, on && s.allergyChipOn]}
            activeOpacity={0.75}
          >
            <Text style={[s.allergyChipText, on && s.allergyChipTextOn]}>{on ? '✓ ' : ''}{a}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Blank child form ───────────────────────────────────────────
const blankChild = () => ({
  child_id: 0,
  name: '',
  age: '',
  allergies: [] as string[],
  medical_notes: '',
  bedtime_routine: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  special_needs: '',
  has_allergies: false,
});

export default function ChildrenProfiles() {
  const router = useRouter();
  const user   = (global as any).currentUser || {};

  const [children,   setChildren]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [editChild,  setEditChild]  = useState<any>(null); // null = new

  // Form state
  const [form, setForm] = useState(blankChild());
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const load = useCallback(async () => {
    if (!user.id) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=get_child_profiles`, { parent_id: user.id });
      if (res.data?.success) setChildren(res.data.data || []);
    } catch {}
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditChild(null);
    setForm(blankChild());
    setShowForm(true);
  };

  const openEdit = (child: any) => {
    setEditChild(child);
    setForm({
      child_id:               child.id,
      name:                   child.name || '',
      age:                    child.age != null ? String(child.age) : '',
      allergies:              Array.isArray(child.allergies) ? child.allergies : [],
      medical_notes:          child.medical_notes || '',
      bedtime_routine:        child.bedtime_routine || '',
      emergency_contact_name: child.emergency_contact_name || '',
      emergency_contact_phone:child.emergency_contact_phone || '',
      special_needs:          child.special_needs || '',
      has_allergies:          Array.isArray(child.allergies) && child.allergies.length > 0,
    });
    setShowForm(true);
  };

  const saveChild = async () => {
    if (!form.name.trim()) return Alert.alert('Required', 'Please enter the child\'s name.');
    setSaving(true);
    try {
      const payload: any = {
        parent_id:               user.id,
        name:                    form.name.trim(),
        age:                     form.age !== '' ? parseInt(form.age) : null,
        allergies:               form.has_allergies ? form.allergies : [],
        medical_notes:           form.medical_notes.trim() || null,
        bedtime_routine:         form.bedtime_routine.trim() || null,
        emergency_contact_name:  form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        special_needs:           form.special_needs.trim() || null,
      };
      if (form.child_id) payload.child_id = form.child_id;

      const res = await axios.post(`${JOBS_API}?action=save_child_profile`, payload);
      if (res.data?.success) {
        setShowForm(false);
        load();
      } else {
        Alert.alert('Error', res.data?.error || 'Could not save. Please try again.');
      }
    } catch {
      Alert.alert('Connection Error', 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const deleteChild = (child: any) => {
    Alert.alert(
      `Remove ${child.name}?`,
      'This will permanently delete this child profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await axios.post(`${JOBS_API}?action=delete_child_profile`, {
                parent_id: user.id,
                child_id:  child.id,
              });
              load();
            } catch {
              Alert.alert('Error', 'Could not remove. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── FORM VIEW ───────────────────────────────────────────────────
  if (showForm) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={['#C93488', '#9B5BAB']} style={s.header}>
          <TouchableOpacity onPress={() => setShowForm(false)} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{editChild ? `Edit ${editChild.name}` : 'Add Child'}</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false}>

            {/* Name + Age */}
            <View style={s.card}>
              <Text style={s.cardTitle}>👶 Basic Info</Text>
              <Text style={s.label}>Child's Name *</Text>
              <TextInput
                style={s.input}
                value={form.name}
                onChangeText={v => set('name', v)}
                placeholder="First name"
                placeholderTextColor="#9B9FAE"
                autoCapitalize="words"
              />
              <Text style={s.label}>Age</Text>
              <View style={s.ageRow}>
                {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[s.ageBtn, form.age === String(a) && s.ageBtnOn]}
                    onPress={() => set('age', String(a))}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.ageBtnText, form.age === String(a) && s.ageBtnTextOn]}>
                      {a === 0 ? 'Inf' : a}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Allergies */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={s.cardTitle}>⚠️ Allergies</Text>
                <Switch
                  value={form.has_allergies}
                  onValueChange={v => set('has_allergies', v)}
                  trackColor={{ false: '#E5E2DA', true: '#C93488' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <Text style={s.cardSub}>Sitters are shown this before arriving</Text>
              {form.has_allergies && (
                <>
                  <AllergyChips
                    selected={form.allergies}
                    onChange={v => set('allergies', v)}
                  />
                  {form.allergies.length === 0 && (
                    <Text style={{ fontSize: 12, color: '#F5A623', marginTop: 8 }}>
                      ⚠️ Select at least one allergy above or turn off the toggle
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Medical Notes */}
            <View style={s.card}>
              <Text style={s.cardTitle}>🏥 Medical Notes</Text>
              <Text style={s.cardSub}>Conditions, medications, instructions for emergencies</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={form.medical_notes}
                onChangeText={v => set('medical_notes', v)}
                placeholder="e.g. Has asthma — inhaler in blue bag. EpiPen in kitchen drawer."
                placeholderTextColor="#9B9FAE"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Bedtime */}
            <View style={s.card}>
              <Text style={s.cardTitle}>🌙 Bedtime Routine</Text>
              <Text style={s.cardSub}>Help the sitter keep things consistent</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={form.bedtime_routine}
                onChangeText={v => set('bedtime_routine', v)}
                placeholder="e.g. Bath at 7pm, story at 7:30pm, lights out by 8pm. Needs white noise."
                placeholderTextColor="#9B9FAE"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Special Needs */}
            <View style={s.card}>
              <Text style={s.cardTitle}>💜 Special Needs / Notes</Text>
              <Text style={s.cardSub}>Sensory sensitivities, dietary restrictions, behaviours to be aware of</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={form.special_needs}
                onChangeText={v => set('special_needs', v)}
                placeholder="e.g. Sensory sensitive — no loud noises. Gluten-free diet only."
                placeholderTextColor="#9B9FAE"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Emergency Contact */}
            <View style={s.card}>
              <Text style={s.cardTitle}>🆘 Emergency Contact</Text>
              <Text style={s.cardSub}>Someone the sitter can reach if you are unavailable</Text>
              <Text style={s.label}>Contact Name</Text>
              <TextInput
                style={s.input}
                value={form.emergency_contact_name}
                onChangeText={v => set('emergency_contact_name', v)}
                placeholder="e.g. Grandma Susan"
                placeholderTextColor="#9B9FAE"
                autoCapitalize="words"
              />
              <Text style={s.label}>Contact Phone</Text>
              <TextInput
                style={s.input}
                value={form.emergency_contact_phone}
                onChangeText={v => set('emergency_contact_phone', v)}
                placeholder="(555) 000-0000"
                placeholderTextColor="#9B9FAE"
                keyboardType="phone-pad"
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveChild}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#C93488', '#9B5BAB']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.saveBtnGrad}>
                {saving
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={s.saveBtnText}>💾  Save {form.name || 'Child'}'s Profile</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── LIST VIEW ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#C93488', '#9B5BAB']} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Children Profiles</Text>
        <TouchableOpacity onPress={openAdd} style={s.addBtn}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </LinearGradient>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#C93488" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listScroll} showsVerticalScrollIndicator={false}>

          {/* Info banner */}
          <View style={s.infoBanner}>
            <Text style={s.infoBannerIcon}>💡</Text>
            <Text style={s.infoBannerText}>
              Saved profiles auto-fill your bookings and are shared with your sitter when they arrive — so they're always prepared.
            </Text>
          </View>

          {children.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>👶</Text>
              <Text style={s.emptyTitle}>No children added yet</Text>
              <Text style={s.emptySub}>Add your children so sitters arrive knowing exactly what to expect.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openAdd} activeOpacity={0.85}>
                <LinearGradient colors={['#C93488', '#9B5BAB']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.emptyBtnGrad}>
                  <Text style={s.emptyBtnText}>+ Add First Child</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {children.map(child => (
                <View key={child.id} style={s.childCard}>
                  {/* Avatar + name */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <LinearGradient colors={['#C93488', '#9B5BAB']} style={s.childAvatar}>
                      <Text style={s.childAvatarText}>{(child.name || '?')[0].toUpperCase()}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={s.childName}>{child.name}</Text>
                      <Text style={s.childAge}>{ageLabel(child.age)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEdit(child)} style={s.editBtn}>
                      <Text style={s.editBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Allergy badges */}
                  {Array.isArray(child.allergies) && child.allergies.length > 0 && (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>⚠️ Allergies</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {child.allergies.map((a: string) => (
                          <View key={a} style={s.allergyBadge}>
                            <Text style={s.allergyBadgeText}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Medical notes */}
                  {!!child.medical_notes && (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>🏥 Medical</Text>
                      <Text style={s.sectionText}>{child.medical_notes}</Text>
                    </View>
                  )}

                  {/* Bedtime */}
                  {!!child.bedtime_routine && (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>🌙 Bedtime</Text>
                      <Text style={s.sectionText}>{child.bedtime_routine}</Text>
                    </View>
                  )}

                  {/* Special needs */}
                  {!!child.special_needs && (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>💜 Special Needs</Text>
                      <Text style={s.sectionText}>{child.special_needs}</Text>
                    </View>
                  )}

                  {/* Emergency contact */}
                  {!!child.emergency_contact_name && (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>🆘 Emergency Contact</Text>
                      <Text style={s.sectionText}>
                        {child.emergency_contact_name}
                        {child.emergency_contact_phone ? `  ·  ${child.emergency_contact_phone}` : ''}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity onPress={() => deleteChild(child)} style={s.deleteBtn} activeOpacity={0.8}>
                    <Text style={s.deleteBtnText}>🗑  Remove {child.name}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={s.addMoreBtn} onPress={openAdd} activeOpacity={0.85}>
                <LinearGradient colors={['#C93488', '#9B5BAB']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.addMoreGrad}>
                  <Text style={s.addMoreText}>+ Add Another Child</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: '#F7F5F0' },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  headerTitle:       { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  backBtn:           { width: 40, alignItems: 'flex-start' },
  backText:          { fontSize: 28, color: '#FFFFFF', lineHeight: 32 },
  addBtn:            { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText:        { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  // List
  listScroll:        { padding: 16, gap: 14 },
  infoBanner:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F5A623' },
  infoBannerIcon:    { fontSize: 18 },
  infoBannerText:    { flex: 1, fontSize: 13, color: '#7A4900', lineHeight: 18 },

  emptyBox:          { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyIcon:         { fontSize: 56 },
  emptyTitle:        { fontSize: 18, fontWeight: '800', color: '#0F1117' },
  emptySub:          { fontSize: 14, color: '#5A5F72', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyBtn:          { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  emptyBtnGrad:      { paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText:      { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },

  childCard:         { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: 'rgba(201,52,136,0.15)', shadowColor: '#000', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  childAvatar:       { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  childAvatarText:   { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  childName:         { fontSize: 17, fontWeight: '900', color: '#0F1117' },
  childAge:          { fontSize: 13, color: '#5A5F72', marginTop: 2 },
  editBtn:           { backgroundColor: '#F5F4F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText:       { fontSize: 13, fontWeight: '700', color: '#5A5F72' },
  section:           { marginTop: 10 },
  sectionLabel:      { fontSize: 12, fontWeight: '700', color: '#9B9FAE', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  sectionText:       { fontSize: 14, color: '#3A3F52', lineHeight: 20 },
  allergyBadge:      { backgroundColor: '#FFF0F0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#FFBDBD' },
  allergyBadgeText:  { fontSize: 12, fontWeight: '700', color: '#C0392B' },
  deleteBtn:         { marginTop: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E2DA', padding: 10, alignItems: 'center' },
  deleteBtnText:     { fontSize: 13, fontWeight: '600', color: '#9B9FAE' },
  addMoreBtn:        { borderRadius: 14, overflow: 'hidden' },
  addMoreGrad:       { padding: 15, alignItems: 'center' },
  addMoreText:       { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  // Form
  formScroll:        { padding: 16, gap: 14 },
  card:              { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(15,17,23,0.08)', shadowColor: '#000', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle:         { fontSize: 15, fontWeight: '800', color: '#0F1117', marginBottom: 4 },
  cardSub:           { fontSize: 12, color: '#9B9FAE', marginBottom: 10, lineHeight: 17 },
  label:             { fontSize: 13, fontWeight: '600', color: '#5A5F72', marginTop: 10, marginBottom: 4 },
  input:             { borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 12, padding: 13, fontSize: 15, color: '#0F1117', backgroundColor: '#FAFAF8' },
  textArea:          { minHeight: 80, textAlignVertical: 'top' },
  ageRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  ageBtn:            { width: 44, height: 36, borderRadius: 10, backgroundColor: '#F5F4F0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E2DA' },
  ageBtnOn:          { backgroundColor: '#C93488', borderColor: '#C93488' },
  ageBtnText:        { fontSize: 12, fontWeight: '600', color: '#5A5F72' },
  ageBtnTextOn:      { color: '#FFFFFF', fontWeight: '800' },
  allergyChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F4F0', borderWidth: 1, borderColor: '#E5E2DA' },
  allergyChipOn:     { backgroundColor: '#FFF0F0', borderColor: '#C0392B' },
  allergyChipText:   { fontSize: 13, fontWeight: '600', color: '#5A5F72' },
  allergyChipTextOn: { color: '#C0392B', fontWeight: '700' },
  saveBtn:           { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  saveBtnGrad:       { padding: 17, alignItems: 'center' },
  saveBtnText:       { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
