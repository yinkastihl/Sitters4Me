// app/parent-payment-settings.tsx
// Parent saves / manages their payment card
// Works in Expo Go — uses expo-web-browser (no native Stripe SDK)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';

const STRIPE_API = 'https://sitters4me.com/api/stripe.php';
const JOBS_API   = 'https://sitters4me.com/api/jobs.php';

// Hosted payment setup page (upload payment-setup.html to your server)
const PAYMENT_SETUP_URL = 'https://sitters4me.com/payment-setup.html';

export default function ParentPaymentSettings() {
  const router = useRouter();
  const user   = global.currentUser || {};

  const [loading, setLoading]     = useState(false);
  const [hasCard, setHasCard]     = useState(false);
  const [cardInfo, setCardInfo]   = useState<any>(null);
  const [checking, setChecking]   = useState(true);
  const [history, setHistory]     = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    checkPaymentMethod();
    loadPaymentHistory();
  }, []);

  // ── Check if parent already has a saved card ──────────────────
  const checkPaymentMethod = async () => {
    setChecking(true);
    try {
      const res = await axios.post(`${STRIPE_API}?action=get_payment_method`, {
        parent_id: user.id,
      });
      if (res.data?.success && res.data?.data?.has_card) {
        setHasCard(true);
        setCardInfo(res.data.data);
      } else {
        setHasCard(false);
        setCardInfo(null);
      }
    } catch {
      // If endpoint doesn't exist yet — assume no card
      setHasCard(false);
    } finally {
      setChecking(false);
    }
  };

  // ── Load last 10 payments ──────────────────────────────────────
  const loadPaymentHistory = async () => {
    setHistLoading(true);
    try {
      const res = await axios.post(`${STRIPE_API}?action=payment_history`, {
        parent_id: user.id,
      });
      if (res.data?.success) {
        setHistory(res.data.data?.slice(0, 10) || []);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  };

  // ── Open Stripe card setup in browser ─────────────────────────
  const openCardSetup = async () => {
    if (!user.id) {
      Alert.alert('Error', 'Please log in again and try.');
      return;
    }
    setLoading(true);
    try {
      // Step 1: Create SetupIntent + Stripe Customer on server
      const res = await axios.post(`${STRIPE_API}?action=setup_intent`, {
        parent_id: user.id,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Could not start card setup. Please try again.');
      }

      const { client_secret, publishable_key } = res.data.data;

      // Step 2: Build the URL for the hosted card page
      const setupUrl = `${PAYMENT_SETUP_URL}?cs=${encodeURIComponent(client_secret)}&pk=${encodeURIComponent(publishable_key)}&pid=${user.id}`;

      setLoading(false);

      // Step 3: Open in browser — user enters card and Stripe confirms setup
      const result = await WebBrowser.openBrowserAsync(setupUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: '#C93488',
        toolbarColor: '#FFFFFF',
        showTitle: false,
      });

      // Step 4: After browser closes, re-check payment method status
      if (result.type === 'dismiss' || result.type === 'cancel') {
        // Small delay to let Stripe finalize, then re-check
        setTimeout(() => {
          checkPaymentMethod();
          loadPaymentHistory();
        }, 1500);
      }

    } catch (e: any) {
      setLoading(false);
      Alert.alert(
        'Setup Error',
        e.message || 'Could not open card setup. Please check your connection and try again.'
      );
    }
  };

  const fmtAmount = (n: any) => `$${parseFloat(n || 0).toFixed(2)}`;
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <SafeAreaView style={s.container}>
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
            <Text style={s.headerTitle}>Payment Settings</Text>
            <Text style={s.headerSub}>Manage your payment method</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Payment method card ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Payment Method</Text>

          {checking ? (
            <View style={s.checkingBox}>
              <ActivityIndicator color="#C93488" />
              <Text style={s.checkingText}>Checking saved cards...</Text>
            </View>
          ) : hasCard ? (
            // Has a saved card
            <View style={s.cardBox}>
              <View style={s.cardTop}>
                <View style={s.cardIconBox}>
                  <Text style={s.cardIcon}>💳</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardLabel}>
                    {cardInfo?.brand ? cardInfo.brand.toUpperCase() : 'Card'} ···· {cardInfo?.last4 || '••••'}
                  </Text>
                  <Text style={s.cardMeta}>
                    Expires {cardInfo?.exp_month || '—'}/{cardInfo?.exp_year || '—'}
                  </Text>
                </View>
                <View style={s.savedBadge}>
                  <Text style={s.savedBadgeText}>✓ Active</Text>
                </View>
              </View>
              <View style={s.secureRow}>
                <Text style={s.secureText}>🔒  Secured by Stripe · Payments are automatic</Text>
              </View>
              <TouchableOpacity style={s.changeBtn} onPress={openCardSetup} activeOpacity={0.85}>
                <Text style={s.changeBtnText}>Update Card</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // No card saved
            <View style={s.noCardBox}>
              <Text style={s.noCardIcon}>💳</Text>
              <Text style={s.noCardTitle}>No Payment Method Saved</Text>
              <Text style={s.noCardSub}>
                Add a card so sitters are paid automatically when a job ends.
                Your card is stored securely by Stripe — we never see your card number.
              </Text>

              <View style={s.howRow}>
                {[
                  { step: '1', text: 'Tap "Add Card" below' },
                  { step: '2', text: 'Enter card in the secure form' },
                  { step: '3', text: 'Sitters are paid automatically at job end' },
                ].map(item => (
                  <View key={item.step} style={s.howItem}>
                    <View style={s.howNum}>
                      <Text style={s.howNumText}>{item.step}</Text>
                    </View>
                    <Text style={s.howText}>{item.text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={openCardSetup} activeOpacity={0.85} disabled={loading}>
                <LinearGradient
                  colors={['#C93488', '#9B5BAB']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[s.addBtn, loading && { opacity: 0.6 }]}
                >
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={s.addBtnText}>💳  Add Card Securely</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── How payments work ──────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>How Payments Work</Text>
          <View style={s.infoCard}>
            {[
              { icon: '✅', title: 'Automatic at job end',    desc: 'When the sitter taps "End Job", your card is charged automatically — no action needed.' },
              { icon: '🔒', title: 'Powered by Stripe',       desc: 'Your card is stored securely by Stripe (the same payment system used by Amazon, Google, and millions of businesses).' },
              { icon: '💰', title: '15% platform fee',        desc: 'Sitters4Me charges 15% to cover platform costs. You see the full amount charged before any job.' },
              { icon: '📧', title: 'Email receipt',           desc: 'You receive an email receipt from Stripe after each job is charged.' },
            ].map(item => (
              <View key={item.title} style={s.infoRow}>
                <Text style={s.infoIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoTitle}>{item.title}</Text>
                  <Text style={s.infoDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Payment history ─────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Payment History</Text>
          {histLoading ? (
            <ActivityIndicator color="#9B9FAE" style={{ marginVertical: 20 }} />
          ) : history.length === 0 ? (
            <View style={s.emptyHistory}>
              <Text style={s.emptyHistoryText}>No payments yet — your history will appear here after your first booking.</Text>
            </View>
          ) : (
            <View style={s.historyList}>
              {history.map((p, i) => (
                <View key={p.id || i} style={s.historyRow}>
                  <View style={s.historyLeft}>
                    <Text style={s.historyName}>
                      {p.sitter_fname} {p.sitter_lname}
                    </Text>
                    <Text style={s.historyDate}>{fmtDate(p.created_at)}</Text>
                    <Text style={s.historyMeta}>
                      {parseFloat(p.hours_worked || 0).toFixed(1)} hrs · {p.kids || 1} child{p.kids !== 1 ? 'ren' : ''}
                    </Text>
                  </View>
                  <View style={s.historyRight}>
                    <Text style={s.historyAmount}>{fmtAmount(p.amount_usd)}</Text>
                    <View style={[s.historyStatus,
                      p.status === 'succeeded' && s.historyStatusSuccess,
                      p.status === 'failed'    && s.historyStatusFail,
                      p.status === 'refunded'  && s.historyStatusRefund,
                    ]}>
                      <Text style={[s.historyStatusText,
                        p.status === 'succeeded' && { color: '#1A7F6E' },
                        p.status === 'failed'    && { color: '#BF3B2E' },
                        p.status === 'refunded'  && { color: '#F5A623' },
                      ]}>
                        {p.status === 'succeeded' ? '✓ Paid' :
                         p.status === 'failed'    ? '✕ Failed' :
                         p.status === 'refunded'  ? '↩ Refunded' : p.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F5F4F0' },
  header:             { paddingBottom: 16 },
  headerRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  backBtn:            { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:           { fontSize: 32, color: '#FFFFFF', fontWeight: '300' },
  headerTitle:        { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSub:          { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  scroll:             { flex: 1, marginTop: -16 },
  content:            { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 48, gap: 20 },
  section:            { gap: 12 },
  sectionTitle:       { fontSize: 17, fontWeight: '800', color: '#0F1117', letterSpacing: -0.2 },
  checkingBox:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20 },
  checkingText:       { fontSize: 14, color: '#9B9FAE' },

  // Has card
  cardBox:            { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: 'rgba(26,127,110,0.3)' },
  cardTop:            { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cardIconBox:        { width: 44, height: 44, backgroundColor: '#F5F4F0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardIcon:           { fontSize: 22 },
  cardLabel:          { fontSize: 16, fontWeight: '700', color: '#0F1117' },
  cardMeta:           { fontSize: 13, color: '#9B9FAE', marginTop: 2 },
  savedBadge:         { backgroundColor: '#D4EDE9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  savedBadgeText:     { fontSize: 12, fontWeight: '700', color: '#1A7F6E' },
  secureRow:          { backgroundColor: '#F5F4F0', borderRadius: 10, padding: 10, marginBottom: 12 },
  secureText:         { fontSize: 12, color: '#5A5F72', fontWeight: '600' },
  changeBtn:          { borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E2DA' },
  changeBtnText:      { fontSize: 14, fontWeight: '700', color: '#5A5F72' },

  // No card
  noCardBox:          { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  noCardIcon:         { fontSize: 48, textAlign: 'center' },
  noCardTitle:        { fontSize: 18, fontWeight: '800', color: '#0F1117', textAlign: 'center' },
  noCardSub:          { fontSize: 13, color: '#5A5F72', lineHeight: 20, textAlign: 'center' },
  howRow:             { gap: 10, backgroundColor: '#F5F4F0', borderRadius: 12, padding: 14 },
  howItem:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
  howNum:             { width: 26, height: 26, borderRadius: 13, backgroundColor: '#C93488', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howNumText:         { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  howText:            { fontSize: 13, color: '#5A5F72', fontWeight: '600', flex: 1 },
  addBtn:             { borderRadius: 14, padding: 16, alignItems: 'center', shadowColor: '#C93488', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  addBtnText:         { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Info card
  infoCard:           { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  infoRow:            { flexDirection: 'row', gap: 12 },
  infoIcon:           { fontSize: 22, width: 28, textAlign: 'center' },
  infoTitle:          { fontSize: 14, fontWeight: '700', color: '#0F1117', marginBottom: 2 },
  infoDesc:           { fontSize: 12, color: '#5A5F72', lineHeight: 18 },

  // History
  emptyHistory:       { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20, alignItems: 'center' },
  emptyHistoryText:   { fontSize: 13, color: '#9B9FAE', textAlign: 'center', lineHeight: 20 },
  historyList:        { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15,17,23,0.09)' },
  historyRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(15,17,23,0.07)' },
  historyLeft:        { flex: 1, gap: 2 },
  historyName:        { fontSize: 14, fontWeight: '700', color: '#0F1117' },
  historyDate:        { fontSize: 12, color: '#9B9FAE' },
  historyMeta:        { fontSize: 12, color: '#9B9FAE' },
  historyRight:       { alignItems: 'flex-end', gap: 4 },
  historyAmount:      { fontSize: 16, fontWeight: '800', color: '#0F1117' },
  historyStatus:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#F5F4F0' },
  historyStatusSuccess:{ backgroundColor: '#D4EDE9' },
  historyStatusFail:  { backgroundColor: '#FDE9E7' },
  historyStatusRefund:{ backgroundColor: '#FEF3E2' },
  historyStatusText:  { fontSize: 11, fontWeight: '700', color: '#9B9FAE' },
});
