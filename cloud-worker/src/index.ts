export interface Env {
  DB: D1Database;
}

type VaultMetaRow = {
  value: string;
};

type AuthFileRow = {
  identity_key: string;
  encrypted_auth_json: string;
  iv: string;
  algorithm: string;
  account_id: string | null;
  user_id: string | null;
  email: string | null;
  plan_type: string | null;
  alias: string | null;
  account_updated_at: string | null;
  saved_at: string;
};

type SaveAuthFileRequest = {
  encryptedAuthJson?: string;
  iv?: string;
  algorithm?: string;
  accountId?: string | null;
  userId?: string | null;
  email?: string | null;
  planType?: string | null;
  alias?: string | null;
  accountUpdatedAt?: string | null;
};

const META_VERSION_KEY = 'version';
const META_CRYPTO_SALT_KEY = 'crypto_salt';
const META_ACCESS_TOKEN_HASH_KEY = 'access_token_hash';
const VAULT_VERSION = '1.0.0';
const MAX_JSON_BODY_BYTES = 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ status: 'error', message }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function timingSafeEqualText(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    diff |= aBytes[index] ^ bBytes[index];
  }
  return diff === 0;
}

async function readMeta(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM vault_meta WHERE key = ?')
    .bind(key)
    .first<VaultMetaRow>();
  return row?.value ?? null;
}

async function writeMeta(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO vault_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(key, value)
    .run();
}

async function ensureVault(request: Request, env: Env): Promise<{ cryptoSalt: string } | Response> {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return errorResponse(401, '缺少保险柜密钥');
  }

  let cryptoSalt = await readMeta(env, META_CRYPTO_SALT_KEY);
  if (!cryptoSalt) {
    cryptoSalt = randomBase64Url(16);
    await writeMeta(env, META_CRYPTO_SALT_KEY, cryptoSalt);
    await writeMeta(env, META_VERSION_KEY, VAULT_VERSION);
  }

  const incomingHash = await sha256Base64Url(bearerToken);
  const storedHash = await readMeta(env, META_ACCESS_TOKEN_HASH_KEY);
  if (!storedHash) {
    await writeMeta(env, META_ACCESS_TOKEN_HASH_KEY, incomingHash);
    return { cryptoSalt };
  }

  if (!timingSafeEqualText(storedHash, incomingHash)) {
    return errorResponse(401, '保险柜密钥不正确');
  }

  return { cryptoSalt };
}

function mapAuthFileRow(row: AuthFileRow) {
  return {
    identityKey: row.identity_key,
    encryptedAuthJson: row.encrypted_auth_json,
    iv: row.iv,
    algorithm: row.algorithm,
    accountId: row.account_id,
    userId: row.user_id,
    email: row.email,
    planType: row.plan_type,
    alias: row.alias,
    accountUpdatedAt: row.account_updated_at,
    savedAt: row.saved_at,
  };
}

function validateNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少字段：${field}`);
  }
  return value.trim();
}

async function readJsonBody<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new Error('请求内容过大');
  }
  return request.json() as Promise<T>;
}

async function handleMeta(request: Request, env: Env): Promise<Response> {
  const vault = await ensureVault(request, env);
  if (vault instanceof Response) return vault;

  return jsonResponse({
    status: 'ok',
    version: (await readMeta(env, META_VERSION_KEY)) ?? VAULT_VERSION,
    cryptoSalt: vault.cryptoSalt,
  });
}

async function handleList(request: Request, env: Env): Promise<Response> {
  const vault = await ensureVault(request, env);
  if (vault instanceof Response) return vault;

  const result = await env.DB.prepare(
    `SELECT identity_key, encrypted_auth_json, iv, algorithm, account_id, user_id, email,
      plan_type, alias, account_updated_at, saved_at
     FROM auth_files
     ORDER BY saved_at DESC`
  ).all<AuthFileRow>();

  return jsonResponse({
    files: result.results.map(mapAuthFileRow),
  });
}

async function handleSave(request: Request, env: Env, identityKey: string): Promise<Response> {
  const vault = await ensureVault(request, env);
  if (vault instanceof Response) return vault;

  const payload = await readJsonBody<SaveAuthFileRequest>(request);
  const encryptedAuthJson = validateNonEmptyString(payload.encryptedAuthJson, 'encryptedAuthJson');
  const iv = validateNonEmptyString(payload.iv, 'iv');
  const algorithm = validateNonEmptyString(payload.algorithm, 'algorithm');
  const savedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO auth_files (
      identity_key, encrypted_auth_json, iv, algorithm, account_id, user_id, email,
      plan_type, alias, account_updated_at, saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_key) DO UPDATE SET
      encrypted_auth_json = excluded.encrypted_auth_json,
      iv = excluded.iv,
      algorithm = excluded.algorithm,
      account_id = excluded.account_id,
      user_id = excluded.user_id,
      email = excluded.email,
      plan_type = excluded.plan_type,
      alias = excluded.alias,
      account_updated_at = excluded.account_updated_at,
      saved_at = excluded.saved_at`
  )
    .bind(
      identityKey,
      encryptedAuthJson,
      iv,
      algorithm,
      payload.accountId ?? null,
      payload.userId ?? null,
      payload.email ?? null,
      payload.planType ?? null,
      payload.alias ?? null,
      payload.accountUpdatedAt ?? null,
      savedAt
    )
    .run();

  return jsonResponse({ status: 'ok', identityKey, savedAt });
}

async function handleDelete(request: Request, env: Env, identityKey: string): Promise<Response> {
  const vault = await ensureVault(request, env);
  if (vault instanceof Response) return vault;

  await env.DB.prepare('DELETE FROM auth_files WHERE identity_key = ?').bind(identityKey).run();
  return jsonResponse({ status: 'ok', identityKey });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);

  try {
    if (url.pathname === '/v1/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' });
    }

    if (url.pathname === '/v1/meta' && request.method === 'GET') {
      return handleMeta(request, env);
    }

    if (url.pathname === '/v1/auth-files' && request.method === 'GET') {
      return handleList(request, env);
    }

    const authFileMatch = url.pathname.match(/^\/v1\/auth-files\/(.+)$/);
    if (authFileMatch) {
      const identityKey = decodeURIComponent(authFileMatch[1]);
      if (!identityKey.trim()) {
        return errorResponse(400, '缺少认证文件身份键');
      }
      if (request.method === 'PUT') {
        return handleSave(request, env, identityKey);
      }
      if (request.method === 'DELETE') {
        return handleDelete(request, env, identityKey);
      }
    }

    return errorResponse(404, '接口不存在');
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : '请求处理失败');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
