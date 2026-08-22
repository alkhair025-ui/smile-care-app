import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

function nextDays(n: number) {
  const days = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push(d);
  }
  return days;
}
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

// Convert "HH:MM" (24h) to Arabic 12-hour label, e.g. "1:00 ظهراً", "2:30 مساءً".
function to12h(hhmm: string) {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'صباحاً' : (h < 14 ? 'ظهراً' : 'مساءً');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

export default function BookingPortal() {
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const [clinic, setClinic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [slots, setSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    api.publicClinic(tenantId).then(setClinic).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [tenantId]);

  const loadSlots = useCallback(async (day: Date) => {
    if (!tenantId) return;
    setSlotsLoading(true); setSelectedTime('');
    try { const res = await api.publicSlots(tenantId, dateKey(day)); setSlots(res.slots || []); }
    catch { setSlots([]); } finally { setSlotsLoading(false); }
  }, [tenantId]);

  useEffect(() => { if (clinic) loadSlots(selectedDay); }, [clinic, selectedDay, loadSlots]);

  const submit = async () => {
    setErr('');
    if (!name.trim() || !phone.trim()) { setErr('يرجى إدخال الاسم ورقم الهاتف'); return; }
    if (!selectedTime) { setErr('يرجى اختيار وقت متاح'); return; }
    setSubmitting(true);
    try {
      await api.publicBook(tenantId!, { full_name: name, phone, date: dateKey(selectedDay), time: selectedTime, reason });
      setDone(true);
      loadSlots(selectedDay);
    } catch (e: any) { setErr(e.message || 'تعذّر الحجز'); } finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View></SafeAreaView>;
  if (notFound) return <SafeAreaView style={styles.root}><View style={styles.center}><Feather name="alert-circle" size={48} color={colors.borderStrong} /><Text style={styles.emptyText}>العيادة غير موجودة</Text></View></SafeAreaView>;

  if (done) return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.brand, colors.brandDark]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.center}>
          <View style={styles.successBadge}><Feather name="check" size={40} color={colors.brand} /></View>
          <Text style={styles.successTitle}>تم استلام طلب حجزك!</Text>
          <Text style={styles.successText}>سيتواصل معك فريق {clinic.clinic_name} لتأكيد الموعد يوم {DAY_NAMES[selectedDay.getDay()]} الساعة {to12h(selectedTime)}.</Text>
          <Pressable testID="book-again" onPress={() => { setDone(false); setSelectedTime(''); }} style={styles.againBtn}>
            <Text style={styles.againText}>حجز موعد آخر</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.brand, colors.brandDark]} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text style={styles.clinicName}>{clinic.clinic_name}</Text>
          {clinic.clinic_address ? <Text style={styles.clinicSub}>{clinic.clinic_address}</Text> : null}
          <Text style={styles.headerTag}>احجز موعدك بسهولة</Text>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>اختر اليوم</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
            {nextDays(14).map((d) => {
              const active = dateKey(d) === dateKey(selectedDay);
              return (
                <Pressable key={dateKey(d)} testID={`day-${dateKey(d)}`} onPress={() => setSelectedDay(d)} style={[styles.dayChip, { backgroundColor: active ? colors.brand : colors.surface, borderColor: active ? colors.brand : colors.border }]}>
                  <Text style={[styles.dayName, { color: active ? '#fff' : colors.muted }]}>{DAY_NAMES[d.getDay()]}</Text>
                  <Text style={[styles.dayNum, { color: active ? '#fff' : colors.onSurface }]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.section}>اختر الوقت المتاح</Text>
          {slotsLoading ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} /> : (
            <Pressable testID="time-dropdown" onPress={() => setTimeOpen(true)} style={styles.dropdown}>
              <Feather name="chevron-down" size={20} color={colors.muted} />
              <Text style={[styles.dropdownText, !selectedTime && { color: colors.muted }]}>
                {selectedTime ? to12h(selectedTime) : 'اختر الوقت المناسب'}
              </Text>
              <Feather name="clock" size={18} color={colors.brand} />
            </Pressable>
          )}

          <Modal visible={timeOpen} transparent animationType="slide" onRequestClose={() => setTimeOpen(false)}>
            <Pressable style={styles.timeOverlay} onPress={() => setTimeOpen(false)}>
              <View style={styles.timeSheet}>
                <View style={styles.timeHeader}>
                  <Pressable testID="time-close" onPress={() => setTimeOpen(false)} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
                  <Text style={styles.timeTitle}>اختر الوقت</Text>
                  <View style={{ width: 22 }} />
                </View>
                <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
                  {slots.map((s) => (
                    <Pressable
                      key={s.time}
                      testID={`slot-${s.time}`}
                      disabled={!s.available}
                      onPress={() => { setSelectedTime(s.time); setTimeOpen(false); }}
                      style={[
                        styles.slotRow,
                        selectedTime === s.time && styles.slotRowActive,
                        !s.available && styles.slotRowTaken,
                      ]}
                    >
                      <Text style={[styles.slotRowText, !s.available && styles.slotRowTakenText, selectedTime === s.time && { color: '#fff' }]}>
                        {to12h(s.time)}
                      </Text>
                      {!s.available
                        ? <Text style={styles.takenTag}>محجوز</Text>
                        : (selectedTime === s.time ? <Feather name="check" size={18} color="#fff" /> : <Feather name="circle" size={16} color={colors.borderStrong} />)}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

          <Text style={styles.section}>بياناتك</Text>
          <View style={styles.card}>
            <Text style={styles.label}>الاسم الكامل</Text>
            <TextInput testID="book-name" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={[styles.label, { marginTop: spacing.md }]}>رقم الهاتف</Text>
            <TextInput testID="book-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholderTextColor={colors.muted} />
            <Text style={[styles.label, { marginTop: spacing.md }]}>سبب الزيارة (اختياري)</Text>
            <TextInput testID="book-reason" value={reason} onChangeText={setReason} style={styles.input} placeholderTextColor={colors.muted} />
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable testID="book-submit" onPress={submit} disabled={submitting} style={styles.submitBtn}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>تأكيد الحجز</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  clinicName: { color: '#fff', fontSize: font.xxl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.md },
  clinicSub: { color: '#DDEAE6', fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  headerTag: { color: '#fff', fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.md, opacity: 0.9 },
  section: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurfaceSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl' },
  dayChip: { width: 64, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', gap: 4 },
  dayName: { fontSize: 11, fontFamily: fontFamily.medium },
  dayNum: { fontSize: font.lg, fontFamily: fontFamily.bold },
  slotsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  dropdown: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.sm },
  dropdownText: { flex: 1, marginHorizontal: spacing.sm, color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', fontSize: font.base },
  timeOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  timeSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  timeHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  timeTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  slotRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  slotRowActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotRowTaken: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse, opacity: 0.65 },
  slotRowText: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base },
  slotRowTakenText: { color: '#C5D3CE', textDecorationLine: 'line-through' },
  takenTag: { color: '#C5D3CE', fontFamily: fontFamily.medium, fontSize: font.sm },
  slot: { width: '22%', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  slotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotTaken: { backgroundColor: colors.surfaceTertiary, borderColor: colors.surfaceTertiary },
  slotText: { fontFamily: fontFamily.medium, color: colors.onSurface, fontSize: font.sm },
  slotTakenText: { color: colors.muted, textDecorationLine: 'line-through' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  submitBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  submitText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
  successBadge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: '#fff', fontSize: font.xxl, fontFamily: fontFamily.bold, textAlign: 'center' },
  successText: { color: '#DDEAE6', fontFamily: fontFamily.regular, textAlign: 'center', writingDirection: 'rtl', lineHeight: 24 },
  againBtn: { backgroundColor: '#fff', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginTop: spacing.lg },
  againText: { color: colors.brand, fontFamily: fontFamily.bold },
});
