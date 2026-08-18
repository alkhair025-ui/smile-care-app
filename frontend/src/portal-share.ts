import { Linking } from 'react-native';
import { api } from '@/src/api';

/** Fetch a patient's portal link and open WhatsApp with a message containing it. */
export async function sharePortalViaWhatsApp(
  patientId: string,
  clinicName: string,
  patientName: string,
  patientPhone?: string
) {
  const { url } = await api.getPatientPortal(patientId);
  const lines = [
    `مرحباً ${patientName || ''} 🦷`,
    `هذا رابط ملفك الطبي الخاص في ${clinicName || 'العيادة'}، ويشمل سجل الفواتير والدفعات والتقرير الطبي ومخطط الأسنان (يُحدَّث تلقائياً):`,
    '',
    url,
  ];
  const text = encodeURIComponent(lines.join('\n'));
  const phone = (patientPhone || '').replace(/[^\d]/g, '');
  const wa = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  await Linking.openURL(wa);
  return url;
}
