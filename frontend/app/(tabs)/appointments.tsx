import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

function toDateKey(iso: string) { return (iso || '').slice(0, 10); }

export default function Appointments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.listAppointments()); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const it of items) {
      const k = toDateKey(it.date);
      (map[k] = map[k] || []).push(it);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const setStatus = async (a: any, status: string) => {
    await api.updateAppointment(a.id, { ...a, status });
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المواعيد</Text>
        <Pressable testID="add-appt-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="calendar" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyText}>لا توجد مواعيد</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([k]) => k}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item: [key, list] }) => (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={styles.dayHeader}>{key}</Text>
              {list.map((a: any) => (
                <View key={a.id} style={styles.row}>
                  <View style={styles.timeBox}>
                    <Text style={styles.timeText}>{a.date.slice(11, 16)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{a.patient_name}</Text>
                    <Text style={styles.meta}>{a.reason || 'موعد'}</Text>
                  </View>
                  <View style={styles.statusChips}>
                    <Chip label="مؤكد" active={a.status === 'confirmed'} onPress={() => setStatus(a, 'confirmed')} color={colors.success} tid={`appt-confirm-${a.id}`} />
                    <Chip label="مكتمل" active={a.status === 'completed'} onPress={() => setStatus(a, 'completed')} color={colors.brand} tid={`appt-complete-${a.id}`} />
                    <Chip label="ملغي" active={a.status === 'cancelled'} onPress={() => setStatus(a, 'cancelled')} color={colors.error} tid={`appt-cancel-${a.id}`} />
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}
      <AddApptModal visible={showAdd} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, color, tid }: any) {
  return (
    <Pressable testID={tid} onPress={onPress} style={[styles.chip, { borderColor: active ? color : colors.border, backgroundColor: active ? color + '18' : 'transparent' }]}>
      <Text style={{ fontSize: 11, color: active ? color : colors.muted, fontFamily: fontFamily.medium }}>{label}</Text>
    </Pressable>
  );
}

function AddApptModal({ visible, onClose, onCreated }: any) {
  const [patients, setPatients] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  React.useEffect(() => {
    if (visible) api.listPatients().then(setPatients).catch(() => {});
  }, [visible]);

  const submit = async () => {
    setErr('');
    if (!patient) { setErr('اختر المريض'); return; }
    if (!date) { setErr('اختر التاريخ'); return; }
    setLoading(true);
    try {
      await api.createAppointment({
        patient_id: patient.id,
        patient_name: patient.full_name,
        date: new Date(date).toISOString(),
        duration_minutes: 30,
        reason,
        status: 'scheduled',
      });
      setPatient(null); setDate(new Date().toISOString().slice(0, 16)); setReason('');
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>موعد جديد</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.label}>المريض</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }} style={{ marginBottom: spacing.md }}>
                {patients.map((p) => (
                  <Pressable
                    key={p.id}
                    testID={`appt-pick-${p.id}`}
                    onPress={() => setPatient(p)}
                    style={[styles.patChip, { backgroundColor: patient?.id === p.id ? colors.brand : colors.surfaceSecondary }]}
                  >
                    <Text style={{ color: patient?.id === p.id ? '#fff' : colors.onSurface, fontFamily: fontFamily.medium }}>{p.full_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>التاريخ والوقت (YYYY-MM-DDTHH:MM)</Text>
              <TextInput testID="appt-date" value={date} onChangeText={setDate} style={styles.input} placeholder="2026-05-30T10:00" placeholderTextColor={colors.muted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>السبب</Text>
              <TextInput testID="appt-reason" value={reason} onChangeText={setReason} style={styles.input} placeholder="فحص، حشوة، تنظيف..." placeholderTextColor={colors.muted} />

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Pressable testID="save-appt-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ الموعد</Text>}
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
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  headerTitle: { fontSize: font.xl, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular },
  dayHeader: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  timeBox: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, minWidth: 56, alignItems: 'center' },
  timeText: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.sm },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  statusChips: { flexDirection: 'row-reverse', gap: 4 },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  patChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
