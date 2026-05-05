import React, { useEffect, useState } from 'react';

interface HeaderProps {
  accountCount: number;
  activeName?: string;
  onAddAccount: () => void;
  onQuickLogin: () => void;
  onReadCurrentAccount: () => void;
  onReloadAccounts: () => void | Promise<void>;
  onRefreshAll: () => void | Promise<void>;
  onSyncCodexProxyEnv: () => void | Promise<void>;
  onToggleAutoRestartCodex: () => void | Promise<void>;
  onOpenSettings: () => void;
  onToggleProxy: () => void;
  isProxyEnabled: boolean;
  isAutoRestartCodexOnSwitch: boolean;
  isRefreshing: boolean;
  isRefreshingAll: boolean;
  isSyncingCodexProxyEnv: boolean;
  isLoading: boolean;
  children?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  accountCount,
  activeName,
  onAddAccount,
  onQuickLogin,
  onReadCurrentAccount,
  onReloadAccounts,
  onRefreshAll,
  onSyncCodexProxyEnv,
  onToggleAutoRestartCodex,
  onOpenSettings,
  onToggleProxy,
  isProxyEnabled,
  isAutoRestartCodexOnSwitch,
  isRefreshing,
  isRefreshingAll,
  isSyncingCodexProxyEnv,
  isLoading,
  children,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });

  const hour = currentTime.getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const displayName = activeName || '欢迎回来';

  const renderMenuIcon = (path: string, className = 'text-[var(--dash-text-secondary)]') => (
    <svg className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );

  const headerBody = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-text-muted)]">
          <span>{formatDate(currentTime)}</span>
          <span className="tabular-nums normal-case tracking-normal">{formatTime(currentTime)}</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold text-[var(--dash-text-primary)]">
          {greeting}，{displayName}
        </h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        <button
          onClick={onReloadAccounts}
          disabled={isLoading}
          className="h-10 px-3 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 bg-white/70 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm hidden md:inline">重新加载列表</span>
        </button>

        {accountCount > 0 && (
          <>
            <button
              onClick={onRefreshAll}
              disabled={isLoading || isRefreshing}
              className="h-10 px-3 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 bg-white/70 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm hidden md:inline">刷新用量</span>
            </button>

            <div
              className="relative"
              onMouseEnter={() => setIsToolsMenuOpen(true)}
              onMouseLeave={() => setIsToolsMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen((open) => !open)}
                disabled={isLoading || isSyncingCodexProxyEnv}
                aria-expanded={isToolsMenuOpen}
                className="h-10 px-4 rounded-full border border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 bg-white/70 transition-colors flex items-center gap-2 disabled:opacity-50"
                title="小工具"
              >
                <span className="text-sm">小工具</span>
                {renderMenuIcon('M19 9l-7 7-7-7', isToolsMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform')}
              </button>

              {isToolsMenuOpen && (
                <div className="absolute right-0 top-full pt-2 z-20">
                  <div className="w-80 rounded-2xl border border-[var(--dash-border)] bg-white/95 backdrop-blur shadow-[0_20px_50px_rgba(15,23,42,0.16)] p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        void onSyncCodexProxyEnv();
                      }}
                      disabled={isSyncingCodexProxyEnv}
                      className="w-full h-10 px-3 rounded-xl text-sm text-left text-[var(--dash-text-primary)] hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent flex items-center gap-2"
                    >
                      {renderMenuIcon('M4 7h16M4 12h16M4 17h10', 'text-blue-500')}
                      <span>{isSyncingCodexProxyEnv ? '正在写入代理配置...' : '写入 Codex 代理配置'}</span>
                    </button>

                    <div className="my-3 h-px bg-[var(--dash-border)]" />

                    <div className="flex items-center justify-between gap-3 px-1">
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--dash-text-primary)]">切换后自动重启 Codex</p>
                        <p className="text-xs text-[var(--dash-text-muted)] mt-1 leading-5">
                          切换认证文件后自动重启已运行的 Codex 进程
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void onToggleAutoRestartCodex();
                        }}
                        disabled={isLoading}
                        className={`relative h-8 w-14 flex-shrink-0 rounded-full transition-colors ${
                          isAutoRestartCodexOnSwitch ? 'bg-emerald-500' : 'bg-slate-200'
                        } disabled:opacity-50`}
                        aria-pressed={isAutoRestartCodexOnSwitch}
                        title={isAutoRestartCodexOnSwitch ? '已开启自动重启' : '已关闭自动重启'}
                      >
                        <span
                          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                            isAutoRestartCodexOnSwitch ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <button
          onClick={onToggleProxy}
          className={`h-10 px-3 rounded-full border transition-colors flex items-center gap-2 text-sm ${
            isProxyEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-[var(--dash-border)] bg-white/70 text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300'
          }`}
          title={isProxyEnabled ? '代理已开启' : '代理已关闭'}
        >
          {renderMenuIcon('M3 7h18M3 12h18M3 17h18')}
          <span>{isProxyEnabled ? '代理开启' : '代理关闭'}</span>
        </button>

        <div
          className="relative"
          onMouseEnter={() => setIsAddMenuOpen(true)}
          onMouseLeave={() => setIsAddMenuOpen(false)}
        >
          <div className="flex items-center">
            <button
              onClick={onQuickLogin}
              className="h-10 pl-4 pr-3 rounded-l-full bg-[var(--dash-accent)] text-white text-sm font-medium transition-colors hover:brightness-110 flex items-center gap-2"
            >
              {renderMenuIcon('M12 4v16m8-8H4', 'text-white')}
              快速登录
            </button>
            <button
              type="button"
              onClick={() => setIsAddMenuOpen((open) => !open)}
              className="h-10 w-10 rounded-r-full border-l border-white/20 bg-[var(--dash-accent)] text-white transition-colors hover:brightness-110 flex items-center justify-center"
              aria-label="展开添加认证文件菜单"
              aria-expanded={isAddMenuOpen}
            >
              <svg
                className={`w-4 h-4 transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {isAddMenuOpen && (
            <div className="absolute right-0 top-full pt-2 z-20">
              <div className="w-56 rounded-2xl border border-[var(--dash-border)] bg-white/95 backdrop-blur shadow-[0_20px_50px_rgba(15,23,42,0.16)] p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onAddAccount();
                  }}
                  disabled={isLoading}
                  className="w-full h-10 px-3 rounded-xl text-sm text-left text-[var(--dash-text-primary)] hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent flex items-center gap-2"
                >
                  {renderMenuIcon('M12 4v16m8-8H4', 'text-emerald-500')}
                  添加认证文件
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onReadCurrentAccount();
                  }}
                  disabled={isLoading}
                  className="w-full h-10 px-3 rounded-xl text-sm text-left text-[var(--dash-text-primary)] hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent flex items-center gap-2"
                >
                  {renderMenuIcon('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', 'text-blue-500')}
                  保存当前登录
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onOpenSettings}
          className="h-10 w-10 rounded-full border border-[var(--dash-border)] bg-white/70 text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 transition-colors flex items-center justify-center"
          title="设置"
        >
          {renderMenuIcon('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z')}
        </button>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="dash-card-soft px-6 py-5">
          {headerBody}
          {children && (
            <div className="mt-5 pt-5 border-t border-[var(--dash-border)]">
              {children}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
