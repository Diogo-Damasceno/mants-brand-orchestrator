import { useState } from 'react';
import { getSession, clearSession } from '../modules/storage';
import { apiConfig, revokeSession } from '../modules/api';

export default definePopup(() => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [apiInfo, setApiInfo] = useState<{ featureChatgptAssistedInsertion: boolean; extensionMinVersion: string } | null>(null);
  const [version] = useState('0.1.0');

  useState(() => {
    getSession().then((s) => setAuthed(!!s));
    apiConfig().then(setApiInfo).catch(() => setApiInfo(null));
  });

  async function onLogout() {
    const s = await getSession<{ token: string }>();
    if (s?.token) await revokeSession(s.token).catch(() => {});
    await clearSession();
    setAuthed(false);
  }

  return (
    <div style={{ width: 320, padding: 12, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants Brand Orchestrator</h1>
      <p style={{ fontSize: 11, color: '#666' }}>conta compatível do ChatGPT</p>
      <hr />
      <p style={{ fontSize: 12 }}>Status: {authed === null ? 'verificando…' : authed ? 'Autenticado' : 'Não autenticado'}</p>
      <p style={{ fontSize: 11, color: '#666' }}>
        API: {apiInfo ? (apiInfo.featureChatgptAssistedInsertion ? 'inserção ativa' : 'inserção desativada') : 'indisponível'}
      </p>
      <p style={{ fontSize: 11, color: '#666' }}>Versão: {version}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => browser.tabs.create({ url: 'http://localhost:3000/login' })} style={{ flex: 1 }}>
          Abrir dashboard
        </button>
        <button onClick={() => browser.sidePanel.open()} style={{ flex: 1 }}>
          Painel lateral
        </button>
      </div>
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
