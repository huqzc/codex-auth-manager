import { describe, expect, it } from 'vitest';
import { handleRequest, type Env } from '../src/index';

type AuthRow = {
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

class MemoryStatement {
  private params: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly meta: Map<string, string>,
    private readonly authFiles: Map<string, AuthRow>
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM vault_meta')) {
      const key = String(this.params[0]);
      const value = this.meta.get(key);
      return (value ? { value } : null) as T | null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM auth_files')) {
      return {
        results: Array.from(this.authFiles.values()).sort((a, b) =>
          b.saved_at.localeCompare(a.saved_at)
        ) as T[],
      };
    }
    return { results: [] };
  }

  async run(): Promise<void> {
    if (this.sql.includes('INSERT INTO vault_meta')) {
      this.meta.set(String(this.params[0]), String(this.params[1]));
      return;
    }

    if (this.sql.includes('INSERT INTO auth_files')) {
      const row: AuthRow = {
        identity_key: String(this.params[0]),
        encrypted_auth_json: String(this.params[1]),
        iv: String(this.params[2]),
        algorithm: String(this.params[3]),
        account_id: (this.params[4] as string | null) ?? null,
        user_id: (this.params[5] as string | null) ?? null,
        email: (this.params[6] as string | null) ?? null,
        plan_type: (this.params[7] as string | null) ?? null,
        alias: (this.params[8] as string | null) ?? null,
        account_updated_at: (this.params[9] as string | null) ?? null,
        saved_at: String(this.params[10]),
      };
      this.authFiles.set(row.identity_key, row);
      return;
    }

    if (this.sql.includes('DELETE FROM auth_files')) {
      this.authFiles.delete(String(this.params[0]));
    }
  }
}

function createEnv(): Env {
  const meta = new Map<string, string>();
  const authFiles = new Map<string, AuthRow>();
  return {
    DB: {
      prepare(sql: string) {
        return new MemoryStatement(sql, meta, authFiles);
      },
    } as unknown as D1Database,
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://vault.test${path}`, {
    ...init,
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

describe('个人云端保险柜 Worker', () => {
  it('首次访问会初始化保险柜，错误密钥会被拒绝', async () => {
    const env = createEnv();

    const first = await handleRequest(request('/v1/meta'), env);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { cryptoSalt?: string };
    expect(firstBody.cryptoSalt).toBeTruthy();

    const second = await handleRequest(
      new Request('https://vault.test/v1/meta', {
        headers: { Authorization: 'Bearer other-token' },
      }),
      env
    );
    expect(second.status).toBe(401);
  });

  it('同一个身份键会覆盖旧认证文件', async () => {
    const env = createEnv();
    await handleRequest(request('/v1/meta'), env);

    const payload = {
      encryptedAuthJson: 'cipher-1',
      iv: 'iv-1',
      algorithm: 'AES-GCM/PBKDF2-SHA-256/v1',
      email: 'user@example.com',
      alias: '旧别名',
    };

    const saved = await handleRequest(
      request('/v1/auth-files/email%3Auser%40example.com', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(saved.status).toBe(200);

    await handleRequest(
      request('/v1/auth-files/email%3Auser%40example.com', {
        method: 'PUT',
        body: JSON.stringify({ ...payload, encryptedAuthJson: 'cipher-2', alias: '新别名' }),
      }),
      env
    );

    const listed = await handleRequest(request('/v1/auth-files'), env);
    const body = await listed.json() as { files: Array<{ encryptedAuthJson: string; alias: string }> };
    expect(body.files).toHaveLength(1);
    expect(body.files[0].encryptedAuthJson).toBe('cipher-2');
    expect(body.files[0].alias).toBe('新别名');
  });

  it('删除认证文件后列表为空', async () => {
    const env = createEnv();
    await handleRequest(request('/v1/meta'), env);
    await handleRequest(
      request('/v1/auth-files/user%3A123', {
        method: 'PUT',
        body: JSON.stringify({
          encryptedAuthJson: 'cipher',
          iv: 'iv',
          algorithm: 'AES-GCM/PBKDF2-SHA-256/v1',
        }),
      }),
      env
    );

    const removed = await handleRequest(
      request('/v1/auth-files/user%3A123', { method: 'DELETE' }),
      env
    );
    expect(removed.status).toBe(200);

    const listed = await handleRequest(request('/v1/auth-files'), env);
    const body = await listed.json() as { files: unknown[] };
    expect(body.files).toHaveLength(0);
  });
});
