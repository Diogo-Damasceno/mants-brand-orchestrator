import { useState, useEffect } from 'react';
import { getSession } from '../modules/storage';
import { getApiBase, registerPromptUsage, downloadPackageBlob, type Session } from '../modules/api';
import {
  extGet,
  extPost,
  extPatch,
  getPublicConfig,
  validateExtensionSession,
} from '../modules/extension-client';
import browser from 'webextension-polyfill';
import { filterBrandKitsByClient } from '../modules/sidepanel-filter';

interface Option {
  id: string;
  name: string;
  clientId?: string;
}
interface AssetOption extends Option {
  mimeType: string;
  originalName: string;
}
interface PromptResult {
  id: string;
  prompt: { originalText: string };
}

export default defineSidepanel(() => {
  const [status, setStatus] = useState('Carregando…');
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [assistedEnabled, setAssistedEnabled] = useState(false);

  const [clients, setClients] = useState<Option[]>([]);
  const [client, setClient] = useState('');
  const [brandKits, setBrandKits] = useState<Option[]>([]);
  const [brandKit, setBrandKit] = useState('');
  const [campaigns, setCampaigns] = useState<Option[]>([]);
  const [campaign, setCampaign] = useState('');
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [format, setFormat] = useState('post_instagram');
  const [mode, setMode] = useState<'essential' | 'professional' | 'strict_branding' | 'creative_exploration'>('professional');
  const [objective, setObjective] = useState('');
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [cta, setCta] = useState('');
  const [mandatory, setMandatory] = useState('');
  const [prohibited, setProhibited] = useState('');
  const [promptId, setPromptId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [edited, setEdited] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSession<Session>();
        if (!s) {
          setStatus('Não autenticado. Faça login na extensão.');
          return;
        }
        setSession(s);
        // Valida a sessão no backend (revogação/expiração/organização/membership).
        try {
          const v = await validateExtensionSession(s.token);
          if (!v.valid) {
            if (v.networkError) {
              // Indisponibilidade: mantém a sessão local; apenas informa.
              setStatus('API indisponível. Sessão mantida localmente.');
            } else {
              setStatus('Sessão inválida ou expirada. Faça login novamente.');
              return;
            }
          }
        } catch {
          setStatus('API indisponível. Sessão mantida localmente.');
        }
        // Configuração pública (sem token); verifica feature flag remota.
        const cfg = await getPublicConfig<{ featureChatgptAssistedInsertion: boolean; extensionMinVersion: string }>();
        setAssistedEnabled(cfg.featureChatgptAssistedInsertion);
        await loadClients(s.token);
        await loadBrandKits(s.token);
        setStatus('Pronto.');
      } catch (e) {
        setError(describeError(e));
        setStatus('Falha ao carregar.');
      }
    })();

  }, []);

  function describeError(e: unknown): string {
    if (e instanceof Error) {
      if (/401|sess[aã]o/i.test(e.message)) return 'Sessão expirada. Faça login novamente.';
      if (/failed to fetch|network|indispon/i.test(e.message)) return 'API indisponível. Verifique a conexão.';
      if (/403|negad/i.test(e.message)) return 'Acesso negado.';
      return e.message;
    }
    return 'Erro desconhecido.';
  }

  async function loadClients(t: string) {
    try {
      const d = await extGet<{ clients: Option[] }>('/api/clients', t);
      setClients(d.clients ?? []);
      if ((d.clients ?? []).length === 0) setStatus('Nenhum cliente disponível.');
    } catch (e) {
      setError(describeError(e));
    }
  }
  async function loadBrandKits(t: string, clientId?: string) {
    try {
      const d = await extGet<{ brandKits: Option[] }>('/api/brand-kits', t);
      const all = d.brandKits ?? [];
      // Filtra pelo cliente (isolamento por cliente). Confirma clientId real na resposta.
      setBrandKits(filterBrandKitsByClient(all, clientId));
    } catch (e) {
      setError(describeError(e));
    }
  }
  async function loadCampaigns(t: string, bk: string) {
    try {
      const d = await extGet<{ campaigns: Option[] }>(`/api/campaigns?brandKitId=${bk}`, t);
      setCampaigns(d.campaigns ?? []);
    } catch (e) {
      setError(describeError(e));
    }
  }
  async function loadAssets(t: string, bk: string) {
    try {
      const d = await extGet<{ assets: AssetOption[] }>(`/api/assets?brandKitId=${bk}`, t);
      setAssets(d.assets ?? []);
    } catch (e) {
      setError(describeError(e));
    }
  }

  function toggleAsset(id: string) {
    setSelectedAssets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onGenerate() {
    if (!session) return setStatus('Não autenticado.');
    if (!brandKit) return setStatus('Selecione um Brand Kit.');
    setStatus('Gerando…');
    try {
      const d = await extPost<PromptResult>(
        '/api/prompts/generate',
        session.token,
        {
          brandKitId: brandKit,
          campaignId: campaign || undefined,
          templateKind: format,
          promptMode: mode,
          objective,
          productOrService: product,
          audience,
          offer,
          cta,
          mandatoryContent: mandatory.split('\n').filter(Boolean),
          prohibitedContent: prohibited.split('\n').filter(Boolean),
          selectedAssetIds: selectedAssets,
          variations: 1,
        },
      );
      setPromptId(d.id);
      setPrompt(d.prompt.originalText);
      setEdited(d.prompt.originalText);
      setStatus('Prompt gerado (sem LLM).');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha ao gerar.');
    }
  }

  async function onSaveEdit() {
    if (!session || !promptId) return setStatus('Gere um prompt primeiro.');
    try {
      // Contrato real da API: PATCH /api/prompts/:id (validado por schema).
      await extPatch(`/api/prompts/${promptId}`, session.token, { promptId, editedText: edited });
      setStatus('Edição salva.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha ao salvar.');
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(edited || prompt);
      setStatus('Copiado.');
    } catch {
      setStatus('Falha ao copiar. Selecione e copie manualmente.');
    }
  }

  async function onInsert() {
    if (!assistedEnabled) {
      setStatus('Inserção assistida desativada. Use "Copiar prompt".');
      return;
    }
    // O side panel NÃO está no DOM do ChatGPT: encaminha ao background, que
    // localiza a aba ativa e manda ao content script (INSERT_TEXT).
    const r = await browser.runtime.sendMessage({ type: 'INSERT_TEXT', text: edited || prompt });
    const res = r as { ok: boolean; reason?: string } | undefined;
    if (res?.ok) setStatus('Inserido no ChatGPT.');
    else setStatus(`Falha: ${res?.reason ?? 'desconhecido'}. Use "Copiar prompt".`);
  }

  async function onDownload() {
    if (!session || !promptId || !brandKit) return setStatus('Gere um prompt e selecione o Brand Kit.');
    setStatus('Gerando pacote…');
    try {
      const d = await extPost<{ id: string }>('/api/packages', session.token, {
        brandKitId: brandKit,
        campaignId: campaign || undefined,
        promptId,
        assetIds: selectedAssets,
      });
      // Download autenticado via fetch + Blob (Bearer enviado, sem token na URL).
      const blob = await downloadPackageBlob(d.id, session.token);
      const blobUrl = URL.createObjectURL(blob);
      const filename = `mants-pacote-${d.id.slice(0, 8)}.zip`;
      // Tenta a API de downloads (melhor UX); fallback para <a download>.
      let usedDownloads = false;
      if (browser?.downloads?.download) {
        try {
          await browser.downloads.download({ url: blobUrl, filename, saveAs: true });
          usedDownloads = true;
        } catch {
          usedDownloads = false;
        }
      }
      if (!usedDownloads) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Aguarda o início do download antes de revogar a URL.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      } else {
        // Com downloads.download, a URL é consumida internamente; revoga após um tempo.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
      }
      setStatus('Pacote gerado e baixado.');
    } catch (e) {
      setStatus(describeError(e));
    }
  }

  function onOpenChat() {
    browser.tabs.create({ url: 'https://chatgpt.com/' });
  }

  async function onRegisterUsed() {
    if (!session || !promptId) return setStatus('Gere um prompt primeiro.');
    try {
      await registerPromptUsage(promptId, session.token);
      setStatus('Uso registrado.');
    } catch (e) {
      // Não afirma "Uso registrado" quando falha.
      setStatus(e instanceof Error ? e.message : 'Falha ao registrar uso.');
    }
  }

  function onImportResult() {
    // Rota real existente no site (apps/web/src/app/resultados/importar/page.tsx).
    browser.tabs.create({ url: `${getApiBase()}/resultados/importar` });
  }

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui', fontSize: 12, maxWidth: 360 }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants — Painel lateral</h1>
      <p style={{ color: '#666' }}>Org: {session?.organizationId || '—'}</p>

      <label>Cliente
        <select value={client} onChange={(e) => {
          const v = e.target.value;
          setClient(v);
          // Limpa cascata ao trocar de cliente (isolamento por cliente).
          setBrandKit('');
          setCampaign('');
          setAssets([]);
          setSelectedAssets([]);
          setPrompt('');
          setEdited('');
          setPromptId('');
          if (session) void loadBrandKits(session.token, v);
        }} style={{ width: '100%' }}>
          <option value="">— selecione —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Brand Kit
        <select value={brandKit} onChange={(e) => { setBrandKit(e.target.value); if (e.target.value) { void loadCampaigns(session!.token, e.target.value); void loadAssets(session!.token, e.target.value); } }} style={{ width: '100%' }}>
          <option value="">— selecione —</option>
          {brandKits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>Campanha
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ width: '100%' }}>
          <option value="">— nova —</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <label>Formato
        <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: '100%' }}>
          <option value="post_instagram">Post Instagram</option>
          <option value="story">Story</option>
          <option value="carousel">Carrossel</option>
          <option value="banner">Banner</option>
          <option value="ad">Anúncio</option>
          <option value="promo_campaign">Campanha promocional</option>
          <option value="launch">Lançamento</option>
          <option value="institutional">Institucional</option>
          <option value="holiday">Data comemorativa</option>
          <option value="caption">Legenda</option>
          <option value="copy">Copy</option>
          <option value="visual_direction">Direção visual</option>
          <option value="artwork_variation">Variação de arte</option>
        </select>
      </label>
      <label>Modo
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} style={{ width: '100%' }}>
          <option value="essential">Essencial</option>
          <option value="professional">Profissional</option>
          <option value="strict_branding">Branding estrito</option>
          <option value="creative_exploration">Exploração criativa</option>
        </select>
      </label>

      <label>Objetivo<textarea value={objective} onChange={(e) => setObjective(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Produto/serviço<textarea value={product} onChange={(e) => setProduct(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Público<input value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Oferta<input value={offer} onChange={(e) => setOffer(e.target.value)} style={{ width: '100%' }} /></label>
      <label>CTA<input value={cta} onChange={(e) => setCta(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Conteúdo obrigatório (um por linha)<textarea value={mandatory} onChange={(e) => setMandatory(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Conteúdo proibido (um por linha)<textarea value={prohibited} onChange={(e) => setProhibited(e.target.value)} style={{ width: '100%' }} /></label>

      <p style={{ fontWeight: 600 }}>Ativos recomendados</p>
      <div style={{ maxHeight: 120, overflow: 'auto', border: '1px solid #ddd', padding: 4 }}>
        {assets.length === 0 && <span style={{ color: '#888' }}>Nenhum ativo para este Brand Kit.</span>}
        {assets.map((a) => (
          <label key={a.id} style={{ display: 'block' }}>
            <input type="checkbox" checked={selectedAssets.includes(a.id)} onChange={() => toggleAsset(a.id)} /> {a.originalName}
          </label>
        ))}
      </div>

      <button onClick={onGenerate} style={{ marginTop: 8, width: '100%' }}>Gerar prompt</button>
      <label>Pré-visualização / Edição
        <textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={8} style={{ width: '100%' }} readOnly={!prompt} />
      </label>
      <button onClick={onSaveEdit} style={{ width: '100%' }}>Salvar edição</button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <button onClick={onCopy}>Copiar prompt</button>
        <button onClick={onInsert}>Inserir (exp.)</button>
        <button onClick={onDownload}>Baixar pacote</button>
        <button onClick={onOpenChat}>Abrir ChatGPT</button>
        <button onClick={onRegisterUsed}>Registrar uso</button>
        <button onClick={onImportResult}>Importar resultado</button>
      </div>
      <p style={{ color: '#444', marginTop: 8 }}>{status}</p>
      {error && <p style={{ color: '#b00', marginTop: 8 }}>{error}</p>}
      <p style={{ fontSize: 10, color: '#888' }}>
        A inserção assistida é experimental e controlada por flag remota. Sempre funciona copiar, baixar e abrir.
      </p>
    </div>
  );
});
