import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (authJson: string, alias?: string) => Promise<void>;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [authJson, setAuthJson] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'paste' | 'file'>('paste');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json'],
        }],
      });

      if (selected) {
        const content = await invoke<string>('read_file_content', {
          filePath: selected,
        });
        setAuthJson(content);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取文件');
    }
  };

  const handleSubmitImport = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const parsed = JSON.parse(authJson);
      const hasValidTokens =
        parsed.tokens &&
        typeof parsed.tokens.id_token === 'string' &&
        parsed.tokens.id_token.trim() &&
        typeof parsed.tokens.access_token === 'string' &&
        parsed.tokens.access_token.trim() &&
        typeof parsed.tokens.refresh_token === 'string' &&
        parsed.tokens.refresh_token.trim() &&
        typeof parsed.tokens.account_id === 'string' &&
        parsed.tokens.account_id.trim();

      if (!hasValidTokens) {
        throw new Error('无效的 auth.json 格式：缺少完整的 tokens 字段');
      }

      await onAdd(authJson, alias || undefined);

      setAuthJson('');
      setAlias('');
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('JSON 格式无效，请检查输入');
      } else {
        setError(err instanceof Error ? err.message : '保存认证文件失败');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">添加认证文件</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
            认证文件别名（可选）
          </label>
          <input
            type="text"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="例如：工作账号、个人账号"
            className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
          />
        </div>

        <div className="flex gap-1 mb-4 p-1 bg-slate-100 rounded-full">
          <button
            type="button"
            onClick={() => setImportMode('paste')}
            className={`flex-1 py-1.5 px-3 rounded-full text-sm transition-colors ${
              importMode === 'paste'
                ? 'bg-white text-[var(--dash-text-primary)] shadow-sm'
                : 'text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)]'
            }`}
          >
            粘贴 JSON
          </button>
          <button
            type="button"
            onClick={() => setImportMode('file')}
            className={`flex-1 py-1.5 px-3 rounded-full text-sm transition-colors ${
              importMode === 'file'
                ? 'bg-white text-[var(--dash-text-primary)] shadow-sm'
                : 'text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)]'
            }`}
          >
            选择文件
          </button>
        </div>

        {importMode === 'paste' ? (
          <div className="mb-4">
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
              auth.json 内容
            </label>
            <textarea
              value={authJson}
              onChange={(event) => setAuthJson(event.target.value)}
              placeholder="粘贴 .codex/auth.json 文件内容"
              rows={6}
              className="w-full px-3 py-2 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors font-mono resize-none"
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
              选择 auth.json 文件
            </label>
            <button
              type="button"
              onClick={handleSelectFile}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              选择文件
            </button>

            {authJson && (
              <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-[var(--dash-border)]">
                <p className="text-xs text-[var(--dash-text-muted)] mb-1">已加载文件内容</p>
                <pre className="text-xs text-[var(--dash-text-secondary)] overflow-auto max-h-24 font-mono">
                  {authJson.substring(0, 200)}...
                </pre>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmitImport}
            disabled={!authJson || isLoading}
            className="flex-1 h-10 bg-[var(--dash-accent)] hover:brightness-110 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isLoading ? '保存中...' : '保存到云端'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddAccountModal;
