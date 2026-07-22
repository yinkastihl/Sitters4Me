// app/reset-password.tsx
// Two-step password reset: (1) enter email → receive 6-digit code, (2) enter code + new password
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

export default function ResetPassword() {
  const router    = useRouter();
  const userType  = (global as any).resetUserType || 'parent'; // set before navigating

  // Step 1 state
  const [email,    setEmail]    = useState('');
  // Step 2 state
  const [code,     setCode]     = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confPass, setConfPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [step,     setStep]     = useState<1 | 2>(1);
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false); // shows resend link after first send

  const codeRef = useRef<TextInput>(null);

  // ── Step 1: request reset code ────────────────────────────────
  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@'))
      return Alert.alert('Invalid Email', 'Please enter a valid email address.');
    setLoading(true);
    try {
      await axios.post(`${JOBS_API}?action=forgot_password`, {
        email:     trimmed,
        user_type: userType,
      });
      // Always move to step 2 — server hides whether email exists (security)
      setSent(true);
      setStep(2);
      setTimeout(() => codeRef.current?.focus(), 400);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send code. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify code and set new password ──────────────────
  const resetPassword = async () => {
    if (code.length !== 6) return Alert.alert('Invalid Code', 'Please enter the 6-digit code from your email.');
    if (newPass.length < 8)  return Alert.alert('Too Short', 'Password must be at least 8 characters.');
    if (newPass !== confPass) return Alert.alert('Mismatch', 'Passwords do not match. Please re-enter.');
    setLoading(true);
    try {
      const res = await axios.post(`${JOBS_API}?action=reset_password`, {
        email:        email.trim().toLowerCase(),
        user_type:    userType,
        code:         code.trim(),
        new_password: newPass,
      });
      if (res.data?.success) {
        Alert.alert(
          '✅ Password Reset!',
          'Your password has been updated. Please log in with your new password.',
          [{ text: 'Go to Login', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Reset Failed', res.data?.error || 'Could not reset password. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const accentColor = userType === 'sitter' ? '#02A4E2' : '#C93488';
  const gradColors: [string, string, string, string] = userType === 'sitter'
    ? ['#02A4E2', '#0270C8', '#9B5BAB', '#C93488']
    : ['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2'];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Reset Password</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step indicators */}
        <View style={s.steps}>
          <View style={[s.stepDot, step >= 1 && s.stepDotActive]} />
          <View style={s.stepLine} />
          <View style={[s.stepDot, step >= 2 && s.stepDotActive]} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.card} keyboardShouldPersistTaps="handled">

            {step === 1 ? (
              /* ── STEP 1: Email ──────────────────────────────── */
              <>
                <Text style={s.stepTitle}>Forgot your password?</Text>
                <Text style={s.stepSub}>
                  Enter your email address and we'll send you a 6-digit reset code.
                </Text>

                <View style={s.field}>
                  <Text style={s.label}>EMAIL ADDRESS</Text>
                  <TextInput
                    style={s.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={sendCode}
                  />
                </View>

                <TouchableOpacity
                  style={[s.btn, loading && { opacity: 0.7 }]}
                  onPress={sendCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[accentColor, accentColor + 'CC']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btnGrad}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={s.btnText}>Send Reset Code →</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.back()} style={s.backLink}>
                  <Text style={s.backLinkText}>← Back to Login</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── STEP 2: Code + New Password ────────────────── */
              <>
                <Text style={s.stepTitle}>Check your email</Text>
                <Text style={s.stepSub}>
                  We sent a 6-digit code to{'\n'}
                  <Text style={{ fontWeight: '700', color: '#0F1117' }}>{email}</Text>
                </Text>

                {/* 6-digit code */}
                <View style={s.field}>
                  <Text style={s.label}>6-DIGIT CODE</Text>
                  <TextInput
                    ref={codeRef}
                    style={[s.input, s.codeInput]}
                    value={code}
                    onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor="#9B9FAE"
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="next"
                  />
                </View>

                {/* New password */}
                <View style={s.field}>
                  <Text style={s.label}>NEW PASSWORD</Text>
                  <View style={s.passRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginBottom: 0 }]}
                      value={newPass}
                      onChangeText={setNewPass}
                      placeholder="Minimum 8 characters"
                      placeholderTextColor="#9B9FAE"
                      secureTextEntry={!showPass}
                      returnKeyType="next"
                    />
                    <TouchableOpacity style={{ padding: 14 }} onPress={() => setShowPass(v => !v)}>
                      <Text style={{ fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm password */}
                <View style={s.field}>
                  <Text style={s.label}>CONFIRM PASSWORD</Text>
                  <TextInput
                    style={s.input}
                    value={confPass}
                    onChangeText={setConfPass}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#9B9FAE"
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={resetPassword}
                  />
                  {confPass.length > 0 && newPass !== confPass && (
                    <Text style={s.mismatch}>Passwords don't match</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[s.btn, (loading || code.length < 6 || newPass.length < 8 || newPass !== confPass) && { opacity: 0.55 }]}
                  onPress={resetPassword}
                  disabled={loading || code.length < 6 || newPass.length < 8 || newPass !== confPass}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#1A7F6E', '#0D5C51']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.btnGrad}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={s.btnText}>✓  Reset My Password</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                {/* Resend link */}
                <TouchableOpacity
                  onPress={() => { setStep(1); setCode(''); setNewPass(''); setConfPass(''); }}
                  style={s.backLink}
                >
                  <Text style={s.backLinkText}>Didn't get the code? Try again</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:       { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  headerTitle:    { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  steps:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 16, gap: 0 },
  stepDot:        { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.35)' },
  stepDotActive:  { backgroundColor: '#FFFFFF' },
  stepLine:       { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', marginHorizontal: 6 },
  card:           { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 60, flexGrow: 1 },
  stepTitle:      { fontSize: 22, fontWeight: '900', color: '#0F1117', marginBottom: 8, letterSpacing: -0.3 },
  stepSub:        { fontSize: 14, color: '#5A5F72', lineHeight: 22, marginBottom: 24 },
  field:          { marginBottom: 16 },
  label:          { fontSize: 11, fontWeight: '700', color: '#5A5F72', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' },
  input:          { backgroundColor: '#F5F4F0', borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)', padding: 14, fontSize: 15, color: '#0F1117' },
  codeInput:      { fontSize: 26, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },
  passRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(15,17,23,0.1)' },
  mismatch:       { fontSize: 12, color: '#BF3B2E', marginTop: 4, fontWeight: '600' },
  btn:            { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  btnGrad:        { padding: 16, alignItems: 'center' },
  btnText:        { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  backLink:       { marginTop: 20, alignItems: 'center' },
  backLinkText:   { color: '#9B9FAE', fontSize: 14, fontWeight: '600' },
});
