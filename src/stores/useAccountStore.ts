import { create } from 'zustand';
import type { AppConfig, CodexAuthConfig, StoredAccount, UsageInfo } from '../types';
import {
  addAccount as addAccountToStore,
  isMissingIdentityError,
  loadAccountsFromVault,
  loadAccountsStore,
  removeAccount as removeAccountFromStore,
  switchToAccount as switchAccount,
  syncCurrentAccount as syncCurrent,
  updateAppConfig,
  type AddAccountOptions,
} from '../utils/storage';

interface AccountState {
  accounts: StoredAccount[];
  activeAccountId: string | null;
  config: AppConfig;
  isLoading: boolean;
  error: string | null;

  loadAccounts: (options?: { silent?: boolean }) => Promise<void>;
  syncCurrentAccount: () => Promise<void>;
  addAccount: (authJson: string, alias?: string, options?: AddAccountOptions) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  switchToAccount: (accountId: string) => Promise<void>;
  updateUsage: (accountId: string, usage: UsageInfo) => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  refreshAllUsage: () => Promise<void>;
  setError: (message: string) => void;
  clearError: () => void;
}

const DEFAULT_CONFIG: AppConfig = {
  autoRefreshInterval: 30,
  codexPath: 'codex',
  closeBehavior: 'ask',
  theme: 'dark',
  hasInitialized: false,
  proxyEnabled: false,
  proxyUrl: 'http://127.0.0.1:7890',
  autoRestartCodexOnSwitch: false,
  skipSwitchRestartConfirm: false,
  cloudVault: {
    apiBaseUrl: '',
    vaultKey: '',
    activeIdentityKey: null,
    reloadIntervalMinutes: 0,
    lastLoadedAt: undefined,
  },
};

function buildState(accounts: StoredAccount[], config: AppConfig) {
  const activeAccount = accounts.find((account) => account.isActive);
  return {
    accounts,
    activeAccountId: activeAccount?.id ?? null,
    config: {
      ...DEFAULT_CONFIG,
      ...config,
      cloudVault: {
        ...DEFAULT_CONFIG.cloudVault,
        ...config.cloudVault,
      },
    },
  };
}

async function loadCloudState() {
  const accounts = await loadAccountsFromVault();
  const store = await loadAccountsStore();
  return buildState(accounts, store.config);
}

function mergeAccountsWithUsage(
  nextAccounts: StoredAccount[],
  currentAccounts: StoredAccount[]
): StoredAccount[] {
  const usageByAccountId = new Map(
    currentAccounts
      .filter((account) => account.usageInfo)
      .map((account) => [account.id, account.usageInfo])
  );

  return nextAccounts.map((account) => {
    const usageInfo = usageByAccountId.get(account.id);
    return usageInfo ? { ...account, usageInfo } : account;
  });
}

async function loadMergedCloudState(currentAccounts: StoredAccount[]) {
  const state = await loadCloudState();
  return {
    ...state,
    accounts: mergeAccountsWithUsage(state.accounts, currentAccounts),
  };
}

let latestLoadRequestId = 0;

function invalidatePendingLoads(): void {
  latestLoadRequestId += 1;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  config: DEFAULT_CONFIG,
  isLoading: false,
  error: null,

  loadAccounts: async (options = {}) => {
    const requestId = ++latestLoadRequestId;
    if (!options.silent) {
      set({ isLoading: true, error: null });
    }

    try {
      const state = await loadMergedCloudState(get().accounts);
      if (requestId !== latestLoadRequestId) {
        return;
      }
      set({
        ...state,
        isLoading: options.silent ? get().isLoading : false,
        error: null,
      });
    } catch (error) {
      if (requestId !== latestLoadRequestId) {
        return;
      }
      set({
        isLoading: options.silent ? get().isLoading : false,
        error: error instanceof Error ? error.message : '加载云端保险柜失败',
      });
    }
  },

  syncCurrentAccount: async () => {
    try {
      await syncCurrent();
      const state = await loadMergedCloudState(get().accounts);
      set(state);
    } catch (error) {
      console.error('同步当前账号状态失败:', error);
    }
  },

  addAccount: async (authJson: string, alias?: string, options?: AddAccountOptions) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      const authConfig = JSON.parse(authJson) as CodexAuthConfig;
      await addAccountToStore(authConfig, alias, options);
      const state = await loadMergedCloudState(get().accounts);
      set({ ...state, isLoading: false, error: null });
    } catch (error) {
      if (isMissingIdentityError(error)) {
        set({ isLoading: false, error: null });
        throw error;
      }

      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '保存认证文件失败',
      });
      throw error;
    }
  },

  removeAccount: async (accountId: string) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      await removeAccountFromStore(accountId);
      const state = await loadMergedCloudState(get().accounts);
      set({ ...state, isLoading: false, error: null });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '删除云端认证文件失败',
      });
    }
  },

  switchToAccount: async (accountId: string) => {
    invalidatePendingLoads();
    set({ isLoading: true, error: null });
    try {
      await switchAccount(accountId);
      const state = await loadMergedCloudState(get().accounts);
      set({ ...state, isLoading: false, error: null });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '切换账号失败',
      });
    }
  },

  updateUsage: async (accountId: string, usage: UsageInfo) => {
    set({
      accounts: get().accounts.map((account) =>
        account.id === accountId
          ? { ...account, usageInfo: usage, updatedAt: new Date().toISOString() }
          : account
      ),
    });
  },

  updateConfig: async (config: Partial<AppConfig>) => {
    await updateAppConfig(config);
    const store = await loadAccountsStore();
    const activeIdentityKey = store.config.cloudVault.activeIdentityKey;
    const accounts = get().accounts.map((account) => ({
      ...account,
      isActive: activeIdentityKey ? account.id === activeIdentityKey : false,
    }));
    set(buildState(accounts, store.config));
  },

  refreshAllUsage: async () => {
    console.log('刷新全部用量...');
  },

  setError: (message: string) => set({ error: message }),
  clearError: () => set({ error: null }),
}));
