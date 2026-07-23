// app/sitter-availability.tsx
// Sitter sets their weekly availability — day on/off + start/end time per day
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Half-hour time slots 5:00 AM → 11:30 PM
const TIME_SLOTS: string[] = [];
for (let h = 5; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 23) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(':').map(Number);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
};

type DayState = { on: boolean; start: string; end: string };
type Schedule = DayState[];

const DEFAULT_DAY: DayState = { on: false, start: '09:00', end: '18:00' };

const defaultSchedule = (): Schedule =>
  Array.from({ length: 7 }, (_, i) => ({
    on:    i >= 1 && i <= 5, // Mon–Fri default on
    start: '09:00',
    end:   '18:00',
  }));

export default function SitterAvailability() {
  const router = useRouter();
  const user   = (global as any).currentUser || {};

  const [schedule, setSchedule] = useState<Schedule>(defaultSchedule());
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [picker,   setPicker]   = useState<{ dayIdx: number; field: 'start' | 'end' } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!user.id) { setLoading(false); return; }
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_availability`, {
        sitter_id: user.id,
      });
      if (res.data?.success && res.data?.data?.availability) {
        const raw = res.data.data.availability;
        const sched = defaultSchedule();
        for (let d = 0; d <= 6; d++) {
          const day = raw[d] ?? raw[String(d)];
          if (day) {
            sched[d] = {
              on:    !!day.on,
              start: day.start || '09:00',
              end:   day.end   || '18:00',
            };
          }
        }
        setSchedule(sched);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const availability: Record<number, any> = {};
      schedule.forEach((d, i) => {
        availability[i] = d.on ? { on: true, start: d.start, end: d.end } : { on: false };
      });
      const res = await axios.post(`${JOBS_API}?action=save_sitter_availability`, {
        sitter_id:    user.id,
        availability,
      });
      if (res.data?.success) {
        Alert.alert('✅ Saved', 'Your availability has been updated.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', res.data?.error || 'Could not save. Please try again.');
      }
    } catch {
      Alert.alert('Connection Error', 'Could not reach the server. Please check your internet.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (idx: number) => {
    setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, on: !d.on } : d));
  };

  const setTime = (dayIdx: number, field: 'start' | 'end', value: string) => {
    setSchedule(prev => prev.map((d, i) => i === dayIdx ? { ...d, [field]: value } : d));
    setPicker(null);
  };

  // Copy Mon schedule to all weekdays
  const copyMonToWeekdays = () => {
    const mon = schedule[1];
    setSchedule(prev => prev.map((d, i) =>
      i >= 1 && i <= 5 ? { ...d, on: mon.on, start: mon.start, end: mon.end } : d
    ));
  };

  const onDaysCount = schedule.filter(d => d.on).length;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <LinearGradient colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Text style={s.backBtnText}>‹ Back</Text></TouchableOpacity>
            <Text style={s.headerTitle}>My Availability</Text>
            <View style={{ width: 60 }} />
          </View>
        </LinearGradient>
        <View style={s.loadingBox}><ActivityIndicator color="#C93488" size="large" /></View>
      </SafeAreaView>
    );
  }

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
          <Text style={s.headerTitle}>My Availability</Text>
          <View style={{ width: 60 }} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info banner */}
        <View style={s.infoBanner}>
          <Text style={s.infoBannerIcon}>📅</Text>
          <Text style={s.infoBannerText}>
            Parents see your availability before requesting you. You'll only be notified for jobs that fall within your available hours.
          </Text>
        </View>

        {/* Summary chips */}
        <View style={s.summaryRow}>
          {DAY_SHORT.map((d, i) => (
            <View key={i} style={[s.summaryChip, schedule[i].on && s.summaryChipOn]}>
              <Text style={[s.summaryChipText, schedule[i].on && s.summaryChipTextOn]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={s.summaryLabel}>
          {onDaysCount === 0 ? 'No days selected' : `Available ${onDaysCount} day${onDaysCount !== 1 ? 's' : ''} a week`}
        </Text>

        {/* Copy weekdays shortcut */}
        <TouchableOpacity style={s.copyBtn} onPress={copyMonToWeekdays} activeOpacity={0.8}>
          <Text style={s.copyBtnText}>⚡ Copy Monday hours to all weekdays</Text>
        </TouchableOpacity>

        {/* Day cards */}
        {schedule.map((day, idx) => (
          <View key={idx} style={[s.dayCard, !day.on && s.dayCardOff]}>
            <View style={s.dayRow}>
              <View style={s.dayLeft}>
                <Text style={[s.dayName, !day.on && s.dayNameOff]}>{DAYS[idx]}</Text>
                {day.on && (
                  <Text style={s.dayHours}>{fmt12(day.start)} – {fmt12(day.end)}</Text>
                )}
              </View>
              <Switch
                value={day.on}
                onValueChange={() => toggle(idx)}
                trackColor={{ false: '#E5E2DA', true: '#02A4E2' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E2DA"
              />
            </View>

            {day.on && (
              <View style={s.timeRow}>
                {/* Start time */}
                <View style={s.timeBlock}>
                  <Text style={s.timeLabel}>FROM</Text>
                  <TouchableOpacity
                    style={s.timeBtn}
                    onPress={() => setPicker({ dayIdx: idx, field: 'start' })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.timeBtnText}>{fmt12(day.start)}</Text>
                    <Text style={s.timeBtnChevron}>▾</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.timeSep}>—</Text>

                {/* End time */}
                <View style={s.timeBlock}>
                  <Text style={s.timeLabel}>TO</Text>
                  <TouchableOpacity
                    style={s.timeBtn}
                    onPress={() => setPicker({ dayIdx: idx, field: 'end' })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.timeBtnText}>{fmt12(day.end)}</Text>
                    <Text style={s.timeBtnChevron}>▾</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}

        {/* Save */}
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={[s.saveWrap, saving && { opacity: 0.6 }]}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#ED1E76', '#C93488', '#9B5BAB']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.saveBtn}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={s.saveBtnText}>Save Availability</Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Time picker bottom sheet ── */}
      {picker && (
        <TouchableOpacity
          style={s.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPicker(null)}
        >
          <TouchableOpacity activeOpacity={1} style={s.pickerSheet} onPress={() => {}}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>
                {picker.field === 'start' ? 'Start Time' : 'End Time'} — {DAY_SHORT[picker.dayIdx]}
              </Text>
              <TouchableOpacity onPress={() => setPicker(null)}>
                <Text style={s.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: 280 }}
              showsVerticalScrollIndicator={false}
            >
              {TIME_SLOTS.map(slot => {
                const dayState = schedule[picker.dayIdx];
                const isSelected =
                  picker.field === 'start' ? dayState.start === slot : dayState.end === slot;
                // For end time, disable slots that aren't after start
                const isDisabled =
                  picker.field === 'end' && slot <= dayState.start;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[s.pickerItem, isSelected && s.pickerItemSelected, isDisabled && s.pickerItemDisabled]}
                    onPress={() => !isDisabled && setTime(picker.dayIdx, picker.field, slot)}
                    activeOpacity={isDisabled ? 1 : 0.7}
                  >
                    <Text style={[s.pickerItemText, isSelected && s.pickerItemTextSelected, isDisabled && { color: '#D9D6CE' }]}>
                      {fmt12(slot)}
                    </Text>
                    {isSelected && <Text style={s.pickerItemCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#F5F4F0' },
  header:              { paddingBottom: 16 },
  headerRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  backBtn:             { width: 60, paddingVertical: 6 },
  backBtnText:         { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerTitle:         { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },

  loadingBox:          { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll:              { padding: 16, gap: 12 },

  infoBanner:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EAF5FD', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(2,164,226,0.2)' },
  infoBannerIcon:      { fontSize: 22 },
  infoBannerText:      { flex: 1, fontSize: 13, color: '#1C5EA8', lineHeight: 20 },

  summaryRow:          { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 4 },
  summaryChip:         { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E2DA' },
  summaryChipOn:       { backgroundColor: '#02A4E2', borderColor: '#02A4E2' },
  summaryChipText:     { fontSize: 11, fontWeight: '700', color: '#9B9FAE' },
  summaryChipTextOn:   { color: '#FFFFFF' },
  summaryLabel:        { textAlign: 'center', fontSize: 13, color: '#5A5F72', fontWeight: '600' },

  copyBtn:             { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#02A4E2' },
  copyBtnText:         { fontSize: 13, fontWeight: '700', color: '#02A4E2' },

  dayCard:             { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#E5E2DA', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  dayCardOff:          { backgroundColor: '#FAFAF8', borderColor: '#EDEBE5' },
  dayRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLeft:             { flex: 1 },
  dayName:             { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  dayNameOff:          { color: '#9B9FAE' },
  dayHours:            { fontSize: 12, color: '#02A4E2', fontWeight: '600', marginTop: 2 },

  timeRow:             { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 },
  timeBlock:           { flex: 1 },
  timeLabel:           { fontSize: 10, fontWeight: '800', color: '#9B9FAE', letterSpacing: 0.8, marginBottom: 5 },
  timeBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F4F0', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E5E2DA' },
  timeBtnText:         { fontSize: 14, fontWeight: '700', color: '#0F1117' },
  timeBtnChevron:      { fontSize: 12, color: '#9B9FAE', marginLeft: 6 },
  timeSep:             { fontSize: 16, color: '#C5C2BA', fontWeight: '300', paddingTop: 18 },

  saveWrap:            { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveBtn:             { padding: 17, alignItems: 'center' },
  saveBtnText:         { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  // Time picker bottom sheet
  pickerOverlay:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:         { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  pickerHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0EEE9' },
  pickerTitle:         { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  pickerClose:         { fontSize: 18, color: '#9B9FAE', paddingLeft: 16 },
  pickerItem:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F5F4F0' },
  pickerItemSelected:  { backgroundColor: '#EAF5FD' },
  pickerItemDisabled:  { backgroundColor: '#FAFAF8' },
  pickerItemText:      { fontSize: 15, color: '#0F1117', fontWeight: '600' },
  pickerItemTextSelected: { color: '#02A4E2', fontWeight: '800' },
  pickerItemCheck:     { fontSize: 15, color: '#02A4E2', fontWeight: '900' },
});
