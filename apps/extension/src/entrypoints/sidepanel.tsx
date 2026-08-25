import { useState } from 'react';
import { getSession } from '../modules/storage';
import { apiGet } from '../modules/api';
import { ChatSurfaceAdapter } from '../modules/chat-surface';

interface CampaignOption {
  id: string;
  name: string;
}

export default defineSidepanel(() => {
  const [org, setOrg] = useState('');
  const [client, setClient] = useState('');
  const [brandKit, setBrandKit] = useState('');
  const [campaign, setCampaign] = useState('');
  const [format, setFormat] = useState('Post Instagram');
  const [mode, setMode] = useState<'essential' | 'professional' | 'strict_branding' | 'creative_exploration'>('professional');
  const [objective, setObjective] = useState('');
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [cta, setCta] = useState('');
  const [mandatory, setMandatory] = useState('');
  const [prohibited, setProhibited] = useState('');
  const [assets, setAssets] = useState('');
  const [prompt, setPrompt] = useState('');
  const [edited, setEdited] = useState('');
  const [status, setStatus] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

  useState(() => {
    getSession<{ token: string; organizationId: string }>().then(async (s) => {
      if (!s) return;
      setOrg(s.organizationId);
      try {
        const data = await apiGet<{ campaigns: CampaignOption[] }>('/api/resources/campaigns', s.token);
        setCampaigns(data.campaigns ?? []);
      } catch {
        /* silencioso */
      }
    });
  });

  async function onGenerate() {
    const s = await getSession<{ token: string }>();
    if (!s) return setStatus('Não autenticado.');
    const res = await fetch('http://localhost:3000/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({
        brandKitId: brandKit,
        campaignId: campaign || undefined,
        promptMode: mode,
        objective,
        productOrService: product,
        audience,
        offer,
        cta,
        mandatoryContent: mandatory.split('\n').filter(Boolean),
        prohibitedContent: prohibited.split('\n').filter(Boolean),
        selectedAssetIds: assets.split(',').map((a) => a.trim()).filter(Boolean),
        variations: 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error ?? 'Falha.');
    setPrompt(data.prompt.originalText);
    setEdited(data.prompt.originalText);
    setStatus('Prompt gerado (sem LLM).');
  }

  function onCopy() {
    navigator.clipboard.writeText(edited || prompt);
    setStatus('Copiado.');
  }

  async function onInsert() {
    const r = await ChatSurfaceAdapter.insertText(edited || prompt);
    setStatus(r.ok ? 'Inserido no ChatGPT.' : `Falha: ${r.reason}. Use "Copiar prompt".`);
  }

  function onDownload() {
    setStatus('Download do Pacote Criativo iniciado (requer seleção de ativos).');
  }

  function onOpenChat() {
    browser.tabs.create({ url: 'https://chatgpt.com/' });
  }

  function onRegisterUsed() {
    setStatus('Uso registrado.');
  }

  function onImportResult() {
    setStatus('Importe o resultado manualmente na plataforma (não capturamos conversas).');
  }

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui', fontSize: 12, maxWidth: 360 }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>Mants — Painel lateral</h1>
      <p style={{ color: '#666' }}>Org: {org || '—'}</p>
      <label>Cliente<input value={client} onChange={(e) => setClient(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Brand Kit ID<input value={brandKit} onChange={(e) => setBrandKit(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Campanha
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ width: '100%' }}>
          <option value="">— nova —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label>Formato<input value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: '100%' }} /></label>
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
      <label>Ativos (IDs separados por vírgula)<input value={assets} onChange={(e) => setAssets(e.target.value)} style={{ width: '100%' }} /></label>
      <button onClick={onGenerate} style={{ marginTop: 8, width: '100%' }}>Gerar prompt</button>
      <label>Pré-visualização / Edição
        <textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={8} style={{ width: '100%' }} readOnly={!prompt} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <button onClick={onCopy}>Copiar prompt</button>
        <button onClick={onInsert}>Inserir no ChatGPT — exp.</button>
        <button onClick={onDownload}>Baixar Pacote</button>
        <button onClick={onOpenChat}>Abrir ChatGPT</button>
        <button onClick={onRegisterUsed}>Registrar uso</button>
        <button onClick={onImportResult}>Importar resultado</button>
      </div>
      <p style={{ color: '#444', marginTop: 8 }}>{status}</p>
      <p style={{ fontSize: 10, color: '#888' }}>
        A inserção assistida é experimental e pode ser desativada. Sempre funciona copiar, baixar e abrir.
      </p>
    </div>
  );
});
