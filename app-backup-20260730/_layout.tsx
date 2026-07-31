// app/_layout.tsx — complete route registry
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />

        {/* ── Parent ── */}
        <Stack.Screen name="parent-login" />
        <Stack.Screen name="parent-register" />
        <Stack.Screen name="parent-home" />
        <Stack.Screen name="parent-settings" />
        <Stack.Screen name="parent-profile-edit" />
        <Stack.Screen name="parent-payment-settings" />
        <Stack.Screen name="children-profiles" />
        <Stack.Screen name="parent-history" />
        <Stack.Screen name="parent-favorites" />
        <Stack.Screen name="job-accepted" />
        <Stack.Screen name="job-tracking" />
        <Stack.Screen name="payment" />
        <Stack.Screen name="payment-settings" />
        <Stack.Screen name="schedule-sitter" />
        <Stack.Screen name="rate-sitter" />

        {/* ── Sitter ── */}
        <Stack.Screen name="sitter-login" />
        <Stack.Screen name="sitter-register" />
        <Stack.Screen name="sitter-pending" />
        <Stack.Screen name="sitter-home" />
        <Stack.Screen name="sitter-settings" />
        <Stack.Screen name="sitter-profile-edit" />
        <Stack.Screen name="sitter-profile-view" />
        <Stack.Screen name="sitter-earnings" />
        <Stack.Screen name="sitter-bank-setup" />
        <Stack.Screen name="sitter-availability" />
        <Stack.Screen name="sitter-browse" />
        <Stack.Screen name="active-job" />
        <Stack.Screen name="rate-parent" />
        <Stack.Screen name="earnings" />

        {/* ── Shared ── */}
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="referral" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </>
  );
}
