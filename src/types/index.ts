// Codex auth.json 文件结构
export interface CodexAuthConfig {
  auth_mode?: string;
  OPENAI_API_KEY: string | null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh: string;
}

// 从 JWT 解析出的账号信息
export interface AccountInfo {
  email: string;
  planType: 'free' | 'plus' | 'pro' | 'team';
  accountId: string;
  userId: string;
  accountUserId?: string;
  accountStructure?: 'workspace' | 'personal';
  workspaceName?: string | null;
  subscriptionActiveUntil?: string;
  organizations?: Array<{
    id: string;
    title: string;
    role: string;
    is_default?: boolean;
  }>;
}

// 用量信息
export interface UsageInfo {
  status?:
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
  planType?: string;
  contextWindow?: {
    percentLeft: number;
    used: string;
    total: string;
  };
  fiveHourLimit?: {
    percentLeft: number;
    resetTime: string;
  };
  weeklyLimit?: {
    percentLeft: number;
    resetTime: string;
  };
  codeReviewLimit?: {
    percentLeft: number;
    resetTime: string;
  };
  lastUpdated?: string;
  sourceFile?: string;
}

// 内存中的账号数据，id 使用云端认证文件的 identityKey
export interface StoredAccount {
  id: string;
  alias: string;
  accountInfo: AccountInfo;
  usageInfo?: UsageInfo;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 个人云端保险柜配置，只保存本地偏好，不保存账号列表
export interface CloudVaultConfig {
  apiBaseUrl: string;
  vaultKey: string;
  activeIdentityKey: string | null;
  reloadIntervalMinutes: number;
  lastLoadedAt?: string;
}

// 应用配置
export interface AppConfig {
  autoRefreshInterval: number;
  codexPath: string;
  closeBehavior: 'ask' | 'exit' | 'tray';
  theme: 'dark' | 'light';
  hasInitialized: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
  autoRestartCodexOnSwitch: boolean;
  skipSwitchRestartConfirm: boolean;
  cloudVault: CloudVaultConfig;
}

// 本地配置文件结构；accounts 仅用于读取旧版本数据时兼容迁移，不再作为账号来源
export interface AccountsStore {
  version: string;
  accounts?: StoredAccount[];
  config: AppConfig;
}
