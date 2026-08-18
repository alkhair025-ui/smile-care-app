import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { colors, spacing, radius, font, fontFamily, shadow, toothColors, toothLabels } from '@/src/theme';
import { api } from '@/src/api';
import { exportInvoicePdf } from '@/src/invoice-pdf';
import { sharePortalViaWhatsApp } from '@/src/portal-share';

const UP_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UP_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LO_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LO_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const CONDITIONS = ['healthy', 'caries', 'filling', 'crown', 'rct', 'extracted', 'implant', 'missing'];

export default function PatientDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [chart, setChart] = useState<Record<number, any>>({});
  const [xrays, setXrays] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [xrayUrls, setXrayUrls] = useState<Record<string, string>>({});
  const [xrayError, setXrayError] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, c, x] = await Promise.all([api.getPatient(id), api.getChart(id), api.listXrays(id)]);
      setPatient(p); setNotes(p.doctor_notes || '');
      const map: Record<number, any> = {};
      c.forEach((t: any) => { map[t.tooth] = t; });
      setChart(map);
      setXrays(x);
      const urls: Record<string, string> = {};
      for (const xr of x) urls[xr.id] = await api.xrayFileUrl(xr.id);
      setXrayUrls(urls);
      try { const inv = await api.listInvoices('patient'); setInvoices(inv.filter((i: any) => i.patient_id === id)); } catch { setInvoices([]); }
      try { setClinic(await api.getSettings()); } catch { /* noop */ }
    } catch (e: any) {
      // Auth/network errors are handled by the global AuthGate redirect; avoid crashing the screen.
      console.warn('patient load error', e?.message);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setCondition = async (cond: string) => {
    if (selectedTooth == null) return;
    const tooth = selectedTooth;
    setSelectedTooth(null);
    try {
      const updated = await api.setTooth(id!, { tooth, condition: cond, note: chart[tooth]?.note || '' });
      setChart((c) => ({ ...c, [tooth]: updated }));
    } catch (e: any) {
      console.warn('setTooth error', e?.message);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await api.updatePatient(id!, { doctor_notes: notes }); setPatient((p: any) => ({ ...p, doctor_notes: notes })); }
    catch (e: any) { console.warn('saveNotes error', e?.message); }
    finally { setSavingNotes(false); }
  };

  const pickXray = async () => {
    setXrayError('');
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted' && perm.canAskAgain) {
        status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
      }
      if (status !== 'granted') {
        setXrayError('يلزم إذن الوصول للصور. افتح الإعدادات لتفعيله.');
        Linking.openSettings();
        return;
      }
    }
    let res;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    } catch {
      setXrayError('تعذّر فتح معرض الصور.');
      return;
    }
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      // Compress + resize before upload to save server space while keeping medical detail.
      let uploadUri = asset.uri;
      let name = (asset.fileName || 'xray.jpg').replace(/\.[^.]+$/, '') + '.jpg';
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );
        uploadUri = manipulated.uri;
      } catch (mErr) {
        console.warn('compress failed, using original', mErr);
      }
      const uploaded = await api.uploadXray(id!, uploadUri, name, 'image/jpeg');
      const url = await api.xrayFileUrl(uploaded.id);
      setXrays((xs) => [uploaded, ...xs]);
      setXrayUrls((u) => ({ ...u, [uploaded.id]: url }));
    } catch (e: any) {
      setXrayError('فشل رفع الصورة، تأكد من الاتصال وحاول مجدداً.');
      console.warn('xray', e?.message);
    } finally { setUploading(false); }
  };

  const exportPatientPdf = async () => {
    if (!patient) return;
    const chartRows = Object.values(chart).map((t: any) => `<tr><td>${t.tooth}</td><td>${toothLabels[t.condition] || t.condition}</td><td>${t.note || ''}</td></tr>`).join('');
    const invRows = invoices.map((i: any) => `<tr><td>${(i.date || '').slice(0, 10)}</td><td>${(i.items || []).map((x: any) => x.description).join(', ')}</td><td>${i.total} ${i.currency === 'USD' ? '$' : 'ل.س'}</td></tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
      body{font-family:Tajawal, Arial, sans-serif; padding:32px; color:#1A211E;}
      h1{color:#4A7065; margin-bottom:4px;} .sub{color:#6B7876; margin-bottom:24px;}
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
      <div class="field"><b>ملاحظات الطبيب:</b> ${patient.doctor_notes || '—'}</div>
      <h2>مخطط الأسنان</h2>
      ${chartRows ? `<table><tr><th>السن</th><th>الحالة</th><th>ملاحظات</th></tr>${chartRows}</table>` : '<p>لا يوجد سجل.</p>'}
      <h2>الفواتير</h2>
      ${invRows ? `<table><tr><th>التاريخ</th><th>البنود</th><th>الإجمالي</th></tr>${invRows}</table>` : '<p>لا توجد فواتير.</p>'}
      <div class="foot">تم إصدار هذا التقرير من نظام عيادتي</div>
    </body></html>`;
    try {
      if (Platform.OS === 'web') await Print.printAsync({ html });
      else { const { uri } = await Print.printToFileAsync({ html }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri); }
    } catch (e: any) { console.warn('pdf', e.message); }
  };

  const clinicInfo = { name: clinic.clinic_name, phone: clinic.clinic_phone, address: clinic.clinic_address };
  const onShareInvoice = async () => {
    setSharingId('portal');
    try { await sharePortalViaWhatsApp(id!, clinic.clinic_name, patient?.full_name, patient?.phone); }
    catch (e: any) { console.warn('share portal', e?.message); } finally { setSharingId(null); }
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
        <Pressable onPress={exportPatientPdf} testID="export-pdf-btn" hitSlop={8}>
          <Feather name="download" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Personal details */}
        <SectionCard icon="user" title="المعلومات الشخصية">
          {([
            ['الهاتف', patient.phone], ['البريد', patient.email],
            ['تاريخ الميلاد', patient.date_of_birth], ['الجنس', patient.gender],
            ['العنوان', patient.address], ['التاريخ المرضي', patient.medical_history],
            ['الحساسية', patient.allergies], ['الأدوية', patient.medications], ['ملاحظات عامة', patient.notes],
          ] as [string, string][]).map(([l, v]) => (
            <View key={l} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{l}</Text>
              <Text style={styles.infoVal}>{v || '—'}</Text>
            </View>
          ))}
        </SectionCard>

        {/* Doctor notes */}
        <SectionCard icon="edit-3" title="ملاحظات الطبيب">
          <TextInput
            testID="doctor-notes-input"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="اكتب ملاحظاتك السريرية وخطة العلاج هنا..."
            placeholderTextColor={colors.muted}
            style={styles.notesInput}
          />
          {notes !== (patient.doctor_notes || '') && (
            <Pressable testID="save-notes-btn" onPress={saveNotes} disabled={savingNotes} style={styles.savePill}>
              {savingNotes ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.savePillText}>حفظ الملاحظات</Text>}
            </Pressable>
          )}
        </SectionCard>

        {/* Dental chart */}
        <SectionCard icon="grid" title="مخطط الأسنان (FDI)">
          <Text style={styles.arcLabel}>الفك العلوي</Text>
          <View style={styles.arch}>{[...UP_RIGHT, ...UP_LEFT].map((n) => <Tooth key={n} n={n} chart={chart} onSelect={setSelectedTooth} />)}</View>
          <View style={styles.midDivider} />
          <View style={styles.arch}>{[...LO_LEFT.slice().reverse(), ...LO_RIGHT.slice().reverse()].map((n) => <Tooth key={n} n={n} chart={chart} onSelect={setSelectedTooth} />)}</View>
          <Text style={styles.arcLabel}>الفك السفلي</Text>
          <View style={styles.legendWrap}>
            {Object.keys(toothLabels).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: toothColors[k], borderWidth: k === 'healthy' ? 1 : 0, borderColor: colors.border }]} />
                <Text style={styles.legendText}>{toothLabels[k]}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* X-rays */}
        <SectionCard icon="image" title="الصور الشعاعية">
          <Pressable testID="upload-xray-btn" onPress={pickXray} style={styles.uploadBtn}>
            {uploading ? <ActivityIndicator color="#fff" /> : (<><Feather name="upload" size={18} color="#fff" /><Text style={styles.uploadBtnText}>رفع صورة شعاعية</Text></>)}
          </Pressable>
          <Text style={styles.uploadHint}>يتم ضغط الصورة تلقائياً قبل الحفظ لتوفير المساحة مع الحفاظ على وضوح التفاصيل.</Text>
          {xrayError ? <Text testID="xray-error" style={styles.xrayErr}>{xrayError}</Text> : null}
          {xrays.length === 0 ? (
            <Text style={styles.emptyInline}>لا توجد صور شعاعية</Text>
          ) : (
            <View style={styles.gallery}>
              {xrays.map((x: any) => (
                <View key={x.id} style={styles.thumb}><Image source={xrayUrls[x.id] ? { uri: xrayUrls[x.id] } : undefined} style={styles.thumbImg} contentFit="cover" /></View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* Invoices */}
        <SectionCard icon="file-text" title="الفواتير">
          <View style={styles.invActionsTop}>
            <Pressable testID="open-billing-btn" onPress={() => router.push({ pathname: '/patient/billing/[id]', params: { id: id! } })} style={styles.manageBtn}>
              <Feather name="dollar-sign" size={16} color="#fff" />
              <Text style={styles.manageBtnText}>إدارة الفواتير والحالة المالية</Text>
            </Pressable>
            <Pressable testID="share-portal-btn" onPress={onShareInvoice} disabled={sharingId === 'portal'} style={styles.portalShareBtn}>
              {sharingId === 'portal' ? <ActivityIndicator color="#fff" size="small" /> : (<><Feather name="share-2" size={16} color="#fff" /><Text style={styles.manageBtnText}>إرسال رابط المريض عبر واتساب</Text></>)}
            </Pressable>
          </View>
          {invoices.length === 0 ? (
            <Text style={styles.emptyInline}>لا توجد فواتير للمريض</Text>
          ) : invoices.map((i: any) => (
            <View key={i.id} style={styles.invCard}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={styles.infoVal}>{(i.date || '').slice(0, 10)}</Text>
                <Text style={[styles.infoVal, { color: colors.brand, fontFamily: fontFamily.bold }]}>{i.total} {i.currency === 'USD' ? '$' : 'ل.س'}</Text>
              </View>
              {(i.items || []).map((it: any, idx: number) => (
                <Text key={idx} style={styles.infoLabel}>• {it.description} ({it.quantity} × {it.unit_price})</Text>
              ))}
              <View style={styles.invActions}>
                <Pressable testID={`inv-pdf-${i.id}`} onPress={() => exportInvoicePdf(i, clinicInfo)} style={styles.pdfBtn}>
                  <Feather name="printer" size={14} color={colors.brand} />
                  <Text style={styles.pdfBtnText}>طباعة / PDF</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </SectionCard>
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

function Tooth({ n, chart, onSelect }: { n: number; chart: any; onSelect: (n: number) => void }) {
  const st = chart[n];
  const bg = st ? toothColors[st.condition] : '#fff';
  const isDark = st && ['extracted', 'implant'].includes(st.condition);
  return (
    <Pressable testID={`tooth-${n}`} onPress={() => onSelect(n)} style={[styles.tooth, { backgroundColor: bg }]}>
      <Text style={[styles.toothNum, { color: isDark ? '#fff' : colors.onSurface }]}>{n}</Text>
    </Pressable>
  );
}

function SectionCard({ icon, title, children }: any) {
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  cardIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'right', writingDirection: 'rtl' },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoLabel: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  infoVal: { color: colors.onSurface, fontFamily: fontFamily.medium, textAlign: 'right', writingDirection: 'rtl', flex: 1, marginLeft: spacing.md },
  notesInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 100, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', textAlignVertical: 'top' },
  savePill: { alignSelf: 'flex-start', marginTop: spacing.md, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  savePillText: { color: '#fff', fontFamily: fontFamily.bold },
  arcLabel: { textAlign: 'center', color: colors.muted, fontFamily: fontFamily.medium, marginVertical: spacing.sm },
  arch: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  midDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  tooth: { width: 32, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  toothNum: { fontSize: 10, fontFamily: fontFamily.bold },
  legendWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.onSurfaceSecondary, fontFamily: fontFamily.regular },
  uploadBtn: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginBottom: spacing.md },
  uploadBtnText: { color: '#fff', fontFamily: fontFamily.bold },
  uploadHint: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginBottom: spacing.sm },
  xrayErr: { color: colors.error, backgroundColor: colors.errorBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  emptyInline: { color: colors.muted, fontFamily: fontFamily.regular, textAlign: 'center', paddingVertical: spacing.md },
  gallery: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: '48%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  thumbImg: { width: '100%', height: '100%' },
  invCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  invActionsTop: { gap: spacing.sm, marginBottom: spacing.md },
  manageBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.md },
  manageBtnText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.base },
  portalShareBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.success, paddingVertical: spacing.md, borderRadius: radius.md },
  invActions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md },
  pdfBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  pdfBtnText: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.sm },
  waBtnSm: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.success, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  waBtnSmText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.sm },
  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  sheetTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.lg },
  condGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', paddingBottom: spacing.xl },
  condChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  condDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  condText: { fontFamily: fontFamily.medium, color: colors.onSurface },
});
