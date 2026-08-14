import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';
import { exportInvoicePdf, shareInvoiceViaWhatsApp } from '@/src/invoice-pdf';

const KIND_LABELS: Record<string, string> = { patient: 'المرضى', purchase: 'المشتريات', expense: 'المصاريف', salary: 'الرواتب' };
const KIND_COLORS: Record<string, string> = { patient: '#3A6F54', purchase: '#B58548', expense: '#A84A42', salary: '#4A5854' };

export default function Invoices() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'patient' | 'purchase' | 'expense' | 'salary'>('patient');
  const [items, setItems] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>({});
  const [patientPhones, setPatientPhones] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuInv, setMenuInv] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setDenied(false);
    try {
      setItems(await api.listInvoices(tab));
      try { setClinic(await api.getSettings()); } catch { /* noop */ }
      if (tab === 'patient') {
        try {
          const ps = await api.listPatients();
          const map: Record<string, string> = {};
          ps.forEach((p: any) => { map[p.id] = p.phone; });
          setPatientPhones(map);
        } catch { /* noop */ }
      }
    } catch (e: any) {
      if (String(e.message).includes('صلاحية')) setDenied(true);
      setItems([]);
    } finally { setLoading(false); }
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = useMemo(() => items.reduce((s, i) => s + (i.total || 0), 0), [items]);
  const clinicInfo = { name: clinic.clinic_name, phone: clinic.clinic_phone, address: clinic.clinic_address };

  const onShare = async (inv: any) => {
    setBusyId(inv.id);
    try { await shareInvoiceViaWhatsApp(inv, clinicInfo, patientPhones[inv.patient_id]); } finally { setBusyId(null); }
  };
  const onDelete = async (inv: any) => {
    setMenuInv(null);
    await api.deleteInvoice(inv.id);
    load();
  };

  if (denied) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}><Feather name="lock" size={48} color={colors.borderStrong} /><Text style={styles.emptyText}>ليس لديك صلاحية عرض الفواتير المالية</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الفواتير</Text>
        <Pressable testID="add-invoice-btn" onPress={() => { setEditing(null); setShowForm(true); }} style={styles.addBtn}><Feather name="plus" size={22} color="#fff" /></Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {(['patient', 'purchase', 'salary', 'expense'] as const).map((k) => (
          <Pressable key={k} testID={`invoice-tab-${k}`} onPress={() => setTab(k)} style={[styles.tabChip, { backgroundColor: tab === k ? colors.brand : colors.surface, borderColor: tab === k ? colors.brand : colors.border }]}>
            <Text style={{ color: tab === k ? '#fff' : colors.onSurface, fontFamily: fontFamily.medium }}>{KIND_LABELS[k]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>إجمالي {KIND_LABELS[tab]}</Text>
        <Text style={styles.totalVal}>{Math.round(total).toLocaleString('en')} د.أ</Text>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> :
        items.length === 0 ? <View style={styles.center}><Feather name="file-text" size={48} color={colors.borderStrong} /><Text style={styles.emptyText}>لا توجد فواتير</Text></View> :
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.dotSquare, { backgroundColor: KIND_COLORS[item.kind] + '22' }]}><Feather name="file-text" size={18} color={KIND_COLORS[item.kind]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.party_name}</Text>
                <Text style={styles.meta}>{(item.date || '').slice(0, 10)} · {item.items?.length || 0} بند</Text>
                <View style={styles.actionsRow}>
                  <Pressable testID={`inv-pdf-${item.id}`} onPress={() => exportInvoicePdf(item, clinicInfo)} style={styles.miniBtn}>
                    <Feather name="download" size={12} color={colors.brand} /><Text style={styles.miniText}>PDF</Text>
                  </Pressable>
                  {tab === 'patient' && (
                    <Pressable testID={`wa-share-${item.id}`} onPress={() => onShare(item)} disabled={busyId === item.id} style={[styles.miniBtn, { backgroundColor: colors.success + '18' }]}>
                      {busyId === item.id ? <ActivityIndicator size="small" color={colors.success} /> : (<><Feather name="share-2" size={12} color={colors.success} /><Text style={[styles.miniText, { color: colors.success }]}>واتساب</Text></>)}
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-start', gap: spacing.sm }}>
                <Text style={styles.amt}>{Math.round(item.total).toLocaleString('en')} د.أ</Text>
                <Pressable testID={`inv-menu-${item.id}`} onPress={() => setMenuInv(item)} hitSlop={8}><Feather name="more-vertical" size={18} color={colors.muted} /></Pressable>
              </View>
            </View>
          )}
        />
      }

      <InvoiceFormModal
        kind={tab}
        editing={editing}
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load(); }}
      />

      {/* options menu */}
      <Modal visible={!!menuInv} transparent animationType="fade" onRequestClose={() => setMenuInv(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuInv(null)}>
          <View style={styles.menuSheet}>
            <Pressable testID="inv-edit-btn" onPress={() => { setEditing(menuInv); setMenuInv(null); setShowForm(true); }} style={styles.menuItem}>
              <Feather name="edit-2" size={18} color={colors.brand} /><Text style={styles.menuText}>تعديل الفاتورة</Text>
            </Pressable>
            {user?.role === 'doctor' && (
              <Pressable testID="inv-delete-btn" onPress={() => onDelete(menuInv)} style={styles.menuItem}>
                <Feather name="trash-2" size={18} color={colors.error} /><Text style={[styles.menuText, { color: colors.error }]}>حذف الفاتورة</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InvoiceFormModal({ kind, editing, visible, onClose, onSaved }: any) {
  const [partyName, setPartyName] = useState('');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  React.useEffect(() => {
    if (visible) {
      if (editing) {
        setPartyName(editing.party_name || '');
        const it = editing.items?.[0] || {};
        setDesc(it.description || '');
        setQty(String(it.quantity ?? 1));
        setPrice(String(it.unit_price ?? ''));
      } else { setPartyName(''); setDesc(''); setQty('1'); setPrice(''); }
      setErr('');
    }
  }, [visible, editing]);

  const submit = async () => {
    setErr('');
    if (!partyName.trim() || !desc.trim() || !price) { setErr('يرجى إكمال الحقول'); return; }
    setLoading(true);
    try {
      const q = parseFloat(qty || '1') || 1;
      const p = parseFloat(price || '0') || 0;
      const payload = {
        kind, party_name: partyName, patient_id: editing?.patient_id || '',
        items: [{ description: desc, quantity: q, unit_price: p }],
        total: q * p, paid: q * p, date: editing?.date || new Date().toISOString(), note: '',
      };
      if (editing) await api.updateInvoice(editing.id, payload);
      else await api.createInvoice(payload);
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>{editing ? 'تعديل' : 'فاتورة'} {KIND_LABELS[kind]}</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.label}>{kind === 'patient' ? 'اسم المريض' : kind === 'salary' ? 'اسم الموظف' : kind === 'purchase' ? 'اسم المورّد' : 'البيان'}</Text>
              <TextInput testID="inv-party" value={partyName} onChangeText={setPartyName} style={styles.input} />
              <Text style={[styles.label, { marginTop: spacing.md }]}>الوصف</Text>
              <TextInput testID="inv-desc" value={desc} onChangeText={setDesc} style={styles.input} />
              <View style={{ flexDirection: 'row-reverse', gap: spacing.md, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}><Text style={styles.label}>الكمية</Text><TextInput testID="inv-qty" keyboardType="numeric" value={qty} onChangeText={setQty} style={styles.input} /></View>
                <View style={{ flex: 1 }}><Text style={styles.label}>السعر</Text><TextInput testID="inv-price" keyboardType="numeric" value={price} onChangeText={setPrice} style={styles.input} /></View>
              </View>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="save-invoice-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
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
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  headerTitle: { fontSize: font.xl, fontFamily: fontFamily.bold, color: colors.onSurface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  tabChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, flexShrink: 0 },
  totalBox: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md },
  totalLabel: { color: colors.brand, fontFamily: fontFamily.bold },
  totalVal: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center' },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  dotSquare: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  actionsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.sm },
  miniBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.brandTertiary, borderRadius: radius.sm },
  miniText: { color: colors.brand, fontSize: 11, fontFamily: fontFamily.medium },
  amt: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.sm },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  menuText: { fontSize: font.base, fontFamily: fontFamily.medium, color: colors.onSurface },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.lg },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
