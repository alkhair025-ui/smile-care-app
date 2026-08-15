import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily } from '@/src/theme';
import { api } from '@/src/api';

export default function ResetPassword() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!token) { setErr('رابط غير صالح'); return; }
    if (pw.length < 6) { setErr('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (pw !== pw2) { setErr('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try { await api.resetPassword(token, pw); setDone(true); }
    catch (e: any) { setErr(e.message || 'تعذّر إعادة التعيين'); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>تعيين كلمة مرور جديدة</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {done ? (
            <View style={styles.successBox}>
              <View style={styles.successIcon}><Feather name="check" size={32} color={colors.brand} /></View>
              <Text style={styles.successTitle}>تم بنجاح!</Text>
              <Text style={styles.successText}>تم تعيين كلمة المرور الجديدة. يمكنك الآن تسجيل الدخول.</Text>
              <Pressable testID="reset-to-login" onPress={() => router.replace('/(auth)/login')} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.hint}>اختر كلمة مرور جديدة قوية لحسابك.</Text>
              <Text style={styles.label}>كلمة المرور الجديدة</Text>
              <View style={styles.inputWrap}>
                <Feather name="lock" size={18} color={colors.muted} />
                <TextInput testID="reset-pw" value={pw} onChangeText={setPw} secureTextEntry={!showPw} style={styles.input} />
                <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}><Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.muted} /></Pressable>
              </View>
              <Text style={[styles.label, { marginTop: spacing.md }]}>تأكيد كلمة المرور</Text>
              <View style={styles.inputWrap}>
                <Feather name="lock" size={18} color={colors.muted} />
                <TextInput testID="reset-pw2" value={pw2} onChangeText={setPw2} secureTextEntry={!showPw} style={styles.input} />
              </View>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="reset-submit" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ كلمة المرور</Text>}
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
  headerBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  body: { padding: spacing.xl },
  hint: { textAlign: 'right', writingDirection: 'rtl', color: colors.muted, fontFamily: fontFamily.regular, marginBottom: spacing.xl },
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
