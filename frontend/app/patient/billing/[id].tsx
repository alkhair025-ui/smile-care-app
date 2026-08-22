import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';
import { sharePortalViaWhatsApp } from '@/src/portal-share';
import { money } from '@/src/currencies';
import CurrencyPicker from '@/src/components/CurrencyPicker';

export default function PatientBilling() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [clinic, setClinic] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [menuInv, setMenuInv] = useState<any>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, inv] = await Promise.all([api.getPatient(id), api.listInvoices('patient')]);
      setPatient(p);
      setItems(inv.filter((i: any) => i.patient_id === id));
      try { setClinic(await api.getSettings()); } catch { /* noop */ }
    } catch (e: any) { console.warn('billing load', e?.message); } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals = useMemo(() => {
    const t: Record<string, { billed: number; paid: number }> = {};
    items.forEach((i) => {
      const c = i.currency || 'SYP';
      t[c] = t[c] || { billed: 0, paid: 0 };
      t[c].billed += i.total || 0; t[c].paid += i.paid || 0;
    });
    return t;
  }, [items]);

  const onDelete = async (inv: any) => { setMenuInv(null); await api.deleteInvoice(inv.id); load(); };

  const sharePortal = async () => {
    setSharing(true);
    try { await sharePortalViaWhatsApp(id!, clinic.clinic_name, patient?.full_name, patient?.phone); }
    catch (e: any) { console.warn('share portal', e?.message); } finally { setSharing(false); }
  };

  if (loading || !patient) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>فواتير: {patient.full_name}</Text>
        <Pressable testID="billing-add" onPress={() => { setEditing(null); setShowForm(true); }} style={styles.addBtn}><Feather name="plus" size={20} color="#fff" /></Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        ListHeaderComponent={
          <View>
            {/* Financial status */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>الحالة المالية</Text>
              {Object.keys(totals).length === 0 ? <Text style={styles.emptyInline}>لا توجد فواتير بعد</Text> :
                Object.entries(totals).map(([c, v]) => (
                  <View key={c} style={styles.summaryRow}>
                    <SumTile label="الإجمالي" value={money(v.billed, c)} color={colors.info} />
                    <SumTile label="المدفوع" value={money(v.paid, c)} color={colors.success} />
                    <SumTile label="المتبقي" value={money(v.billed - v.paid, c)} color={(v.billed - v.paid) > 0 ? colors.error : colors.success} />
                  </View>
                ))}
            </View>

            <Pressable testID="billing-share-portal" onPress={sharePortal} disabled={sharing} style={styles.portalBtn}>
              {sharing ? <ActivityIndicator color="#fff" /> : (<><Feather name="share-2" size={16} color="#fff" /><Text style={styles.portalBtnText}>إرسال رابط المريض عبر واتساب</Text></>)}
            </Pressable>

            <Text style={styles.listTitle}>سجل الفواتير</Text>
          </View>
        }
        renderItem={({ item }) => {
          const remaining = (item.total || 0) - (item.paid || 0);
          return (
            <View style={styles.invRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                  <Text style={styles.invName}>{(item.items?.[0]?.description) || 'علاج'}</Text>
                  <Text style={styles.invTotal}>{money(item.total, item.currency)}</Text>
                </View>
                <Text style={styles.invMeta}>{(item.date || '').slice(0, 10)}</Text>
                <View style={styles.payRow}>
                  <Text style={styles.payText}>مدفوع: {money(item.paid, item.currency)}</Text>
                  <Text style={[styles.payText, { color: remaining > 0 ? colors.error : colors.success }]}>متبقٍ: {money(remaining, item.currency)}</Text>
                </View>
              </View>
              <Pressable testID={`billing-menu-${item.id}`} onPress={() => setMenuInv(item)} hitSlop={8}><Feather name="more-vertical" size={18} color={colors.muted} /></Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<View style={styles.center}><Feather name="file-text" size={40} color={colors.borderStrong} /><Text style={styles.emptyInline}>لا توجد فواتير</Text></View>}
      />

      <BillingFormModal patientId={id!} patientName={patient.full_name} editing={editing} visible={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />

      <Modal visible={!!menuInv} transparent animationType="fade" onRequestClose={() => setMenuInv(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuInv(null)}>
          <View style={styles.menuSheet}>
            <Pressable testID="billing-edit" onPress={() => { setEditing(menuInv); setMenuInv(null); setShowForm(true); }} style={styles.menuItem}>
              <Feather name="edit-2" size={18} color={colors.brand} /><Text style={styles.menuText}>تعديل الفاتورة</Text>
            </Pressable>
            {user?.role === 'doctor' && (
              <Pressable testID="billing-delete" onPress={() => onDelete(menuInv)} style={styles.menuItem}>
                <Feather name="trash-2" size={18} color={colors.error} /><Text style={[styles.menuText, { color: colors.error }]}>حذف الفاتورة</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function SumTile({ label, value, color }: any) {
  return (
    <View style={[styles.sumTile, { borderTopColor: color }]}>
      <Text style={styles.sumVal} numberOfLines={1}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

function BillingFormModal({ patientId, patientName, editing, visible, onClose, onSaved }: any) {
  const [treatment, setTreatment] = useState('');
  const [cost, setCost] = useState('');
  const [paid, setPaid] = useState('');
  const [currency, setCurrency] = useState('SYP');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  React.useEffect(() => {
    if (visible) {
      if (editing) {
        setTreatment(editing.items?.[0]?.description || '');
        setCost(String(editing.total ?? ''));
        setPaid(String(editing.paid ?? ''));
        setCurrency(editing.currency || 'SYP');
        setDate((editing.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      } else { setTreatment(''); setCost(''); setPaid(''); setCurrency('SYP'); setDate(new Date().toISOString().slice(0, 10)); }
      setErr('');
    }
  }, [visible, editing]);

  const remaining = (parseFloat(cost || '0') || 0) - (parseFloat(paid || '0') || 0);

  const submit = async () => {
    setErr('');
    if (!treatment.trim() || !cost) { setErr('يرجى إدخال نوع العلاج والتكلفة'); return; }
    setLoading(true);
    try {
      const total = parseFloat(cost) || 0;
      const paidVal = parseFloat(paid || '0') || 0;
      const payload = {
        kind: 'patient', patient_id: patientId, party_name: patientName,
        items: [{ description: treatment, quantity: 1, unit_price: total }],
        total, paid: paidVal, currency, date: new Date(date).toISOString(), note: '',
      };
      if (editing) await api.updateInvoice(editing.id, payload); else await api.createInvoice(payload);
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>{editing ? 'تعديل فاتورة' : 'فاتورة جديدة'}</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.label}>نوع العلاج / الخطة</Text>
              <TextInput testID="billing-treatment" value={treatment} onChangeText={setTreatment} style={styles.input} placeholder="حشوة، تنظيف، تقويم..." placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: 'row-reverse', gap: spacing.md, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}><Text style={styles.label}>التكلفة</Text><TextInput testID="billing-cost" keyboardType="numeric" value={cost} onChangeText={setCost} style={styles.input} /></View>
                <View style={{ flex: 1 }}><Text style={styles.label}>الدفعة</Text><TextInput testID="billing-paid" keyboardType="numeric" value={paid} onChangeText={setPaid} style={styles.input} /></View>
              </View>
              <View style={styles.remainBox}>
                <Text style={styles.remainLabel}>المتبقي</Text>
                <Text style={[styles.remainVal, { color: remaining > 0 ? colors.error : colors.success }]}>{money(remaining, currency)}</Text>
              </View>
              <Text style={[styles.label, { marginTop: spacing.md }]}>التاريخ (YYYY-MM-DD)</Text>
              <TextInput testID="billing-date" value={date} onChangeText={setDate} style={styles.input} />
              <Text style={[styles.label, { marginTop: spacing.md }]}>العملة</Text>
              <CurrencyPicker testID="billing-currency" value={currency} onChange={setCurrency} />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="billing-save" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ الفاتورة</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  summaryTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  summaryRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.sm },
  sumTile: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderTopWidth: 3, alignItems: 'center' },
  sumVal: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface },
  sumLabel: { fontSize: 11, color: colors.muted, fontFamily: fontFamily.regular, marginTop: 2 },
  portalBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.success, paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.md },
  portalBtnText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.base },
  listTitle: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurfaceSecondary, marginTop: spacing.xl, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  emptyInline: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center', paddingVertical: spacing.md },
  invRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  invName: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  invTotal: { color: colors.brand, fontFamily: fontFamily.bold },
  invMeta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  payRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: spacing.sm },
  payText: { fontFamily: fontFamily.medium, fontSize: font.sm, color: colors.onSurfaceSecondary },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.sm },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  menuText: { fontSize: font.base, fontFamily: fontFamily.medium, color: colors.onSurface },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  remainBox: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  remainLabel: { color: colors.brand, fontFamily: fontFamily.bold },
  remainVal: { fontFamily: fontFamily.bold, fontSize: font.lg },
  curRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  curChip: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
