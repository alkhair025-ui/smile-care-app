import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily } from '@/src/theme';
import { useAuth } from '@/src/auth-context';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', clinic_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    setErr('');
    if (!form.full_name || !form.clinic_name || !form.email || form.password.length < 6) {
      setErr('يرجى إكمال جميع الحقول (كلمة المرور 6 أحرف على الأقل)'); return;
    }
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim() });
    } catch (e: any) {
      setErr(e.message || 'فشل إنشاء الحساب');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} testID="register-back" hitSlop={8}>
          <Feather name="chevron-right" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>حساب عيادة جديد</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>أنشئ حساب عيادتك للبدء بإدارة المرضى والفواتير</Text>

          <Field label="اسم الطبيب" val={form.full_name} onCh={(v) => upd('full_name', v)} icon="user" tid="reg-name" />
          <Field label="اسم العيادة" val={form.clinic_name} onCh={(v) => upd('clinic_name', v)} icon="briefcase" tid="reg-clinic" />
          <Field label="البريد الإلكتروني" val={form.email} onCh={(v) => upd('email', v)} icon="mail" tid="reg-email" keyboardType="email-address" />
          <Field label="كلمة المرور" val={form.password} onCh={(v) => upd('password', v)} icon="lock" tid="reg-password" secure />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable testID="register-submit" onPress={onSubmit} disabled={loading} style={styles.primaryBtn}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>إنشاء الحساب</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, val, onCh, icon, tid, secure, keyboardType }: any) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Feather name={icon} size={18} color={colors.muted} />
        <TextInput
          testID={tid}
          value={val}
          onChangeText={onCh}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  body: { padding: spacing.xl },
  hint: { textAlign: 'right', writingDirection: 'rtl', color: colors.muted, fontFamily: fontFamily.regular, marginBottom: spacing.xl },
  label: { fontSize: font.base, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.medium },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: font.lg, color: colors.onSurface, paddingVertical: spacing.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamily.regular, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
