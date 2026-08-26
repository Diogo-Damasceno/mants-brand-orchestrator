import { useState, useEffect } from 'react';
import { getApiBase, startAuth, exchangeCode, revokeSession, type Session } from '../modules/api';
import { generateDeviceId, saveSession, getSession, clearSession } from '../modules/storage';
import { generateCodeVerifier, deriveCodeChallenge, generateState, generateNonce, sha256Hex } from '../modules/pkce';

interface FlowTemp {
  code: string;
  codeVerifier: string;
  state: string;
  nonce: string;
  deviceId: string;
  origin: string;
}

const FLOW_KEY = 'mants_flow_temp';

async function saveFlowTemp(f: FlowTemp): Promise<void> {
  await browser.storage.local.set({ [FLOW_KEY]: f });
}
async function getFlowTemp(): Promise<FlowTemp | null> {
  const r = await browser.storage.local.get(FLOW_KEY);
  return (r[FLOW_KEY] as FlowTemp) ?? null;
}
async function clearFlowTemp(): Promise<void> {
  await browser.storage.local.remove(FLOW_KEY);
}

export default definePopup(() => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [expired, setExpired] = useState(false);

  async function validateSession(s: Session | null): Promise<boolean> {
    if (!s) return false;
    if (Date.now() > (s.expiresAt ?? 0)) return false;
    try {
      const res = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    (async () => {
      const s = await getSession<Session>();
      if (await validateSession(s)) {
        setSession(s);
        setAuthed(true);
      } else {
        await clearSession();
        setAuthed(false);
      }
    })();
  }, []);

  async function onLogin() {
    setLoading(true);
    setError('');
    setExpired(false);
    try {
      const manifest = browser.runtime.getManifest();
      const extensionVersion = manifest.version ?? '0.1.0';
      const deviceId = await generateDeviceId();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await deriveCodeChallenge(codeVerifier);
      const state = generateState();
      const nonce = generateNonce();
      const stateHash = await sha256Hex(state);
      const nonceHash = await sha256Hex(nonce);
      const origin = getApiBase();

      const { code } = await startAuth({
        codeChallenge,
        deviceId,
        origin,
        stateHash,
        nonceHash,
        browser: browser.runtime.getURL('').includes('moz-extension') ? 'Firefox' : 'Chrome',
        extensionVersion,
        extensionName: 'Mants Brand Orchestrator',
      });

      await saveFlowTemp({ code, codeVerifier, state, nonce, deviceId, origin });
      await browser.tabs.create({ url: `${getApiBase()}/extension/authorize?code=${encodeURIComponent(code)}` });
      setLoading(false);
      // O exchange é concluído após a autorização (via side panel ou polling).
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar login.');
      setLoading(false);
    }
  }

  // Chamado pelo side panel/background após a autorização ser concluída.
  async function completeExchange(flowCode: string) {
    const flow = await getFlowTemp();
    if (!flow || flow.code !== flowCode) throw new Error('Fluxo inconsistente.');
    setLoading(true);
    try {
      const s = await exchangeCode(flow.code, flow.codeVerifier, flow.deviceId, flow.origin, flow.state, flow.nonce);
      await clearFlowTemp();
      await saveSession(s);
      setSession(s);
      setAuthed(true);
      setExpired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na troca de código.');
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    const s = await getSession<Session>();
    if (s?.token) await revokeSession(s.token).catch(() => {});
    await clearSession();
    await clearFlowTemp();
    setSession(null);
    setAuthed(false);
  }

  return (
    <div style={{ width: 320, padding: 12, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants Brand Orchestrator</h1>
      <p style={{ fontSize: 11, color: '#666' }}>conta compatível do ChatGPT</p>
      <hr />
      {authed === null && <p style={{ fontSize: 12 }}>verificando…</p>}
      {authed && session && (
        <div style={{ fontSize: 12 }}>
          <p>Autenticado.</p>
          <p>Organização: {session.organizationId}</p>
          <p>Papel: {session.roles.join(', ')}</p>
          <p>Expira em: {new Date(session.expiresAt).toLocaleTimeString()}</p>
        </div>
      )}
      {expired && <p style={{ fontSize: 12, color: '#b00' }}>Sessão expirada. Faça login novamente.</p>}
      {error && <p style={{ fontSize: 12, color: '#b00' }}>{error}</p>}
      {!authed && authed !== null && (
        <button onClick={onLogin} disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Autenticando…' : 'Entrar na Mants'}
        </button>
      )}
      {authed && (
        <button onClick={onLogout} style={{ marginTop: 8, width: '100%' }}>
          Sair (revoga sessão)
        </button>
      )}
      <p style={{ fontSize: 10, color: '#888', marginTop: 8 }}>
        Não solicitamos senha, cookie ou token do ChatGPT.
      </p>
    </div>
  );
});
