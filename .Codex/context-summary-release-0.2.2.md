## 项目上下文摘要（0.2.2 自动发布说明）
生成时间：2026-05-07 19:05:00

### 1. 相似实现分析
- **实现1**: `.github/workflows/release.yml`
  - 模式：推送 `v*` 标签触发 Tauri 多平台构建与 GitHub Release 发布。
  - 可复用：继续使用 `tauri-apps/tauri-action@v0`、`tagName: v__VERSION__` 和矩阵构建。
  - 需注意：应用版本必须与 tag 对齐，否则 `v__VERSION__` 会指向错误版本。

- **实现2**: `package.json` / `package-lock.json`
  - 模式：前端包版本保持一致。
  - 可复用：根包版本同步作为 npm 构建显示与锁文件来源。
  - 需注意：只改 `package.json` 会留下锁文件版本漂移。

- **实现3**: `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`
  - 模式：Tauri 安装包版本、Rust 根包版本和锁文件根包版本同步。
  - 可复用：沿用 0.2.0、0.2.1 的发版元数据同步方式。
  - 需注意：GitHub Release tag 与 Tauri app version 必须同为 `0.2.2`。

### 2. 项目约定
- **命名约定**: Git tag 使用 `v0.2.2`，Release 标题使用 `Codex Manager v0.2.2`。
- **文件组织**: GitHub Actions 配置保留在 `.github/workflows/`，Release Notes 分类配置放在 `.github/release.yml`。
- **导入顺序**: 本次发布配置不新增代码依赖；保留既有导入组织。
- **代码风格**: YAML 保持两空格缩进；版本展示继续使用简短文本。

### 3. 可复用组件清单
- `.github/workflows/release.yml`: 现有发布入口。
- `.github/release.yml`: GitHub 自动 Release Notes 分类配置。
- `package.json` / `package-lock.json`: 前端版本来源。
- `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`: 桌面端版本来源。

### 4. 测试策略
- **测试框架**: ESLint、TypeScript/Vite、Cargo。
- **测试模式**: 静态检查、生产构建、Rust 锁文件检查。
- **参考文件**: `.github/workflows/ci.yml`。
- **覆盖要求**: 发布配置语法、前端构建、Rust 后端检查均需通过。

### 5. 依赖和集成点
- **外部依赖**: GitHub Releases API、`tauri-apps/tauri-action@v0`。
- **内部依赖**: 版本号同步覆盖前端、Tauri 配置、Rust 包和 UI 展示。
- **集成方式**: 推送 `v0.2.2` 标签触发 Release workflow。
- **配置来源**: `.github/release.yml` 控制自动发布说明分类。

### 6. 技术选型理由
- **为什么用这个方案**: 避免每次发版修改 workflow 中的硬编码正文，让 GitHub 基于 PR 与提交元数据生成说明。
- **优势**: 发布配置稳定，Release 内容跟随历史变更自动生成。
- **劣势和风险**: 如果提交没有经过 PR 或缺少 label，自动说明会更偏向提交和 compare 链接，分类精度会下降。

### 7. 关键风险点
- **并发问题**: tag 必须指向已经包含 0.2.2 版本号和发布配置的提交。
- **边界条件**: 远端已存在 `v0.2.2` 时不能重复创建同名 tag。
- **性能瓶颈**: 本次改动不引入运行时性能影响。
- **安全考虑**: 本次不变更认证、鉴权或密钥处理。
