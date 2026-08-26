import { useState, useEffect } from 'react';
import {
  getSession,
  clearSession,
  getApiBase,
  getManifestVersion,
  apiConfig,
  setUnauthorizedHandler,
} from '../modules/api';
import type { AuthStatus } from '../modules/protocol';

type View =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'in_progress'; detail: string }
  | { kind: 'awaiting'; code: string; expiresAt: number }
  | { kind: 'authenticated'; org: string }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

export default definePopup(() => {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [apiInfo, setApiInfo] = useState<{ featureChatgptAssistedInsertion: boolean; extensionMinVersion: string } | null>(null);
  const [version] = useState(getManifestVersion());
  const [sessionExpiredFlag, setSessionExpiredFlag] = useState(false);

  async function refreshStatus(): Promise<void> {
    try {
      const resp = await browser.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      const status: AuthStatus | undefined = resp?.status;
      if (!status) {
        setView({ kind: 'idle' });
        return;
      }
      applyStatus(status);
    } catch {
      setView({ kind: 'idle' });
    }
  }

  function applyStatus(status: AuthStatus): void {
    switch (status.phase) {
      case 'idle':
        setView({ kind: 'idle' });
        break;
      case 'pending':
        setView({ kind: 'in_progress', detail: 'Iniciando login…' });
        break;
      case 'awaiting_authorization':
        setView({ kind: 'awaiting', code: status.code, expiresAt: status.expiresAt });
        break;
      case 'authenticated':
        setView({ kind: 'authenticated', org: status.session.organizationId });
        break;
      case 'expired':
        setView({ kind: 'expired' });
        break;
      case 'error':
        setView({ kind: 'error', message: status.message });
        break;
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpiredFlag(true);
      setView({ kind: 'expired' });
    });
    refreshStatus();
    apiConfig().then(setApiInfo).catch(() => setApiInfo(null));
    // Atualiza quando o background muda de estado.
    const listener = (msg: unknown) => {
      if (msg && typeof msg === 'object' && 'type' in msg) {
        if (msg.type === 'AUTH_STATE_CHANGED') void refreshStatus();
        if (msg.type === 'AUTH_STATUS' && 'status' in msg) applyStatus(msg.status as AuthStatus);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogin(): Promise<void> {
    setView({ kind: 'in_progress', detail: 'Aguardando autorização no site…' });
    try {
      const resp = await browser.runtime.sendMessage({
        type: 'START_AUTH',
        browser: navigator.userAgent,
        extensionVersion: version,
        extensionName: 'Mants Brand Orchestrator',
      });
      if (resp?.type === 'AUTH_STARTED') {
        setView({ kind: 'in_progress', detail: 'Autorize no site que foi aberto…' });
      } else if (resp?.type === 'AUTH_START_FAILED') {
        setView({ kind: 'error', message: resp.error });
      }
    } catch (e) {
      setView({ kind: 'error', message: e instanceof Error ? e.message : 'Falha ao iniciar login.' });
    }
  }

  async function onCancel(): Promise<void> {
    await browser.runtime.sendMessage({ type: 'CANCEL_FLOW' }).catch(() => undefined);
    setView({ kind: 'idle' });
  }

  async function onLogout(): Promise<void> {
    await browser.runtime.sendMessage({ type: 'LOGOUT' }).catch(() => undefined);
    await clearSession().catch(() => undefined);
    setView({ kind: 'idle' });
  }

  function openDashboard(): void {
    browser.tabs.create({ url: `${getApiBase()}/dashboard` });
  }

  function openSidePanel(): void {
    if (typeof browser.sidePanel?.open === 'function') {
      browser.sidePanel.open();
    } else {
      // Firefox/outros: fallback abrindo a página de instruções.
      browser.tabs.create({ url: `${getApiBase()}/extension/authorize` });
    }
  }

  // Verificação de versão mínima.
  const minVersion = apiInfo?.extensionMinVersion ?? '0.1.0';
  const meetsMin = compareVersion(version, minVersion) >= 0;

  return (
    <div style={{ width: 340, padding: 12, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants Brand Orchestrator</h1>
      <p style={{ fontSize: 11, color: '#666' }}>conta compatível do ChatGPT</p>
      <hr />
      <p style={{ fontSize: 12 }}>
        Status:{' '}
        {view.kind === 'loading' && 'verificando…'}
        {view.kind === 'idle' && 'Não autenticado'}
        {view.kind === 'in_progress' && view.detail}
        {view.kind === 'awaiting' && 'Aguardando autorização no site…'}
        {view.kind === 'authenticated' && 'Autenticado'}
        {view.kind === 'expired' && 'Sessão expirada'}
        {view.kind === 'error' && `Erro: ${view.message}`}
      </p>

      {view.kind === 'awaiting' && (
        <p style={{ fontSize: 11, color: '#666' }}>
          Abra a aba do site, clique em “Autorizar” e volte aqui. A extensão conclui o login sozinha.
        </p>
      )}

      {!meetsMin && (
        <p style={{ fontSize: 11, color: '#b00' }}>
          Atualize a extensão (mín. {minVersion}). A versão atual é {version}.
        </p>
      )}

      <p style={{ fontSize: 11, color: '#666' }}>
        API: {apiInfo ? (apiInfo.featureChatgptAssistedInsertion ? 'inserção ativa' : 'inserção desativada') : 'indisponível'}
      </p>
      <p style={{ fontSize: 11, color: '#666' }}>Versão: {version}</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {(view.kind === 'idle' || view.kind === 'expired' || view.kind === 'error') && (
          <button onClick={onLogin} style={{ flex: 1 }} disabled={!meetsMin}>
            Entrar
          </button>
        )}
        {view.kind === 'awaiting' && (
          <button onClick={onCancel} style={{ flex: 1 }}>
            Cancelar
          </button>
        )}
        {view.kind === 'authenticated' && (
          <button onClick={onLogout} style={{ flex: 1 }}>
            Sair (revoga sessão)
          </button>
        )}
        <button onClick={openDashboard} style={{ flex: 1 }}>
          Abrir dashboard
        </button>
        <button onClick={openSidePanel} style={{ flex: 1 }}>
          Painel lateral
        </button>
      </div>

      <p style={{ fontSize: 10, color: '#888', marginTop: 8 }}>
        Não solicitamos senha, cookie ou token do ChatGPT.
      </p>
    </div>
  );
});

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}
