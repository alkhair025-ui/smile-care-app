import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { money, curName } from '@/src/currencies';

const PERIODS = [
  { key: 'daily', label: 'يومي' },
  { key: 'weekly', label: 'أسبوعي' },
  { key: 'monthly', label: 'شهري' },
  { key: 'yearly', label: 'سنوي' },
];

// Years from 2026 onward (up to the current year).
const CURRENT_YEAR = new Date().getFullYear();
const YEARS: number[] = [];
for (let y = 2026; y <= Math.max(2026, CURRENT_YEAR); y++) YEARS.push(y);

export default function Reports() {
  const router = useRouter();
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(2026);
  const [yearOpen, setYearOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.profitReport(period, period === 'yearly' ? year : undefined)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [period, year]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.by_currency || [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="reports-back" onPress={() => router.back()} hitSlop={8}><Feather name="chevron-right" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>التقارير المالية</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={styles.section}>الفترة الزمنية</Text>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable key={p.key} testID={`period-${p.key}`} onPress={() => setPeriod(p.key)} style={[styles.periodChip, { backgroundColor: active ? colors.brand : colors.surface, borderColor: active ? colors.brand : colors.border }]}>
                <Text style={[styles.periodText, { color: active ? '#fff' : colors.onSurface }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {period === 'yearly' && (
          <>
            <Text style={styles.section}>السنة</Text>
            <Pressable testID="year-dropdown" onPress={() => setYearOpen(true)} style={styles.yearField}>
              <Feather name="chevron-down" size={18} color={colors.muted} />
              <Text style={styles.yearText}>{year}</Text>
              <Feather name="calendar" size={16} color={colors.brand} />
            </Pressable>
          </>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : data && data.financials_visible === false ? (
          <View style={styles.lockCard}>
            <Feather name="lock" size={28} color={colors.muted} />
            <Text style={styles.lockTitle}>التقارير المالية مخفية</Text>
            <Text style={styles.lockText}>يمكن للطبيب تفعيل عرض التقارير المالية من الإعدادات.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.rangeLabel}>الأرباح — {data?.label || ''}</Text>
            {rows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="bar-chart-2" size={40} color={colors.borderStrong} />
                <Text style={styles.emptyText}>لا توجد بيانات لهذه الفترة</Text>
              </View>
            ) : rows.map((g: any) => (
              <View key={g.currency} style={styles.curCard}>
                <View style={styles.curHead}>
                  <Text style={styles.curName}>{curName(g.currency)}</Text>
                  <View style={styles.curBadge}><Text style={styles.curBadgeText}>{g.currency}</Text></View>
                </View>
                <View style={styles.finRow}>
                  <Tile label="الإيرادات" val={money(g.revenue, g.currency)} color={colors.success} />
                  <Tile label="المصروفات" val={money(g.expenses, g.currency)} color={colors.error} />
                </View>
                <View style={styles.profitBox}>
                  <Text style={styles.profitLabel}>صافي الربح</Text>
                  <Text style={[styles.profitVal, { color: g.net >= 0 ? colors.success : colors.error }]}>{money(g.net, g.currency)}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={yearOpen} transparent animationType="slide" onRequestClose={() => setYearOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setYearOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Pressable testID="year-close" onPress={() => setYearOpen(false)} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
              <Text style={styles.sheetTitle}>اختر السنة</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {YEARS.map((y) => {
                const active = y === year;
                return (
                  <Pressable key={y} testID={`year-opt-${y}`} onPress={() => { setYear(y); setYearOpen(false); }} style={[styles.yearRow, active && styles.yearRowActive]}>
                    <Text style={[styles.yearRowText, active && { color: '#fff' }]}>{y}</Text>
                    {active ? <Feather name="check" size={18} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Tile({ label, val, color }: any) {
  return (
    <View style={styles.finTile}>
      <View style={[styles.finDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.finLabel}>{label}</Text>
        <Text style={styles.finVal}>{val}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  section: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurfaceSecondary, marginTop: spacing.lg, marginBottom: spacing.sm, textAlign: 'right', writingDirection: 'rtl' },
  periodRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  periodChip: { flexGrow: 1, minWidth: '22%', alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  periodText: { fontFamily: fontFamily.bold, fontSize: font.base },
  yearField: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  yearText: { flex: 1, marginHorizontal: spacing.sm, color: colors.onSurface, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl', fontSize: font.base },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  rangeLabel: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.brand, marginTop: spacing.xl, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  curCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  curHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  curName: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  curBadge: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  curBadgeText: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.sm },
  finRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  finTile: { flex: 1, flexDirection: 'row-reverse', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  finDot: { width: 10, height: 10, borderRadius: 5 },
  finLabel: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  finVal: { fontSize: font.base, color: colors.onSurface, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  profitBox: { marginTop: spacing.md, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  profitLabel: { fontSize: font.base, color: colors.brand, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  profitVal: { fontSize: font.xl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  emptyCard: { alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xxl, ...shadow.card },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular },
  lockCard: { alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xxl, marginTop: spacing.xl, ...shadow.card },
  lockTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, marginTop: spacing.sm },
  lockText: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center', writingDirection: 'rtl' },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: spacing.md },
  sheetHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  yearRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  yearRowActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  yearRowText: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base },
});
