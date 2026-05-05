import { invoke } from '@tauri-apps/api/core';
import type { AccountsStore, AppConfig, CodexAuthConfig, StoredAccount } from '../types';
import {
  buildIdentityFromAuthConfig,
  buildIdentityKeyFromAuthConfig,
  isEmptyIdentity,
} from './accountIdentity';
import {
  deleteAuthConfigFromCloudVault,
  loadCloudAuthConfig,
  loadCloudVaultAccounts,
  saveAuthConfigToCloudVault,
} from './cloudVault';

export { isMissingIdentityError } from './accountIdentity';

const DEFAULT_CLOUD_VAULT_CONFIG: AppConfig['cloudVault'] = {
  apiBaseUrl: '',
  vaultKey: '',
  activeIdentityKey: null,
  reloadIntervalMinutes: 0,
  lastLoadedAt: undefined,
};

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
  cloudVault: DEFAULT_CLOUD_VAULT_CONFIG,
};

const DEFAULT_STORE: AccountsStore = {
  version: '2.0.0',
  accounts: [],
  config: DEFAULT_CONFIG,
};

export type AddAccountOptions = {
  allowMissingIdentity?: boolean;
};

type AccountBackupEntry = {
  alias?: string;
  authConfig: CodexAuthConfig;
};

type AccountsBackupFile = {
  format: 'codex-manager-backup';
  version: '1.0.0';
  exportedAt: string;
  accounts: AccountBackupEntry[];
};

function normalizeConfig(config?: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    cloudVault: {
      ...DEFAULT_CLOUD_VAULT_CONFIG,
      ...config?.cloudVault,
    },
  };
}

function buildStoreForPersistence(config: AppConfig): AccountsStore {
  return {
    version: '2.0.0',
    accounts: [],
    config,
  };
}

function areAuthConfigsEquivalent(a: CodexAuthConfig, b: CodexAuthConfig): boolean {
  return (
    (a.OPENAI_API_KEY ?? null) === (b.OPENAI_API_KEY ?? null) &&
    (a.last_refresh ?? '') === (b.last_refresh ?? '') &&
    (a.tokens?.id_token ?? '') === (b.tokens?.id_token ?? '') &&
    (a.tokens?.access_token ?? '') === (b.tokens?.access_token ?? '') &&
    (a.tokens?.refresh_token ?? '') === (b.tokens?.refresh_token ?? '') &&
    (a.tokens?.account_id ?? '') === (b.tokens?.account_id ?? '')
  );
}

function parseAccountsBackup(data: string): AccountsBackupFile {
  let parsed: Partial<AccountsBackupFile>;
  try {
    parsed = JSON.parse(data) as Partial<AccountsBackupFile>;
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }

  if (parsed.format !== 'codex-manager-backup') {
    throw new Error('无效的备份格式');
  }

  if (!Array.isArray(parsed.accounts)) {
    throw new Error('备份文件缺少账号列表');
  }

  parsed.accounts.forEach((account, index) => {
    const tokens = account?.authConfig?.tokens;
    const hasValidTokens =
      typeof tokens?.id_token === 'string' &&
      tokens.id_token.trim() &&
      typeof tokens.access_token === 'string' &&
      tokens.access_token.trim() &&
      typeof tokens.refresh_token === 'string' &&
      tokens.refresh_token.trim() &&
      typeof tokens.account_id === 'string' &&
      tokens.account_id.trim();

    if (!hasValidTokens) {
      throw new Error(`备份文件中的第 ${index + 1} 个账号缺少完整凭据`);
    }
  });

  return {
    format: 'codex-manager-backup',
    version: '1.0.0',
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    accounts: parsed.accounts,
  };
}

async function loadCloudAccounts(config: AppConfig): Promise<StoredAccount[]> {
  if (!config.cloudVault.apiBaseUrl.trim() || !config.cloudVault.vaultKey.trim()) {
    return [];
  }

  const accounts = await loadCloudVaultAccounts(config, async () => null);

  if (!config.cloudVault.activeIdentityKey && accounts.length > 0) {
    return accounts.map((account, index) => ({
      ...account,
      isActive: index === 0,
    }));
  }

  return accounts;
}

export async function loadAccountsStore(): Promise<AccountsStore> {
  try {
    const data = await invoke<string>('load_accounts_store');
    const store = JSON.parse(data) as Partial<AccountsStore>;
    return {
      version: store.version || DEFAULT_STORE.version,
      accounts: [],
      config: normalizeConfig(store.config),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Store file not found')) {
      console.log('未找到本地配置，使用默认配置:', error);
      return DEFAULT_STORE;
    }
    throw error;
  }
}

export async function saveAccountsStore(store: AccountsStore): Promise<void> {
  const data = JSON.stringify(buildStoreForPersistence(normalizeConfig(store.config)), null, 2);
  await invoke('save_accounts_store', { data });
}

export async function loadAccountsFromVault(): Promise<StoredAccount[]> {
  const store = await loadAccountsStore();
  const accounts = await loadCloudAccounts(store.config);
  const activeIdentityKey =
    store.config.cloudVault.activeIdentityKey ??
    accounts.find((account) => account.isActive)?.id ??
    null;

  const nextConfig = normalizeConfig({
    ...store.config,
    cloudVault: {
      ...store.config.cloudVault,
      activeIdentityKey,
      lastLoadedAt: new Date().toISOString(),
    },
  });
  await saveAccountsStore(buildStoreForPersistence(nextConfig));

  return accounts.map((account) => ({
    ...account,
    isActive: account.id === activeIdentityKey,
  }));
}

export async function addAccount(
  authConfig: CodexAuthConfig,
  alias?: string,
  options: AddAccountOptions = {}
): Promise<StoredAccount> {
  const store = await loadAccountsStore();
  const identityKey = await saveAuthConfigToCloudVault(
    authConfig,
    alias,
    store.config,
    !!options.allowMissingIdentity
  );

  if (!store.config.cloudVault.activeIdentityKey) {
    await updateAppConfig({
      cloudVault: {
        ...store.config.cloudVault,
        activeIdentityKey: identityKey,
      },
    });
  }

  const accounts = await loadAccountsFromVault();
  const account = accounts.find((current) => current.id === identityKey);
  if (!account) {
    throw new Error('认证文件已保存到云端，但重新加载列表时未找到该账号');
  }
  return account;
}

export async function exportAccountsBackup(): Promise<string> {
  const accounts = await loadAccountsFromVault();
  const store = await loadAccountsStore();

  const backupAccounts = await Promise.all(
    accounts.map(async (account) => ({
      alias: account.alias || undefined,
      authConfig: await loadCloudAuthConfig(account.id, store.config),
    }))
  );

  const backup: AccountsBackupFile = {
    format: 'codex-manager-backup',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    accounts: backupAccounts,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importAccountsBackup(backupJson: string): Promise<{ importedCount: number }> {
  const backup = parseAccountsBackup(backupJson);

  for (const account of backup.accounts) {
    await addAccount(account.authConfig, account.alias, { allowMissingIdentity: true });
  }

  return { importedCount: backup.accounts.length };
}

export async function refreshAccountsWorkspaceMetadata(config: AppConfig): Promise<StoredAccount[]> {
  const accounts = await loadCloudAccounts(config);
  return accounts.map((account) => ({
    ...account,
    isActive: account.id === config.cloudVault.activeIdentityKey,
  }));
}

export async function removeAccount(accountId: string): Promise<void> {
  const store = await loadAccountsStore();
  await deleteAuthConfigFromCloudVault(accountId, store.config);

  if (store.config.cloudVault.activeIdentityKey === accountId) {
    await updateAppConfig({
      cloudVault: {
        ...store.config.cloudVault,
        activeIdentityKey: null,
      },
    });
  }
}

export async function updateAccountUsage(): Promise<void> {
  // 用量信息现在只保存在内存状态里，云端保险柜只保管认证文件。
}

export async function setActiveAccount(accountId: string | null): Promise<void> {
  const store = await loadAccountsStore();
  await updateAppConfig({
    cloudVault: {
      ...store.config.cloudVault,
      activeIdentityKey: accountId,
    },
  });
}

export async function getActiveAccount(): Promise<StoredAccount | null> {
  const accounts = await loadAccountsFromVault();
  return accounts.find((account) => account.isActive) ?? null;
}

export async function switchToAccount(accountId: string): Promise<void> {
  const store = await loadAccountsStore();
  const authConfig = await loadCloudAuthConfig(accountId, store.config);

  await invoke('write_codex_auth', {
    authConfig: JSON.stringify(authConfig),
  });

  await setActiveAccount(accountId);
}

export async function importAccountFromFile(
  filePath: string,
  options: AddAccountOptions = {}
): Promise<StoredAccount> {
  const content = await invoke<string>('read_file_content', { filePath });
  const authConfig = JSON.parse(content) as CodexAuthConfig;
  return addAccount(authConfig, undefined, options);
}

export async function updateAppConfig(config: Partial<AppConfig>): Promise<void> {
  const store = await loadAccountsStore();
  const nextConfig = normalizeConfig({
    ...store.config,
    ...config,
    cloudVault: {
      ...store.config.cloudVault,
      ...config.cloudVault,
    },
  });
  await saveAccountsStore(buildStoreForPersistence(nextConfig));
}

export async function getCurrentAuthAccountId(): Promise<string | null> {
  try {
    const authJson = await invoke<string>('read_codex_auth');
    const authConfig = JSON.parse(authJson) as CodexAuthConfig;
    return buildIdentityFromAuthConfig(authConfig).accountId;
  } catch (error) {
    console.log('读取当前 Codex 认证失败:', error);
    return null;
  }
}

export async function syncCurrentAccount(): Promise<string | null> {
  let currentAuthConfig: CodexAuthConfig | null = null;
  try {
    const authJson = await invoke<string>('read_codex_auth');
    currentAuthConfig = JSON.parse(authJson) as CodexAuthConfig;
  } catch (error) {
    console.log('读取当前 Codex 认证失败:', error);
  }

  if (!currentAuthConfig) {
    await setActiveAccount(null);
    return null;
  }

  const identity = buildIdentityFromAuthConfig(currentAuthConfig);
  if (isEmptyIdentity(identity)) {
    await setActiveAccount(null);
    return null;
  }

  const identityKey = buildIdentityKeyFromAuthConfig(currentAuthConfig);
  const store = await loadAccountsStore();

  try {
    const cloudAuth = await loadCloudAuthConfig(identityKey, store.config);
    if (!areAuthConfigsEquivalent(cloudAuth, currentAuthConfig)) {
      await saveAuthConfigToCloudVault(currentAuthConfig, undefined, store.config, true);
    }
    await setActiveAccount(identityKey);
    return identityKey;
  } catch (error) {
    console.log('当前 Codex 账号不在云端保险柜中:', error);
    await setActiveAccount(null);
    return null;
  }
}

export async function loadAuthConfigForAccount(accountId: string): Promise<CodexAuthConfig> {
  const store = await loadAccountsStore();
  return loadCloudAuthConfig(accountId, store.config);
}
