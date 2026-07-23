// app/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Show notifications as banners/alerts even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// Android requires a notification channel to be created before any
// notification can be shown. This is a no-op on iOS.
async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name:               'Sitters4Me Notifications',
    importance:         Notifications.AndroidImportance.MAX,
    vibrationPattern:   [0, 250, 250, 250],
    lightColor:         '#C93488',
    sound:              'default',
    enableVibrate:      true,
    showBadge:          true,
  });
}

export default function RootLayout() {
  const router = useRouter();

  // Navigate to the right screen based on the notification payload.
  // Stored as a useCallback so it's stable across renders.
  const handleNotificationNav = useCallback((data: any) => {
    if (!data?.type) return;
    try {
      switch (data.type) {
        case 'job_request':
          // Sitter tapped a new live job ping → go to sitter-home.
          // The sitter-home polling loop will immediately surface the modal.
          // We also stash the raw data so sitter-home can skip the first poll delay.
          (global as any).pendingJobNotification = data;
          router.push('/sitter-home');
          break;

        case 'job_accepted':
          // Parent: sitter accepted → show the ETA / travelling screen.
          (global as any).pendingJobUpdate = data;
          router.push('/job-accepted');
          break;

        case 'job_update':
          // Live location / status tick from sitter → refresh ETA screen.
          (global as any).pendingJobUpdate = data;
          router.push('/job-accepted');
          break;

        case 'chat':
          // New chat message → open chat for the relevant job.
          if (data.job_id) (global as any).chatJob = { job_id: data.job_id };
          router.push('/chat');
          break;

        case 'job_complete':
          // Job ended — sitter or parent taps the completion notice.
          if (data.job_id) (global as any).completedJobId = data.job_id;
          router.push('/active-job');
          break;

        case 'sitter_online':
        case 'sitter_available':
          // Parent notified that a favourite sitter just went online.
          router.push('/parent-favorites');
          break;

        case 'parent_rating':
          // Sitter was rated after a job — show earnings summary.
          router.push('/sitter-earnings');
          break;

        default:
          // Unknown type — leave the user on whichever screen they were on.
          console.log('Unhandled notification type:', data.type);
          break;
      }
    } catch (e) {
      console.warn('Notification nav error:', e);
    }
  }, [router]);

  useEffect(() => {
    // Create the Android channel immediately on mount
    setupAndroidChannel();

    // ── Foreground / background tap ──────────────────────────────────────────
    // Fires when the user taps a notification while the app is running or
    // backgrounded. A short delay ensures the router is fully ready.
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      console.log('Notification tapped:', data);
      setTimeout(() => handleNotificationNav(data), 150);
    });

    // ── Cold start ───────────────────────────────────────────────────────────
    // If the app was killed and launched via a notification tap, grab the last
    // response and navigate. We use a longer delay so the full route tree mounts
    // before we push.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response?.notification?.request?.content?.data) {
        const data = response.notification.request.content.data as any;
        console.log('Cold-start notification:', data);
        setTimeout(() => handleNotificationNav(data), 900);
      }
    }).catch(() => {});

    return () => sub.remove();
  }, [handleNotificationNav]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="parent-login" />
        <Stack.Screen name="parent-register" />
        <Stack.Screen name="parent-home" />
        <Stack.Screen name="job-accepted" />
        <Stack.Screen name="sitter-login" />
        <Stack.Screen name="sitter-register" />
        <Stack.Screen name="sitter-pending" />
        <Stack.Screen name="sitter-home" />
        <Stack.Screen name="active-job" />
        <Stack.Screen name="parent-payment-settings" />
        <Stack.Screen name="sitter-earnings" />
        <Stack.Screen name="sitter-bank-setup" />
        <Stack.Screen name="sitter-profile-edit" />
        <Stack.Screen name="parent-history" />
        <Stack.Screen name="sitter-profile-view" />
        <Stack.Screen name="parent-favorites" />
        <Stack.Screen name="parent-profile-edit" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="reset-password" />
        {/* Screens added after initial launch */}
        <Stack.Screen name="sitter-availability" />
        <Stack.Screen name="referral" />
        <Stack.Screen name="sitter-browse" />
        <Stack.Screen name="children-profiles" />
      </Stack>
    </>
  );
}
