import type { AccountInfo, AppConfig, CloudVaultConfig, CodexAuthConfig, StoredAccount } from '../types';
import {
  buildFallbackAccountInfo,
  buildIdentityFromAuthConfig,
  buildIdentityKey,
  buildIdentityKeyFromAuthConfig,
  createMissingIdentityError,
  isIdentityInsufficient,
  mergeWorkspaceMetadata,
  type AccountWorkspaceMetadata,
} from './accountIdentity';
import { parseAccountInfo } from './jwt';

const VAULT_ALGORITHM = 'AES-GCM/PBKDF2-SHA-256/v1';
const ACCESS_TOKEN_PREFIX = 'codex-manager-vault-access:v1:';
const ENCRYPTION_KEY_PREFIX = 'codex-manager-vault-encryption:v1:';
const PBKDF2_ITERATIONS = 210_000;

type VaultMetaResponse = {
  status: 'ok';
  version: string;
  cryptoSalt: string;
};

type CloudAuthFile = {
  identityKey: string;
  encryptedAuthJson: string;
  iv: string;
  algorithm: string;
  accountId?: string | null;
  userId?: string | null;
  email?: string | null;
  planType?: AccountInfo['planType'] | null;
  alias?: string | null;
  accountUpdatedAt?: string | null;
  savedAt: string;
};

type CloudAuthFilesResponse = {
  files: CloudAuthFile[];
};

type SaveCloudAuthFilePayload = Omit<CloudAuthFile, 'identityKey' | 'savedAt'>;

type CloudRequestOptions = {
  method?: string;
  body?: unknown;
};

export type CloudVaultAuthFile = {
  identityKey: string;
  authConfig: CodexAuthConfig;
  alias?: string | null;
  savedAt: string;
};

function ensureVaultConfig(config: AppConfig): CloudVaultConfig {
  const cloudVault = config.cloudVault;
  if (!cloudVault?.apiBaseUrl?.trim() || !cloudVault?.vaultKey?.trim()) {
    throw new Error('请先在设置里配置云端保险柜地址和保险柜密钥');
  }
  return {
    ...cloudVault,
    apiBaseUrl: cloudVault.apiBaseUrl.trim().replace(/\/+$/, ''),
    vaultKey: cloudVault.vaultKey.trim(),
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function deriveAccessToken(vaultKey: string): Promise<string> {
  return digestText(`${ACCESS_TOKEN_PREFIX}${vaultKey}`);
}

async function deriveEncryptionKey(vaultKey: string, cryptoSalt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${ENCRYPTION_KEY_PREFIX}${vaultKey}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toArrayBuffer(base64UrlToBytes(cryptoSalt)),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function requestCloudVault<T>(
  cloudVault: CloudVaultConfig,
  path: string,
  options: CloudRequestOptions = {}
): Promise<T> {
  const token = await deriveAccessToken(cloudVault.vaultKey);
  const response = await fetch(`${cloudVault.apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = `云端保险柜请求失败：${response.status}`;
    try {
      const error = (await response.json()) as { message?: string };
      if (error.message) {
        message = error.message;
      }
    } catch {
      // 响应不是 JSON 时保留状态码，避免吞掉真实错误。
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function loadVaultMeta(config: AppConfig): Promise<VaultMetaResponse> {
  return requestCloudVault<VaultMetaResponse>(ensureVaultConfig(config), '/v1/meta');
}

async function encryptAuthConfig(
  authConfig: CodexAuthConfig,
  vaultKey: string,
  cryptoSalt: string
): Promise<{ encryptedAuthJson: string; iv: string; algorithm: string }> {
  const key = await deriveEncryptionKey(vaultKey, cryptoSalt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(authConfig))
  );

  return {
    encryptedAuthJson: bytesToBase64Url(new Uint8Array(encrypted)),
    iv: bytesToBase64Url(iv),
    algorithm: VAULT_ALGORITHM,
  };
}

async function decryptAuthConfig(
  file: CloudAuthFile,
  vaultKey: string,
  cryptoSalt: string
): Promise<CodexAuthConfig> {
  if (file.algorithm !== VAULT_ALGORITHM) {
    throw new Error(`不支持的云端认证文件加密算法：${file.algorithm}`);
  }

  const key = await deriveEncryptionKey(vaultKey, cryptoSalt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(file.iv)) },
    key,
    toArrayBuffer(base64UrlToBytes(file.encryptedAuthJson))
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as CodexAuthConfig;
}

function parseAccountInfoWithFallback(authConfig: CodexAuthConfig, allowMissingIdentity: boolean): AccountInfo {
  try {
    return parseAccountInfo(authConfig);
  } catch {
    const identity = buildIdentityFromAuthConfig(authConfig);
    if (!allowMissingIdentity || isIdentityInsufficient(identity)) {
      throw createMissingIdentityError();
    }
    return buildFallbackAccountInfo(identity);
  }
}

function buildStoredAccountFromAuthFile(
  file: CloudVaultAuthFile,
  config: AppConfig,
  metadata?: AccountWorkspaceMetadata | null
): StoredAccount {
  const baseInfo = parseAccountInfoWithFallback(file.authConfig, true);
  const accountInfo = mergeWorkspaceMetadata(baseInfo, metadata);
  const fallbackAlias = accountInfo.email.includes('@') ? accountInfo.email.split('@')[0] : file.identityKey;

  return {
    id: file.identityKey,
    alias: file.alias?.trim() || fallbackAlias,
    accountInfo,
    isActive: config.cloudVault.activeIdentityKey === file.identityKey,
    createdAt: file.savedAt,
    updatedAt: file.savedAt,
  };
}

async function loadCloudAuthFiles(config: AppConfig): Promise<CloudVaultAuthFile[]> {
  const cloudVault = ensureVaultConfig(config);
  const meta = await requestCloudVault<VaultMetaResponse>(cloudVault, '/v1/meta');
  const response = await requestCloudVault<CloudAuthFilesResponse>(cloudVault, '/v1/auth-files');

  return Promise.all(
    response.files.map(async (file) => ({
      identityKey: file.identityKey,
      authConfig: await decryptAuthConfig(file, cloudVault.vaultKey, meta.cryptoSalt),
      alias: file.alias,
      savedAt: file.savedAt,
    }))
  );
}

export async function loadCloudVaultAccounts(
  config: AppConfig,
  fetchMetadata: (identityKey: string, authConfig: CodexAuthConfig) => Promise<AccountWorkspaceMetadata | null>
): Promise<StoredAccount[]> {
  const files = await loadCloudAuthFiles(config);
  const accounts = await Promise.all(
    files.map(async (file) => {
      const metadata = await fetchMetadata(file.identityKey, file.authConfig);
      return buildStoredAccountFromAuthFile(file, config, metadata);
    })
  );

  return accounts.sort((a, b) => a.alias.localeCompare(b.alias, 'zh-CN'));
}

export async function loadCloudAuthConfig(identityKey: string, config: AppConfig): Promise<CodexAuthConfig> {
  const files = await loadCloudAuthFiles(config);
  const file = files.find((current) => current.identityKey === identityKey);
  if (!file) {
    throw new Error('云端保险柜中不存在目标认证文件');
  }
  return file.authConfig;
}

export async function saveAuthConfigToCloudVault(
  authConfig: CodexAuthConfig,
  alias: string | undefined,
  config: AppConfig,
  allowMissingIdentity: boolean
): Promise<string> {
  const accountInfo = parseAccountInfoWithFallback(authConfig, allowMissingIdentity);
  const identity = buildIdentityFromAuthConfig(authConfig);
  if (isIdentityInsufficient(identity) && !allowMissingIdentity) {
    throw createMissingIdentityError();
  }

  const identityKey = buildIdentityKey(identity);
  const cloudVault = ensureVaultConfig(config);
  const meta = await requestCloudVault<VaultMetaResponse>(cloudVault, '/v1/meta');
  const encrypted = await encryptAuthConfig(authConfig, cloudVault.vaultKey, meta.cryptoSalt);
  const payload: SaveCloudAuthFilePayload = {
    ...encrypted,
    accountId: identity.accountId,
    userId: identity.userId,
    email: identity.email,
    planType: accountInfo.planType,
    alias: alias?.trim() || null,
    accountUpdatedAt: authConfig.last_refresh || new Date().toISOString(),
  };

  await requestCloudVault(cloudVault, `/v1/auth-files/${encodeURIComponent(identityKey)}`, {
    method: 'PUT',
    body: payload,
  });

  return identityKey;
}

export async function deleteAuthConfigFromCloudVault(identityKey: string, config: AppConfig): Promise<void> {
  const cloudVault = ensureVaultConfig(config);
  await requestCloudVault(cloudVault, `/v1/auth-files/${encodeURIComponent(identityKey)}`, {
    method: 'DELETE',
  });
}

export async function findCloudIdentityKey(authConfig: CodexAuthConfig): Promise<string> {
  return buildIdentityKeyFromAuthConfig(authConfig);
}
