import { Platform, Linking } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '@/src/api';

const CUR: Record<string, string> = { SYP: 'ل.س', USD: '$' };
const money = (n: number, cur = 'SYP') => `${(Number(n) || 0).toLocaleString('en')} ${CUR[cur] || cur}`;

export function invoiceHtml(inv: any, clinic: { name?: string; phone?: string; address?: string }) {
  const cur = inv.currency || 'SYP';
  const rows = (inv.items || [])
    .map(
      (it: any) =>
        `<tr><td>${it.description}</td><td>${it.quantity}</td><td>${money(it.unit_price, cur)}</td><td>${money(
          (it.quantity || 0) * (it.unit_price || 0), cur
        )}</td></tr>`
    )
    .join('');
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
    body{font-family:Tajawal, Arial, sans-serif; padding:32px; color:#1A211E;}
    .head{display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #4A7065; padding-bottom:16px;}
    .clinic{font-size:22px; font-weight:bold; color:#4A7065;}
    .sub{color:#6B7876; font-size:13px; margin-top:4px;}
    .tag{background:#F0F4F2; color:#4A7065; padding:6px 14px; border-radius:20px; font-weight:bold;}
    h2{color:#334F46; margin-top:24px;}
    .meta{margin:16px 0; color:#384541;}
    .meta b{color:#4A7065;}
    table{width:100%; border-collapse:collapse; margin-top:12px;}
    th,td{border:1px solid #E1E8E6; padding:10px; text-align:right; font-size:13px;}
    th{background:#F0F4F2; color:#334F46;}
    .totals{margin-top:16px; text-align:left;}
    .totals div{margin:4px 0; font-size:15px;}
    .grand{font-size:20px; font-weight:bold; color:#4A7065;}
    .foot{margin-top:40px; text-align:center; color:#6B7876; font-size:12px;}
  </style></head><body>
    <div class="head">
      <div>
        <div class="clinic">${clinic.name || 'العيادة'}</div>
        <div class="sub">${clinic.address || ''}</div>
        <div class="sub">${clinic.phone || ''}</div>
      </div>
      <div class="tag">فاتورة</div>
    </div>
    <div class="meta">
      <div><b>المستفيد:</b> ${inv.party_name || '—'}</div>
      <div><b>التاريخ:</b> ${(inv.date || '').slice(0, 10)}</div>
    </div>
    <table>
      <tr><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>
      ${rows}
    </table>
    <div class="totals">
      <div>المجموع: ${money(inv.total, cur)}</div>
      <div>المدفوع: ${money(inv.paid, cur)}</div>
      <div class="grand">المتبقي: ${money((inv.total || 0) - (inv.paid || 0), cur)}</div>
    </div>
    <div class="foot">شكراً لزيارتكم — تم الإصدار من نظام عيادتي</div>
  </body></html>`;
}

/** Generate PDF, upload to backend, and open WhatsApp with text + public download link. */
export async function shareInvoiceViaWhatsApp(
  inv: any,
  clinic: { name?: string; phone?: string; address?: string },
  patientPhone?: string
) {
  const html = invoiceHtml(inv, clinic);
  let publicUrl = '';
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const uploaded = await api.uploadPdf(uri, `invoice-${inv.id}.pdf`);
    publicUrl = uploaded.absolute_url;
  } catch (e) {
    // fall through — still send text summary
  }
  const lines = [
    `فاتورة من ${clinic.name || 'العيادة'}`,
    `المستفيد: ${inv.party_name}`,
    `التاريخ: ${(inv.date || '').slice(0, 10)}`,
    `الإجمالي: ${money(inv.total, inv.currency || 'SYP')}`,
    `المدفوع: ${money(inv.paid, inv.currency || 'SYP')}`,
  ];
  if (publicUrl) lines.push('', `تحميل الفاتورة PDF:`, publicUrl);
  const text = encodeURIComponent(lines.join('\n'));
  const phone = (patientPhone || '').replace(/[^\d]/g, '');
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  await Linking.openURL(url);
  return publicUrl;
}

/** Print / share the invoice as a PDF locally. */
export async function exportInvoicePdf(inv: any, clinic: { name?: string; phone?: string; address?: string }) {
  const html = invoiceHtml(inv, clinic);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
  } else {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  }
}
