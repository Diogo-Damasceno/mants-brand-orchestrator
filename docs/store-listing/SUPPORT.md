# Página de Suporte — Mants Brand Orchestrator

## Contato
- E-mail: mitszukyo@gmail.com
- Horário: dias úteis, 9h–18h (UTC-3)

## Perguntas frequentes

**A extensão funciona offline?**
Não. Ela se comunica com a instância da sua organização (`API_BASE`) para autenticação,
seleção de Brand Kits e geração de pacotes.

**Como revogo uma sessão?**
No painel da organização (`/api/extension/sessions`) ou via endpoint
`/api/extension/sessions/[id]/revoke`. A revogação tem efeito imediato (validada no banco).

**Esqueci a senha / problemas de login?**
Use a tela de login da web da organização. A extensão segue a sessão web via fluxo PKCE.

**O build pede um domínio (API_BASE). O que é?**
É a URL HTTPS da sua instância Mants. Nunca use `localhost` em produção; o pipeline de
release recusa builds contendo `localhost` ou placeholders.

## Reportar problemas
Inclua: versão da extensão, navegador, mensagem de erro e (se aplicável) o ID da sessão.
