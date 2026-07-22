// app/sitter-pending.tsx
// Shows real-time Checkr background check status, polls every 30s
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const CHECKR_API = 'https://sitters4me.com/api/checkr.php';

// Maps Checkr status → display config
const STATUS_CONFIG: Record<string, { icon: string; color: string; title: string; sub: string }> = {
  pending: {
    icon:  '⏳',
    color: '#02A4E2',
    title: 'Background Check Pending',
    sub:   'Check your email for a link from Checkr to complete your identity verification. This takes just a few minutes.',
  },
  processing: {
    icon:  '🔍',
    color: '#9B5BAB',
    title: 'Check In Progress',
    sub:   'You\'ve submitted your info — Checkr is now running your background check. This usually takes 1–3 business days.',
  },
  clear: {
    icon:  '✅',
    color: '#1A7F6E',
    title: 'Background Check Cleared!',
    sub:   'Your background check came back clear. Your account is now active — log in to start accepting jobs!',
  },
  consider: {
    icon:  '⚠️',
    color: '#F59E0B',
    title: 'Under Manual Review',
    sub:   'Your background check flagged some items for review. Our team will make a decision within 1–3 business days and notify you by email.',
  },
  suspended: {
    icon:  '🚫',
    color: '#EF4444',
    title: 'Check Suspended',
    sub:   'Your background check has been suspended. Please contact support at support@sitters4me.com for assistance.',
  },
  dispute: {
    icon:  '📋',
    color: '#6B7280',
    title: 'Dispute Filed',
    sub:   'A dispute has been filed on your background check. Checkr will contact you directly to resolve it.',
  },
};

export default function SitterPending() {
  const router = useRouter();
  const user   = (global as any).currentUser || {};

  const [checkrStatus,   setCheckrStatus]   = useState<string>('pending');
  const [accountActive,  setAccountActive]  = useState(false);
  const [invitationUrl,  setInvitationUrl]  = useState<string | null>(
    user.checkr_invitation_url || null
  );
  const [polling,        setPolling]        = useState(false);
  const [lastChecked,    setLastChecked]    = useState<Date | null>(null);

  const checkStatus = useCallback(async (showSpinner = false) => {
    if (!user.id) return;
    if (showSpinner) setPolling(true);
    try {
      const res = await axios.post(`${CHECKR_API}?action=get_check_status`, {
        sitter_id: user.id,
      });
      if (res.data?.success) {
        const d = res.data.data;
        setCheckrStatus(d.checkr_status || 'pending');
        setAccountActive(d.account_status === 'active' && d.bgcheck === 'Y');
        if (d.invitation_url) setInvitationUrl(d.invitation_url);
        setLastChecked(new Date());
      }
    } catch {}
    finally { setPolling(false); }
  }, [user.id]);

  // Poll every 30 seconds while on this screen
  useEffect(() => {
    checkStatus(false);
    const interval = setInterval(() => checkStatus(false), 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const cfg = STATUS_CONFIG[checkrStatus] || STATUS_CONFIG.pending;

  const stepStates = [
    { label: 'Application submitted', done: true },
    {
      label: checkrStatus === 'pending'
        ? 'Complete Checkr invite (check email)'
        : checkrStatus === 'processing' ? 'Identity verified — check running'
        : checkrStatus === 'clear'      ? 'Background check passed ✓'
        : checkrStatus === 'consider'   ? 'Under manual review'
        : checkrStatus === 'suspended'  ? 'Check suspended'
        : 'Background check',
      done:    ['processing','clear','consider'].includes(checkrStatus),
      active:  checkrStatus === 'pending',
      warning: ['consider','suspended','dispute'].includes(checkrStatus),
    },
    {
      label: 'Account activated — start earning! 🎉',
      done:  accountActive,
      dim:   !accountActive,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient
        colors={['#C93488', '#9B5BAB', '#5A7EC4', '#02A4E2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <View style={{ height: 40 }} />
        <View style={s.card}>
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Image source={require('../assets/logo.jpg')} style={s.logo} resizeMode="contain" />

            {/* Status icon */}
            <View style={[s.iconWrap, { backgroundColor: cfg.color + '18' }]}>
              <Text style={s.iconEmoji}>{cfg.icon}</Text>
            </View>

            <Text style={s.title}>{cfg.title}</Text>
            <Text style={s.sub}>{cfg.sub}</Text>

            {/* Progress steps */}
            <View style={s.steps}>
              {stepStates.map((step, i) => (
                <View key={i} style={s.step}>
                  <View style={[
                    s.dot,
                    step.done    ? s.dotDone    :
                    step.active  ? s.dotActive  :
                    step.warning ? s.dotWarn    :
                    s.dotDim
                  ]} />
                  <Text style={[s.stepText, step.dim && { color: '#9B9FAE' }]}>
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Open Checkr invitation button (shown while pending) */}
            {checkrStatus === 'pending' && invitationUrl && (
              <TouchableOpacity
                style={s.checkrBtn}
                onPress={() => Linking.openURL(invitationUrl!)}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#02A4E2', '#0270C8']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.checkrBtnGrad}
                >
                  <Text style={s.checkrBtnText}>🔗 Open Checkr Verification</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Re-check status button */}
            <TouchableOpacity
              style={s.refreshBtn}
              onPress={() => checkStatus(true)}
              disabled={polling}
            >
              {polling
                ? <ActivityIndicator color="#C93488" size="small" />
                : <Text style={s.refreshBtnText}>🔄 Refresh Status</Text>
              }
            </TouchableOpacity>

            {/* Last checked timestamp */}
            {lastChecked && (
              <Text style={s.lastChecked}>
                Last checked: {lastChecked.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </Text>
            )}

            {/* Account active — go to home */}
            {accountActive && (
              <TouchableOpacity
                onPress={() => router.replace('/sitter-home')}
                activeOpacity={0.88}
                style={{ marginTop: 8, alignSelf: 'stretch' }}
              >
                <LinearGradient
                  colors={['#1A7F6E', '#0D5C51']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.checkrBtnGrad}
                >
                  <Text style={s.checkrBtnText}>🎉 Go to Dashboard</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Help text */}
            <Text style={s.helpText}>
              Didn't get the Checkr email?{'\n'}
              Check your spam folder or contact{' '}
              <Text
                style={{ color: '#02A4E2' }}
                onPress={() => Linking.openURL('mailto:support@sitters4me.com')}
              >
                support@sitters4me.com
              </Text>
            </Text>

            <TouchableOpacity
              onPress={() => router.replace('/sitter-login')}
              style={{ marginTop: 16 }}
            >
              <Text style={s.backLink}>← Back to Sign In</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card:         { flex: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  scrollContent:{ padding: 28, alignItems: 'center', paddingBottom: 40 },
  logo:         { width: 130, height: 90, marginBottom: 8 },
  iconWrap:     { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  iconEmoji:    { fontSize: 44 },
  title:        { fontSize: 22, fontWeight: '900', color: '#0F1117', textAlign: 'center', marginBottom: 10, letterSpacing: -0.4 },
  sub:          { fontSize: 14, color: '#5A5F72', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  steps:        { backgroundColor: '#F5F4F0', borderRadius: 14, padding: 18, gap: 14, alignSelf: 'stretch', marginBottom: 20 },
  step:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot:          { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  dotDone:      { backgroundColor: '#1A7F6E' },
  dotActive:    { backgroundColor: '#02A4E2' },
  dotWarn:      { backgroundColor: '#F59E0B' },
  dotDim:       { backgroundColor: '#D1D5DB' },
  stepText:     { fontSize: 13, color: '#0F1117', fontWeight: '500', flex: 1 },
  checkrBtn:    { alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  checkrBtnGrad:{ padding: 15, alignItems: 'center' },
  checkrBtnText:{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  refreshBtn:   { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E2DA', marginBottom: 8 },
  refreshBtnText:{ fontSize: 13, fontWeight: '700', color: '#5A5F72' },
  lastChecked:  { fontSize: 11, color: '#9B9FAE', marginBottom: 16 },
  helpText:     { fontSize: 12, color: '#9B9FAE', textAlign: 'center', lineHeight: 20, marginTop: 16 },
  backLink:     { color: '#9B9FAE', fontSize: 14, textAlign: 'center' },
});
