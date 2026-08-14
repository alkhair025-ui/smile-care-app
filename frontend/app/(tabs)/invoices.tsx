import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';

const KIND_LABELS: Record<string, string> = {
  patient: 'المرضى',
  purchase: 'المشتريات',
  expense: 'المصاريف',
  salary: 'الرواتب',
};

const KIND_COLORS: Record<string, string> = {
  patient: '#3A6F54',
  purchase: '#B58548',
  expense: '#A84A42',
  salary: '#4A5854',
};

export default function Invoices() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'patient' | 'purchase' | 'expense' | 'salary'>('patient');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setDenied(false);
    try { setItems(await api.listInvoices(tab)); }
    catch (e: any) {
      if (String(e.message).includes('صلاحية')) setDenied(true);
      setItems([]);
    } finally { setLoading(false); }
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = useMemo(() => items.reduce((s, i) => s + (i.total || 0), 0), [items]);

  const shareWhatsApp = (inv: any) => {
    const lines = [
      `فاتورة من ${user?.clinic_name || 'العيادة'}`,
      `المستفيد: ${inv.party_name}`,
      `التاريخ: ${(inv.date || '').slice(0, 10)}`,
      ...inv.items.map((it: any) => `• ${it.description} — ${it.quantity} × ${it.unit_price} = ${it.quantity * it.unit_price} د.أ`),
      `الإجمالي: ${inv.total} د.أ`,
      `المدفوع: ${inv.paid} د.أ`,
    ];
    const text = encodeURIComponent(lines.join('\n'));
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {});
  };

  if (denied) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <Feather name="lock" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyText}>ليس لديك صلاحية عرض الفواتير المالية</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الفواتير</Text>
        <Pressable testID="add-invoice-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
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

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="file-text" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyText}>لا توجد فواتير</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.dotSquare, { backgroundColor: KIND_COLORS[item.kind] + '22' }]}>
                <Feather name="file-text" size={18} color={KIND_COLORS[item.kind]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.party_name}</Text>
                <Text style={styles.meta}>{(item.date || '').slice(0, 10)} · {item.items?.length || 0} بند</Text>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={styles.amt}>{Math.round(item.total).toLocaleString('en')} د.أ</Text>
                {tab === 'patient' && (
                  <Pressable testID={`wa-share-${item.id}`} onPress={() => shareWhatsApp(item)} style={styles.waBtn}>
                    <Feather name="share-2" size={12} color={colors.success} />
                    <Text style={styles.waText}>واتساب</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}

      <AddInvoiceModal kind={tab} visible={showAdd} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
    </SafeAreaView>
  );
}

function AddInvoiceModal({ kind, visible, onClose, onCreated }: any) {
  const [partyName, setPartyName] = useState('');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!partyName.trim() || !desc.trim() || !price) { setErr('يرجى إكمال الحقول'); return; }
    setLoading(true);
    try {
      const q = parseFloat(qty || '1') || 1;
      const p = parseFloat(price || '0') || 0;
      await api.createInvoice({
        kind,
        party_name: partyName,
        items: [{ description: desc, quantity: q, unit_price: p }],
        total: q * p,
        paid: q * p,
        date: new Date().toISOString(),
        note: '',
      });
      setPartyName(''); setDesc(''); setQty('1'); setPrice('');
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>فاتورة {KIND_LABELS[kind]}</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.label}>{kind === 'patient' ? 'اسم المريض' : kind === 'salary' ? 'اسم الموظف' : kind === 'purchase' ? 'اسم المورّد' : 'البيان'}</Text>
              <TextInput testID="inv-party" value={partyName} onChangeText={setPartyName} style={styles.input} />
              <Text style={[styles.label, { marginTop: spacing.md }]}>الوصف</Text>
              <TextInput testID="inv-desc" value={desc} onChangeText={setDesc} style={styles.input} />
              <View style={{ flexDirection: 'row-reverse', gap: spacing.md, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>الكمية</Text>
                  <TextInput testID="inv-qty" keyboardType="numeric" value={qty} onChangeText={setQty} style={styles.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>السعر</Text>
                  <TextInput testID="inv-price" keyboardType="numeric" value={price} onChangeText={setPrice} style={styles.input} />
                </View>
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
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  dotSquare: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  amt: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface },
  waBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.success + '18', borderRadius: radius.sm },
  waText: { color: colors.success, fontSize: 11, fontFamily: fontFamily.medium },
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
