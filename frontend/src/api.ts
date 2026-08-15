// Cross-platform token storage + typed API client.
import { Platform } from 'react-native';
import { storage } from '@/src/utils/storage';

const TOKEN_KEY = 'eayadati_token';
const USER_KEY = 'eayadati_user';

export type Role = 'doctor' | 'assistant' | 'super_admin';
export type User = {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  role: Role;
  clinic_name?: string | null;
  show_financials_to_assistants: boolean;
};

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '') + '/api';
export const APP_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, '')) || null;
}
export async function setToken(t: string | null) {
  if (t === null) await storage.secureRemove(TOKEN_KEY);
  else await storage.secureSet(TOKEN_KEY, t);
}
export async function getStoredUser(): Promise<User | null> {
  const u = await storage.getItem<any>(USER_KEY, null);
  return (u as User) || null;
}
export async function setStoredUser(u: User | null) {
  if (u === null) await storage.removeItem(USER_KEY);
  else await storage.setItem(USER_KEY, u as any);
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: any; isForm?: boolean; auth?: boolean } = {}
): Promise<T> {
  const { method = 'GET', body, isForm = false, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `خطأ ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const api = {
  register: (payload: { email: string; password: string; full_name: string; clinic_name: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request<User>('/auth/me'),
  forgotPassword: (email: string) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token: string, new_password: string) => request('/auth/reset-password', { method: 'POST', body: { token, new_password }, auth: false }),

  adminListDoctors: () => request<any[]>('/admin/doctors'),
  adminStats: () => request<any>('/admin/stats'),
  adminResetPassword: (userId: string, new_password: string) => request(`/admin/users/${userId}/reset-password`, { method: 'POST', body: { new_password } }),
  adminToggleDisabled: (userId: string) => request<any>(`/admin/users/${userId}/toggle-disabled`, { method: 'POST' }),

  listAssistants: () => request<User[]>('/auth/assistants'),
  createAssistant: (payload: { email: string; password: string; full_name: string }) =>
    request<User>('/auth/assistants', { method: 'POST', body: payload }),
  deleteAssistant: (id: string) => request(`/auth/assistants/${id}`, { method: 'DELETE' }),

  getSettings: () => request<any>('/settings'),
  updateSettings: (payload: any) => request<any>('/settings', { method: 'PATCH', body: payload }),

  listPatients: (q = '') => request<any[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getPatient: (id: string) => request<any>(`/patients/${id}`),
  createPatient: (data: any) => request<any>('/patients', { method: 'POST', body: data }),
  updatePatient: (id: string, data: any) => request<any>(`/patients/${id}`, { method: 'PATCH', body: data }),
  deletePatient: (id: string) => request(`/patients/${id}`, { method: 'DELETE' }),

  getChart: (pid: string) => request<any[]>(`/patients/${pid}/chart`),
  setTooth: (pid: string, data: any) => request<any>(`/patients/${pid}/chart`, { method: 'POST', body: data }),

  listXrays: (pid: string) => request<any[]>(`/patients/${pid}/xrays`),
  uploadXray: async (pid: string, uri: string, name: string, type: string) => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('file', blob, name);
    } else {
      form.append('file', { uri, name, type } as any);
    }
    return request<any>(`/patients/${pid}/xrays`, { method: 'POST', body: form, isForm: true });
  },
  xrayFileUrl: async (xrayId: string) => {
    const token = await getToken();
    return `${BASE}/xrays/${xrayId}/file?token=${encodeURIComponent(token || '')}`;
  },
  deleteXray: (id: string) => request(`/xrays/${id}`, { method: 'DELETE' }),

  listAppointments: (from = '', to = '') => {
    const qs: string[] = [];
    if (from) qs.push(`date_from=${encodeURIComponent(from)}`);
    if (to) qs.push(`date_to=${encodeURIComponent(to)}`);
    return request<any[]>(`/appointments${qs.length ? '?' + qs.join('&') : ''}`);
  },
  createAppointment: (data: any) => request<any>('/appointments', { method: 'POST', body: data }),
  updateAppointment: (id: string, data: any) => request<any>(`/appointments/${id}`, { method: 'PATCH', body: data }),
  deleteAppointment: (id: string) => request(`/appointments/${id}`, { method: 'DELETE' }),

  listInvoices: (kind = '') => request<any[]>(`/invoices${kind ? `?kind=${kind}` : ''}`),
  createInvoice: (data: any) => request<any>('/invoices', { method: 'POST', body: data }),
  getInvoice: (id: string) => request<any>(`/invoices/${id}`),
  updateInvoice: (id: string, data: any) => request<any>(`/invoices/${id}`, { method: 'PATCH', body: data }),
  deleteInvoice: (id: string) => request(`/invoices/${id}`, { method: 'DELETE' }),

  uploadPdf: async (uri: string, name = 'invoice.pdf') => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('file', blob, name);
    } else {
      form.append('file', { uri, name, type: 'application/pdf' } as any);
    }
    const res = await request<{ file_id: string; path: string }>('/uploads/pdf', { method: 'POST', body: form, isForm: true });
    return { ...res, absolute_url: `${BASE.replace(/\/api$/, '')}${res.path}` };
  },

  publicClinic: (tenantId: string) => request<any>(`/public/clinic/${tenantId}`, { auth: false }),
  publicSlots: (tenantId: string, date: string) => request<any>(`/public/clinic/${tenantId}/slots?date=${date}`, { auth: false }),
  publicBook: (tenantId: string, data: any) => request<any>(`/public/clinic/${tenantId}/book`, { method: 'POST', body: data, auth: false }),

  listInventory: () => request<any[]>('/inventory'),
  createInventory: (data: any) => request<any>('/inventory', { method: 'POST', body: data }),
  updateInventory: (id: string, data: any) => request<any>(`/inventory/${id}`, { method: 'PATCH', body: data }),
  deleteInventory: (id: string) => request(`/inventory/${id}`, { method: 'DELETE' }),

  listLab: () => request<any[]>('/lab-orders'),
  createLab: (data: any) => request<any>('/lab-orders', { method: 'POST', body: data }),
  updateLab: (id: string, data: any) => request<any>(`/lab-orders/${id}`, { method: 'PATCH', body: data }),
  deleteLab: (id: string) => request(`/lab-orders/${id}`, { method: 'DELETE' }),

  summary: () => request<any>('/reports/summary'),
};
