## 项目上下文摘要（个人云端保险柜）
生成时间：2026-05-05 16:36:58

### 1. 相似实现分析
- **实现1**: `src/utils/storage.ts`
  - 模式：本地账号读写、身份查重、切换账号写入 `.codex/auth.json`。
  - 可复用：认证文件解析、当前 Codex auth 读取、切换账号流程。
  - 调整：账号来源改为云端保险柜，本地配置只保存偏好。

- **实现2**: `src/stores/useAccountStore.ts`
  - 模式：Zustand 负责账号列表、当前账号、配置和错误状态。
  - 可复用：`loadAccounts`、`addAccount`、`switchToAccount`、`removeAccount` 的 UI 调用契约。
  - 调整：列表加载从云端实时生成，usage 信息仅保存在内存状态。

- **实现3**: `src-tauri/src/lib.rs`
  - 模式：Tauri command 负责系统文件、Codex 登录、wham API 访问。
  - 可复用：`fetch_wham_account_metadata`、`get_codex_wham_usage` 的网络与代理处理。
  - 调整：新增从 auth 内容直接查询 metadata/usage 的命令，避免读取本地 per-account auth 文件。

- **实现4**: `src/components/Header.tsx` 与 `src/components/SettingsModal.tsx`
  - 模式：头部操作入口和设置弹窗统一承接用户操作。
  - 可复用：小工具浮层、设置保存、代理与 Codex 路径配置。
  - 调整：加入“云端保险柜”配置、连接测试、“重新加载列表”“保存当前登录”“添加认证文件”。

### 2. 项目约定
- **命名约定**: 前端使用 camelCase；React props 使用 `onXxx` / `isXxx`；Rust 使用 snake_case；Worker API 使用 camelCase JSON。
- **文件组织**: 前端组件在 `src/components`，状态在 `src/stores`，工具在 `src/utils`，Tauri 命令集中在 `src-tauri/src/lib.rs`，云端服务独立在 `cloud-worker`。
- **导入顺序**: 第三方依赖优先，本地类型与工具随后。
- **代码风格**: React 函数组件 + hooks；Tauri command 返回 `Result<_, String>`；Worker 使用显式 JSON 响应和 D1 binding。

### 3. 可复用组件清单
- `src/utils/accountIdentity.ts`: 统一身份提取、身份键生成、缺失身份错误、workspace 元数据合并。
- `src/utils/cloudVault.ts`: 个人保险柜客户端、访问令牌派生、AES-GCM 加解密、云端 CRUD。
- `src/utils/storage.ts`: 本地配置读写、云端列表加载、保存当前认证、切换认证文件。
- `cloud-worker/src/index.ts`: 单人保险柜 Worker，提供 meta、列表、保存、删除接口。

### 4. 测试策略
- **前端验证**: `npm run lint`、`npm run build`。
- **Rust 验证**: `cargo fmt --all`、`cargo test --manifest-path src-tauri/Cargo.toml --lib`、`cargo check --manifest-path src-tauri/Cargo.toml --locked`。
- **Worker 验证**: `npm run typecheck`、`npm test`、`npx wrangler d1 migrations apply codex-auth-vault --local`。
- **覆盖重点**: 身份键覆盖、云端保存覆盖、列表实时加载、删除后列表为空、从 auth 内容查询 wham 数据。

### 5. 依赖和集成点
- **外部依赖**: Cloudflare Workers、D1、Wrangler、Web Crypto、Tauri、reqwest。
- **内部依赖**: `App` 调用 store；store 调用 `storage.ts`；`storage.ts` 调用 `cloudVault.ts` 与 Tauri command；Worker 通过 D1 binding 保存密文。
- **配置来源**: 本地 `accounts.json` 仅保存 `config.cloudVault`、代理、Codex 路径、当前 identityKey 等偏好。
- **云端来源**: `GET /v1/auth-files` 是账号列表唯一来源。

### 6. 技术选型理由
- **为什么用这个方案**: 用户明确要求个人使用、无用户表、云端作为唯一认证文件来源。
- **优势**: 多机器共享同一保险柜；不再出现本地/云端双源合并冲突；同 identityKey 直接覆盖。
- **风险**: 初次配置云端地址和密钥前列表为空；托盘菜单仍依赖旧本地缓存，主界面已成为云端权威入口。

### 7. 关键风险点
- **并发问题**: 多机器同时保存同一 identityKey 时后写入覆盖先写入。
- **边界条件**: 云端未配置、保险柜密钥错误、D1 未迁移、auth 缺少身份字段。
- **性能瓶颈**: 列表加载会解密所有认证文件并按需请求 workspace metadata，账号过多时可后续增加惰性 metadata 刷新。
- **安全考虑**: 云端只保存密文；访问令牌和加密密钥分别派生；服务端只保存访问令牌哈希。
