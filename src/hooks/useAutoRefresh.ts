import { useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../stores/useAccountStore';
import type { UsageInfo } from '../types';
import { loadAuthConfigForAccount } from '../utils/storage';

interface RustUsageData {
  five_hour_percent_left?: number;
  five_hour_reset_time_ms?: number;
  weekly_percent_left?: number;
  weekly_reset_time_ms?: number;
  code_review_percent_left?: number;
  code_review_reset_time_ms?: number;
  last_updated: string;
}

interface RustUsageResult {
  status:
    | 'ok'
    | 'missing_account_id'
    | 'missing_token'
    | 'no_codex_access'
    | 'no_usage'
    | 'expired'
    | 'stale_token'
    | 'forbidden'
    | 'error';
  message?: string;
  plan_type?: string;
  usage?: RustUsageData;
}

const formatResetTime = (resetTimeMs: number, includeWeekday: boolean): string => {
  if (!Number.isFinite(resetTimeMs) || resetTimeMs <= 0) {
    throw new Error('无效的重置时间');
  }

  const date = new Date(resetTimeMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error('无效的重置时间');
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (!includeWeekday) {
    return `${hours}:${minutes}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const buildLimitInfo = (
  percentLeft: number | undefined,
  resetTimeMs: number | undefined,
  includeWeekday: boolean
) => {
  if (!Number.isFinite(percentLeft) || !Number.isFinite(resetTimeMs)) {
    return undefined;
  }

  return {
    percentLeft: Math.round(percentLeft as number),
    resetTime: formatResetTime(resetTimeMs as number, includeWeekday),
  };
};

const buildUsageInfo = (usageData: RustUsageData, planType?: string): UsageInfo => ({
  status: 'ok',
  planType,
  fiveHourLimit: buildLimitInfo(
    usageData.five_hour_percent_left,
    usageData.five_hour_reset_time_ms,
    false
  ),
  weeklyLimit: buildLimitInfo(
    usageData.weekly_percent_left,
    usageData.weekly_reset_time_ms,
    true
  ),
  codeReviewLimit: buildLimitInfo(
    usageData.code_review_percent_left,
    usageData.code_review_reset_time_ms,
    false
  ),
  lastUpdated: usageData.last_updated,
});

const buildStatusUsageInfo = (result: RustUsageResult): UsageInfo => ({
  status: result.status,
  message: result.message,
  planType: result.plan_type,
  lastUpdated: new Date().toISOString(),
});

export function useAutoRefresh() {
  const { accounts, config, updateUsage } = useAccountStore();
  const isRefreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  type RefreshStatus =
    | 'success'
    | 'no-usage'
    | 'missing-account-id'
    | 'missing-token'
    | 'no-codex-access'
    | 'expired'
    | 'stale-token'
    | 'forbidden'
    | 'error'
    | 'skipped';
  type RefreshResult = { status: RefreshStatus; message?: string };
  type RefreshAllResult = { updated: number; missing: number; skipped: boolean };

  const fetchAccountUsage = useCallback(async (accountId: string): Promise<{
    usage: UsageInfo | null;
    status: RefreshStatus;
  }> => {
    try {
      const authConfig = await loadAuthConfigForAccount(accountId);
      const usageResult = await invoke<RustUsageResult>('get_codex_wham_usage_from_auth', {
        authConfig: JSON.stringify(authConfig),
        proxyEnabled: config.proxyEnabled,
        proxyUrl: config.proxyUrl,
      });

      if (usageResult.status === 'ok' && usageResult.usage) {
        return {
          usage: buildUsageInfo(usageResult.usage, usageResult.plan_type),
          status: 'success',
        };
      }

      const statusMap: Partial<Record<RustUsageResult['status'], RefreshStatus>> = {
        no_usage: 'no-usage',
        missing_account_id: 'missing-account-id',
        missing_token: 'missing-token',
        no_codex_access: 'no-codex-access',
        expired: 'expired',
        stale_token: 'stale-token',
        forbidden: 'forbidden',
        error: 'error',
      };
      const mappedStatus = statusMap[usageResult.status] ?? 'error';
      return { usage: buildStatusUsageInfo(usageResult), status: mappedStatus };
    } catch (error) {
      console.error(`获取账号用量失败 ${accountId}:`, error);
      return {
        usage: {
          status: 'error',
          message: error instanceof Error ? error.message : 'wham/usage 请求失败',
          lastUpdated: new Date().toISOString(),
        },
        status: 'error',
      };
    }
  }, [config.proxyEnabled, config.proxyUrl]);

  const refreshAllUsage = useCallback(async (): Promise<RefreshAllResult> => {
    if (isRefreshingRef.current || accounts.length === 0) {
      return { updated: 0, missing: 0, skipped: true };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    let updated = 0;
    let missing = 0;

    try {
      for (const account of accounts) {
        const { usage, status } = await fetchAccountUsage(account.id);
        if (usage) {
          await updateUsage(account.id, usage);
        }
        if (status === 'success') {
          updated += 1;
        } else {
          missing += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return { updated, missing, skipped: false };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [accounts, fetchAccountUsage, updateUsage]);

  const refreshSingleAccount = useCallback(async (accountId: string): Promise<RefreshResult> => {
    if (isRefreshingRef.current) {
      return { status: 'skipped' };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const { usage, status: fetchStatus } = await fetchAccountUsage(accountId);
      const status = fetchStatus === 'success' ? 'success' : fetchStatus;
      const message = usage?.message;

      if (usage) {
        await updateUsage(accountId, usage);
      }

      return { status, message };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [fetchAccountUsage, updateUsage]);

  return {
    refreshAllUsage,
    refreshSingleAccount,
    isRefreshing,
  };
}

export default useAutoRefresh;
