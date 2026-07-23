// app/parent-profile-edit.tsx
// Parent can update name, phone, address, number of children, and profile photo
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, TextInput, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

export default function ParentProfileEdit() {
  const router = useRouter();
  const user   = (global as any).currentUser || {};

  const [fname,   setFname]   = useState<string>(user.fname   || '');
  const [lname,   setLname]   = useState<string>(user.lname   || '');
  const [phone,   setPhone]   = useState<string>(user.phone   || '');
  const [address, setAddress] = useState<string>(user.address || '');
  const [kids,    setKids]    = useState<number>(parseInt(user.kids) || 1);
  const [photo,   setPhoto]   = useState<string | null>(null);

  const [saving,  setSaving]  = useState(false);

  const initials = `${(fname || '?')[0]}${(lname || '?')[0]}`.toUpperCase();
  const photoUri = photo
    || (user.image ? `https://sitters4me.com/uploads/${user.image}` : null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to upload a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const saveProfile = async () => {
    if (!fname.trim() || !lname.trim()) {
      return Alert.alert('Required', 'Please enter your first and last name.');
    }
    setSaving(true);
    try {
      // Upload photo first if a new one was picked
      if (photo) {
        try {
          const response = await fetch(photo);
          const blob     = await response.blob();
          const b64: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
          });
          const uploadRes = await axios.post(`${JOBS_API}?action=upload_photo`, {
            user_type:    'parent',
            user_id:      user.id,
            image_base64: b64,
          });
          if (uploadRes.data?.success) {
            const filename = uploadRes.data.data?.filename;
            if (filename) (global as any).currentUser = { ...(global as any).currentUser, image: filename };
          }
        } catch { /* photo upload failure is non-fatal */ }
      }

      const res = await axios.post(`${JOBS_API}?action=update_parent_profile`, {
        parent_id: user.id,
        fname:     fname.trim(),
        lname:     lname.trim(),
        phone:     phone.trim(),
        address:   address.trim(),
        kids:      kids,
      });

      if (res.data?.success) {
        (global as any).currentUser = { ...(global as any).currentUser, ...res.data.data };
        Alert.alert('✅ Saved!', 'Your profile has been updated.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', res.data?.error || 'Could not save profile. Please try again.');
      }
    } catch {
      Alert.alert('Connection Error', 'Could not reach the server. Please check your internet connection.');
    } finally {
      setSaving(false);
    }
  };

  const adjustKids = (delta: number) => {
    setKids(prev => Math.max(1, Math.min(12, prev + delta)));
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
          <Text style={s.headerTitle}>Edit Profile</Text>
          <View style={{ width: 60 }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Avatar ── */}
          <TouchableOpacity style={s.avatarWrap} onPress={pickPhoto} activeOpacity={0.85}>
            {photoUri
              ? <Image source={{ uri: photoUri }} style={s.avatar} />
              : (
                <LinearGradient
                  colors={['#C93488', '#9B5BAB', '#02A4E2']}
                  style={s.avatarGrad}
                >
                  <Text style={s.avatarInitials}>{initials}</Text>
                </LinearGradient>
              )
            }
            <View style={s.cameraBadge}>
              <Text style={{ fontSize: 14 }}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Tap to change photo</Text>

          {/* ── Name (editable) ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Personal Details</Text>

            <Text style={s.label}>First Name</Text>
            <TextInput
              style={s.input}
              value={fname}
              onChangeText={setFname}
              placeholder="First name"
              placeholderTextColor="#9B9FAE"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={s.label}>Last Name</Text>
            <TextInput
              style={s.input}
              value={lname}
              onChangeText={setLname}
              placeholder="Last name"
              placeholderTextColor="#9B9FAE"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={s.label}>Phone Number</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. (713) 555-0100"
              placeholderTextColor="#9B9FAE"
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            <Text style={s.label}>Home Address</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 123 Main St, Houston, TX"
              placeholderTextColor="#9B9FAE"
              multiline
              numberOfLines={2}
              returnKeyType="done"
            />
          </View>

          {/* ── Account email (read-only) ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Account</Text>
            <Text style={s.label}>Email</Text>
            <View style={s.inputReadOnly}>
              <Text style={s.inputReadOnlyText}>{user.email || '—'}</Text>
            </View>
            <Text style={s.readOnlyNote}>To change your email, contact support.</Text>
          </View>

          {/* ── Children ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Children</Text>
            <Text style={s.label}>Number of Children</Text>
            <View style={s.stepper}>
              <TouchableOpacity style={s.stepBtn} onPress={() => adjustKids(-1)} activeOpacity={0.7}>
                <Text style={s.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.stepVal}>
                {kids} {kids === 1 ? 'child' : 'children'}
              </Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => adjustKids(+1)} activeOpacity={0.7}>
                <Text style={s.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.readOnlyNote}>
              You can provide exact ages when you request a sitter.
            </Text>
          </View>

          {/* ── Children Profiles shortcut ── */}
          <TouchableOpacity
            onPress={() => router.push('/children-profiles')}
            style={s.saveWrap}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#9B5BAB', '#7A3D8A']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.saveBtn}
            >
              <Text style={s.saveBtnText}>👶  Manage Children Profiles</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 8 }} />

          {/* ── Save button ── */}
          <TouchableOpacity
            onPress={saveProfile}
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
                : <Text style={s.saveBtnText}>Save Changes</Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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

  scroll:           { padding: 20, gap: 0 },

  avatarWrap:       { alignSelf: 'center', marginBottom: 6, position: 'relative' },
  avatar:           { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#C93488' },
  avatarGrad:       { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarInitials:   { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  cameraBadge:      { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#F0EEE9', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  avatarHint:       { textAlign: 'center', fontSize: 12, color: '#9B9FAE', marginBottom: 20 },

  section:          { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  sectionTitle:     { fontSize: 15, fontWeight: '800', color: '#0F1117', marginBottom: 14 },

  label:            { fontSize: 12, fontWeight: '700', color: '#9B9FAE', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
  input:            { borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: '#0F1117', backgroundColor: '#FAFAFA' },
  inputMulti:       { minHeight: 64, textAlignVertical: 'top' },
  inputReadOnly:    { borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#F5F4F0' },
  inputReadOnlyText:{ fontSize: 15, color: '#9B9FAE' },
  readOnlyNote:     { fontSize: 11, color: '#9B9FAE', marginTop: 6 },

  stepper:          { flexDirection: 'row', alignItems: 'center', gap: 0, borderWidth: 1.5, borderColor: '#E5E2DA', borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  stepBtn:          { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F4F0' },
  stepBtnText:      { fontSize: 22, fontWeight: '700', color: '#0F1117' },
  stepVal:          { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#0F1117' },

  saveWrap:         { borderRadius: 14, overflow: 'hidden', marginTop: 6 },
  saveBtn:          { padding: 17, alignItems: 'center' },
  saveBtnText:      { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
