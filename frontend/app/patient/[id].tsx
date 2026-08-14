import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { colors, spacing, radius, font, fontFamily, shadow, toothColors, toothLabels } from '@/src/theme';
import { api } from '@/src/api';

// FDI numbering (permanent teeth): upper right 18-11, upper left 21-28, lower left 31-38, lower right 41-48
const UP_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UP_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LO_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LO_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

const CONDITIONS = ['healthy', 'caries', 'filling', 'crown', 'rct', 'extracted', 'implant', 'missing'];

type Tab = 'info' | 'chart' | 'xrays' | 'invoices';

export default function PatientDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [chart, setChart] = useState<Record<number, any>>({});
  const [xrays, setXrays] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [xrayUrls, setXrayUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, c, x] = await Promise.all([api.getPatient(id), api.getChart(id), api.listXrays(id)]);
      setPatient(p);
      const map: Record<number, any> = {};
      c.forEach((t: any) => { map[t.tooth] = t; });
      setChart(map);
      setXrays(x);
      const urls: Record<string, string> = {};
      for (const xr of x) urls[xr.id] = await api.xrayFileUrl(xr.id);
      setXrayUrls(urls);
      try {
        const inv = await api.listInvoices('patient');
        setInvoices(inv.filter((i: any) => i.patient_id === id));
      } catch { setInvoices([]); }
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setCondition = async (cond: string) => {
    if (selectedTooth == null) return;
    const updated = await api.setTooth(id!, { tooth: selectedTooth, condition: cond, note: '' });
    setChart((c) => ({ ...c, [selectedTooth]: updated }));
    setSelectedTooth(null);
  };

  const pickXray = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const uploaded = await api.uploadXray(id!, asset.uri, asset.fileName || 'xray.jpg', asset.mimeType || 'image/jpeg');
      const url = await api.xrayFileUrl(uploaded.id);
      setXrays((xs) => [uploaded, ...xs]);
      setXrayUrls((u) => ({ ...u, [uploaded.id]: url }));
    } catch (e: any) { console.warn('xray upload', e.message); } finally { setUploading(false); }
  };

  const exportPdf = async () => {
    if (!patient) return;
    const chartRows = Object.values(chart).map((t: any) => `<tr><td>${t.tooth}</td><td>${toothLabels[t.condition] || t.condition}</td><td>${t.note || ''}</td></tr>`).join('');
    const invRows = invoices.map((i: any) => `<tr><td>${(i.date || '').slice(0, 10)}</td><td>${(i.items || []).map((x: any) => x.description).join(', ')}</td><td>${i.total} د.أ</td></tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
      body{font-family:Tajawal, Arial, sans-serif; padding:32px; color:#1A211E;}
      h1{color:#4A7065; margin-bottom:4px;}
      .sub{color:#6B7876; margin-bottom:24px;}
      h2{color:#334F46; border-bottom:2px solid #E1E8E6; padding-bottom:6px; margin-top:24px;}
      .field{margin:6px 0;} .field b{color:#4A7065;}
      table{width:100%; border-collapse:collapse; margin-top:8px;}
      th,td{border:1px solid #E1E8E6; padding:8px; text-align:right; font-size:13px;}
      th{background:#F0F4F2; color:#334F46;}
      .foot{margin-top:32px; color:#6B7876; font-size:12px; text-align:center;}
    </style></head><body>
      <h1>الملف الطبي الختامي</h1>
      <div class="sub">${patient.full_name} — ${new Date().toLocaleDateString('ar-EG')}</div>
      <h2>معلومات المريض</h2>
      <div class="field"><b>الاسم:</b> ${patient.full_name}</div>
      <div class="field"><b>الهاتف:</b> ${patient.phone || '—'}</div>
      <div class="field"><b>تاريخ الميلاد:</b> ${patient.date_of_birth || '—'}</div>
      <div class="field"><b>التاريخ المرضي:</b> ${patient.medical_history || '—'}</div>
      <div class="field"><b>الحساسية:</b> ${patient.allergies || '—'}</div>
      <div class="field"><b>الأدوية:</b> ${patient.medications || '—'}</div>
      <h2>مخطط الأسنان</h2>
      ${chartRows ? `<table><tr><th>السن</th><th>الحالة</th><th>ملاحظات</th></tr>${chartRows}</table>` : '<p>لا يوجد سجل.</p>'}
      <h2>الفواتير</h2>
      ${invRows ? `<table><tr><th>التاريخ</th><th>البنود</th><th>الإجمالي</th></tr>${invRows}</table>` : '<p>لا توجد فواتير.</p>'}
      <div class="foot">تم إصدار هذا التقرير من نظام عيادتي</div>
    </body></html>`;
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      }
    } catch (e: any) { console.warn('pdf', e.message); }
  };

  const shareWhatsAppSummary = () => {
    if (!patient) return;
    const text = encodeURIComponent(
      `ملف ${patient.full_name}\nالتاريخ المرضي: ${patient.medical_history || '—'}\nالحساسية: ${patient.allergies || '—'}\nعدد الفواتير: ${invoices.length}`
    );
    Linking.openURL(`https://wa.me/${(patient.phone || '').replace(/[^\d]/g, '')}?text=${text}`).catch(() => {});
  };

  if (loading || !patient) return (
    <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="pt-back" hitSlop={8}>
          <Feather name="chevron-right" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{patient.full_name}</Text>
        <Pressable onPress={exportPdf} testID="export-pdf-btn" hitSlop={8}>
          <Feather name="download" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {([
          { k: 'info', l: 'المعلومات', i: 'user' },
          { k: 'chart', l: 'مخطط الأسنان', i: 'grid' },
          { k: 'xrays', l: 'الأشعة', i: 'image' },
          { k: 'invoices', l: 'الفواتير', i: 'file-text' },
        ] as const).map((t) => (
          <Pressable key={t.k} testID={`pt-tab-${t.k}`} onPress={() => setTab(t.k)} style={[styles.tabChip, { backgroundColor: tab === t.k ? colors.brand : colors.surface, borderColor: tab === t.k ? colors.brand : colors.border }]}>
            <Feather name={t.i as any} size={14} color={tab === t.k ? '#fff' : colors.onSurface} />
            <Text style={{ color: tab === t.k ? '#fff' : colors.onSurface, fontFamily: fontFamily.medium, marginRight: 4 }}>{t.l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {tab === 'info' && <InfoTab patient={patient} onShare={shareWhatsAppSummary} />}
        {tab === 'chart' && <ChartTab chart={chart} onSelect={setSelectedTooth} />}
        {tab === 'xrays' && <XraysTab xrays={xrays} urls={xrayUrls} onPick={pickXray} uploading={uploading} />}
        {tab === 'invoices' && <InvoicesTab invoices={invoices} />}
      </ScrollView>

      <Modal visible={selectedTooth != null} transparent animationType="fade" onRequestClose={() => setSelectedTooth(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSelectedTooth(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>السن رقم {selectedTooth}</Text>
            <View style={styles.condGrid}>
              {CONDITIONS.map((c) => (
                <Pressable key={c} testID={`cond-${c}`} onPress={() => setCondition(c)} style={styles.condChip}>
                  <View style={[styles.condDot, { backgroundColor: toothColors[c] }]} />
                  <Text style={styles.condText}>{toothLabels[c]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InfoTab({ patient, onShare }: any) {
  const rows: [string, string][] = [
    ['الهاتف', patient.phone], ['البريد', patient.email],
    ['تاريخ الميلاد', patient.date_of_birth], ['الجنس', patient.gender],
    ['العنوان', patient.address], ['التاريخ المرضي', patient.medical_history],
    ['الحساسية', patient.allergies], ['الأدوية', patient.medications], ['ملاحظات', patient.notes],
  ];
  return (
    <View style={styles.card}>
      {rows.map(([l, v]) => (
        <View key={l} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{l}</Text>
          <Text style={styles.infoVal}>{v || '—'}</Text>
        </View>
      ))}
      <Pressable testID="wa-share-patient" onPress={onShare} style={styles.waBtn}>
        <Feather name="share-2" size={16} color="#fff" />
        <Text style={styles.waText}>مشاركة الملخص عبر واتساب</Text>
      </Pressable>
    </View>
  );
}

function ChartTab({ chart, onSelect }: any) {
  const Tooth = ({ n }: { n: number }) => {
    const st = chart[n];
    const bg = st ? toothColors[st.condition] : '#fff';
    const isDark = st && ['extracted', 'implant'].includes(st.condition);
    return (
      <Pressable testID={`tooth-${n}`} onPress={() => onSelect(n)} style={[styles.tooth, { backgroundColor: bg }]}>
        <Text style={[styles.toothNum, { color: isDark ? '#fff' : colors.onSurface }]}>{n}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.card}>
      <Text style={styles.arcLabel}>الفك العلوي</Text>
      <View style={styles.arch}>
        {[...UP_RIGHT, ...UP_LEFT].map((n) => <Tooth key={n} n={n} />)}
      </View>
      <View style={styles.midDivider} />
      <View style={styles.arch}>
        {[...LO_LEFT.slice().reverse(), ...LO_RIGHT.slice().reverse()].map((n) => <Tooth key={n} n={n} />)}
      </View>
      <Text style={styles.arcLabel}>الفك السفلي</Text>
      <Text style={styles.legendTitle}>الرموز:</Text>
      <View style={styles.legendWrap}>
        {Object.keys(toothLabels).map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: toothColors[k], borderWidth: k === 'healthy' ? 1 : 0, borderColor: colors.border }]} />
            <Text style={styles.legendText}>{toothLabels[k]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function XraysTab({ xrays, urls, onPick, uploading }: any) {
  return (
    <View>
      <Pressable testID="upload-xray-btn" onPress={onPick} style={styles.uploadBtn}>
        {uploading ? <ActivityIndicator color="#fff" /> : (
          <>
            <Feather name="upload" size={18} color="#fff" />
            <Text style={styles.uploadBtnText}>رفع صورة شعاعية</Text>
          </>
        )}
      </Pressable>
      {xrays.length === 0 ? (
        <View style={styles.center}><Feather name="image" size={40} color={colors.borderStrong} /><Text style={styles.emptyText}>لا توجد صور شعاعية</Text></View>
      ) : (
        <View style={styles.gallery}>
          {xrays.map((x: any) => (
            <View key={x.id} style={styles.thumb}>
              <Image source={urls[x.id] ? { uri: urls[x.id] } : undefined} style={styles.thumbImg} contentFit="cover" />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function InvoicesTab({ invoices }: any) {
  if (invoices.length === 0) return <View style={styles.center}><Feather name="file-text" size={40} color={colors.borderStrong} /><Text style={styles.emptyText}>لا توجد فواتير للمريض</Text></View>;
  return (
    <View>
      {invoices.map((i: any) => (
        <View key={i.id} style={[styles.card, { marginBottom: spacing.sm }]}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={styles.infoVal}>{(i.date || '').slice(0, 10)}</Text>
            <Text style={[styles.infoVal, { color: colors.brand, fontFamily: fontFamily.bold }]}>{i.total} د.أ</Text>
          </View>
          {(i.items || []).map((it: any, idx: number) => (
            <Text key={idx} style={styles.infoLabel}>• {it.description} ({it.quantity} × {it.unit_price})</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, fontFamily: fontFamily.regular },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  tabChip: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, flexShrink: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, ...shadow.card },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoLabel: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  infoVal: { color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', flex: 1, marginLeft: spacing.md },
  waBtn: { marginTop: spacing.lg, backgroundColor: colors.success, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  waText: { color: '#fff', fontFamily: fontFamily.bold },
  arcLabel: { textAlign: 'center', color: colors.muted, fontFamily: fontFamily.medium, marginVertical: spacing.sm },
  arch: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  midDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  tooth: { width: 34, height: 42, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  toothNum: { fontSize: 10, fontFamily: fontFamily.bold },
  legendTitle: { marginTop: spacing.md, color: colors.onSurfaceSecondary, fontFamily: fontFamily.bold, textAlign: 'right', writingDirection: 'rtl' },
  legendWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.onSurfaceSecondary, fontFamily: fontFamily.regular },
  uploadBtn: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginBottom: spacing.md },
  uploadBtnText: { color: '#fff', fontFamily: fontFamily.bold },
  gallery: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: '48%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  thumbImg: { width: '100%', height: '100%' },
  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  sheetTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.lg },
  condGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', paddingBottom: spacing.xl },
  condChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  condDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  condText: { fontFamily: fontFamily.medium, color: colors.onSurface },
});
