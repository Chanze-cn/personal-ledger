import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { JobRun } from './types';

export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    let alive = true;
    const id = ++runId.current;
    setLoading(true);
    fetcher()
      .then((result) => {
        if (alive && id === runId.current) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (alive && id === runId.current) setError(err.message || '加载失败');
      })
      .finally(() => {
        if (alive && id === runId.current) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}

/** 仅用于需要「等切片算完再刷新」的场景（如生成示例数据），业务写入默认不阻塞。 */
export async function waitForJob(jobId: number, timeoutMs = 20000): Promise<JobRun> {
  const startedAt = Date.now();
  let delay = 150;
  while (Date.now() - startedAt < timeoutMs) {
    const job = await api.job(jobId);
    if (job.status === 'success' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.35), 600);
  }
  throw new Error('异步任务执行超时，请到任务中心查看进度');
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}
