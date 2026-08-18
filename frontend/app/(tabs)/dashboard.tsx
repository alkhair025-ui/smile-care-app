import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { useAuth } from '@/src/auth-context';
import { api } from '@/src/api';

const fmt = (n: number) => `${Math.round(n).toLocaleString('en')} ل.س`;

function StatCard({ icon, label, value, color, testID }: any) {
  return (
    <View testID={testID} style={[styles.stat, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function MiniBarChart({ data }: { data: { label: string; revenue: number; expenses: number }[] }) {
  const w = 320; const h = 160; const padL = 28; const padB = 24; const padT = 8;
  const chartW = w - padL - 8; const chartH = h - padB - padT;
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.expenses]));
  const barW = (chartW / data.length) / 2 - 4;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={w} height={h}>
        <Line x1={padL} y1={padT + chartH} x2={w - 8} y2={padT + chartH} stroke={colors.border} strokeWidth={1} />
        {data.map((d, i) => {
          const x = padL + i * (chartW / data.length) + 4;
          const revH = (d.revenue / max) * chartH;
          const expH = (d.expenses / max) * chartH;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={padT + chartH - revH} width={barW} height={revH} fill={colors.brand} rx={3} />
              <Rect x={x + barW + 2} y={padT + chartH - expH} width={barW} height={expH} fill={colors.warning} rx={3} />
              <SvgText x={x + barW + 1} y={h - 8} fontSize={9} fill={colors.muted} textAnchor="middle">{d.label.slice(5)}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.brand }]} /><Text style={styles.legendText}>الإيرادات</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.warning }]} /><Text style={styles.legendText}>المصروفات</Text></View>
      </View>
    </View>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.summary();
      setData(s);
    } catch (e) { /* noop */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return (
    <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View></SafeAreaView>
  );

  const showFin = data?.financials_visible;
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً، {user?.full_name}</Text>
          <Text style={styles.clinic}>{user?.clinic_name || 'عيادتك'}</Text>
        </View>
        <View style={styles.avatarBadge}>
          <Feather name="user" size={22} color={colors.brand} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.statRow}>
          <StatCard testID="stat-patients" icon="users" label="إجمالي المرضى" value={data?.total_patients ?? 0} color={colors.brand} />
          <StatCard testID="stat-appointments" icon="calendar" label="مواعيد اليوم" value={data?.today_appointments ?? 0} color={colors.info} />
          <StatCard testID="stat-lowstock" icon="alert-triangle" label="مواد ناقصة" value={data?.low_stock_count ?? 0} color={colors.warning} />
        </View>

        <View style={styles.dailyCard}>
          <View style={styles.dailyHead}>
            <Text style={styles.cardTitle}>ملخّص اليوم</Text>
            <Feather name="sunrise" size={18} color={colors.brand} />
          </View>
          <View style={styles.dailyRow}>
            <DailyTile icon="calendar" label="مواعيد اليوم" value={data?.today_appointments ?? 0} color={colors.info} />
            <DailyTile icon="clock" label="حجوزات جديدة" value={data?.new_bookings ?? 0} color={colors.warning} highlight={(data?.new_bookings ?? 0) > 0} />
            {showFin && <DailyTile icon="trending-up" label="دخل اليوم" value={fmt(data?.today_income || 0)} color={colors.success} small />}
          </View>
          {(data?.new_bookings ?? 0) > 0 && (
            <Pressable testID="review-bookings" onPress={() => router.push('/(tabs)/appointments')} style={styles.reviewBtn}>
              <Feather name="arrow-left" size={14} color={colors.brand} />
              <Text style={styles.reviewText}>لديك {data.new_bookings} حجز جديد بانتظار التأكيد</Text>
            </Pressable>
          )}
        </View>

        {showFin ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>الملخّص المالي</Text>
              <View style={styles.finRow}>
                <FinTile label="الإيرادات" val={fmt(data.revenue)} color={colors.success} />
                <FinTile label="المشتريات" val={fmt(data.purchases)} color={colors.warning} />
              </View>
              <View style={styles.finRow}>
                <FinTile label="الرواتب" val={fmt(data.salaries)} color={colors.info} />
                <FinTile label="المصاريف" val={fmt(data.expenses)} color={colors.error} />
              </View>
              <View style={styles.profitBox}>
                <Text style={styles.profitLabel}>صافي الربح</Text>
                <Text style={[styles.profitVal, { color: data.net_profit >= 0 ? colors.success : colors.error }]}>
                  {fmt(data.net_profit)}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>آخر 6 أشهر</Text>
              <MiniBarChart data={data.monthly || []} />
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Feather name="lock" size={28} color={colors.muted} />
            <Text style={styles.hiddenTitle}>التقارير المالية مخفية</Text>
            <Text style={styles.hiddenText}>يمكن للطبيب تفعيل عرض التقارير المالية من الإعدادات.</Text>
          </View>
        )}

        <Text style={styles.section}>الاختصارات السريعة</Text>
        <View style={styles.quickRow}>
          <Quick icon="user-plus" label="مريض جديد" onPress={() => router.push('/(tabs)/patients')} />
          <Quick icon="calendar" label="موعد جديد" onPress={() => router.push('/(tabs)/appointments')} />
          <Quick icon="file-plus" label="فاتورة جديدة" onPress={() => router.push('/(tabs)/invoices')} />
          <Quick icon="package" label="المستودع" onPress={() => router.push('/more/inventory')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FinTile({ label, val, color }: any) {
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

function DailyTile({ icon, label, value, color, highlight, small }: any) {
  return (
    <View style={[dailyStyles.tile, highlight && { backgroundColor: colors.warningBg }]}>
      <View style={[dailyStyles.iconBox, { backgroundColor: color + '22' }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[dailyStyles.value, small && { fontSize: font.base }]} numberOfLines={1}>{value}</Text>
      <Text style={dailyStyles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const dailyStyles = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  label: { fontSize: 11, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center' },
});

function Quick({ icon, label, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={styles.quick}>
      <View style={styles.quickIcon}><Feather name={icon} size={20} color={colors.brand} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  greeting: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  clinic: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  avatarBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  statRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderTopWidth: 3, ...shadow.card },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  statValue: { fontSize: font.xl, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  statLabel: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, ...shadow.card },
  dailyCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, ...shadow.card },
  dailyHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  dailyRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  reviewBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: radius.md },
  reviewText: { color: colors.warning, fontFamily: fontFamily.bold, fontSize: font.sm },
  cardTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  finRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.sm },
  finTile: { flex: 1, flexDirection: 'row-reverse', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  finDot: { width: 10, height: 10, borderRadius: 5 },
  finLabel: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  finVal: { fontSize: font.base, color: colors.onSurface, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  profitBox: { marginTop: spacing.md, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  profitLabel: { fontSize: font.base, color: colors.brand, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  profitVal: { fontSize: font.xl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  hiddenTitle: { marginTop: spacing.sm, fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  hiddenText: { color: colors.muted, marginTop: 4, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  section: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurfaceSecondary, marginTop: spacing.xl, marginBottom: spacing.md, textAlign: 'right', writingDirection: 'rtl' },
  quickRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  quick: { width: '48%', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, ...shadow.card },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { flex: 1, color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl' },
  legendRow: { flexDirection: 'row-reverse', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: font.sm, color: colors.muted, fontFamily: fontFamily.regular },
});
