"use client";
import type { ReactNode } from 'react';
import { Loader } from '@mantine/core';
import { IconDatabase, IconRefresh } from '@tabler/icons-react';
import classes from './originalXPost.module.css';

/** Stored content stays directly readable while providers load or are unavailable. */
export function StoredPostFallback({ children, loading, onRetry }: { children: ReactNode; loading?: boolean; onRetry?: () => void }) {
  return <div className={classes.panel}>
    <div className={classes.fallbackStatus}>
      <span role="status">{loading ? <Loader size={12} color="cyan" /> : <IconDatabase size={13} aria-hidden />}{loading ? 'Memuat post asli…' : 'Data tersimpan · Bankomen'}</span>
      {!loading && onRetry && <button type="button" onClick={onRetry} title="Coba muat post asli" aria-label="Coba muat post asli"><IconRefresh size={14} aria-hidden /></button>}
    </div>
    {children}
  </div>;
}
