import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput, ActivityIndicator, Linking, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api, APP_BASE } from '@/src/api';
import { useAuth } from '@/src/auth-context';
import MapView from '@/src/components/MapView';

export default function Settings() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState('');

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

  const useCurrentLocation = async () => {
    setLocMsg('');
    setLocating(true);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted' && perm.canAskAgain) {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status !== 'granted') {
        setLocMsg('لم يتم منح إذن الموقع. يمكنك تفعيله من الإعدادات.');
        if (Platform.OS !== 'web') Linking.openSettings();
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await save({ clinic_location: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      setLocMsg('تم تحديد موقع العيادة بنجاح.');
    } catch (e: any) {
      setLocMsg('تعذّر الحصول على الموقع الحالي.');
    } finally { setLocating(false); }
  };

  const openMap = () => {
    const loc = settings?.clinic_location;
    if (!loc?.lat) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`);
  };
  const bookingLink = user ? `https://dazzling-amazement-production-68f2.up.railway.app/book/${user.tenant_id}` : '';

  const shareBooking = async () => {
    const msg = `احجز موعدك في ${settings?.clinic_name || 'عيادتنا'} عبر الرابط:\n${bookingLink}`;    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
      } else {
        await Share.share({ message: msg });
      }
    } catch { /* noop */ }
  };

  if (loading || !settings) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;

  const isDoctor = user?.role === 'doctor';
  const loc = settings.clinic_location;

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
          <Field label="أوقات الدوام" val={settings.working_hours} onSave={(v) => save({ working_hours: v })} editable={isDoctor} tid="s-working-hours" />
          {isDoctor ? <Text style={styles.rowHelp}>مثال: السبت - الخميس، 8 صباحاً - 11 مساءً. تظهر للمرضى في صفحة الحجز.</Text> : null}
        </View>

        {/* Location */}
        <View style={styles.card}>
          <Text style={styles.section}>موقع العيادة على الخريطة</Text>
          {loc?.lat ? (
            <MapView
              lat={loc.lat}
              lng={loc.lng}
              height={200}
              interactive={isDoctor}
              onPick={(la, ln) => isDoctor && save({ clinic_location: { lat: la, lng: ln } })}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Feather name="map-pin" size={32} color={colors.borderStrong} />
              <Text style={styles.rowHelp}>لم يتم تحديد موقع بعد</Text>
            </View>
          )}
          {isDoctor && (
            <>
              <Pressable testID="use-gps-btn" onPress={useCurrentLocation} disabled={locating} style={styles.gpsBtn}>
                {locating ? <ActivityIndicator color="#fff" /> : (<><Feather name="crosshair" size={18} color="#fff" /><Text style={styles.gpsText}>استخدام موقعي الحالي (GPS)</Text></>)}
              </Pressable>
              {isDoctor ? <Text style={styles.rowHelp}>يمكنك أيضاً الضغط على الخريطة لتحريك المؤشر بدقة.</Text> : null}
              {locMsg ? <Text style={styles.locMsg}>{locMsg}</Text> : null}
            </>
          )}
          {loc?.lat && (
            <Pressable testID="open-map-btn" onPress={openMap} style={styles.mapBtn}>
              <Feather name="external-link" size={16} color={colors.brand} />
              <Text style={styles.mapText}>فتح في خرائط جوجل</Text>
            </Pressable>
          )}
        </View>

        {/* Booking link */}
        {isDoctor && (
          <View style={styles.card}>
            <Text style={styles.section}>رابط حجز المرضى</Text>
            <Text style={styles.rowHelp}>شارك هذا الرابط مع مرضاك ليحجزوا مواعيدهم بأنفسهم.</Text>
            <View style={styles.linkBox}><Text testID="booking-link" style={styles.linkText} numberOfLines={2}>{bookingLink}</Text></View>
            <View style={{ flexDirection: 'row-reverse', gap: spacing.sm }}>
              <Pressable testID="share-booking-btn" onPress={shareBooking} style={[styles.gpsBtn, { flex: 1, marginTop: 0, backgroundColor: colors.success }]}>
                <Feather name="share-2" size={16} color="#fff" /><Text style={styles.gpsText}>مشاركة</Text>
              </Pressable>
              <Pressable testID="open-booking-btn" onPress={() => Linking.openURL(bookingLink)} style={[styles.gpsBtn, { flex: 1, marginTop: 0, backgroundColor: colors.brand }]}>
                <Feather name="eye" size={16} color="#fff" /><Text style={styles.gpsText}>معاينة</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isDoctor && (
          <View style={styles.card}>
            <Text style={styles.section}>الصلاحيات</Text>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>عرض التقارير المالية للمساعدين</Text>
                <Text style={styles.rowHelp}>عند التفعيل، يستطيع المساعدون رؤية الفواتير والإيرادات.</Text>
              </View>
              <Switch testID="toggle-fin-perm" value={!!settings.show_financials_to_assistants} onValueChange={(v) => save({ show_financials_to_assistants: v })} trackColor={{ true: colors.brand, false: colors.border }} thumbColor="#fff" disabled={saving} />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.section}>عن التطبيق</Text>
          <Text style={styles.rowLabel}>عيادتي — إدارة عيادات الأسنان</Text>
          <Text style={styles.rowHelp}>الإصدار 1.1.0</Text>
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
          <Pressable testID={`${tid}-save`} onPress={() => onSave(v)} style={styles.saveBtn}><Text style={styles.saveText}>حفظ</Text></Pressable>
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
  rowHelp: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  saveBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md },
  saveText: { color: '#fff', fontFamily: fontFamily.bold },
  mapPlaceholder: { height: 140, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  gpsBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  gpsText: { color: '#fff', fontFamily: fontFamily.bold },
  locMsg: { color: colors.brand, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.sm },
  mapBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm, justifyContent: 'center' },
  mapText: { color: colors.brand, fontFamily: fontFamily.medium },
  linkBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  linkText: { color: colors.brand, fontFamily: fontFamily.medium, textAlign: 'left', writingDirection: 'ltr' },
});
