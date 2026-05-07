import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../types';
import { loadVaultMeta } from '../utils/cloudVault';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onClose: () => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
}

type SettingsDraft = {
  autoRefreshInterval: number;
  codexPath: string;
  closeBehavior: AppConfig['closeBehavior'];
  proxyEnabled: boolean;
  proxyUrl: string;
  cloudApiBaseUrl: string;
  cloudVaultKey: string;
  cloudReloadIntervalMinutes: number;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function buildNextConfig(config: AppConfig, draft: SettingsDraft): Partial<AppConfig> {
  const normalizedAutoRefreshInterval =
    draft.autoRefreshInterval <= 0 ? 0 : Math.max(1, Math.round(draft.autoRefreshInterval));
  const normalizedCloudReloadInterval =
    draft.cloudReloadIntervalMinutes <= 0 ? 0 : Math.max(1, Math.round(draft.cloudReloadIntervalMinutes));

  return {
    autoRefreshInterval: normalizedAutoRefreshInterval,
    codexPath: draft.codexPath,
    closeBehavior: draft.closeBehavior,
    proxyEnabled: draft.proxyEnabled,
    proxyUrl: draft.proxyUrl,
    cloudVault: {
      ...config.cloudVault,
      apiBaseUrl: draft.cloudApiBaseUrl.trim(),
      vaultKey: draft.cloudVaultKey.trim(),
      reloadIntervalMinutes: normalizedCloudReloadInterval,
    },
  };
}

function serializeConfig(config: Partial<AppConfig>): string {
  return JSON.stringify(config);
}

function SettingsModalContent({ config, onClose, onSave }: Omit<SettingsModalProps, 'isOpen'>) {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(config.autoRefreshInterval);
  const [codexPath, setCodexPath] = useState(config.codexPath);
  const [closeBehavior, setCloseBehavior] = useState(config.closeBehavior);
  const [proxyEnabled, setProxyEnabled] = useState(config.proxyEnabled);
  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl);
  const [cloudApiBaseUrl, setCloudApiBaseUrl] = useState(config.cloudVault.apiBaseUrl);
  const [cloudVaultKey, setCloudVaultKey] = useState(config.cloudVault.vaultKey);
  const [cloudReloadIntervalMinutes, setCloudReloadIntervalMinutes] = useState(
    config.cloudVault.reloadIntervalMinutes
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const latestConfigRef = useRef(config);
  const hasMountedRef = useRef(false);
  const lastSavedSignatureRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestIdRef = useRef(0);

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  const buildCurrentConfig = useCallback(() =>
    buildNextConfig(latestConfigRef.current, {
      autoRefreshInterval,
      codexPath,
      closeBehavior,
      proxyEnabled,
      proxyUrl,
      cloudApiBaseUrl,
      cloudVaultKey,
      cloudReloadIntervalMinutes,
    }), [
      autoRefreshInterval,
      codexPath,
      closeBehavior,
      proxyEnabled,
      proxyUrl,
      cloudApiBaseUrl,
      cloudVaultKey,
      cloudReloadIntervalMinutes,
    ]);

  const saveDraft = useCallback(async (
    nextConfig: Partial<AppConfig>,
    signature: string
  ): Promise<boolean> => {
    if (signature === lastSavedSignatureRef.current) {
      return true;
    }

    const requestId = ++saveRequestIdRef.current;
    setSaveStatus('saving');
    setCloudMessage(null);
    try {
      await onSave(nextConfig);
      if (requestId === saveRequestIdRef.current) {
        lastSavedSignatureRef.current = signature;
        setSaveStatus('saved');
      }
      return true;
    } catch (error) {
      if (requestId === saveRequestIdRef.current) {
        setSaveStatus('error');
        setCloudMessage(error instanceof Error ? error.message : '保存设置失败');
      }
      return false;
    }
  }, [onSave]);

  const flushAndClose = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const nextConfig = buildCurrentConfig();
    const signature = serializeConfig(nextConfig);
    const saved = await saveDraft(nextConfig, signature);
    if (saved) {
      onClose();
    }
  }, [buildCurrentConfig, onClose, saveDraft]);

  useEffect(() => {
    const nextConfig = buildCurrentConfig();
    const signature = serializeConfig(nextConfig);

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastSavedSignatureRef.current = signature;
      return undefined;
    }

    if (signature === lastSavedSignatureRef.current) {
      return undefined;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveDraft(nextConfig, signature);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    buildCurrentConfig,
    saveDraft,
  ]);

  const handleTestCloudVault = async () => {
    setIsTestingCloud(true);
    setCloudMessage(null);
    try {
      await loadVaultMeta({
        ...latestConfigRef.current,
        ...buildCurrentConfig(),
        cloudVault: {
          ...latestConfigRef.current.cloudVault,
          apiBaseUrl: cloudApiBaseUrl.trim(),
          vaultKey: cloudVaultKey.trim(),
        },
      });
      setCloudMessage('云端保险柜连接正常');
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : '云端保险柜连接失败');
    } finally {
      setIsTestingCloud(false);
    }
  };

  const saveStatusText = {
    idle: '',
    saving: '保存中...',
    saved: '已保存',
    error: '保存失败',
  }[saveStatus];

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 animate-fade-in"
      onClick={() => {
        void flushAndClose();
      }}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-xl mx-4 border border-[var(--dash-border)] shadow-[0_24px_60px_rgba(15,23,42,0.2)] max-h-[90vh] overflow-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">设置</h2>
          <div className="flex items-center gap-3">
            {saveStatusText && (
              <span
                className={`text-xs ${
                  saveStatus === 'error' ? 'text-red-500' : 'text-[var(--dash-text-muted)]'
                }`}
              >
                {saveStatusText}
              </span>
            )}
            <button
              onClick={() => {
                void flushAndClose();
              }}
              className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-slate-100 rounded-full transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-[var(--dash-text-secondary)] text-xs font-medium">云端保险柜</h3>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                服务地址
              </label>
              <input
                type="url"
                value={cloudApiBaseUrl}
                onChange={(event) => setCloudApiBaseUrl(event.target.value)}
                placeholder="https://codex-auth-vault.example.workers.dev"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                保险柜密钥
              </label>
              <input
                type="password"
                value={cloudVaultKey}
                onChange={(event) => setCloudVaultKey(event.target.value)}
                placeholder="用于访问云端并解密认证文件"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--dash-text-muted)] leading-5">
                认证文件只以密文保存在云端；列表、切换和新增都会实时访问保险柜。
              </p>
              <button
                type="button"
                onClick={handleTestCloudVault}
                disabled={isTestingCloud || !cloudApiBaseUrl.trim() || !cloudVaultKey.trim()}
                className="h-9 px-4 rounded-full border border-[var(--dash-border)] text-sm text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 disabled:opacity-50 whitespace-nowrap"
              >
                {isTestingCloud ? '测试中...' : '测试连接'}
              </button>
            </div>
            {cloudMessage && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[var(--dash-text-secondary)]">
                {cloudMessage}
              </div>
            )}
            <div className="pt-3">
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
                重新加载列表间隔
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={cloudReloadIntervalMinutes}
                  onChange={(event) => setCloudReloadIntervalMinutes(Number(event.target.value))}
                  className="flex-1 h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-[var(--dash-text-primary)] text-sm w-16 text-right tabular-nums">
                  {cloudReloadIntervalMinutes === 0 ? '禁用' : `${cloudReloadIntervalMinutes} 分钟`}
                </span>
              </div>
              <p className="text-xs text-[var(--dash-text-muted)] mt-2">
                只更新云端认证文件列表，不会清除已显示的模型用量。
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
              自动刷新用量间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={autoRefreshInterval}
                onChange={(event) => setAutoRefreshInterval(Number(event.target.value))}
                className="flex-1 h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[var(--dash-text-primary)] text-sm w-16 text-right tabular-nums">
                {autoRefreshInterval === 0 ? '禁用' : `${autoRefreshInterval} 分钟`}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                Codex CLI 路径
              </label>
              <input
                type="text"
                value={codexPath}
                onChange={(event) => setCodexPath(event.target.value)}
                placeholder="codex"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
                点击关闭按钮时
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'ask', label: '每次询问' },
                  { value: 'tray', label: '最小化托盘' },
                  { value: 'exit', label: '直接退出' },
                ].map((option) => {
                  const selected = closeBehavior === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCloseBehavior(option.value as AppConfig['closeBehavior'])}
                      className={`h-10 rounded-xl border text-sm transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-[var(--dash-border)] bg-white text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--dash-text-primary)]">启用代理</p>
                <p className="text-xs text-[var(--dash-text-muted)] mt-1">
                  用于访问 chatgpt.com/wham/usage
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProxyEnabled(!proxyEnabled)}
                className={`relative h-8 w-14 rounded-full transition-colors ${
                  proxyEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-6 w-6 bg-white rounded-full shadow transition-transform ${
                    proxyEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                代理地址
              </label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(event) => setProxyUrl(event.target.value)}
                placeholder="http://127.0.0.1:7890"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-blue-400 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-[var(--dash-text-secondary)] text-xs font-medium mb-2">关于</h3>
            <div className="space-y-1 text-sm text-[var(--dash-text-secondary)]">
              <p>Codex Manager v0.2.2</p>
              <p className="text-xs text-[var(--dash-text-muted)]">
                个人云端保险柜模式：云端保管认证文件，本机按需加载。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <SettingsModalContent
      config={config}
      onClose={onClose}
      onSave={onSave}
    />
  );
};

export default SettingsModal;
