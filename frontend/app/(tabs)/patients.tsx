import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

export default function PatientsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (search = q) => {
    setLoading(true);
    try {
      const list = await api.listPatients(search);
      setItems(list);
    } finally { setLoading(false); }
  }, [q]);

  useFocusEffect(useCallback(() => { load(''); }, []));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المرضى</Text>
        <Pressable testID="add-patient-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput
          testID="patient-search"
          value={q}
          onChangeText={(v) => { setQ(v); load(v); }}
          placeholder="ابحث بالاسم..."
          placeholderTextColor={colors.muted}
          style={styles.search}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyText}>لا يوجد مرضى بعد</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Pressable
              testID={`patient-row-${item.id}`}
              onPress={() => router.push({ pathname: '/patient/[id]', params: { id: item.id } })}
              style={styles.row}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.full_name || '?').slice(0, 1)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>{item.phone || 'بدون رقم'} · {item.gender || '—'}</Text>
              </View>
              <Feather name="chevron-left" size={22} color={colors.muted} />
            </Pressable>
          )}
        />
      )}

      <AddPatientModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); load(''); }}
      />
    </SafeAreaView>
  );
}

function AddPatientModal({ visible, onClose, onCreated }: any) {
  const [form, setForm] = useState<any>({ full_name: '', phone: '', date_of_birth: '', gender: '', address: '', medical_history: '', allergies: '', medications: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.full_name.trim()) { setErr('اسم المريض مطلوب'); return; }
    setLoading(true);
    try {
      await api.createPatient(form);
      setForm({ full_name: '', phone: '', date_of_birth: '', gender: '', address: '', medical_history: '', allergies: '', medications: '', notes: '' });
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} testID="patient-close" hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>إضافة مريض</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              {[
                { k: 'full_name', l: 'الاسم الكامل *' },
                { k: 'phone', l: 'رقم الهاتف' },
                { k: 'date_of_birth', l: 'تاريخ الميلاد (YYYY-MM-DD)' },
                { k: 'gender', l: 'الجنس' },
                { k: 'address', l: 'العنوان' },
                { k: 'medical_history', l: 'التاريخ المرضي' },
                { k: 'allergies', l: 'الحساسية' },
                { k: 'medications', l: 'الأدوية' },
                { k: 'notes', l: 'ملاحظات' },
              ].map((f) => (
                <View key={f.k} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.label}>{f.l}</Text>
                  <TextInput
                    testID={`patient-field-${f.k}`}
                    value={form[f.k]} onChangeText={(v) => upd(f.k, v)}
                    style={styles.input}
                    placeholder=""
                    placeholderTextColor={colors.muted}
                    multiline={['medical_history', 'notes', 'allergies', 'medications', 'address'].includes(f.k)}
                  />
                </View>
              ))}
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="save-patient-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ المريض</Text>}
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
  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', color: colors.onSurface, fontSize: font.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.brand, fontSize: font.lg, fontFamily: fontFamily.bold },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
