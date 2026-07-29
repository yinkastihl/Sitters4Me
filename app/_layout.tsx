// app/_layout.tsx — complete route registry
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="parent-login" />
        <Stack.Screen name="parent-register" />
        <Stack.Screen name="parent-home" />
        <Stack.Screen name="job-accepted" />
        <Stack.Screen name="payment" />
        <Stack.Screen name="schedule-sitter" />
        <Stack.Screen name="rate-sitter" />
        <Stack.Screen name="sitter-login" />
        <Stack.Screen name="sitter-register" />
        <Stack.Screen name="sitter-pending" />
        <Stack.Screen name="sitter-home" />
        <Stack.Screen name="active-job" />
        <Stack.Screen name="rate-parent" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="verify-email" />
      </Stack>
    </>
  );
}
