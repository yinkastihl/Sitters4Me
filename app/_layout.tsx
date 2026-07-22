// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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
  useEffect(() => {
    // Create the Android channel immediately on mount
    setupAndroidChannel();

    // Handle notification taps (when app is backgrounded or killed)
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      console.log('Notification tapped:', data);
      // Future: navigate to the right screen based on data.type
    });
    return () => sub.remove();
  }, []);

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
      </Stack>
    </>
  );
}
