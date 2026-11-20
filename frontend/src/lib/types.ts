export interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  avatar_emoji: string;
  currency: string;
}

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  emoji: string;
  kind: 'expense' | 'income';
  color: string;
  sort_order: number;
  is_archived: boolean;
  usage: number;
  child_count: number;
  /** 没有子品类时才是可记账的末级品类 */
  is_leaf: boolean;
  children?: Category[];
}

export interface Transaction {
  id: number;
  category_id: number;
  category_name: string;
  category_parent_name: string | null;
  category_emoji: string;
  category_color: string;
  kind: 'expense' | 'income';
  amount: number;
  occurred_on: string;
  note: string;
  created_at: string;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  total_expense: number;
  total_income: number;
}

export type PeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface BudgetNode {
  id: number;
  parent_id: number | null;
  is_total: boolean;
  name: string;
  kind: 'expense' | 'income';
  category_id: number | null;
  category_name: string;
  category_parent_name: string | null;
  category_emoji: string;
  category_color: string;
  period_type: PeriodType;
  period_days: number | null;
  anchor_date: string | null;
  period_label: string;
  window_start: string;
  window_end: string;
  amount: number;
  effective_amount: number;
  children_total: number;
  overridden: boolean;
  used: number;
  remaining: number;
  ratio: number;
  days_left: number;
  daily_allowance: number;
  is_active: boolean;
  children: BudgetNode[];
  /** 总预算专用：子预算按一级品类归组，额度 = max(整组预算, 子预算合计) */
  groups: BudgetGroup[];
}

export interface BudgetGroup {
  key: number;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  whole_amount: number;
  items_total: number;
  has_whole: boolean;
  overridden: boolean;
  used: number;
  children: BudgetNode[];
}

export interface BudgetGroups {
  totals: BudgetNode[];
  standalone: BudgetNode[];
  summary: { amount: number; used: number; count: number; child_count: number };
}

export interface JobRun {
  id: number;
  name: string;
  job_type: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  message: string;
  error: string;
  trigger: string;
  duration_ms: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Totals {
  expense: number;
  income: number;
  net: number;
  txn_count: number;
  active_days: number;
  days: number;
  avg_daily_expense: number;
  saving_rate: number;
}

export interface MonthOverview extends Totals {
  label: string;
  start: string;
  end: string;
  previous_expense: number;
  expense_delta: number | null;
  top_category: {
    name: string;
    emoji: string;
    color: string;
    amount: number;
    share: number;
  } | null;
}

export interface TrendPoint {
  key: string;
  label: string;
  expense: number;
  income: number;
}

export interface CategorySliceChild {
  id: number;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  count: number;
  share: number;
}

export interface CategorySlice {
  id: number;
  parent_id?: number | null;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  count: number;
  share: number;
  /** 一级品类聚合，children 为子品类明细 */
  is_group?: boolean;
  children?: CategorySliceChild[];
  previous_amount?: number;
  delta?: number | null;
}

export interface Dashboard {
  month: MonthOverview;
  trend: TrendPoint[];
  categories: CategorySlice[];
  recent: Transaction[];
  budgets: BudgetGroups;
  jobs: { running: number; finished_today: number };
  meta: { today: string };
}

export interface Report {
  granularity: 'week' | 'month' | 'year';
  label: string;
  start: string;
  end: string;
  previous_label: string;
  previous_start: string;
  previous_end: string;
  current: Totals;
  previous: Totals;
  last_year: Totals;
  categories: CategorySlice[];
  points: TrendPoint[];
  weekday: { label: string; expense: number; income: number }[];
  calendar: { date: string; weekday: number; expense: number; intensity: number }[];
  insight: {
    top_day: string | null;
    top_day_amount: number;
    top_category: string | null;
    expense_delta: number | null;
    income_delta: number | null;
    avg_daily_expense: number;
  };
}

export interface SliceRow {
  period_key: string;
  total_income: number;
  total_expense: number;
  net: number;
  txn_count: number;
}

export interface SystemInfo {
  app: string;
  server_time: string;
  today: string;
  txn_count: number;
  daily_rows: number;
  period_rows: number;
  budget_count: number;
  scheduler: { enabled: boolean; daily_rollup_at: string; catchup_every_minutes: number; desc: string };
  transport: string;
  last_job: { id: number; name: string; status: string; finished_at: string | null } | null;
}

export interface MutationResult {
  job_id: number;
  message: string;
  transaction: Transaction | null;
}

export interface RecurringTemplate {
  id: number;
  category_id: number;
  category_name: string;
  category_emoji: string;
  kind: 'expense' | 'income';
  amount: number;
  note: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_run_on: string;
  is_active: boolean;
  generated_count: number;
}

export interface Handshake {
  key_id: string;
  public_key: string;
  algorithm: string;
  nonce: string;
  expires_in: number;
}
