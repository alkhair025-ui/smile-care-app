import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { useAuth } from '@/src/auth-context';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('doctor@demo.com');
  const [password, setPassword] = useState('demo1234');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const onLogin = async () => {
    setErr('');
    if (!email.trim() || !password) { setErr('يرجى إدخال البريد وكلمة المرور'); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setErr(e.message || 'فشل تسجيل الدخول');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.brand, colors.brandDark]}
        style={styles.header}
      >
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: spacing.xl }}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}><Feather name="activity" size={26} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>عيادتي</Text>
              <Text style={styles.brandSub}>نظام إدارة عيادات الأسنان</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>مرحباً بعودتك</Text>
          <Text style={styles.subtitle}>سجّل دخولك للمتابعة إلى لوحة القيادة</Text>

          <View style={styles.field}>
            <Text style={styles.label}>البريد الإلكتروني</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color={colors.muted} />
              <TextInput
                testID="login-email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color={colors.muted} />
              <TextInput
                testID="login-password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPw}
                style={styles.input}
              />
              <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}>
                <Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          {err ? <Text testID="login-error" style={styles.err}>{err}</Text> : null}

          <Pressable
            testID="login-submit-button"
            onPress={onLogin}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>}
          </Pressable>

          <Pressable testID="forgot-password-link" onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
          </Pressable>

          <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>أو</Text><View style={styles.line} /></View>

          <Pressable
            testID="go-to-register"
            onPress={() => router.push('/(auth)/register')}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>إنشاء حساب عيادة جديدة</Text>
          </Pressable>

          <View style={styles.demoBox}>
            <Feather name="info" size={14} color={colors.onBrandTertiary} />
            <Text style={styles.demoText}>
              حساب تجريبي: doctor@demo.com / demo1234
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingBottom: spacing.xxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  logoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  logoBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  brandName: { color: '#fff', fontSize: font.xxl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  brandSub: { color: '#DDEAE6', fontSize: font.base, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  formWrap: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { fontSize: font.xxl, fontFamily: fontFamily.bold, color: colors.onSurface, marginTop: spacing.xl, textAlign: 'right', writingDirection: 'rtl' },
  subtitle: { fontSize: font.base, color: colors.muted, marginTop: 4, marginBottom: spacing.xl, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular },
  field: { marginBottom: spacing.lg },
  label: { fontSize: font.base, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.medium },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 4, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: font.lg, color: colors.onSurface, paddingVertical: spacing.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
  forgotBtn: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.sm },
  forgotText: { color: colors.brand, fontFamily: fontFamily.medium, fontSize: font.base },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontFamily: fontFamily.regular },
  secondaryBtn: { backgroundColor: colors.brandTertiary, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.brandSecondary },
  secondaryBtnText: { color: colors.brand, fontSize: font.base, fontFamily: fontFamily.bold },
  demoBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.xl },
  demoText: { color: colors.onBrandTertiary, fontSize: font.sm, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', flex: 1 },
});
