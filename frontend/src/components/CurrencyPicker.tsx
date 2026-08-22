import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, font, fontFamily } from '@/src/theme';
import { CURRENCIES, curName, curSymbol } from '@/src/currencies';

// Searchable currency dropdown so the doctor can quickly find a currency
// instead of scrolling a long inline list.
export default function CurrencyPicker({ value, onChange, testID = 'currency-picker' }: {
  value: string;
  onChange: (code: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return CURRENCIES;
    return CURRENCIES.filter((c) =>
      c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || c.symbol.includes(s));
  }, [q]);

  return (
    <View>
      <Pressable testID={testID} onPress={() => { setQ(''); setOpen(true); }} style={styles.field}>
        <Feather name="chevron-down" size={18} color={colors.muted} />
        <Text style={styles.fieldText}>{curName(value)} ({curSymbol(value)})</Text>
        <Feather name="dollar-sign" size={16} color={colors.brand} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable testID={`${testID}-close`} onPress={() => setOpen(false)} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
              <Text style={styles.title}>اختر العملة</Text>
              <View style={{ width: 22 }} />
            </View>
            <View style={styles.searchWrap}>
              <Feather name="search" size={18} color={colors.muted} />
              <TextInput
                testID={`${testID}-search`}
                value={q}
                onChangeText={setQ}
                placeholder="ابحث عن العملة..."
                placeholderTextColor={colors.muted}
                style={styles.search}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              renderItem={({ item }) => {
                const active = item.code === value;
                return (
                  <Pressable
                    testID={`${testID}-opt-${item.code}`}
                    onPress={() => { onChange(item.code); setOpen(false); }}
                    style={[styles.row, active && styles.rowActive]}
                  >
                    <Text style={[styles.rowText, active && { color: '#fff' }]}>{item.name} ({item.symbol})</Text>
                    {active ? <Feather name="check" size={18} color="#fff" /> : <Text style={styles.rowCode}>{item.code}</Text>}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>لا توجد نتائج</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  fieldText: { flex: 1, marginHorizontal: spacing.sm, color: colors.onSurface, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: spacing.md },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginHorizontal: spacing.lg, marginVertical: spacing.md },
  search: { flex: 1, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  rowActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowText: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base },
  rowCode: { fontFamily: fontFamily.medium, color: colors.muted, fontSize: font.sm },
  empty: { textAlign: 'center', color: colors.muted, fontFamily: fontFamily.regular, paddingVertical: spacing.xl },
});
