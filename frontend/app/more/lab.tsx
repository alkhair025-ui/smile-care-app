import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

const STATUS_LABELS: Record<string, string> = { sent: 'مُرسل', received: 'تم الاستلام', delivered: 'تم التسليم' };
const STATUS_COLORS: Record<string, string> = { sent: '#B58548', received: '#4A7065', delivered: '#3A6F54' };

export default function LabScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.listLab()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (o: any, status: string) => {
    await api.updateLab(o.id, { ...o, status });
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>المخابر</Text>
        <Pressable testID="add-lab-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}><Feather name="plus" size={20} color="#fff" /></Pressable>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> :
        items.length === 0 ? <View style={styles.center}><Feather name="clipboard" size={48} color={colors.borderStrong} /><Text style={styles.empty}>لا توجد طلبات مخبرية</Text></View> :
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: STATUS_COLORS[item.status] + '22' }]}>
                <Feather name="clipboard" size={20} color={STATUS_COLORS[item.status]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.patient_name} · {item.lab_name}</Text>
                <Text style={styles.meta}>{item.description}</Text>
                <Text style={styles.meta}>الكلفة: {item.cost} د.أ | المدفوع: {item.paid} د.أ</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 4, marginTop: 4 }}>
                  {['sent', 'received', 'delivered'].map((s) => (
                    <Pressable key={s} testID={`lab-${s}-${item.id}`} onPress={() => setStatus(item, s)} style={[styles.chip, { borderColor: item.status === s ? STATUS_COLORS[s] : colors.border, backgroundColor: item.status === s ? STATUS_COLORS[s] + '18' : 'transparent' }]}>
                      <Text style={{ fontSize: 11, color: item.status === s ? STATUS_COLORS[s] : colors.muted, fontFamily: fontFamily.medium }}>{STATUS_LABELS[s]}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}
        />
      }
      <AddLabModal visible={showAdd} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
    </SafeAreaView>
  );
}

function AddLabModal({ visible, onClose, onCreated }: any) {
  const [patients, setPatients] = useState<any[]>([]);
  const [patient, setPatient] = useState<any>(null);
  const [form, setForm] = useState<any>({ lab_name: '', description: '', cost: '0' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  React.useEffect(() => { if (visible) api.listPatients().then(setPatients); }, [visible]);

  const submit = async () => {
    setErr('');
    if (!patient || !form.lab_name.trim() || !form.description.trim()) { setErr('يرجى إكمال الحقول'); return; }
    setLoading(true);
    try {
      await api.createLab({
        patient_id: patient.id, patient_name: patient.full_name,
        lab_name: form.lab_name, description: form.description,
        sent_at: new Date().toISOString(), expected_at: '', status: 'sent',
        cost: parseFloat(form.cost) || 0, paid: 0,
      });
      setPatient(null); setForm({ lab_name: '', description: '', cost: '0' });
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>طلب مخبري</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.label}>المريض</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                {patients.map((p) => (
                  <Pressable key={p.id} testID={`lab-pick-${p.id}`} onPress={() => setPatient(p)} style={[styles.patChip, { backgroundColor: patient?.id === p.id ? colors.brand : colors.surfaceSecondary }]}>
                    <Text style={{ color: patient?.id === p.id ? '#fff' : colors.onSurface, fontFamily: fontFamily.medium }}>{p.full_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.label, { marginTop: spacing.md }]}>اسم المخبر</Text>
              <TextInput testID="lab-name" value={form.lab_name} onChangeText={(v) => upd('lab_name', v)} style={styles.input} />
              <Text style={[styles.label, { marginTop: spacing.md }]}>الوصف</Text>
              <TextInput testID="lab-desc" value={form.description} onChangeText={(v) => upd('description', v)} style={styles.input} multiline />
              <Text style={[styles.label, { marginTop: spacing.md }]}>الكلفة</Text>
              <TextInput testID="lab-cost" value={form.cost} onChangeText={(v) => upd('cost', v)} keyboardType="numeric" style={styles.input} />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="save-lab-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ الطلب</Text>}
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
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  empty: { color: colors.muted, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
  patChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
});
