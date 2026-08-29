import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity, ActivityIndicator, Modal, TextInput, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { colors, spacing, radius, font, fontFamily, shadow } from '@/src/theme';
import { api } from '@/src/api';
import { sharePortalViaWhatsApp } from '@/src/portal-share';
import { buildTreatmentMaps, toothTextColor, TreatmentType } from '@/src/treatment';
import { money } from '@/src/currencies';

const Q1 = [11, 12, 13, 14, 15, 16, 17, 18]; // علوي أيمن
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // علوي أيسر
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // سفلي أيسر
const Q4 = [41, 42, 43, 44, 45, 46, 47, 48]; // سفلي أيمن
const QUADRANTS = [
  { key: 'Q1', label: 'الربع الأول · علوي أيمن', teeth: Q1 },
  { key: 'Q2', label: 'الربع الثاني · علوي أيسر', teeth: Q2 },
  { key: 'Q4', label: 'الربع الرابع · سفلي أيمن', teeth: Q4 },
  { key: 'Q3', label: 'الربع الثالث · سفلي أيسر', teeth: Q3 },
];
// Most-used treatments shown as direct buttons; everything else lives in the searchable "all types" sheet.
const FREQUENT = ['caries', 'filling', 'crown', 'extracted', 'healthy'];

export default function PatientDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [chart, setChart] = useState<Record<number, any>>({});
  const [xrays, setXrays] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeCondition, setActiveCondition] = useState<string>('healthy');
  const [uploading, setUploading] = useState(false);
  const [xrayUrls, setXrayUrls] = useState<Record<string, string>>({});
  const [xrayError, setXrayError] = useState('');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<TreatmentType[]>([]);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [addingType, setAddingType] = useState(false);
  const [addTypeErr, setAddTypeErr] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSearch, setMoreSearch] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [activeTreatment, setActiveTreatment] = useState<any>(null);
  const [showSessForm, setShowSessForm] = useState(false);
  const [sessName, setSessName] = useState('');
  const [sessNote, setSessNote] = useState('');
  const [addingSess, setAddingSess] = useState(false);
  // ---- Edit personal info states ----
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const { colorMap, labelMap, conditions } = useMemo(() => buildTreatmentMaps(customTypes), [customTypes]);

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
      try { setCustomTypes(await api.listTreatmentTypes()); } catch { /* noop */ }
      try { setTreatments(await api.listTreatments(id)); } catch { setTreatments([]); }
      try { const inv = await api.listInvoices('patient'); setInvoices(inv.filter((i: any) => i.patient_id === id)); } catch { setInvoices([]); }
      try { setClinic(await api.getSettings()); } catch { /* noop */ }
    } catch (e: any) {
      // Auth/network errors are handled by the global AuthGate redirect; avoid crashing the screen.
      console.warn('patient load error', e?.message);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addTreatmentType = async () => {
    setAddTypeErr('');
    const label = newTypeLabel.trim();
    if (!label) { setAddTypeErr('يرجى إدخال اسم نوع المعالجة'); return; }
    setAddingType(true);
    try {
      const created = await api.createTreatmentType(label);
      setCustomTypes((list) => [...list, created]);
      setNewTypeLabel(''); setAddTypeOpen(false);
    } catch (e: any) { setAddTypeErr(e?.message || 'تعذّر إضافة النوع'); }
    finally { setAddingType(false); }
  };

  const toggleTooth = (tooth: number) => {
    setSelectedTeeth((prev) => prev.includes(tooth) ? prev.filter((t) => t !== tooth) : [...prev, tooth]);
  };

  const saveTreatment = async () => {
    if (selectedTeeth.length === 0 || savingTreatment) return;
    setSavingTreatment(true);
    try {
      const teeth = [...selectedTeeth].sort((a, b) => a - b);
      // Create the treatment record (with an initial session) and open its session view.
      // The chart itself is NOT permanently colored — the treatment lives in the log/sessions,
      // so the chart returns to its normal (clean) state for future treatments.
      const t = await api.createTreatment(id!, { teeth, condition: activeCondition, name: labelMap[activeCondition] || activeCondition });
      setTreatments((prev) => [t, ...prev]);
      // Reset the chart back to its normal state so new treatments can be started.
      setSelectedTeeth([]);
      setActiveCondition('healthy');
      setActiveTreatment(null);
    } catch (e: any) {
      console.warn('saveTreatment error', e?.message);
    } finally { setSavingTreatment(false); }
  };

  const addFollowUp = async () => {
    const name = sessName.trim();
    if (!name || addingSess || !activeTreatment) return;
    setAddingSess(true);
    try {
      const updated = await api.addTreatmentSession(id!, activeTreatment.id, { name, note: sessNote.trim() });
      setActiveTreatment(updated);
      setTreatments((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSessName(''); setSessNote(''); setShowSessForm(false);
    } catch (e: any) {
      console.warn('addFollowUp error', e?.message);
    } finally { setAddingSess(false); }
  };

  // ---- Safe deletes (with confirmation) ----
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const runConfirm = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try { await confirmState.onConfirm(); setConfirmState(null); }
    catch (e: any) { console.warn('confirm action error', e?.message); }
    finally { setConfirmBusy(false); }
  };

  const askDeletePatient = () => setConfirmState({
    title: 'حذف المريض',
    message: `سيتم حذف «${patient?.full_name}» وكل بياناته (المخطط، الأشعة، الفواتير، المعالجات، المواعيد) نهائياً. هل أنت متأكد؟`,
    onConfirm: async () => { await api.deletePatient(id!); router.back(); },
  });

  const askDeleteTreatment = (t: any) => setConfirmState({
    title: 'حذف المعالجة',
    message: `سيتم حذف معالجة «${labelMap[t.condition] || t.name}» وكل جلساتها نهائياً. هل أنت متأكد؟`,
    onConfirm: async () => {
      await api.deleteTreatmentById(t.id);
      setTreatments((prev) => prev.filter((x) => x.id !== t.id));
      setActiveTreatment((cur: any) => (cur && cur.id === t.id ? null : cur));
    },
  });

  const askDeleteSession = (s: any) => setConfirmState({
    title: 'حذف الجلسة',
    message: `سيتم حذف جلسة «${s.name}» نهائياً. هل أنت متأكد؟`,
    onConfirm: async () => {
      await api.deleteSessionById(s.id);
      setActiveTreatment((cur: any) => {
        if (!cur) return cur;
        return { ...cur, sessions: (cur.sessions || []).filter((sess: any) => sess.id !== s.id) };
      });
      setTreatments((prev) => prev.map((t) => {
        if (t.id !== activeTreatment.id) return t;
        return { ...t, sessions: (t.sessions || []).filter((sess: any) => sess.id !== s.id) };
      }));
    },
  });

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await api.updatePatient(id!, { doctor_notes: notes }); setPatient((p: any) => ({ ...p, doctor_notes: notes })); }
    catch (e: any) { console.warn('saveNotes error', e?.message); }
    finally { setSavingNotes(false); }
  };

  // ---- Save personal info edit ----
  const saveEdit = async () => {
    setSavingEdit(true);
    setEditError('');
    try {
      await api.updatePatient(id!, editData);
      setPatient(editData);
      setEditing(false);
    } catch (e: any) {
      setEditError(e?.message || 'تعذّر حفظ التعديلات');
    } finally {
      setSavingEdit(false);
    }
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
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} style={styles.headerBtn}>
          <Feather name="chevron-right" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{patient.full_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => { setEditing(true); setEditData({ ...patient }); setEditError(''); }} activeOpacity={0.6} style={styles.headerBtn}>
            <Feather name="edit-3" size={22} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={askDeletePatient} activeOpacity={0.6} style={styles.headerBtn}>
            <Feather name="trash-2" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {/* Personal details */}
        <SectionCard icon="user" title="المعلومات الشخصية">
          {([
            ['الاسم الكامل', 'full_name', patient.full_name],
            ['الهاتف', 'phone', patient.phone],
            ['البريد', 'email', patient.email],
            ['تاريخ الميلاد', 'date_of_birth', patient.date_of_birth],
            ['الجنس', 'gender', patient.gender],
            ['العنوان', 'address', patient.address],
            ['التاريخ المرضي', 'medical_history', patient.medical_history],
            ['الحساسية', 'allergies', patient.allergies],
            ['الأدوية', 'medications', patient.medications],
            ['ملاحظات عامة', 'notes', patient.notes],
          ] as [string, string, string][]).map(([label, key, value]) => (
            <View key={key} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              {editing ? (
                <TextInput
                  testID={`edit-${key}`}
                  value={editData[key] || ''}
                  onChangeText={(t) => setEditData((prev: any) => ({ ...prev, [key]: t }))}
                  style={styles.editInput}
                  placeholder={label}
                  placeholderTextColor={colors.muted}
                />
              ) : (
                <Text style={styles.infoVal}>{value || '—'}</Text>
              )}
            </View>
          ))}
          {editing && (
            <>
              {editError ? <Text style={styles.editError}>{editError}</Text> : null}
              <View style={styles.editActions}>
                <Pressable onPress={() => setEditing(false)} style={[styles.addBtn2, styles.addBtnGhost]}>
                  <Text style={styles.addBtnGhostText}>إلغاء</Text>
                </Pressable>
                <Pressable onPress={saveEdit} disabled={savingEdit} style={[styles.addBtn2, styles.addBtnPrimary]}>
                  {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addBtnPrimaryText}>حفظ التعديلات</Text>}
                </Pressable>
              </View>
            </>
          )}
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
          <Text style={styles.paletteHint}>اختر نوع المعالجة وحدّد الأسنان ثم اضغط «حفظ المعالجة» لفتح جلسات المتابعة</Text>
          <View style={styles.paletteWrap}>
            {FREQUENT.map((c) => {
              const active = activeCondition === c;
              return (
                <Pressable key={c} testID={`palette-${c}`} onPress={() => setActiveCondition(c)} style={[styles.paletteChip, active && styles.paletteChipActive]}>
                  <View style={[styles.condDot, { backgroundColor: colorMap[c], borderColor: c === 'healthy' ? colors.border : colorMap[c] }]} />
                  <Text style={[styles.paletteText, active && { color: '#fff' }]}>{labelMap[c]}</Text>
                </Pressable>
              );
            })}
            <Pressable testID="more-types-btn" onPress={() => { setMoreSearch(''); setMoreOpen(true); }} style={[styles.paletteChip, styles.moreChip, !FREQUENT.includes(activeCondition) && styles.paletteChipActive]}>
              {!FREQUENT.includes(activeCondition)
                ? <View style={[styles.condDot, { backgroundColor: colorMap[activeCondition], borderColor: colorMap[activeCondition] }]} />
                : <Feather name="grid" size={15} color={colors.brand} />}
              <Text style={[styles.paletteText, { color: !FREQUENT.includes(activeCondition) ? '#fff' : colors.brand }]}>
                {!FREQUENT.includes(activeCondition) ? labelMap[activeCondition] : 'كل الأنواع'}
              </Text>
              <Feather name="chevron-down" size={15} color={!FREQUENT.includes(activeCondition) ? '#fff' : colors.brand} />
            </Pressable>
          </View>

          {QUADRANTS.map((q) => (
            <View key={q.key} style={styles.quadrant}>
              <Text style={styles.quadLabel}>{q.label}</Text>
              <View style={styles.arch}>{q.teeth.map((n) => <Tooth key={n} n={n} chart={chart} onToggle={toggleTooth} selected={selectedTeeth.includes(n)} colorMap={colorMap} />)}</View>
            </View>
          ))}

          <Pressable
            testID="save-treatment-btn"
            onPress={saveTreatment}
            disabled={selectedTeeth.length === 0 || savingTreatment}
            style={[styles.saveTreatmentBtn, (selectedTeeth.length === 0 || savingTreatment) && styles.saveTreatmentBtnDisabled]}
          >
            {savingTreatment ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Feather name="save" size={16} color="#fff" />
                <Text style={styles.saveTreatmentText}>
                  حفظ المعالجة{selectedTeeth.length > 0 ? ` (${selectedTeeth.length} سن)` : ''}
                </Text>
              </>
            )}
          </Pressable>
        </SectionCard>

        {/* Treatments log */}
        <SectionCard icon="activity" title="سجل المعالجات وجلساتها">
          {treatments.length === 0 ? (
            <Text style={styles.emptyInline}>لا توجد معالجات مسجّلة بعد</Text>
          ) : (
            treatments.map((t) => (
              <Pressable key={t.id} testID={`treatment-${t.id}`} onPress={() => setActiveTreatment(t)} style={styles.trmtRow}>
                <View style={[styles.condDot, { backgroundColor: colorMap[t.condition] || colors.brand, borderColor: colors.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trmtName}>{labelMap[t.condition] || t.name}</Text>
                  <Text style={styles.trmtMeta}>الأسنان: {(t.teeth || []).join('، ')} · {(t.sessions || []).length} جلسة · {String(t.created_at).slice(0, 10)}</Text>
                </View>
                <TouchableOpacity onPress={() => askDeleteTreatment(t)} activeOpacity={0.6} style={styles.rowDeleteBtn}>
                  <Feather name="trash-2" size={18} color={colors.error} />
                </TouchableOpacity>
                <Feather name="chevron-left" size={18} color={colors.muted} />
              </Pressable>
            ))
          )}
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
                <Text style={[styles.infoVal, { color: colors.brand, fontFamily: fontFamily.bold }]}>{money(i.total, i.currency)}</Text>
              </View>
              {(i.items || []).map((it: any, idx: number) => (
                <Text key={idx} style={styles.infoLabel}>• {it.description} ({it.quantity} × {it.unit_price})</Text>
              ))}
            </View>
          ))}
        </SectionCard>
      </ScrollView>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setMoreOpen(false)}>
          <Pressable style={styles.moreSheet} onPress={() => {}}>
            <View style={styles.moreHeader}>
              <Pressable testID="more-close" onPress={() => setMoreOpen(false)} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
              <Text style={styles.sheetTitle}>كل أنواع العلاجات</Text>
              <View style={{ width: 22 }} />
            </View>
            <View style={styles.moreSearchWrap}>
              <Feather name="search" size={18} color={colors.muted} />
              <TextInput testID="more-search" value={moreSearch} onChangeText={setMoreSearch} placeholder="ابحث عن نوع العلاج..." placeholderTextColor={colors.muted} style={styles.moreSearchInput} autoFocus />
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
              {conditions.filter((c) => !moreSearch.trim() || (labelMap[c] || '').includes(moreSearch.trim())).map((c) => {
                const active = activeCondition === c;
                return (
                  <Pressable key={c} testID={`more-opt-${c}`} onPress={() => { setActiveCondition(c); setMoreOpen(false); }} style={[styles.moreRow, active && styles.moreRowActive]}>
                    <View style={[styles.condDot, { backgroundColor: colorMap[c], borderColor: c === 'healthy' ? colors.border : colorMap[c] }]} />
                    <Text style={[styles.moreRowText, active && { color: '#fff' }]}>{labelMap[c]}</Text>
                    {active ? <Feather name="check" size={18} color="#fff" /> : null}
                  </Pressable>
                );
              })}
              <Pressable testID="add-treatment-type" onPress={() => { setMoreOpen(false); setAddTypeOpen(true); }} style={[styles.moreRow, styles.moreAddRow]}>
                <Feather name="plus-circle" size={16} color={colors.brand} />
                <Text style={[styles.moreRowText, { color: colors.brand }]}>نوع جديد</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={addTypeOpen} transparent animationType="fade" onRequestClose={() => setAddTypeOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setAddTypeOpen(false)}>
          <Pressable style={styles.addSheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>نوع معالجة جديد</Text>
            <Text style={styles.addHint}>سيتم توليد لون مميز تلقائياً مختلف عن الأنواع الحالية.</Text>
            <TextInput
              testID="new-type-input"
              value={newTypeLabel}
              onChangeText={setNewTypeLabel}
              placeholder="مثال: تبييض، تقويم، جسر..."
              placeholderTextColor={colors.muted}
              style={styles.addInput}
            />
            {addTypeErr ? <Text style={styles.xrayErr}>{addTypeErr}</Text> : null}
            <View style={styles.addActions}>
              <Pressable testID="cancel-type-btn" onPress={() => { setAddTypeOpen(false); setAddTypeErr(''); }} style={[styles.addBtn2, styles.addBtnGhost]}>
                <Text style={styles.addBtnGhostText}>إلغاء</Text>
              </Pressable>
              <Pressable testID="save-type-btn" onPress={addTreatmentType} disabled={addingType} style={[styles.addBtn2, styles.addBtnPrimary]}>
                {addingType ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addBtnPrimaryText}>إضافة</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══════ Confirm Delete Modal ═══════ */}
      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => setConfirmState(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmIcon}><Feather name="alert-triangle" size={26} color={colors.error} /></View>
            <Text style={styles.confirmTitle}>{confirmState?.title}</Text>
            <Text style={styles.confirmMsg}>{confirmState?.message}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg, width: '100%' }}>
              <Pressable onPress={() => setConfirmState(null)} style={[styles.addBtn2, styles.addBtnGhost, { flex: 1 }]}>
                <Text style={styles.addBtnGhostText}>إلغاء</Text>
              </Pressable>
              <Pressable onPress={runConfirm} disabled={confirmBusy} style={[styles.addBtn2, styles.confirmDeleteBtn, { flex: 1 }]}>
                {confirmBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addBtnPrimaryText}>حذف</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════ Treatment Sessions Modal ═══════ */}
      <Modal visible={!!activeTreatment} transparent animationType="slide" onRequestClose={() => setActiveTreatment(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setActiveTreatment(null)}>
          <Pressable style={styles.sessSheet} onPress={() => {}}>
            <View style={styles.sessHeader}>
              <Pressable onPress={() => setActiveTreatment(null)} hitSlop={8}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
              <Text style={styles.sheetTitle}>جلسات المعالجة</Text>
              <Pressable onPress={() => activeTreatment && askDeleteTreatment(activeTreatment)} hitSlop={8}>
                <Feather name="trash-2" size={20} color={colors.error} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
              <View style={styles.sessInfoCard}>
                <View style={styles.sessInfoRow}>
                  <View style={[styles.condDot, { backgroundColor: colorMap[activeTreatment?.condition] || colors.brand, borderColor: colors.border }]} />
                  <Text style={styles.sessTitle}>{labelMap[activeTreatment?.condition] || activeTreatment?.name || ''}</Text>
                </View>
                <Text style={styles.sessTeeth}>الأسنان: {(activeTreatment?.teeth || []).join('، ')}</Text>
              </View>
              {(activeTreatment?.sessions || []).length === 0 ? (
                <Text style={styles.emptyInline}>لا توجد جلسات مسجّلة</Text>
              ) : (
                (activeTreatment?.sessions || []).map((s: any, idx: number) => (
                  <View key={s.id} style={styles.sessRow}>
                    <View style={styles.sessBullet}><Text style={styles.sessBulletText}>{idx + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessName}>{s.name}</Text>
                      {s.note ? <Text style={styles.sessNote}>{s.note}</Text> : null}
                      <Text style={styles.sessDate}>{String(s.date).slice(0, 10)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => askDeleteSession(s)} activeOpacity={0.6} style={styles.rowDeleteBtn}>
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <Pressable onPress={() => setShowSessForm(true)} style={styles.addSessBtn}>
                <Feather name="plus" size={16} color={colors.brand} />
                <Text style={styles.addSessText}>إضافة جلسة متابعة</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══════ Add Session Form Modal ═══════ */}
      <Modal visible={showSessForm && !!activeTreatment} transparent animationType="fade" onRequestClose={() => setShowSessForm(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setShowSessForm(false)}>
          <Pressable style={styles.addSheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>جلسة متابعة جديدة</Text>
            <TextInput value={sessName} onChangeText={setSessName} placeholder="اسم الجلسة (مثال: متابعة حشوة)" placeholderTextColor={colors.muted} style={styles.addInput} />
            <TextInput value={sessNote} onChangeText={setSessNote} placeholder="ملاحظات (اختياري)" placeholderTextColor={colors.muted} style={[styles.addInput, { minHeight: 60 }]} multiline />
            <View style={styles.addActions}>
              <Pressable onPress={() => setShowSessForm(false)} style={[styles.addBtn2, styles.addBtnGhost]}>
                <Text style={styles.addBtnGhostText}>إلغاء</Text>
              </Pressable>
              <Pressable onPress={addFollowUp} disabled={addingSess || !sessName.trim()} style={[styles.addBtn2, styles.addBtnPrimary, (!sessName.trim() || addingSess) && { opacity: 0.5 }]}>
                {addingSess ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addBtnPrimaryText}>حفظ الجلسة</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Tooth({ n, chart, onToggle, selected, colorMap }: { n: number; chart: any; onToggle: (n: number) => void; selected: boolean; colorMap: Record<string, string> }) {
  const st = chart[n];
  const bg = st ? (colorMap[st.condition] || '#fff') : '#fff';
  const textColor = st ? toothTextColor(st.condition, bg) : colors.onSurface;
  return (
    <Pressable testID={`tooth-${n}`} onPress={() => onToggle(n)} style={[styles.tooth, { backgroundColor: bg }, selected && styles.toothSelected]}>
      <Text style={[styles.toothNum, { color: textColor }]}>{n}</Text>
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
  editInput: { flex: 1, marginLeft: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  editActions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md },
  editError: { color: colors.error, fontFamily: fontFamily.regular, textAlign: 'right', marginTop: spacing.sm },
  notesInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 100, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl', textAlignVertical: 'top' },
  savePill: { alignSelf: 'flex-start', marginTop: spacing.md, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  savePillText: { color: '#fff', fontFamily: fontFamily.bold },
  arcLabel: { textAlign: 'center', color: colors.muted, fontFamily: fontFamily.medium, marginVertical: spacing.sm },
  arch: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  paletteHint: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginBottom: spacing.sm },
  paletteWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  paletteChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  paletteChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  paletteText: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.sm },
  quadrant: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  quadLabel: { color: colors.onSurfaceSecondary, fontFamily: fontFamily.bold, fontSize: font.sm, textAlign: 'center', marginBottom: spacing.sm },
  moreChip: { borderColor: colors.brand },
  moreSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: spacing.md },
  moreHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  moreSearchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginHorizontal: spacing.lg, marginVertical: spacing.md },
  moreSearchInput: { flex: 1, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  moreRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  moreRowActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  moreRowText: { flex: 1, fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base, textAlign: 'right', writingDirection: 'rtl' },
  moreAddRow: { justifyContent: 'center', borderStyle: 'dashed', backgroundColor: colors.brandTertiary },
  toothSelected: { borderWidth: 2, borderColor: colors.brand },
  saveTreatmentBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  saveTreatmentBtnDisabled: { backgroundColor: colors.borderStrong },
  saveTreatmentText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.base },
  trmtRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  trmtName: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base, textAlign: 'right', writingDirection: 'rtl' },
  trmtMeta: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  sessSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: spacing.md },
  sessHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sessInfoCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  sessInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  sessTitle: { fontFamily: fontFamily.bold, color: colors.brand, fontSize: font.lg, textAlign: 'right', writingDirection: 'rtl' },
  sessTeeth: { fontFamily: fontFamily.medium, color: colors.onSurfaceSecondary, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 4 },
  sessRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sessBullet: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  sessBulletText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: font.sm },
  sessName: { fontFamily: fontFamily.bold, color: colors.onSurface, fontSize: font.base, textAlign: 'right', writingDirection: 'rtl' },
  sessNote: { fontFamily: fontFamily.regular, color: colors.onSurfaceSecondary, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  sessDate: { fontFamily: fontFamily.regular, color: colors.muted, fontSize: 11, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  sessForm: { marginTop: spacing.md },
  addSessBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: 'dashed', backgroundColor: colors.brandTertiary },
  addSessText: { color: colors.brand, fontFamily: fontFamily.bold, fontSize: font.base },
  rowDeleteBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.errorBg },
  confirmSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '86%', maxWidth: 420, alignItems: 'center', gap: spacing.sm, alignSelf: 'center' },
  confirmIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.errorBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  confirmTitle: { fontSize: font.lg, fontFamily: fontFamily.bold, color: colors.onSurface, textAlign: 'center' },
  confirmMsg: { fontSize: font.sm, fontFamily: fontFamily.regular, color: colors.onSurfaceSecondary, textAlign: 'center', writingDirection: 'rtl', lineHeight: 20 },
  confirmDeleteBtn: { backgroundColor: colors.error },
  confirmOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
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
  addTypeChip: { borderWidth: 1, borderColor: colors.brand, borderStyle: 'dashed', backgroundColor: colors.brandTertiary },
  addSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.sm },
  addHint: { color: colors.muted, fontFamily: fontFamily.regular, fontSize: font.sm, textAlign: 'right', writingDirection: 'rtl', marginBottom: spacing.xs },
  addInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.onSurface, fontFamily: fontFamily.regular, textAlign: 'right', writingDirection: 'rtl' },
  addActions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md, paddingBottom: spacing.md },
  addBtn2: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  addBtnPrimary: { backgroundColor: colors.brand },
  addBtnPrimaryText: { color: '#fff', fontFamily: fontFamily.bold },
  addBtnGhost: { backgroundColor: colors.surfaceSecondary },
  addBtnGhostText: { color: colors.onSurfaceSecondary, fontFamily: fontFamily.bold },
  headerBtn: { padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
