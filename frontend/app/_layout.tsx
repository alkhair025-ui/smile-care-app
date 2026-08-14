import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { I18nManager, LogBox, Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/auth-context';
import { colors } from '@/src/theme';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Force RTL layout for Arabic. On web, we rely on writingDirection styling in components.
try {
  if (Platform.OS !== 'web' && !I18nManager.isRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
} catch { /* noop */ }

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inPublicGroup = segments[0] === 'book';
    if (!user && !inAuthGroup && !inPublicGroup) {
      router.replace('/(auth)/login');
    } else if (user && (inAuthGroup || segments.length === 0)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  const [iconsLoaded, iconErr] = useIconFonts();
  // Load Tajawal directly from Google Fonts CDN (no @expo-google-fonts pkg).
  const [fontsLoaded, fontsErr] = useFonts({
    Tajawal_400: 'https://fonts.gstatic.com/s/tajawal/v11/Iurf6YBj_oCad4k1nzGBC5xLhLE.ttf',
    Tajawal_500: 'https://fonts.gstatic.com/s/tajawal/v11/Iura6YBj_oCad4k1l_6gLrZjiLlJ-G0.ttf',
    Tajawal_700: 'https://fonts.gstatic.com/s/tajawal/v11/Iura6YBj_oCad4k1l6qkLrZjiLlJ-G0.ttf',
  });

  const ready = (iconsLoaded || iconErr) && (fontsLoaded || fontsErr);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
