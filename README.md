# Codex Auth Manager (Codex Manager)

一个用于保管和切换多个 OpenAI Codex 认证文件的 Windows 桌面应用。当前版本采用“个人云端保险柜”模式：认证文件保存在 Cloudflare Workers + D1，桌面端启动、重新加载列表、切换账号和刷新用量时都按需从云端读取。

## 功能特点

- **个人云端保险柜**：新增 `cloud-worker/`，使用 Cloudflare Workers + D1 保管认证文件，不包含用户表、注册流程或多租户账号归属表。
- **云端作为唯一列表来源**：桌面端不再维护本地账号数组，`accounts.json` 只保存本地偏好、云端地址、保险柜密钥、当前 `identityKey`、代理等配置。
- **客户端加密保存**：认证文件在桌面端加密后写入 D1，云端保存密文、初始化盐值、访问令牌哈希和账号展示元数据。
- **查重覆盖**：身份键优先使用 `accountId + userId`，其次使用 `accountId + email`，再使用 `userId` 或 `email`；同一个 `identityKey` 再次保存会覆盖云端旧记录。
- **保存当前登录**：可读取 `%USERPROFILE%\.codex\auth.json` 并保存到云端保险柜。
- **添加认证文件**：可粘贴 auth JSON 或选择本地 auth 文件，解析后直接保存到云端并重新加载列表。
- **快速登录保存**：可拉起 Codex 登录流程，检测到新的 auth 配置后保存到云端保险柜。
- **重新加载列表**：顶部提供“重新加载列表”，设置中可配置自动重新加载间隔；重新加载只更新认证文件列表，不会清空当前会话中已经显示的模型用量。
- **切换认证文件**：切换时从云端读取对应 auth，写入 `%USERPROFILE%\.codex\auth.json`，并更新当前选中的 `identityKey`。
- **用量刷新**：用量请求从云端读取 auth 后调用现有 Tauri/wham 逻辑；新数据只覆盖对应账号，不会把其他认证文件的用量置空。
- **代理配置**：代理开关默认关闭，可在设置中配置代理地址，并可写入 Codex 环境文件。
- **托盘与重启辅助**：支持最小化到托盘、托盘切换入口，以及切换后按配置重启 Codex。

## 技术栈

- **桌面前端**：React + TypeScript + TailwindCSS
- **桌面后端**：Tauri 2 + Rust
- **状态管理**：Zustand
- **云端服务**：Cloudflare Workers + D1
- **云端测试**：Vitest + Wrangler

## 项目结构

```text
codex-auth-manager/
├── cloud-worker/           # Cloudflare Workers + D1 个人保险柜服务
├── src/                    # React 前端源码
├── src-tauri/              # Tauri 后端源码
├── public/                 # 静态资源
├── package.json            # 桌面端前端脚本
└── README.md
```

## 环境要求

### Windows 桌面端

1. Node.js v18 或更高版本
2. Rust 和 Cargo
3. Tauri 依赖
   - WebView2
   - Visual Studio Build Tools，勾选 “Desktop development with C++”
   - Windows 10/11 SDK

### Cloudflare 云端

1. Cloudflare 账号
2. Node.js v18 或更高版本
3. Wrangler，由 `cloud-worker/package.json` 的开发依赖提供

## Cloudflare 保险柜部署

进入 Worker 目录：

```bash
cd cloud-worker
npm install
```

登录 Cloudflare：

```bash
npx wrangler login
```

创建 D1 数据库：

```bash
npx wrangler d1 create codex-auth-vault
```

命令会返回 `database_id`。把它写入 `cloud-worker/wrangler.jsonc`：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "codex-auth-vault",
      "database_id": "这里替换为创建命令返回的 database_id",
      "migrations_dir": "migrations"
    }
  ]
}
```

部署前先执行本地检查：

```bash
npm run typecheck
npm test
npm run check
```

应用远端 D1 migration：

```bash
npx wrangler d1 migrations apply codex-auth-vault --remote
```

部署 Worker：

```bash
npm run deploy
```

部署完成后，Wrangler 会输出 Worker 地址，例如：

```text
https://codex-auth-vault.<你的 workers 子域>.workers.dev
```

在桌面端打开“设置”里的“云端保险柜”，填写：

- **服务地址**：部署后的 Worker 地址
- **保险柜密钥**：你自己保管的一段密钥，多台机器使用同一密钥才能读取同一个保险柜
- **重新加载列表间隔**：0 表示禁用定时重新加载，启用后只更新认证文件列表，不清空用量显示

首次点击“测试连接”或首次保存认证文件时，`GET /v1/meta` 会初始化保险柜盐值和访问令牌哈希。之后同一个 D1 保险柜只接受同一保险柜密钥派生出的访问令牌。

## 云端本地开发

```bash
cd cloud-worker
npm install
npx wrangler d1 migrations apply codex-auth-vault --local
npm run dev
```

本地开发服务默认地址通常为：

```text
http://127.0.0.1:8787
```

可以把这个地址填入桌面端“云端保险柜”的服务地址，用于本地联调。

## 云端 API

所有保险柜接口由桌面端自动调用，路径如下：

- `GET /v1/health`：健康检查
- `GET /v1/meta`：返回服务状态、保险柜版本和加密盐值
- `GET /v1/auth-files`：读取云端认证文件列表
- `PUT /v1/auth-files/:identityKey`：保存或覆盖一个认证文件
- `DELETE /v1/auth-files/:identityKey`：删除一个云端认证文件

D1 只包含两张表：

- `vault_meta(key, value)`：保存保险柜版本、加密盐值、访问令牌哈希等全局元数据
- `auth_files(identity_key, encrypted_auth_json, iv, algorithm, account_id, user_id, email, plan_type, alias, account_updated_at, saved_at)`：保存加密后的认证文件和展示元数据

## 桌面端开发

安装依赖：

```bash
npm install
```

启动 Tauri 开发模式：

```bash
npm run tauri dev
```

构建安装包：

```bash
npm run tauri build
```

也可以使用等价脚本：

```bash
npm run tauri:dev
npm run tauri:build
```

## 使用说明

### 1. 配置云端保险柜

打开“设置”，在“云端保险柜”中填写服务地址和保险柜密钥，并点击“测试连接”。云端未配置时，桌面端不会显示账号列表。

### 2. 保存认证文件

可以选择以下入口：

- **保存当前登录**：读取当前 `%USERPROFILE%\.codex\auth.json`，保存到云端保险柜
- **添加认证文件**：粘贴 auth JSON 或选择 auth 文件，保存到云端保险柜
- **快速登录**：启动 Codex 登录流程，完成授权后保存新的 auth 配置

保存完成后会重新加载云端列表。同一个身份键会覆盖云端旧记录，不提供冲突解决界面。

### 3. 切换认证文件

点击账号卡片上的“切换”：

1. 从云端读取该账号的认证文件
2. 写入 `%USERPROFILE%\.codex\auth.json`
3. 更新本地当前选中的 `identityKey`
4. 按设置决定是否重启 Codex

### 4. 重新加载列表

顶部“重新加载列表”会重新读取云端认证文件列表。设置里的“重新加载列表间隔”可控制是否定时执行。重新加载不会清除当前会话中已经显示的模型用量。

### 5. 刷新用量

- 刷新单个账号：点击账号卡片上的刷新按钮
- 刷新全部账号：点击顶部“刷新用量”

用量数据来自 `https://chatgpt.com/backend-api/wham/usage`。每次刷新会从云端读取对应 auth 后查询 wham 接口，结果只覆盖目标账号。

## 本地配置与数据说明

- **本地应用配置**：`%LOCALAPPDATA%\codex-manager\accounts.json`
  - 只保存配置和偏好，不再保存账号数组作为权威来源
  - 包含云端地址、保险柜密钥、当前 `identityKey`、代理、Codex 路径等
- **当前 Codex 配置**：`%USERPROFILE%\.codex\auth.json`
  - 切换认证文件时写入
- **云端认证文件**：Cloudflare D1 的 `auth_files`
  - 保存客户端加密后的 auth JSON 密文
- **模型用量**：当前桌面会话内显示
  - 重新加载列表会保留已有显示
  - 重启应用后需要重新刷新用量

## 验证命令

桌面端：

```bash
npm run lint
npm run build
cargo fmt --all
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

云端 Worker：

```bash
cd cloud-worker
npm run typecheck
npm test
npm run check
npx wrangler d1 migrations apply codex-auth-vault --local
```

远端部署前：

```bash
cd cloud-worker
npx wrangler d1 migrations apply codex-auth-vault --remote
npm run deploy
```

## 已知限制

- 云端保险柜是个人自用模型，不包含用户注册、多租户隔离或账号归属管理。
- 多台机器同时保存同一个 `identityKey` 时，以后写入云端的版本为准。
- 用量查询依赖 wham 接口、账号 token 和网络环境，token 失效或无 Codex 访问权限时会显示错误或暂无用量。
- 保险柜密钥如果遗失，现有云端密文无法在桌面端解密。

## 参考资料

- [Cloudflare Wrangler 命令文档](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Cloudflare Workers 部署命令](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Cloudflare D1 入门](https://developers.cloudflare.com/d1/get-started/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## License

当前仓库未附带 LICENSE。若需要开源许可，请补充对应 LICENSE 文件。
