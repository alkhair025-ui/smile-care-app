import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { colors, spacing, radius, font, fontFamily, shadow, toothColors, toothLabels } from '@/src/theme';
import { api } from '@/src/api';

const UP_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UP_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LO_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LO_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const money = (n: number, cur = 'SYP') => `${Math.round(n).toLocaleString('en')} ${cur === 'USD' ? '$' : 'ل.س'}`;

export default function PatientPortal() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.publicPatientPortal(token).then(setData).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [token]);

  if (loading) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View></SafeAreaView>;
  if (notFound || !data) return <SafeAreaView style={styles.root}><View style={styles.center}><Feather name="alert-circle" size={48} color={colors.borderStrong} /><Text style={styles.empty}>الرابط غير صالح أو منتهي الصلاحية</Text></View></SafeAreaView>;

  const chartMap: Record<number, any> = {};
  (data.chart || []).forEach((t: any) => { chartMap[t.tooth] = t; });

  const Tooth = ({ n }: { n: number }) => {
    const st = chartMap[n];
    const bg = st ? toothColors[st.condition] : '#fff';
    const dark = st && ['extracted', 'implant'].includes(st.condition);
    return (
      <View style={[styles.tooth, { backgroundColor: bg }]}>
        <Text style={[styles.toothNum, { color: dark ? '#fff' : colors.onSurface }]}>{n}</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.brand, colors.brandDark]} style={styles.header}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <View style={styles.logoBadge}><Feather name="activity" size={22} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clinicName}>{data.clinic.name}</Text>
              <Text style={styles.clinicSub}>الملف الطبي للمريض</Text>
            </View>
          </View>
          <Text style={styles.patientName}>{data.patient.full_name}</Text>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Financial summary */}
        <View style={styles.finRow}>
          <FinTile label="إجمالي الفواتير" value={money(data.financials.total_billed)} color={colors.info} />
          <FinTile label="المدفوع" value={money(data.financials.total_paid)} color={colors.success} />
          <FinTile label="المتبقي" value={money(data.financials.remaining)} color={data.financials.remaining > 0 ? colors.error : colors.success} />
        </View>

        {/* Invoices */}
        <Section icon="file-text" title="سجل الفواتير والدفعات">
          {data.invoices.length === 0 ? <Text style={styles.emptyInline}>لا توجد فواتير</Text> :
            data.invoices.map((i: any) => (
              <View key={i.id} style={styles.invCard}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                  <Text style={styles.invDate}>{(i.date || '').slice(0, 10)}</Text>
                  <Text style={styles.invTotal}>{money(i.total, i.currency)}</Text>
                </View>
                {(i.items || []).map((it: any, idx: number) => (
                  <Text key={idx} style={styles.invItem}>• {it.description} ({it.quantity} × {it.unit_price})</Text>
                ))}
                <View style={styles.payRow}>
                  <Text style={styles.payText}>مدفوع: {money(i.paid, i.currency)}</Text>
                  <Text style={[styles.payText, { color: (i.total - i.paid) > 0 ? colors.error : colors.success }]}>متبقٍ: {money(i.total - i.paid, i.currency)}</Text>
                </View>
              </View>
            ))}
        </Section>

        {/* Medical report */}
        <Section icon="clipboard" title="التقرير الطبي">
          <Row label="التاريخ المرضي" value={data.patient.medical_history} />
          <Row label="الحساسية" value={data.patient.allergies} />
          <Row label="الأدوية" value={data.patient.medications} />
          {data.patient.doctor_notes ? <Row label="ملاحظات الطبيب" value={data.patient.doctor_notes} /> : null}
        </Section>

        {/* Dental chart */}
        <Section icon="grid" title="مخطط الأسنان">
          <Text style={styles.arcLabel}>الفك العلوي</Text>
          <View style={styles.arch}>{[...UP_RIGHT, ...UP_LEFT].map((n) => <Tooth key={n} n={n} />)}</View>
          <View style={styles.midDivider} />
          <View style={styles.arch}>{[...LO_LEFT.slice().reverse(), ...LO_RIGHT.slice().reverse()].map((n) => <Tooth key={n} n={n} />)}</View>
          <Text style={styles.arcLabel}>الفك السفلي</Text>
          <View style={styles.legendWrap}>
            {Object.keys(toothLabels).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: toothColors[k], borderWidth: k === 'healthy' ? 1 : 0, borderColor: colors.border }]} />
                <Text style={styles.legendText}>{toothLabels[k]}</Text>
              </View>
            ))}
          </View>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{data.clinic.name} · {data.clinic.phone}</Text>
          <Text style={styles.footerSub}>هذا الملف يُحدَّث تلقائياً — نظام عيادتي</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function FinTile({ label, value, color }: any) {
  return (
    <View style={[styles.finTile, { borderTopColor: color }]}>
      <Text style={styles.finVal} numberOfLines={1}>{value}</Text>
      <Text style={styles.finLabel}>{label}</Text>
    </View>
  );
}
function Section({ icon, title, children }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}><Feather name={icon} size={16} color={colors.brand} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function Row({ label, value }: any) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoVal}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  empty: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  logoBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  clinicName: { color: '#fff', fontSize: font.lg, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  clinicSub: { color: '#DDEAE6', fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl' },
  patientName: { color: '#fff', fontSize: font.xxl, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.lg },
  finRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.lg },
  finTile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderTopWidth: 3, alignItems: 'center', ...shadow.card },
  finVal: { fontSize: font.base, fontFamily: fontFamily.bold, color: colors.onSurface },
  finLabel: { fontSize: 11, color: colors.muted, fontFamily: fontFamily.regular, marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  cardIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  emptyInline: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center', paddingVertical: spacing.md },
  invCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  invDate: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm },
  invTotal: { color: colors.brand, fontFamily: fontFamily.bold },
  invItem: { color: colors.onSurfaceSecondary, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  payRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  payText: { fontFamily: fontFamily.medium, fontSize: font.sm, color: colors.onSurfaceSecondary },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoLabel: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  infoVal: { color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', flex: 1, marginLeft: spacing.md },
  arcLabel: { textAlign: 'center', color: colors.muted, fontFamily: fontFamily.medium, marginVertical: spacing.sm },
  arch: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  midDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  tooth: { width: 30, height: 38, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  toothNum: { fontSize: 10, fontFamily: fontFamily.bold },
  legendWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.onSurfaceSecondary, fontFamily: fontFamily.regular },
  footer: { alignItems: 'center', marginTop: spacing.md, gap: 4 },
  footerText: { color: colors.onSurfaceSecondary, fontFamily: fontFamily.medium },
  footerSub: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm },
});
