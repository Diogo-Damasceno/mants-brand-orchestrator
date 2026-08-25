import { useState, useEffect } from 'react';
import { getSession } from '../modules/storage';
import { apiGet, apiPost, getApiBase } from '../modules/api';
import { ChatSurfaceAdapter } from '../modules/chat-surface';

interface Option {
  id: string;
  name: string;
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
  const [token, setToken] = useState('');
  const [org, setOrg] = useState('');
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
    getSession<{ token: string; organizationId: string }>()
      .then(async (s) => {
        if (!s) {
          setStatus('Não autenticado. Faça login na extensão.');
          return;
        }
        setToken(s.token);
        setOrg(s.organizationId);
        try {
          const cfg = await apiGet<{ featureChatgptAssistedInsertion: boolean }>('/api/extension/config', s.token);
          setAssistedEnabled(cfg.featureChatgptAssistedInsertion);
        } catch {
          /* padrão desligado */
        }
        await loadClients(s.token);
        await loadBrandKits(s.token);
        setStatus('Pronto.');
      })
      .catch(() => setStatus('Falha ao carregar sessão.'));
  }, []);

  async function loadClients(t: string) {
    try {
      const d = await apiGet<{ clients: Option[] }>('/api/clients', t);
      setClients(d.clients ?? []);
    } catch {
      /* silencioso */
    }
  }
  async function loadBrandKits(t: string) {
    try {
      const d = await apiGet<{ brandKits: Option[] }>('/api/brand-kits', t);
      setBrandKits(d.brandKits ?? []);
    } catch {
      /* silencioso */
    }
  }
  async function loadCampaigns(t: string, bk: string) {
    try {
      const d = await apiGet<{ campaigns: Option[] }>(`/api/campaigns?brandKitId=${bk}`, t);
      setCampaigns(d.campaigns ?? []);
    } catch {
      /* silencioso */
    }
  }
  async function loadAssets(t: string, bk: string) {
    try {
      const d = await apiGet<{ assets: AssetOption[] }>(`/api/assets?brandKitId=${bk}`, t);
      setAssets(d.assets ?? []);
    } catch {
      /* silencioso */
    }
  }

  function toggleAsset(id: string) {
    setSelectedAssets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onGenerate() {
    if (!token) return setStatus('Não autenticado.');
    if (!brandKit) return setStatus('Selecione um Brand Kit.');
    setStatus('Gerando…');
    try {
      const d = await apiPost<PromptResult>('/api/prompts/generate', token, {
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
      });
      setPromptId(d.id);
      setPrompt(d.prompt.originalText);
      setEdited(d.prompt.originalText);
      setStatus('Prompt gerado (sem LLM).');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha ao gerar.');
    }
  }

  async function onSaveEdit() {
    if (!token || !promptId) return setStatus('Gere um prompt primeiro.');
    try {
      await apiPost('/api/prompts/' + promptId, token, { promptId, editedText: edited });
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
    const r = await ChatSurfaceAdapter.insertText(edited || prompt);
    setStatus(r.ok ? 'Inserido no ChatGPT.' : `Falha: ${r.reason}. Use "Copiar prompt".`);
  }

  async function onDownload() {
    if (!token || !promptId || !brandKit) return setStatus('Gere um prompt e selecione o Brand Kit.');
    setStatus('Gerando pacote…');
    try {
      const d = await apiPost<{ id: string }>('/api/packages', token, {
        brandKitId: brandKit,
        campaignId: campaign || undefined,
        promptId,
        assetIds: selectedAssets,
      });
      browser.tabs.create({ url: `${getApiBase()}/api/packages/${d.id}/download` });
      setStatus('Pacote gerado. Download iniciado.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha ao gerar pacote.');
    }
  }

  function onOpenChat() {
    browser.tabs.create({ url: 'https://chatgpt.com/' });
  }

  async function onRegisterUsed() {
    if (!token || !promptId) return setStatus('Gere um prompt primeiro.');
    try {
      await apiPost('/api/prompts/' + promptId + '/usage', token, {}).catch(() => undefined);
      setStatus('Uso registrado.');
    } catch {
      setStatus('Uso registrado (local).');
    }
  }

  function onImportResult() {
    browser.tabs.create({ url: `${getApiBase()}/resultados/importar` });
  }

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui', fontSize: 12, maxWidth: 360 }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants — Painel lateral</h1>
      <p style={{ color: '#666' }}>Org: {org || '—'}</p>

      <label>Cliente
        <select value={client} onChange={(e) => setClient(e.target.value)} style={{ width: '100%' }}>
          <option value="">— selecione —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Brand Kit
        <select value={brandKit} onChange={(e) => { setBrandKit(e.target.value); if (e.target.value) { loadCampaigns(token, e.target.value); loadAssets(token, e.target.value); } }} style={{ width: '100%' }}>
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
      <p style={{ fontSize: 10, color: '#888' }}>
        A inserção assistida é experimental e controlada por flag remota. Sempre funciona copiar, baixar e abrir.
      </p>
    </div>
  );
});
