import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function Reminders() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [clinicName, setClinicName] = useState('العيادة');
  const [loading, setLoading] = useState(true);
  const key = tomorrowKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.listAppointments(`${key}T00:00`, `${key}T23:59`);
      setItems(all.filter((a: any) => a.status !== 'cancelled'));
      try { const ps = await api.listPatients(); const m: Record<string, string> = {}; ps.forEach((p: any) => { m[p.id] = p.phone; }); setPhones(m); } catch { /* noop */ }
      try { const s = await api.getSettings(); setClinicName(s.clinic_name || 'العيادة'); } catch { /* noop */ }
    } finally { setLoading(false); }
  }, [key]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sendReminder = (a: any) => {
    const phone = (phones[a.patient_id] || '').replace(/[^\d]/g, '');
    const msg = encodeURIComponent(`تذكير ودّي من ${clinicName} 🦷\nمرحباً ${a.patient_name}، نذكّرك بموعدك غداً ${key} الساعة ${a.date.slice(11, 16)}${a.reason ? ` (${a.reason})` : ''}.\nفي حال تعذّر الحضور يرجى إبلاغنا. شكراً لك!`);
    Linking.openURL(phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>تذكيرات الغد</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.banner}>
        <Feather name="calendar" size={18} color={colors.brand} />
        <Text style={styles.bannerText}>مواعيد الغد ({key}) — أرسل تذكيراً لكل مريض عبر واتساب لتقليل الغياب.</Text>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> :
        items.length === 0 ? <View style={styles.center}><Feather name="bell-off" size={48} color={colors.borderStrong} /><Text style={styles.empty}>لا توجد مواعيد غداً</Text></View> :
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.timeBox}><Text style={styles.timeText}>{item.date.slice(11, 16)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.patient_name}</Text>
                <Text style={styles.meta}>{item.reason || 'موعد'} · {phones[item.patient_id] || 'بدون رقم'}</Text>
              </View>
              <Pressable testID={`send-reminder-${item.id}`} onPress={() => sendReminder(item)} style={styles.waBtn}>
                <Feather name="send" size={14} color="#fff" />
                <Text style={styles.waText}>تذكير</Text>
              </Pressable>
            </View>
          )}
        />
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandTertiary, margin: spacing.lg, marginBottom: 0, padding: spacing.md, borderRadius: radius.md },
  bannerText: { flex: 1, color: colors.onBrandTertiary, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { color: colors.muted, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, marginTop: spacing.md, ...shadow.card },
  timeBox: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, minWidth: 56, alignItems: 'center' },
  timeText: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.sm },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  waBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.success, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  waText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.sm },
});
