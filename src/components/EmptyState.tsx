import React from 'react';

interface EmptyStateProps {
  onAddAccount: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddAccount }) => {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4">
      <div className="w-20 h-20 rounded-2xl bg-white border border-[var(--dash-border)] flex items-center justify-center mb-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
        <svg className="w-10 h-10 text-[var(--dash-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-[var(--dash-text-primary)] mb-2">连接云端保险柜</h2>
      <p className="text-[var(--dash-text-secondary)] text-sm text-center max-w-md mb-6">
        先在设置中填写云端保险柜地址和密钥，然后保存当前登录或添加认证文件。
      </p>

      <button
        onClick={onAddAccount}
        className="h-10 px-5 bg-[var(--dash-accent)] hover:brightness-110 text-white rounded-full text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        快速登录并保存
      </button>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">实时加载</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">列表始终来自云端保险柜</p>
        </div>

        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">用量监控</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">按云端认证文件查询额度</p>
        </div>

        <div className="text-center p-5 rounded-2xl bg-white border border-[var(--dash-border)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--dash-text-primary)] text-sm mb-1">密文保管</h3>
          <p className="text-xs text-[var(--dash-text-secondary)]">完整 auth 仅以密文存放在云端</p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
