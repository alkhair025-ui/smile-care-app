import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

export default function Inventory() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [menuItem, setMenuItem] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.listInventory()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = async (it: any) => { setMenuItem(null); await api.deleteInventory(it.id); load(); };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>المستودع</Text>
        <Pressable testID="add-inv-btn" onPress={() => { setEditing(null); setShowForm(true); }} style={styles.addBtn}><Feather name="plus" size={20} color="#fff" /></Pressable>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> :
        items.length === 0 ? <View style={styles.center}><Feather name="package" size={48} color={colors.borderStrong} /><Text style={styles.empty}>لا توجد مواد</Text></View> :
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const low = item.quantity <= item.min_quantity;
            return (
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: low ? colors.warningBg : colors.brandTertiary }]}>
                  <Feather name={low ? 'alert-triangle' : 'package'} size={20} color={low ? colors.warning : colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.category} · {item.quantity} {item.unit}</Text>
                </View>
                {low && <View style={styles.lowChip}><Text style={styles.lowText}>ناقص</Text></View>}
                <Pressable testID={`inv-menu-${item.id}`} onPress={() => setMenuItem(item)} hitSlop={8}><Feather name="more-vertical" size={18} color={colors.muted} /></Pressable>
              </View>
            );
          }}
        />
      }

      <InventoryFormModal editing={editing} visible={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />

      <Modal visible={!!menuItem} transparent animationType="fade" onRequestClose={() => setMenuItem(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuItem(null)}>
          <View style={styles.menuSheet}>
            <Pressable testID="inv-edit-btn" onPress={() => { setEditing(menuItem); setMenuItem(null); setShowForm(true); }} style={styles.menuItem}>
              <Feather name="edit-2" size={18} color={colors.brand} /><Text style={styles.menuText}>تعديل المادة</Text>
            </Pressable>
            <Pressable testID="inv-delete-btn" onPress={() => onDelete(menuItem)} style={styles.menuItem}>
              <Feather name="trash-2" size={18} color={colors.error} /><Text style={[styles.menuText, { color: colors.error }]}>حذف المادة</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InventoryFormModal({ editing, visible, onClose, onSaved }: any) {
  const empty = { name: '', unit: 'قطعة', category: 'عام', quantity: '0', min_quantity: '5', unit_price: '0' };
  const [form, setForm] = useState<any>(empty);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (visible) {
      if (editing) setForm({ name: editing.name, unit: editing.unit, category: editing.category, quantity: String(editing.quantity), min_quantity: String(editing.min_quantity), unit_price: String(editing.unit_price) });
      else setForm(empty);
      setErr('');
    }
  }, [visible, editing]);

  const submit = async () => {
    setErr('');
    if (!form.name.trim()) { setErr('الاسم مطلوب'); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name, unit: form.unit, category: form.category,
        quantity: parseFloat(form.quantity) || 0, min_quantity: parseFloat(form.min_quantity) || 0, unit_price: parseFloat(form.unit_price) || 0,
      };
      if (editing) await api.updateInventory(editing.id, payload);
      else await api.createInventory(payload);
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>{editing ? 'تعديل مادة' : 'إضافة مادة'}</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {[{ k: 'name', l: 'الاسم *' }, { k: 'category', l: 'الفئة' }, { k: 'unit', l: 'الوحدة' }, { k: 'quantity', l: 'الكمية', num: true }, { k: 'min_quantity', l: 'الحد الأدنى', num: true }, { k: 'unit_price', l: 'سعر الوحدة', num: true }].map((f) => (
                <View key={f.k} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.label}>{f.l}</Text>
                  <TextInput testID={`inv-field-${f.k}`} value={form[f.k]} onChangeText={(v) => upd(f.k, v)} keyboardType={f.num ? 'numeric' : 'default'} style={styles.input} />
                </View>
              ))}
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="save-inv-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ</Text>}
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
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, ...shadow.card },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  lowChip: { backgroundColor: colors.warningBg, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  lowText: { color: colors.warning, fontFamily: fontFamily.bold, fontSize: 11 },
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
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
