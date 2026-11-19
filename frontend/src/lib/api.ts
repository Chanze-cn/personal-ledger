import { sealPayload } from './crypto';
import type {
  BudgetGroups,
  BudgetNode,
  Category,
  Dashboard,
  Handshake,
  JobRun,
  MutationResult,
  Report,
  SliceRow,
  SystemInfo,
  Transaction,
  TransactionPage,
  User,
} from './types';

export const TOKEN_KEY = 'ledger_token';
export const UNAUTHORIZED_EVENT = 'ledger:unauthorized';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError('网络异常，请检查服务是否启动', 0);
  }

  if (response.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    let detail = '请求失败';
    try {
      const data = await response.json();
      detail = typeof data?.detail === 'string' ? data.detail : detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** 握手 + 混合加密，任何携带密码的请求都走这里，保证不明文过网。 */
async function sealedRequest<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const handshake = await request<Handshake>('/auth/handshake');
  const sealed = await sealPayload(handshake.public_key, {
    ...payload,
    nonce: handshake.nonce,
    ts: Math.floor(Date.now() / 1000),
  });
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify({ key_id: handshake.key_id, ...sealed }),
  });
}

export const api = {
  login: (username: string, password: string) =>
    sealedRequest<{ access_token: string; user: User }>('/auth/login', { username, password }),
  register: (username: string, password: string, displayName = '') =>
    sealedRequest<{ access_token: string; user: User }>('/auth/register', {
      username,
      password,
      display_name: displayName,
    }),
  handshake: () => request<Handshake>('/auth/handshake'),
  me: () => request<User>('/auth/me'),
  updateMe: (payload: Partial<Pick<User, 'display_name' | 'avatar_emoji' | 'currency'>>) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  changePassword: (oldPassword: string, newPassword: string) =>
    sealedRequest<{ ok: boolean }>('/auth/me/password', {
      old_password: oldPassword,
      new_password: newPassword,
    }),

  categories: (includeArchived = false, tree = false) =>
    request<Category[]>(`/categories${qs({ include_archived: includeArchived, tree })}`),
  createCategory: (payload: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id: number, payload: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCategory: (id: number) =>
    request<{ archived: boolean; message: string }>(`/categories/${id}`, { method: 'DELETE' }),
  restoreCategory: (id: number) =>
    request<{ ok: boolean; message: string }>(`/categories/${id}/restore`, { method: 'POST' }),

  transactions: (params: Record<string, string | number | undefined>) =>
    request<TransactionPage>(`/transactions${qs(params)}`),
  createTransaction: (payload: {
    category_id: number;
    amount: number;
    occurred_on: string;
    note: string;
  }) => request<MutationResult>('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateTransaction: (id: number, payload: Record<string, unknown>) =>
    request<MutationResult>(`/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteTransaction: (id: number) =>
    request<MutationResult>(`/transactions/${id}`, { method: 'DELETE' }),

  dashboard: () => request<Dashboard>('/stats/dashboard'),
  report: (period: 'week' | 'month' | 'year', anchor: string) =>
    request<Report>(`/stats/report${qs({ period, anchor })}`),
  trend: (granularity: string, start: string, end: string) =>
    request<{ key: string; label: string; expense: number; income: number }[]>(
      `/stats/trend${qs({ granularity, start, end })}`,
    ),
  slices: (granularity: string, limit = 12) =>
    request<SliceRow[]>(`/stats/slices${qs({ granularity, limit })}`),
  categoriesStats: (start: string, end: string, kind = 'expense') =>
    request<Dashboard['categories']>(`/stats/categories${qs({ start, end, kind })}`),

  budgets: (kind?: 'expense' | 'income') => request<BudgetGroups>(`/budgets${qs({ kind })}`),
  createBudget: (payload: Record<string, unknown>) =>
    request<BudgetNode>('/budgets', { method: 'POST', body: JSON.stringify(payload) }),
  updateBudget: (id: number, payload: Record<string, unknown>) =>
    request<BudgetNode>(`/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteBudget: (id: number) =>
    request<{ ok: boolean; removed_children: number }>(`/budgets/${id}`, { method: 'DELETE' }),

  jobs: (limit = 30) => request<JobRun[]>(`/jobs${qs({ limit })}`),
  job: (id: number) => request<JobRun>(`/jobs/${id}`),
  jobStats: () =>
    request<{ counts: Record<string, number>; avg_duration_ms: Record<string, number> }>(
      '/jobs/stats',
    ),
  rebuild: () => request<{ job_id: number; message: string }>('/jobs/rebuild', { method: 'POST' }),
  dailyRollup: () =>
    request<{ job_id: number; message: string }>('/jobs/daily', { method: 'POST' }),

  systemInfo: () => request<SystemInfo>('/system/info'),
  demoData: () =>
    request<{ job_id: number; created: number; message: string }>('/system/demo-data', {
      method: 'POST',
    }),
  resetData: () => request<{ ok: boolean; message: string }>('/system/data', { method: 'DELETE' }),
};

export type TransactionRow = Transaction;
