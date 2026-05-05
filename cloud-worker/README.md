# Codex 个人云端保险柜

这是 Codex Manager 的个人云端保险柜服务。它只面向单人自用，不包含用户表、注册体系或多租户逻辑。

## 本地开发

```bash
npm install
npm run typecheck
npm test
npx wrangler d1 migrations apply codex-auth-vault --local
npm run dev
```

## 部署

1. 创建 D1 数据库：

```bash
npx wrangler d1 create codex-auth-vault
```

2. 将返回的 `database_id` 写入 `wrangler.jsonc`。
3. 应用迁移并部署：

```bash
npx wrangler d1 migrations apply codex-auth-vault --remote
npm run deploy
```

首次在桌面端填写服务地址和保险柜密钥后，`GET /v1/meta` 会创建保险柜盐值和访问令牌哈希。之后同一个保险柜只接受相同密钥派生出的访问令牌。
