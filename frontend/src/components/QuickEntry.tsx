import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Transaction } from '../lib/types';
import { EntryForm } from './EntryForm';
import { Modal } from './ui';

interface QuickEntryApi {
  open: (transaction?: Transaction) => void;
  close: () => void;
  /** 每次记账成功自增，页面据此重新拉取数据 */
  version: number;
  bump: () => void;
}

const QuickEntryContext = createContext<QuickEntryApi | null>(null);

export function useQuickEntry(): QuickEntryApi {
  const context = useContext(QuickEntryContext);
  if (!context) throw new Error('useQuickEntry 必须在 QuickEntryProvider 内使用');
  return context;
}

export function QuickEntryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [version, setVersion] = useState(0);

  const openEntry = useCallback((transaction?: Transaction) => {
    setEditing(transaction ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const value = useMemo<QuickEntryApi>(
    () => ({ open: openEntry, close, version, bump }),
    [openEntry, close, version, bump],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openEntry();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEntry]);

  return (
    <QuickEntryContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={close}
        title={editing ? '编辑流水' : '记一笔'}
        subtitle={
          editing
            ? '修改后会自动重算该日期起的日 / 周 / 月 / 年切片'
            : '选择品类、输入金额，⌘ / Ctrl + Enter 快速保存'
        }
        width="max-w-2xl"
      >
        <EntryForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onCancel={close}
          onSaved={() => {
            setVersion((current) => current + 1);
            setOpen(false);
          }}
        />
      </Modal>
    </QuickEntryContext.Provider>
  );
}
