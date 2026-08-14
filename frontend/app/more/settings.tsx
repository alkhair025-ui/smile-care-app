import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';

export default function Settings() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await api.getSettings()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (patch: any) => {
    setSaving(true);
    try { const updated = await api.updateSettings(patch); setSettings(updated); await refresh(); }
    finally { setSaving(false); }
  };

  const openMap = () => {
    const loc = settings?.clinic_location;
    if (!loc?.lat || !loc?.lng) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    Linking.openURL(url);
  };

  if (loading || !settings) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;

  const isDoctor = user?.role === 'doctor';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>الإعدادات</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={styles.card}>
          <Text style={styles.section}>معلومات العيادة</Text>
          <Field label="اسم العيادة" val={settings.clinic_name} onSave={(v) => save({ clinic_name: v })} editable={isDoctor} tid="s-clinic-name" />
          <Field label="العنوان" val={settings.clinic_address} onSave={(v) => save({ clinic_address: v })} editable={isDoctor} tid="s-clinic-address" />
          <Field label="الهاتف" val={settings.clinic_phone} onSave={(v) => save({ clinic_phone: v })} editable={isDoctor} tid="s-clinic-phone" />
          {settings.clinic_location?.lat ? (
            <Pressable testID="open-map-btn" onPress={openMap} style={styles.mapBtn}>
              <Feather name="map-pin" size={18} color={colors.brand} />
              <Text style={styles.mapText}>عرض الموقع على الخريطة ({settings.clinic_location.lat.toFixed(3)}, {settings.clinic_location.lng.toFixed(3)})</Text>
            </Pressable>
          ) : null}
        </View>

        {isDoctor && (
          <View style={styles.card}>
            <Text style={styles.section}>الصلاحيات</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>عرض التقارير المالية للمساعدين</Text>
                <Text style={styles.rowHelp}>عند التفعيل، يستطيع المساعدون رؤية الفواتير والإيرادات.</Text>
              </View>
              <Switch
                testID="toggle-fin-perm"
                value={!!settings.show_financials_to_assistants}
                onValueChange={(v) => save({ show_financials_to_assistants: v })}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor="#fff"
                disabled={saving}
              />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.section}>عن التطبيق</Text>
          <Text style={styles.rowLabel}>عيادتي — إدارة عيادات الأسنان</Text>
          <Text style={styles.rowHelp}>الإصدار 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, val, onSave, editable, tid }: any) {
  const [v, setV] = useState(val || '');
  React.useEffect(() => setV(val || ''), [val]);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' }}>
        <TextInput testID={tid} value={v} onChangeText={setV} editable={editable} style={[styles.input, { flex: 1, opacity: editable ? 1 : 0.6 }]} />
        {editable && v !== (val || '') && (
          <Pressable testID={`${tid}-save`} onPress={() => onSave(v)} style={styles.saveBtn}>
            <Text style={styles.saveText}>حفظ</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  section: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  switchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  rowLabel: { color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  rowHelp: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  saveBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md },
  saveText: { color: '#fff', fontFamily: fontFamily.bold },
  mapBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  mapText: { color: colors.brand, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', flex: 1 },
});
