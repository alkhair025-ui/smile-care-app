import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [menuUser, setMenuUser] = useState<any>(null);
  const [resetUser, setResetUser] = useState<any>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.adminListDoctors(), api.adminStats()]);
      setDoctors(d); setStats(s);
    } catch (e) { /* noop */ } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const toggleDisabled = async (u: any) => {
    setMenuUser(null);
    await api.adminToggleDisabled(u.id);
    showToast(u.disabled ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
    load();
  };

  const filtered = doctors.filter((d) =>
    !q || d.full_name.includes(q) || d.email.includes(q) || (d.clinic_name || '').includes(q)
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.surfaceInverse, colors.brandDark]} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>لوحة المدير العام</Text>
              <Text style={styles.headerSub}>{user?.email}</Text>
            </View>
            <Pressable testID="admin-logout" onPress={logout} style={styles.logoutBtn}><Feather name="log-out" size={20} color="#fff" /></Pressable>
          </View>
          {stats && (
            <View style={styles.statsRow}>
              <Stat label="الأطباء" value={stats.doctors} />
              <Stat label="العيادات" value={stats.clinics} />
              <Stat label="المساعدون" value={stats.assistants} />
              <Stat label="المرضى" value={stats.patients} />
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput testID="admin-search" value={q} onChangeText={setQ} placeholder="ابحث باسم الطبيب أو العيادة..." placeholderTextColor={colors.muted} style={styles.search} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View> : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <View style={[styles.card, item.disabled && { opacity: 0.6 }]}>
              <View style={styles.avatar}><Feather name={item.role === 'doctor' ? 'user' : 'users'} size={20} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>{item.email}</Text>
                <Text style={styles.meta}>{item.clinic_name || '—'} · {item.role === 'doctor' ? 'طبيب' : 'مساعد'} · {item.patients_count} مريض</Text>
                {item.disabled && <View style={styles.disabledBadge}><Text style={styles.disabledText}>معطّل</Text></View>}
              </View>
              <Pressable testID={`admin-menu-${item.id}`} onPress={() => setMenuUser(item)} hitSlop={8}><Feather name="more-vertical" size={20} color={colors.muted} /></Pressable>
            </View>
          )}
          ListEmptyComponent={<View style={styles.center}><Feather name="users" size={48} color={colors.borderStrong} /><Text style={styles.meta}>لا توجد حسابات</Text></View>}
        />
      )}

      {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}

      {/* action menu */}
      <Modal visible={!!menuUser} transparent animationType="fade" onRequestClose={() => setMenuUser(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuUser(null)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuHeader}>{menuUser?.full_name}</Text>
            <Pressable testID="admin-reset-pw" onPress={() => { setResetUser(menuUser); setMenuUser(null); }} style={styles.menuItem}>
              <Feather name="key" size={18} color={colors.brand} /><Text style={styles.menuText}>إعادة تعيين كلمة المرور</Text>
            </Pressable>
            <Pressable testID="admin-toggle" onPress={() => toggleDisabled(menuUser)} style={styles.menuItem}>
              <Feather name={menuUser?.disabled ? 'unlock' : 'slash'} size={18} color={menuUser?.disabled ? colors.success : colors.error} />
              <Text style={[styles.menuText, { color: menuUser?.disabled ? colors.success : colors.error }]}>{menuUser?.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ResetPwModal user={resetUser} onClose={() => setResetUser(null)} onDone={(m) => { setResetUser(null); showToast(m); }} />
    </View>
  );
}

function Stat({ label, value }: any) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ResetPwModal({ user, onClose, onDone }: any) {
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  React.useEffect(() => { if (user) { setPw(''); setErr(''); } }, [user]);

  const submit = async () => {
    setErr('');
    if (pw.length < 6) { setErr('6 أحرف على الأقل'); return; }
    setLoading(true);
    try { await api.adminResetPassword(user.id, pw); onDone('تمت إعادة تعيين كلمة المرور بنجاح'); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={!!user} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>إعادة تعيين كلمة المرور</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.meta}>الحساب: {user?.email}</Text>
              <Text style={[styles.label, { marginTop: spacing.md }]}>كلمة المرور الجديدة</Text>
              <TextInput testID="admin-newpw" value={pw} onChangeText={setPw} secureTextEntry style={styles.input} autoCapitalize="none" />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="admin-save-pw" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ</Text>}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.md },
  headerTitle: { color: '#fff', fontSize: font.xl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  headerSub: { color: '#C5D3CE', fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  statVal: { color: '#fff', fontSize: font.xl, fontFamily: fontFamily.bold },
  statLabel: { color: '#C5D3CE', fontSize: 11, fontFamily: fontFamily.regular },
  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', color: colors.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  disabledBadge: { alignSelf: 'flex-end', backgroundColor: colors.errorBg, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  disabledText: { color: colors.error, fontSize: 11, fontFamily: fontFamily.bold },
  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: colors.surfaceInverse, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill },
  toastText: { color: '#fff', fontFamily: fontFamily.medium },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.sm },
  menuHeader: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.sm },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  menuText: { fontSize: font.base, fontFamily: fontFamily.medium, color: colors.onSurface },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
