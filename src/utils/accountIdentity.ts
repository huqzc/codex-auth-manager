import type { AccountInfo, CodexAuthConfig } from '../types';
import { parseAccountInfo } from './jwt';

export type AccountIdentity = {
  accountId: string | null;
  userId: string | null;
  email: string | null;
};

export type AccountWorkspaceMetadata = {
  workspaceName?: string | null;
  accountUserId?: string | null;
  accountStructure?: AccountInfo['accountStructure'];
  planType?: AccountInfo['planType'] | null;
};

export const MISSING_IDENTITY_ERROR = 'missing_account_identity';

export function normalizePlanType(value: string | null | undefined): AccountInfo['planType'] | null {
  switch (value) {
    case 'free':
    case 'plus':
    case 'pro':
    case 'team':
      return value;
    default:
      return null;
  }
}

export function normalizeId(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEmail(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'unknown') return null;
  if (!trimmed.includes('@')) return null;
  return trimmed.toLowerCase();
}

export function buildIdentityFromAccountInfo(accountInfo: AccountInfo): AccountIdentity {
  return {
    accountId: normalizeId(accountInfo.accountId),
    userId: normalizeId(accountInfo.userId),
    email: normalizeEmail(accountInfo.email),
  };
}

export function buildIdentityFromAuthConfig(authConfig: CodexAuthConfig): AccountIdentity {
  let accountInfo: AccountInfo | null = null;
  try {
    accountInfo = parseAccountInfo(authConfig);
  } catch (error) {
    console.log('解析认证文件身份信息失败:', error);
  }

  return {
    accountId: normalizeId(accountInfo?.accountId ?? authConfig.tokens?.account_id),
    userId: normalizeId(accountInfo?.userId),
    email: normalizeEmail(accountInfo?.email),
  };
}

export function isEmptyIdentity(identity: AccountIdentity): boolean {
  return !identity.accountId && !identity.userId && !identity.email;
}

export function isIdentityInsufficient(identity: AccountIdentity): boolean {
  return !identity.userId && !identity.email;
}

export function createMissingIdentityError(): Error {
  const error = new Error(MISSING_IDENTITY_ERROR);
  error.name = 'MissingAccountIdentity';
  return error;
}

export function isMissingIdentityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === MISSING_IDENTITY_ERROR || error.name === 'MissingAccountIdentity';
}

export function buildFallbackAccountInfo(identity: AccountIdentity): AccountInfo {
  return {
    email: identity.email ?? 'Unknown',
    planType: 'free',
    accountId: identity.accountId ?? '',
    userId: identity.userId ?? '',
    accountUserId: undefined,
    accountStructure: undefined,
    workspaceName: undefined,
    subscriptionActiveUntil: undefined,
    organizations: [],
  };
}

export function buildIdentityKey(identity: AccountIdentity): string {
  if (identity.accountId && identity.userId) {
    return `account:${identity.accountId}:user:${identity.userId}`;
  }
  if (identity.accountId && identity.email) {
    return `account:${identity.accountId}:email:${identity.email}`;
  }
  if (identity.userId) {
    return `user:${identity.userId}`;
  }
  if (identity.email) {
    return `email:${identity.email}`;
  }
  throw createMissingIdentityError();
}

export function buildIdentityKeyFromAccountInfo(accountInfo: AccountInfo): string {
  return buildIdentityKey(buildIdentityFromAccountInfo(accountInfo));
}

export function buildIdentityKeyFromAuthConfig(authConfig: CodexAuthConfig): string {
  return buildIdentityKey(buildIdentityFromAuthConfig(authConfig));
}

export function mergeWorkspaceMetadata(
  accountInfo: AccountInfo,
  metadata: AccountWorkspaceMetadata | null | undefined
): AccountInfo {
  if (!metadata) return accountInfo;

  const currentPlanType = normalizePlanType(accountInfo.planType) ?? 'free';
  const metadataPlanType = normalizePlanType(metadata.planType);
  const accountStructure = metadata.accountStructure ?? accountInfo.accountStructure;

  let mergedPlanType = currentPlanType;
  if (metadataPlanType) {
    if (accountStructure === 'workspace') {
      mergedPlanType = metadataPlanType;
    } else if (currentPlanType === 'free' && metadataPlanType !== 'free') {
      mergedPlanType = metadataPlanType;
    }
  }

  return {
    ...accountInfo,
    accountUserId: metadata.accountUserId ?? accountInfo.accountUserId,
    accountStructure,
    workspaceName: metadata.workspaceName ?? accountInfo.workspaceName,
    planType: mergedPlanType,
  };
}
