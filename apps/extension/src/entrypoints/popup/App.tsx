import { useState, useEffect } from 'react';
import { getSession, clearSession } from '../../modules/storage';
import { getApiBase, type Session } from '../../modules/api';
import {
  startAuthFlow,
  cancelFlow,
  logout,
  getAuthStatus,
  getPublicConfig,
  validateExtensionSession,
} from '../../modules/extension-client';
import type { AuthStatus } from '../../modules/messages';

const FALLBACK_MIN_VERSION = '0.1.0';

/** Compara versões semânticas simples (x.y.z). Retorna <0, 0, >0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export default function PopupApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>({ phase: 'idle', code: null, error: null });
  const [error, setError] = useState('');
  const [manifestVersion, setManifestVersion] = useState('0.1.0');
  const [minVersion, setMinVersion] = useState(FALLBACK_MIN_VERSION);
  const [versionOk, setVersionOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  // Lê versão real do manifesto e verifica a versão mínima aceita pela API
  // (rota pública, sem token).
  useEffect(() => {
    const manifest = browser.runtime.getManifest();
    const v = manifest.version ?? '0.1.0';
    setManifestVersion(v);
    void getPublicConfig<{ extensionMinVersion: string }>()
      .then((cfg) => {
        const min = cfg.extensionMinVersion || FALLBACK_MIN_VERSION;
        setMinVersion(min);
        setVersionOk(compareVersions(v, min) >= 0);
      })
      .catch(() => setVersionOk(true)); // não bloqueia offline
  }, []);

  // Sessão persistida + estado de autenticação do background + validação no backend.
  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const s = await getSession<Session>();
    setSession(s);
    if (s?.token) {
      // 1) Expiração local (rápida, sem rede).
      const locallyExpired = typeof s.expiresAt === 'number' && Date.now() > s.expiresAt;
      if (locallyExpired) {
        await clearSession();
        setSession(null);
        setExpired(true);
        broadcastExpired();
        const st = await getAuthStatus();
        applyStatus(st);
        return;
      }
      // 2) Validação REAL no backend (assinatura, expiração, revogação, org, membership).
      try {
        const v = await validateExtensionSession(s.token);
        if (!v.valid) {
          if (v.networkError) {
            // Falha de rede temporária: NÃO apaga a sessão. Mantém o usuário logado
            // off-line; o popup tentará revalidar na próxima abertura.
            setError('API indisponível. Sessão mantida localmente.');
            const st = await getAuthStatus();
            applyStatus(st);
            return;
          }
          // Sessão inválida/expirada/revogada: limpa e oferece novo login.
          await clearSession();
          setSession(null);
          setExpired(true);
          broadcastExpired();
          return;
        }
        // 3) Atualiza estado de validade com dados do servidor.
        setSession((prev) => (prev ? { ...prev, expiresAt: v.expiresAt ?? prev.expiresAt } : prev));
      } catch {
        setError('API indisponível. Sessão mantida localmente.');
      }
    }
    const st = await getAuthStatus();
    applyStatus(st);
  }

  function broadcastExpired() {
    void browser.runtime
      .sendMessage({ type: 'AUTH_STATE_CHANGED', status: { phase: 'expired', code: null, error: 'Sessão expirada.' } })
      .catch(() => undefined);
  }

  function applyStatus(st: AuthStatus) {
    setStatus(st);
    if (st.phase === 'authenticated') {
      setExpired(false);
      setError('');
      void refreshSession();
    } else if (st.phase === 'expired' || st.phase === 'error') {
      setExpired(st.phase === 'expired');
      if (st.error) setError(st.error);
    } else if (st.phase === 'awaiting_user' || st.phase === 'authorizing' || st.phase === 'exchanging') {
      setError('');
      setExpired(false);
      setBusy(true);
    } else {
      setBusy(false);
    }
  }

  async function refreshSession() {
    const s = await getSession<Session>();
    setSession(s);
    setBusy(false);
  }

  // Recebe mudanças de estado do background (broadcast).
  useEffect(() => {
    const listener = (msg: unknown) => {
      const m = msg as { type?: string; status?: AuthStatus; session?: unknown };
      if (m?.type === 'AUTH_STATE_CHANGED' && m.status) applyStatus(m.status);
      if (m?.type === 'SESSION_CHANGED') {
        setSession((m.session as Session) ?? null);
        if (!m.session) setExpired(true);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  async function onLogin() {
    setBusy(true);
    setError('');
    setExpired(false);
    const r = await startAuthFlow();
    if (!r.ok) {
      setError(r.error ?? 'Falha ao iniciar login.');
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    await cancelFlow();
    const st = await getAuthStatus();
    applyStatus(st);
    setBusy(false);
  }

  async function onLogout() {
    setBusy(true);
    const r = await logout();
    setSession(null);
    setExpired(false);
    setBusy(false);
    if (!r.ok) {
      // Não afirma "revogado" se a revogação remota falhou. Informa o usuário
      // para que ele possa revogar manualmente no dashboard.
      setError(r.error ?? 'Falha ao revogar a sessão no servidor.');
    }
  }

  async function onRetry() {
    await clearLocalStatus();
    await onLogin();
  }

  async function clearLocalStatus() {
    const st = await getAuthStatus();
    setStatus(st);
  }

  const isAuthed = status.phase === 'authenticated' && session;
  const inProgress =
    status.phase === 'authorizing' ||
    status.phase === 'awaiting_user' ||
    status.phase === 'exchanging' ||
    busy;

  function openDashboard() {
    browser.tabs.create({ url: `${getApiBase()}/dashboard` });
  }

  async function openSidePanelCompat() {
    try {
      // Chromium: abre o side panel da janela atual.
      const w = await browser.windows.getCurrent();
      // Acessibilidade: usar role/label determinístico no botão em vez de texto solto.
      if (browser.sidePanel?.open && w.id != null) {
        await browser.sidePanel.open({ windowId: w.id });
        return;
      }
    } catch {
      /* Firefox não tem browser.sidePanel */
    }
    // Fallback Firefox: abre o painel lateral como página.
    browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
  }

  return (
    <div style={{ width: 320, padding: 12, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants Brand Orchestrator</h1>
      <p style={{ fontSize: 11, color: '#666' }}>conta compatível do ChatGPT</p>
      <p style={{ fontSize: 10, color: '#888' }}>versão {manifestVersion}</p>
      <hr />

      {!versionOk && (
        <p style={{ fontSize: 12, color: '#b00' }}>
          Extensão desatualizada. Atualize para continuar. (mín {minVersion})
        </p>
      )}

      {expired && <p style={{ fontSize: 12, color: '#b00' }}>Sessão expirada. Faça login novamente.</p>}
      {error && status.phase !== 'expired' && <p style={{ fontSize: 12, color: '#b00' }}>{error}</p>}

      {!isAuthed && !inProgress && status.phase === 'idle' && (
        <button data-testid="popup-login" onClick={onLogin} style={{ width: '100%', marginTop: 8 }}>
          Entrar na Mants
        </button>
      )}

      {status.phase === 'awaiting_user' && (
        <div style={{ fontSize: 12 }}>
          <p>Autorização iniciada.</p>
          <p>Abra a aba do Mants e autorize o dispositivo, depois retorne aqui.</p>
          <p style={{ color: '#666' }}>A conclusão ocorre automaticamente.</p>
          <button data-testid="popup-cancel" onClick={onCancel} style={{ marginTop: 8, width: '100%' }}>
            Cancelar fluxo
          </button>
        </div>
      )}

      {status.phase === 'authorizing' && <p style={{ fontSize: 12 }}>Iniciando login…</p>}
      {status.phase === 'exchanging' && <p style={{ fontSize: 12 }}>Confirmando autorização…</p>}

      {status.phase === 'error' && !expired && (
        <>
          <p style={{ fontSize: 12, color: '#b00' }}>{status.error}</p>
          <button data-testid="popup-retry" onClick={onRetry} style={{ marginTop: 8, width: '100%' }}>
            Tentar novamente
          </button>
        </>
      )}

      {isAuthed && session && (
        <div style={{ fontSize: 12 }}>
          <p>Autenticado.</p>
          <p>Organização: {session.organizationId}</p>
          <p>Papel: {session.roles.join(', ')}</p>
          <p>Expira em: {new Date(session.expiresAt).toLocaleTimeString()}</p>
          <button data-testid="popup-dashboard" onClick={openDashboard} style={{ marginTop: 8, width: '100%' }}>
            Abrir dashboard
          </button>
          <button data-testid="popup-open-sidepanel" onClick={openSidePanelCompat} style={{ marginTop: 6, width: '100%' }}>
            Abrir painel lateral
          </button>
          <button data-testid="popup-logout" onClick={onLogout} style={{ marginTop: 6, width: '100%' }}>
            Sair (revoga sessão)
          </button>
        </div>
      )}

      <p style={{ fontSize: 10, color: '#888', marginTop: 8 }}>
        Não solicitamos senha, cookie ou token do ChatGPT.
      </p>
    </div>
  );
}
