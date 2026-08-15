import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily } from '@/src/theme';
import { api } from '@/src/api';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!email.trim()) { setErr('يرجى إدخال البريد الإلكتروني'); return; }
    setLoading(true);
    try { await api.forgotPassword(email.trim()); setSent(true); }
    catch (e: any) { setErr(e.message || 'حدث خطأ'); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} testID="forgot-back" hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {sent ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}><Feather name="mail" size={32} color={colors.brand} /></View>
              <Text style={styles.successTitle}>تحقّق من بريدك</Text>
              <Text style={styles.successText}>إذا كان البريد مسجلاً لدينا، فستصلك رسالة تحتوي رابطاً لإعادة تعيين كلمة المرور خلال دقائق. الرابط صالح لمدة ساعة.</Text>
              <Pressable testID="back-to-login" onPress={() => router.replace('/(auth)/login')} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>العودة لتسجيل الدخول</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.hint}>أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.</Text>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <View style={styles.inputWrap}>
                <Feather name="mail" size={18} color={colors.muted} />
                <TextInput testID="forgot-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
              </View>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="forgot-submit" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>إرسال الرابط</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  body: { padding: spacing.xl },
  hint: { textAlign: 'right', writingDirection: 'rtl', color: colors.muted, fontFamily: fontFamily.regular, marginBottom: spacing.xl, lineHeight: 22 },
  label: { fontSize: font.base, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.medium },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: font.lg, color: colors.onSurface, paddingVertical: spacing.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.xl },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
  successBox: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: font.xl, fontFamily: fontFamily.bold, color: colors.onSurface },
  successText: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center', writingDirection: 'rtl', lineHeight: 24 },
});
