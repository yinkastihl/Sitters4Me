// app/sitter-earnings.tsx — Earnings (weekly) + Job History tabs
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import axios from 'axios';

const JOBS_API = 'https://sitters4me.com/api/jobs.php';

// ── Helpers ────────────────────────────────────────────────────
const fmtMoney = (n: number) => `$${(n || 0).toFixed(2)}`;
const fmtHours = (h: any) => {
  const hrs = parseFloat(h || 0);
  const hh  = Math.floor(hrs);
  const mm  = Math.round((hrs - hh) * 60);
  return hh > 0 ? `${hh}h${mm > 0 ? ` ${mm}m` : ''}` : `${mm}m`;
};
const fmtElapsed = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
// Parse MySQL datetime string as UTC so device local time is shown correctly
const parseServerDt = (s: string): Date | null => {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  // Append Z only if no timezone info present — treats server time as UTC
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
};
const fmtDate = (s: string) => {
  const d = parseServerDt(s);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};
const fmtTime = (s: string) => {
  const d = parseServerDt(s);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
};
const fmtWeekRange = (weekStart: string) => {
  const start = new Date(weekStart + 'T00:00:00');
  const end   = new Date(start); end.setDate(start.getDate() + 5); // Sun → Fri
  return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
};
const payFridayFor = (weekStart: string) => {
  const start = new Date(weekStart + 'T00:00:00');
  const fri   = new Date(start); fri.setDate(start.getDate() + 12); // Sun + 12 = following Friday
  return fri.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
};

type Tab = 'earnings' | 'history' | 'reviews';

export default function SitterEarnings() {
  const router = useRouter();
  const user   = global.currentUser || {};
  // Support both id and u_id field names depending on what auth.php returns
  const sitterId = user.id || (user as any).u_id || 0;

  const [tab, setTab]                 = useState<Tab>('earnings');
  const [weeks, setWeeks]             = useState<any[]>([]);
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [nextPayDate, setNextPayDate] = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);
  // Per-tab errors — a failure in one tab doesn't block the other
  const [reviews,       setReviews]       = useState<any[]>([]);
  const [avgRating,     setAvgRating]     = useState(0);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [historyError,  setHistoryError]  = useState<string | null>(null);

  // Payout state
  const [available,     setAvailable]     = useState(0);
  const [totalPaid,     setTotalPaid]     = useState(0);
  const [totalPending,  setTotalPending]  = useState(0);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [requesting,    setRequesting]    = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setEarningsError(null);
    setHistoryError(null);

    if (!sitterId) {
      setEarningsError('Not logged in — sitter ID missing. Log out and back in.');
      setLoading(false); setRefreshing(false);
      return;
    }

    // ── Earnings (weekly) — independent of history ─────────────
    try {
      const res = await axios.post(`${JOBS_API}?action=sitter_weekly_earnings`, { sitter_id: sitterId });
      if (res.data?.success) {
        setWeeks(res.data.data.weeks || []);
        setNextPayDate(res.data.data.next_pay_date || '');
      } else {
        setEarningsError(res.data?.error || 'Could not load earnings');
      }
    } catch (e: any) {
      setEarningsError(e?.response?.data?.error || e?.message || 'Network error loading earnings');
    }

    // ── Reviews — from get_sitter_profile (returns reviews array) ──
    try {
      const res = await axios.post(`${JOBS_API}?action=get_sitter_profile`, { sitter_id: sitterId });
      if (res.data?.success) {
        setReviews(res.data.data?.reviews || []);
        setAvgRating(parseFloat(res.data.data?.avg_rating) || 0);
      }
    } catch { /* non-critical */ }

    // ── Job history — runs independently ──────────────────────
    try {
      const res = await axios.post(`${JOBS_API}?action=sitter_job_history`, { sitter_id: sitterId });
      if (res.data?.success) {
        setHistoryJobs(res.data.data || []);
      } else {
        setHistoryError(res.data?.error || 'Could not load job history');
      }
    } catch (e: any) {
      setHistoryError(e?.response?.data?.error || e?.message || 'Network error loading history');
    }

    // ── Payout history + available balance ────────────────────
    try {
      const res = await axios.post(`${JOBS_API}?action=get_payout_history`, { sitter_id: sitterId });
      if (res.data?.success) {
        const d = res.data.data;
        setAvailable(d.available   || 0);
        setTotalPaid(d.total_paid  || 0);
        setTotalPending(d.total_pending || 0);
        setPayoutHistory(d.requests || []);
      }
    } catch { /* non-critical */ }

    setLoading(false); setRefreshing(false);
  }, [sitterId]);

  useEffect(() => { loadData(); }, []);

  // ── Aggregate stats ──────────────────────────────────────────
  const allPayments  = weeks.flatMap(w => w.jobs || []);
  const totalNet     = weeks.reduce((s, w) => s + (w.total_net   || 0), 0);
  const totalGross   = weeks.reduce((s, w) => s + (w.total_gross || 0), 0);
  const totalHours   = weeks.reduce((s, w) => s + (w.hours       || 0), 0);
  const thisWeekNet  = (weeks[0]?.total_net) || 0;

  // Job history totals (from the jobs table — includes jobs even if payment not yet processed)
  const historyTotal = historyJobs.reduce((s, j) => s + (j.net || 0), 0);
  const historyHours = historyJobs.reduce((s, j) => s + (j.hours || 0), 0);

  const displayNet   = totalNet   > 0 ? totalNet   : historyTotal;
  const displayHours = totalHours > 0 ? totalHours : historyHours;

  const requestPayout = () => {
    if (available < 1) {
      Alert.alert('No Balance', 'You have no available balance to withdraw yet.');
      return;
    }
    Alert.alert(
      '💸 Request Payout',
      `Request ${fmtMoney(available)} to your bank account?\n\nTypically processed within 1 business day.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Payout',
          onPress: async () => {
            setRequesting(true);
            try {
              const res = await axios.post(`${JOBS_API}?action=request_payout`, { sitter_id: sitterId });
              if (res.data?.success) {
                Alert.alert('✅ Payout Requested!', `${fmtMoney(res.data.data?.amount || available)} has been requested and will be sent to your bank within 1 business day.`);
                loadData(true);
              } else {
                Alert.alert('Error', res.data?.error || 'Could not request payout. Please try again.');
              }
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error || 'Connection error. Please try again.');
            } finally {
              setRequesting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#C93488','#9B5BAB','#5A7EC4','#02A4E2']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={s.headerTitle}>My Earnings</Text>
            <Text style={s.headerSub}>Pay cycle: Sun–Fri · Paid every Friday</Text>
          </View>
          <View style={{ width:36 }} />
        </View>

        {/* Stats strip */}
        {!loading && (
          <View style={s.headerStats}>
            <View style={s.hStat}>
              <Text style={s.hStatN}>{fmtMoney(displayNet)}</Text>
              <Text style={s.hStatL}>All-Time Earned</Text>
            </View>
            <View style={s.hStatDiv} />
            <View style={s.hStat}>
              <Text style={s.hStatN}>{fmtMoney(thisWeekNet)}</Text>
              <Text style={s.hStatL}>This Week</Text>
            </View>
            <View style={s.hStatDiv} />
            <View style={s.hStat}>
              <Text style={s.hStatN}>{historyJobs.length}</Text>
              <Text style={s.hStatL}>Total Jobs</Text>
            </View>
          </View>
        )}

        {/* Tab bar */}
        <View style={s.tabBar}>
          <TouchableOpacity style={[s.tabBtn, tab==='earnings' && s.tabBtnActive]} onPress={() => setTab('earnings')} activeOpacity={0.8}>
            <Text style={[s.tabBtnText, tab==='earnings' && s.tabBtnTextActive]}>💰 Pay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab==='history' && s.tabBtnActive]} onPress={() => setTab('history')} activeOpacity={0.8}>
            <Text style={[s.tabBtnText, tab==='history' && s.tabBtnTextActive]}>📋 History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab==='reviews' && s.tabBtnActive]} onPress={() => setTab('reviews')} activeOpacity={0.8}>
            <Text style={[s.tabBtnText, tab==='reviews' && s.tabBtnTextActive]}>⭐ Reviews</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#C93488" />}
      >
        {loading ? (
          <View style={s.loadBox}><ActivityIndicator size="large" color="#C93488" /><Text style={s.loadText}>Loading...</Text></View>
        ) : tab === 'earnings' ? (
          earningsError ? (
            <View style={s.errorBox}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.errorTitle}>Could Not Load Earnings</Text>
              <Text style={s.errorMsg}>{earningsError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => loadData(true)}>
                <Text style={s.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <EarningsTab
              weeks={weeks}
              nextPayDate={nextPayDate}
              totalGross={totalGross}
              totalNet={totalNet}
              totalHours={totalHours}
              jobCount={allPayments.length}
              expanded={expanded}
              setExpanded={setExpanded}
              router={router}
              available={available}
              totalPaid={totalPaid}
              totalPending={totalPending}
              payoutHistory={payoutHistory}
              requesting={requesting}
              requestPayout={requestPayout}
            />
          )
        ) : tab === 'history' ? (
          historyError ? (
            <View style={s.errorBox}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.errorTitle}>Could Not Load History</Text>
              <Text style={s.errorMsg}>{historyError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => loadData(true)}>
                <Text style={s.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <HistoryTab jobs={historyJobs} />
          )
        ) : (
          <ReviewsTab reviews={reviews} avgRating={avgRating} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── EARNINGS TAB ───────────────────────────────────────────────
function EarningsTab({ weeks, nextPayDate, totalGross, totalNet, totalHours, jobCount, expanded, setExpanded, router, available, totalPaid, totalPending, payoutHistory, requesting, requestPayout }: any) {
  if (weeks.length === 0) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyIcon}>💰</Text>
        <Text style={s.emptyTitle}>No Earnings Yet</Text>
        <Text style={s.emptySub}>Complete your first job to see your weekly earnings here. Go online and accept incoming requests!</Text>
        <TouchableOpacity style={s.goBtn} onPress={() => router.replace('/sitter-home')}>
          <Text style={s.goBtnText}>← Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <>
      {/* Next payday banner */}
      {nextPayDate && (
        <View style={s.payBanner}>
          <Text style={s.payBannerIcon}>📅</Text>
          <View style={{ flex:1 }}>
            <Text style={s.payBannerTitle}>Next Payday</Text>
            <Text style={s.payBannerDate}>
              {new Date(nextPayDate + 'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
            </Text>
            <Text style={s.payBannerSub}>For work done this Sunday–Friday</Text>
          </View>
        </View>
      )}

      {/* Direct deposit CTA */}
      <TouchableOpacity style={s.depositCta} onPress={() => router.push('/sitter-bank-setup')} activeOpacity={0.85}>
        <Text style={s.depositCtaIcon}>🏦</Text>
        <View style={{ flex:1 }}>
          <Text style={s.depositCtaTitle}>Set Up Direct Deposit</Text>
          <Text style={s.depositCtaSub}>Get paid straight to your bank every Friday</Text>
        </View>
        <Text style={s.depositCtaChevron}>›</Text>
      </TouchableOpacity>

      {/* ── PAYOUT CARD ─────────────────────────────────── */}
      <View style={s.payoutCard}>
        <View style={s.payoutTopRow}>
          <View>
            <Text style={s.payoutLabel}>Available to Withdraw</Text>
            <Text style={s.payoutAmount}>{fmtMoney(available)}</Text>
            {totalPending > 0 && (
              <Text style={s.payoutPending}>⏳ {fmtMoney(totalPending)} pending review</Text>
            )}
          </View>
          <TouchableOpacity
            style={[s.payoutBtn, (available < 1 || requesting) && s.payoutBtnDisabled]}
            onPress={requestPayout}
            disabled={available < 1 || requesting}
            activeOpacity={0.85}
          >
            {requesting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.payoutBtnText}>Withdraw</Text>
            }
          </TouchableOpacity>
        </View>
        <View style={s.payoutDivider} />
        <View style={s.payoutMetaRow}>
          <Text style={s.payoutMetaItem}>✅ Paid out: {fmtMoney(totalPaid)}</Text>
          <Text style={s.payoutMetaItem}>⏳ Pending: {fmtMoney(totalPending)}</Text>
        </View>

        {/* Payout history */}
        {payoutHistory.length > 0 && (
          <>
            <Text style={s.payoutHistTitle}>Payout History</Text>
            {payoutHistory.map((p: any, i: number) => {
              const statusColor = p.status === 'paid' ? '#1A7F6E' : p.status === 'pending' ? '#F5A623' : p.status === 'rejected' ? '#BF3B2E' : '#5A5F72';
              const statusIcon  = p.status === 'paid' ? '✅' : p.status === 'pending' ? '⏳' : p.status === 'rejected' ? '❌' : '✓';
              const dt = p.requested_at ? new Date(p.requested_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
              return (
                <View key={p.id || i} style={[s.payoutHistRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F0EEE9' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.payoutHistAmt}>{fmtMoney(p.amount)}</Text>
                    <Text style={s.payoutHistDate}>{dt}</Text>
                  </View>
                  <Text style={[s.payoutHistStatus, { color: statusColor }]}>{statusIcon} {p.status}</Text>
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* All-time summary */}
      <View style={s.summaryCard}>
        <Text style={s.summaryTitle}>All-Time Summary</Text>
        <View style={s.summaryGrid}>
          {[
            { label:'Gross Earned',   value: fmtMoney(totalGross) },
            { label:'Platform Fees',  value: fmtMoney(totalGross - totalNet) },
            { label:'Net Take-Home',  value: fmtMoney(totalNet)   },
            { label:'Hours Worked',   value: fmtHours(totalHours) },
            { label:'Jobs Completed', value: String(jobCount)     },
            { label:'Avg Rate',       value: jobCount > 0 && totalHours > 0 ? `$${(totalNet/totalHours).toFixed(2)}/hr` : '—' },
          ].map(item => (
            <View key={item.label} style={s.summaryCell}>
              <Text style={s.summaryCellVal}>{item.value}</Text>
              <Text style={s.summaryCellLbl}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Weekly breakdown */}
      <Text style={s.sectionTitle}>Weekly Breakdown</Text>
      {weeks.map((week: any, wi: number) => {
        const isOpen        = expanded === week.week_start;
        const isCurrentWeek = wi === 0;
        return (
          <View key={week.week_start} style={[s.weekCard, isCurrentWeek && s.weekCardCurrent]}>
            <TouchableOpacity style={s.weekHeader} onPress={() => setExpanded(isOpen ? null : week.week_start)} activeOpacity={0.8}>
              <View style={{ flex:1 }}>
                <View style={s.weekTitleRow}>
                  {isCurrentWeek && <View style={s.currentBadge}><Text style={s.currentBadgeText}>Current Week</Text></View>}
                  <Text style={s.weekRange}>{fmtWeekRange(week.week_start)}</Text>
                </View>
                <Text style={s.weekPayDate}>💳 Paid: {payFridayFor(week.week_start)}</Text>
                <Text style={s.weekMeta}>{week.jobs?.length || 0} job{(week.jobs?.length||0)!==1?'s':''} · {fmtHours(week.hours)}</Text>
              </View>
              <View style={s.weekRight}>
                <Text style={s.weekNet}>{fmtMoney(week.total_net)}</Text>
                <Text style={s.weekGross}>Gross: {fmtMoney(week.total_gross)}</Text>
                <Text style={s.weekChevron}>{isOpen ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={s.jobList}>
                {(week.jobs || []).map((job: any, ji: number) => {
                  const gross = parseFloat(job.amount_usd || 0);
                  const fee   = parseFloat(job.platform_fee_usd || 0);
                  const net   = gross - fee;
                  return (
                    <View key={ji} style={[s.jobItem, ji === (week.jobs.length-1) && s.jobItemLast]}>
                      <View style={s.jobItemLeft}>
                        <View style={s.jobDot} />
                        <View style={{ flex:1 }}>
                          <Text style={s.jobParent}>{job.parent_fname} {job.parent_lname}</Text>
                          <Text style={s.jobMeta}>
                            {fmtDate(job.created_at)} · {fmtHours(job.hours_worked)} · {job.kids||1} child{(job.kids||1)!==1?'ren':''}
                          </Text>
                          <Text style={s.jobRate}>
                            ${parseFloat(job.rate_per_hr||0).toFixed(0)}/hr · fee: {fmtMoney(fee)}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.jobNet}>{fmtMoney(net)}</Text>
                    </View>
                  );
                })}
                <View style={s.weekTotal}>
                  <Text style={s.weekTotalLabel}>Week total (net)</Text>
                  <Text style={s.weekTotalVal}>{fmtMoney(week.total_net)}</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ── JOB HISTORY TAB ───────────────────────────────────────────
function HistoryTab({ jobs }: { jobs: any[] }) {
  if (jobs.length === 0) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyIcon}>📋</Text>
        <Text style={s.emptyTitle}>No Jobs Yet</Text>
        <Text style={s.emptySub}>Your completed jobs will appear here with full details — hours, rate, parent, and what you earned.</Text>
      </View>
    );
  }
  return (
    <>
      {/* Summary strip */}
      <View style={s.histSummary}>
        <View style={s.histSumCell}>
          <Text style={s.histSumVal}>{jobs.length}</Text>
          <Text style={s.histSumLbl}>Jobs Done</Text>
        </View>
        <View style={s.hStatDiv} />
        <View style={s.histSumCell}>
          <Text style={s.histSumVal}>{fmtHours(jobs.reduce((a, j) => a + (j.hours || 0), 0))}</Text>
          <Text style={s.histSumLbl}>Total Hours</Text>
        </View>
        <View style={s.hStatDiv} />
        <View style={s.histSumCell}>
          <Text style={s.histSumVal}>{fmtMoney(jobs.reduce((a, j) => a + (j.net || j.gross || 0), 0))}</Text>
          <Text style={s.histSumLbl}>Total Earned</Text>
        </View>
      </View>

      {/* Job cards */}
      {jobs.map((job, i) => {
        const net       = job.net   || job.gross || 0;
        const gross     = job.gross || 0;
        const fee       = job.fee   || 0;
        const hours     = job.hours || 0;
        const rate      = job.rate_per_hr || 0;
        const kids      = job.kids  || 1;
        const paid      = job.payment_status === 'succeeded';
        const elapsedSecs = job.elapsed_secs || 0;
        return (
          <View key={job.id || i} style={s.histCard}>
            {/* Header row */}
            <View style={s.histCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.histParent}>{job.parent_name || `${job.parent_fname||''} ${job.parent_lname||''}`.trim() || 'Parent'}</Text>
                <Text style={s.histDate}>{fmtDate(job.start_time || job.post_time)}</Text>
              </View>
              <View style={[s.histBadge, paid ? s.histBadgePaid : s.histBadgePending]}>
                <Text style={[s.histBadgeText, paid ? { color: '#1A7F6E' } : { color: '#F5A623' }]}>
                  {paid ? '✓ Paid' : '⏳ Pending'}
                </Text>
              </View>
            </View>

            {/* Details grid */}
            <View style={s.histGrid}>
              <View style={s.histGridCell}>
                <Text style={s.histGridVal}>{fmtDate(job.start_time || job.post_time)}</Text>
                <Text style={s.histGridLbl}>Date</Text>
              </View>
              <View style={s.histGridCell}>
                <Text style={s.histGridVal}>
                  {elapsedSecs > 0 ? fmtElapsed(elapsedSecs) : fmtHours(hours)}
                </Text>
                <Text style={s.histGridLbl}>Duration</Text>
              </View>
              <View style={s.histGridCell}>
                <Text style={s.histGridVal}>{kids} child{kids !== 1 ? 'ren' : ''}</Text>
                <Text style={s.histGridLbl}>Children</Text>
              </View>
              <View style={s.histGridCell}>
                <Text style={s.histGridVal}>${parseFloat(String(rate||0)).toFixed(0)}/hr</Text>
                <Text style={s.histGridLbl}>Rate</Text>
              </View>
            </View>

            {/* Time range */}
            {job.start_time && (
              <View style={s.histTimeRow}>
                <Text style={s.histTimeText}>
                  ⏱ {fmtTime(job.start_time)}
                  {job.stop_time ? ` → ${fmtTime(job.stop_time)}` : ' (in progress)'}
                </Text>
                {job.address || job.city ? (
                  <Text style={s.histAddrText} numberOfLines={1}>
                    📍 {[job.address, job.city, job.state].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Earnings breakdown */}
            <View style={s.histEarnings}>
              <View style={s.histEarnRow}>
                <Text style={s.histEarnLabel}>Gross charged</Text>
                <Text style={s.histEarnVal}>{fmtMoney(gross)}</Text>
              </View>
              {fee > 0 && (
                <View style={s.histEarnRow}>
                  <Text style={s.histEarnLabel}>Platform fee (8%)</Text>
                  <Text style={[s.histEarnVal, { color: '#9B9FAE' }]}>−{fmtMoney(fee)}</Text>
                </View>
              )}
              <View style={[s.histEarnRow, s.histEarnRowTotal]}>
                <Text style={s.histNetLabel}>Your earnings</Text>
                <Text style={s.histNetVal}>{fmtMoney(net)}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </>
  );
}

// ── REVIEWS TAB ────────────────────────────────────────────────
function ReviewsTab({ reviews, avgRating }: { reviews: any[]; avgRating: number }) {
  const parseServerDt = (s: string): Date | null => {
    if (!s) return null;
    const iso = s.replace(' ', 'T');
    return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  };
  const fmtDate = (s: string) => {
    const d = parseServerDt(s);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  };

  if (reviews.length === 0) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyIcon}>⭐</Text>
        <Text style={s.emptyTitle}>No Reviews Yet</Text>
        <Text style={s.emptySub}>Complete jobs and ask parents to leave a review. A great rating helps you get more bookings!</Text>
      </View>
    );
  }

  const stars = (rating: number, size = 16) =>
    [1,2,3,4,5].map(i => (
      <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? '#F5A623' : '#D8D5CE' }}>★</Text>
    ));

  const dist = [5,4,3,2,1].map(n => ({
    star: n,
    count: reviews.filter(r => Math.round(r.rating) === n).length,
  }));

  return (
    <>
      {/* Rating summary card */}
      <View style={s.revSummary}>
        <View style={s.revSummaryLeft}>
          <Text style={s.revBigNum}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</Text>
          <View style={{ flexDirection: 'row', gap: 2, marginVertical: 4 }}>
            {stars(avgRating, 22)}
          </View>
          <Text style={s.revTotalLbl}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={s.revSummaryRight}>
          {dist.map(({ star, count }) => {
            const pct = reviews.length > 0 ? count / reviews.length : 0;
            return (
              <View key={star} style={s.revBarRow}>
                <Text style={s.revBarStar}>{star}★</Text>
                <View style={s.revBarBg}>
                  <View style={[s.revBarFill, { width: `${Math.round(pct * 100)}%` as any }]} />
                </View>
                <Text style={s.revBarCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Individual review cards */}
      {reviews.map((rev, i) => (
        <View key={rev.id || i} style={s.revCard}>
          <View style={s.revCardHeader}>
            <View style={s.revAv}>
              <Text style={s.revAvText}>{(rev.parent_fname || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.revName}>
                {rev.parent_fname} {rev.parent_lname ? rev.parent_lname[0] + '.' : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>{stars(rev.rating, 13)}</View>
                <Text style={s.revDate}>{fmtDate(rev.created_at)}</Text>
              </View>
            </View>
            <View style={s.revStarBadge}>
              <Text style={s.revStarBadgeText}>{rev.rating}</Text>
              <Text style={s.revStarBadgeIcon}>★</Text>
            </View>
          </View>
          {!!rev.review_text && (
            <Text style={s.revText}>"{rev.review_text}"</Text>
          )}
        </View>
      ))}
    </>
  );
}

// ── STYLES ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:          { flex:1, backgroundColor:'#F5F4F0' },
  header:             { paddingBottom:8 },
  headerRow:          { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingTop:12, paddingBottom:4 },
  backBtn:            { width:36, height:36, alignItems:'center', justifyContent:'center' },
  backText:           { fontSize:32, color:'#FFFFFF', fontWeight:'300' },
  headerTitle:        { fontSize:18, fontWeight:'900', color:'#FFFFFF' },
  headerSub:          { fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 },
  headerStats:        { flexDirection:'row', paddingHorizontal:20, paddingTop:12, paddingBottom:4 },
  hStat:              { flex:1, alignItems:'center' },
  hStatN:             { fontSize:21, fontWeight:'900', color:'#FFFFFF' },
  hStatL:             { fontSize:10, color:'rgba(255,255,255,0.7)', marginTop:2 },
  hStatDiv:           { width:1, backgroundColor:'rgba(255,255,255,0.25)', marginVertical:4 },

  // Tab bar
  tabBar:             { flexDirection:'row', marginHorizontal:16, marginTop:12, marginBottom:4, backgroundColor:'rgba(0,0,0,0.2)', borderRadius:12, padding:3, gap:3 },
  tabBtn:             { flex:1, paddingVertical:9, alignItems:'center', borderRadius:10 },
  tabBtnActive:       { backgroundColor:'#FFFFFF' },
  tabBtnText:         { fontSize:13, fontWeight:'700', color:'rgba(255,255,255,0.75)' },
  tabBtnTextActive:   { color:'#C93488' },

  scroll:             { flex:1 },
  content:            { paddingTop:16, paddingHorizontal:16, paddingBottom:48, gap:16 },
  loadBox:            { alignItems:'center', paddingVertical:60, gap:12 },
  loadText:           { fontSize:14, color:'#9B9FAE' },
  emptyBox:           { backgroundColor:'#FFFFFF', borderRadius:20, padding:32, alignItems:'center', gap:10 },
  emptyIcon:          { fontSize:56 },
  emptyTitle:         { fontSize:20, fontWeight:'900', color:'#0F1117' },
  emptySub:           { fontSize:13, color:'#5A5F72', textAlign:'center', lineHeight:20 },
  goBtn:              { marginTop:8, borderRadius:12, paddingVertical:12, paddingHorizontal:24, borderWidth:1.5, borderColor:'#E5E2DA' },
  goBtnText:          { fontSize:14, fontWeight:'700', color:'#5A5F72' },
  errorBox:           { backgroundColor:'#FFF3F0', borderRadius:16, padding:24, alignItems:'center', gap:10, borderWidth:1.5, borderColor:'rgba(191,59,46,0.2)', marginTop:8 },
  errorIcon:          { fontSize:40 },
  errorTitle:         { fontSize:17, fontWeight:'800', color:'#BF3B2E' },
  errorMsg:           { fontSize:12, color:'#BF3B2E', textAlign:'center', lineHeight:18, fontFamily:'monospace' },
  retryBtn:           { marginTop:8, borderRadius:10, paddingVertical:10, paddingHorizontal:24, backgroundColor:'#BF3B2E' },
  retryBtnText:       { fontSize:13, fontWeight:'700', color:'#FFFFFF' },

  // Earnings tab
  payBanner:          { backgroundColor:'#2C3E50', borderRadius:16, padding:16, flexDirection:'row', alignItems:'center', gap:12 },
  payBannerIcon:      { fontSize:28 },
  payBannerTitle:     { fontSize:12, fontWeight:'700', color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:0.8 },
  payBannerDate:      { fontSize:16, fontWeight:'900', color:'#FFFFFF', marginTop:2 },
  payBannerSub:       { fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 },
  depositCta:         { backgroundColor:'#FFFFFF', borderRadius:14, padding:16, flexDirection:'row', alignItems:'center', gap:12, borderWidth:1.5, borderColor:'rgba(201,52,136,0.2)' },
  depositCtaIcon:     { fontSize:26 },
  depositCtaTitle:    { fontSize:14, fontWeight:'700', color:'#0F1117' },
  depositCtaSub:      { fontSize:12, color:'#5A5F72', marginTop:2 },
  depositCtaChevron:  { fontSize:22, color:'#C93488', fontWeight:'700' },

  // Payout card
  payoutCard:         { backgroundColor:'#FFFFFF', borderRadius:16, padding:16, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  payoutTopRow:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  payoutLabel:        { fontSize:12, fontWeight:'700', color:'#9B9FAE', textTransform:'uppercase', letterSpacing:0.5 },
  payoutAmount:       { fontSize:28, fontWeight:'900', color:'#1A7F6E', marginTop:2 },
  payoutPending:      { fontSize:12, color:'#F5A623', fontWeight:'600', marginTop:2 },
  payoutBtn:          { backgroundColor:'#1A7F6E', borderRadius:12, paddingHorizontal:20, paddingVertical:12 },
  payoutBtnDisabled:  { backgroundColor:'#C5C2BA' },
  payoutBtnText:      { color:'#FFFFFF', fontSize:15, fontWeight:'800' },
  payoutDivider:      { height:1, backgroundColor:'#F0EEE9', marginVertical:12 },
  payoutMetaRow:      { flexDirection:'row', gap:16 },
  payoutMetaItem:     { fontSize:12, color:'#5A5F72', fontWeight:'600' },
  payoutHistTitle:    { fontSize:13, fontWeight:'800', color:'#0F1117', marginTop:14, marginBottom:8 },
  payoutHistRow:      { flexDirection:'row', alignItems:'center', paddingVertical:8 },
  payoutHistAmt:      { fontSize:15, fontWeight:'800', color:'#0F1117' },
  payoutHistDate:     { fontSize:11, color:'#9B9FAE', marginTop:2 },
  payoutHistStatus:   { fontSize:13, fontWeight:'700', textTransform:'capitalize' },

  summaryCard:        { backgroundColor:'#FFFFFF', borderRadius:16, padding:16, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  summaryTitle:       { fontSize:15, fontWeight:'800', color:'#0F1117', marginBottom:12 },
  summaryGrid:        { flexDirection:'row', flexWrap:'wrap', gap:10 },
  summaryCell:        { flex:1, minWidth:'28%', backgroundColor:'#F5F4F0', borderRadius:10, padding:10, alignItems:'center', gap:3 },
  summaryCellVal:     { fontSize:16, fontWeight:'900', color:'#0F1117' },
  summaryCellLbl:     { fontSize:10, color:'#9B9FAE', textAlign:'center', fontWeight:'600' },
  sectionTitle:       { fontSize:17, fontWeight:'800', color:'#0F1117' },
  weekCard:           { backgroundColor:'#FFFFFF', borderRadius:16, overflow:'hidden', borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  weekCardCurrent:    { borderColor:'rgba(201,52,136,0.3)', borderWidth:1.5 },
  weekHeader:         { flexDirection:'row', alignItems:'flex-start', padding:16, gap:12 },
  weekTitleRow:       { flexDirection:'row', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 },
  currentBadge:       { backgroundColor:'#FFF0F7', borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  currentBadgeText:   { fontSize:11, fontWeight:'700', color:'#C93488' },
  weekRange:          { fontSize:13, fontWeight:'700', color:'#0F1117' },
  weekPayDate:        { fontSize:12, color:'#5A5F72', marginBottom:2 },
  weekMeta:           { fontSize:12, color:'#9B9FAE' },
  weekRight:          { alignItems:'flex-end', gap:2 },
  weekNet:            { fontSize:20, fontWeight:'900', color:'#1A7F6E' },
  weekGross:          { fontSize:11, color:'#9B9FAE' },
  weekChevron:        { fontSize:13, color:'#9B9FAE', marginTop:4 },
  jobList:            { borderTopWidth:1, borderTopColor:'rgba(15,17,23,0.07)' },
  jobItem:            { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderBottomColor:'rgba(15,17,23,0.06)', gap:10 },
  jobItemLast:        { borderBottomWidth:0 },
  jobItemLeft:        { flex:1, flexDirection:'row', gap:10 },
  jobDot:             { width:8, height:8, borderRadius:4, backgroundColor:'#C93488', marginTop:5, flexShrink:0 },
  jobParent:          { fontSize:13, fontWeight:'700', color:'#0F1117' },
  jobMeta:            { fontSize:11, color:'#9B9FAE', marginTop:2 },
  jobRate:            { fontSize:11, color:'#5A5F72', marginTop:1 },
  jobNet:             { fontSize:15, fontWeight:'800', color:'#1A7F6E', paddingTop:2 },
  weekTotal:          { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:12, backgroundColor:'#F5F4F0' },
  weekTotalLabel:     { fontSize:13, fontWeight:'700', color:'#5A5F72' },
  weekTotalVal:       { fontSize:15, fontWeight:'900', color:'#1A7F6E' },

  // Job History tab
  histSummary:        { flexDirection:'row', backgroundColor:'#FFFFFF', borderRadius:16, padding:16, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  histSumCell:        { flex:1, alignItems:'center' },
  histSumVal:         { fontSize:20, fontWeight:'900', color:'#0F1117' },
  histSumLbl:         { fontSize:10, color:'#9B9FAE', marginTop:3, fontWeight:'600' },
  histCard:           { backgroundColor:'#FFFFFF', borderRadius:16, overflow:'hidden', borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  histCardHeader:     { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:16, paddingTop:16, paddingBottom:12, borderBottomWidth:1, borderBottomColor:'rgba(15,17,23,0.07)', gap:10 },
  histParent:         { fontSize:16, fontWeight:'800', color:'#0F1117' },
  histDate:           { fontSize:12, color:'#9B9FAE', marginTop:2 },
  histBadge:          { borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  histBadgePaid:      { backgroundColor:'#D4EDE9' },
  histBadgePending:   { backgroundColor:'#FFF8E7' },
  histBadgeText:      { fontSize:11, fontWeight:'700' },
  histGrid:           { flexDirection:'row', paddingHorizontal:12, paddingVertical:12, gap:4 },
  histGridCell:       { flex:1, alignItems:'center', backgroundColor:'#F5F4F0', borderRadius:10, padding:10 },
  histGridVal:        { fontSize:13, fontWeight:'800', color:'#0F1117', textAlign:'center' },
  histGridLbl:        { fontSize:10, color:'#9B9FAE', marginTop:2, textAlign:'center', fontWeight:'600' },
  histTimeRow:        { paddingHorizontal:16, paddingBottom:12, gap:4 },
  histTimeText:       { fontSize:12, color:'#5A5F72', fontWeight:'600' },
  histAddrText:       { fontSize:12, color:'#9B9FAE' },
  histEarnings:       { marginHorizontal:16, marginBottom:14, backgroundColor:'#F5F4F0', borderRadius:12, padding:12, gap:6 },
  histEarnRow:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  histEarnRowTotal:   { borderTopWidth:1, borderTopColor:'rgba(15,17,23,0.1)', paddingTop:8, marginTop:4 },
  histEarnLabel:      { fontSize:12, color:'#5A5F72', fontWeight:'600' },
  histEarnVal:        { fontSize:13, color:'#0F1117', fontWeight:'700' },
  histNetLabel:       { fontSize:13, fontWeight:'800', color:'#0F1117' },
  histNetVal:         { fontSize:18, fontWeight:'900', color:'#1A7F6E' },

  // Reviews tab
  revSummary:         { backgroundColor:'#FFFFFF', borderRadius:16, padding:16, flexDirection:'row', gap:16, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  revSummaryLeft:     { alignItems:'center', justifyContent:'center', width:80 },
  revBigNum:          { fontSize:44, fontWeight:'900', color:'#0F1117', lineHeight:48 },
  revTotalLbl:        { fontSize:11, color:'#9B9FAE', marginTop:2, fontWeight:'600' },
  revSummaryRight:    { flex:1, justifyContent:'center', gap:5 },
  revBarRow:          { flexDirection:'row', alignItems:'center', gap:6 },
  revBarStar:         { fontSize:11, color:'#9B9FAE', width:20, textAlign:'right' },
  revBarBg:           { flex:1, height:6, backgroundColor:'#F0EEE9', borderRadius:3, overflow:'hidden' },
  revBarFill:         { height:6, backgroundColor:'#F5A623', borderRadius:3 },
  revBarCount:        { fontSize:11, color:'#9B9FAE', width:16 },
  revCard:            { backgroundColor:'#FFFFFF', borderRadius:16, padding:16, borderWidth:1, borderColor:'rgba(15,17,23,0.09)' },
  revCardHeader:      { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:8 },
  revAv:              { width:36, height:36, borderRadius:18, backgroundColor:'#E8F4FB', alignItems:'center', justifyContent:'center', flexShrink:0 },
  revAvText:          { fontSize:14, fontWeight:'700', color:'#02A4E2' },
  revName:            { fontSize:14, fontWeight:'700', color:'#0F1117', marginBottom:3 },
  revDate:            { fontSize:11, color:'#9B9FAE' },
  revStarBadge:       { flexDirection:'row', alignItems:'center', backgroundColor:'#FFF8E7', borderRadius:8, paddingHorizontal:8, paddingVertical:4, gap:2 },
  revStarBadgeText:   { fontSize:14, fontWeight:'900', color:'#A0700A' },
  revStarBadgeIcon:   { fontSize:13, color:'#F5A623' },
  revText:            { fontSize:13, color:'#5A5F72', lineHeight:20, fontStyle:'italic', paddingLeft:46 },
});
