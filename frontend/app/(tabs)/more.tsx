import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { useAuth } from '@/src/auth-context';

export default function More() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const items = [
    { icon: 'package', label: 'المستودع', route: '/more/inventory', tid: 'more-inventory' },
    { icon: 'clipboard', label: 'المخابر', route: '/more/lab', tid: 'more-lab' },
    { icon: 'users', label: 'المساعدون', route: '/more/assistants', doctorOnly: true, tid: 'more-assistants' },
    { icon: 'settings', label: 'الإعدادات', route: '/more/settings', tid: 'more-settings' },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المزيد</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.profileCard}>
          <View style={styles.avatarBig}><Feather name="user" size={26} color={colors.brand} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.full_name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role === 'doctor' ? 'طبيب' : 'مساعد'}</Text>
            </View>
          </View>
        </View>

        {items.map((it) =>
          it.doctorOnly && user?.role !== 'doctor' ? null : (
            <Pressable
              key={it.route}
              testID={it.tid}
              onPress={() => router.push(it.route as any)}
              style={styles.row}
            >
              <View style={styles.itemIcon}><Feather name={it.icon as any} size={20} color={colors.brand} /></View>
              <Text style={styles.itemLabel}>{it.label}</Text>
              <Feather name="chevron-left" size={22} color={colors.muted} />
            </Pressable>
          )
        )}

        <Pressable testID="logout-btn" onPress={logout} style={[styles.row, { marginTop: spacing.xl }]}>
          <View style={[styles.itemIcon, { backgroundColor: colors.errorBg }]}><Feather name="log-out" size={20} color={colors.error} /></View>
          <Text style={[styles.itemLabel, { color: colors.error }]}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  headerTitle: { fontSize: font.xl, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  profileCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.lg, ...shadow.card },
  avatarBig: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  email: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  roleBadge: { alignSelf: 'flex-end', backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  roleText: { color: colors.brand, fontSize: 11, fontFamily: fontFamily.medium },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  itemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, fontSize: font.base, color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
});
