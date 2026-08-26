# Política de Privacidade — Mants Brand Orchestrator (Extensão)

Última atualização: 2026-08-26

## 1. Quem somos
A extensão **Mants Brand Orchestrator** ("Extensão") é uma ferramenta de governança de
marca voltada a times de marketing e cursos de publicidade. O controlador dos dados é a
organização que provisiona a instância (campo `API_BASE` configurado no build).

## 2. Dados coletados
A Extensão processa, no escopo da sua organização:
- **Identidade da sessão**: token de sessão de extensão (HMAC), `deviceId` e
  `organizationId`, necessários para autenticação PKCE e revogação.
- **Conteúdo de marca**: briefings, paletas de cor, fontes, logos, ativos e prompts
  gerados — armazenados no seu próprio storage (MinIO/S3/R2) e banco PostgreSQL.
- **Uso**: registros de geração de pacotes (sem conteúdo textual dos prompts).

## 3. O que NÃO coletamos
- Não coletamos dados pessoais de usuários finais além do e-mail institucional para login.
- Não vendemos dados. Não há rastreadores de terceiros na extensão.
- O `API_BASE` aponta exclusivamente para a instância da sua organização (HTTPS).

## 4. Base legal e retenção
O processamento ocorre para execução de contrato (uso da ferramenta) e legítimo interesse
de governança de marca. Os dados são retidos enquanto a organização mantiver a conta ativa
e podem ser removidos sob solicitação do administrador.

## 5. Seus direitos
Administradores podem revogar sessões de extensão a qualquer momento (endpoint
`/api/extension/sessions/[id]/revoke`) e excluir dados via console da organização.

## 6. Segurança
- Tokens assinados (HMAC-SHA256) com expiração e revogação no banco.
- Storage em bucket privado (sem acesso anônimo).
- Isolamento por `organizationId` em todas as rotas (testado por integração).

## 7. Contato
Suporte: mitszukyo@gmail.com
