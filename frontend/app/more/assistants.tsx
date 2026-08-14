import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';

export default function Assistants() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.listAssistants()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>المساعدون</Text>
        <Pressable testID="add-assistant-btn" onPress={() => setShowAdd(true)} style={styles.addBtn}><Feather name="plus" size={20} color="#fff" /></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> :
        items.length === 0 ? <View style={styles.center}><Feather name="users" size={48} color={colors.borderStrong} /><Text style={styles.empty}>لا يوجد مساعدون</Text></View> :
        <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg }} renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}><Feather name="user" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
            </View>
            <Pressable testID={`del-assist-${item.id}`} onPress={async () => { await api.deleteAssistant(item.id); load(); }} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.error} />
            </Pressable>
          </View>
        )} />
      }
      <AddModal visible={showAdd} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
    </SafeAreaView>
  );
}

function AddModal({ visible, onClose, onCreated }: any) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.full_name || !form.email || form.password.length < 6) { setErr('يرجى إكمال الحقول (كلمة المرور 6 أحرف على الأقل)'); return; }
    setLoading(true);
    try { await api.createAssistant({ ...form, email: form.email.trim() }); setForm({ full_name: '', email: '', password: '' }); onCreated(); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>إضافة مساعد</Text>
            <View style={{ width: 22 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {[{ k: 'full_name', l: 'الاسم' }, { k: 'email', l: 'البريد الإلكتروني' }, { k: 'password', l: 'كلمة المرور' }].map((f) => (
                <View key={f.k} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.label}>{f.l}</Text>
                  <TextInput testID={`assist-${f.k}`} value={(form as any)[f.k]} onChangeText={(v) => upd(f.k, v)} secureTextEntry={f.k === 'password'} autoCapitalize="none" style={styles.input} />
                </View>
              ))}
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <Pressable testID="save-assistant-btn" onPress={submit} disabled={loading} style={styles.primaryBtn}>
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
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  meta: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.xs, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  err: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, fontFamily: fontFamily.regular },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold },
});
