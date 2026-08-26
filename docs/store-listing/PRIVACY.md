# Política de Privacidade — Mants Brand Orchestrator

Última atualização: 2026-08-26
Status: rascunho técnico — **requer revisão jurídica humana antes da publicação.**

> Este texto é informativo e factual sobre o tratamento de dados na ferramenta.
> Não constitui parecer jurídico. A publicação depende de validação por profissional
> habilitado em LGPD/GDPR.

## Controlador
A organização que provisiona a instância do Mants Brand Orchestrator (definida pelo
campo `API_BASE` configurado no build da extensão). Em instâncias SaaS da Mants, o
controlador é a pessoa jurídica Mants.

## Operador
Infraestrutura de armazenamento e processamento pode ser operada pela Mants ou pelo
próprio cliente (self-host), conforme contrato.

## Finalidade
Governança de marca: geração assistida de prompts, gestão de Brand Kits (cores,
fontes, logos, regras) e exportação de pacotes criativos.

## Categorias de dados tratados
- **Dados de conta:** e-mail institucional, nome, senha (hash), ID de usuário.
- **Dados de dispositivo:** `deviceId` dos navegadores onde a extensão é usada.
- **Registros de auditoria:** endereços IP de acesso, timestamps, ações.
- **Conteúdo enviado:** briefings, textos, logos, imagens e ativos de marca.
- **Imagens:** logos e fotos que podem conter pessoas ou terceiros.
- **Metadados:** nomes de arquivos, tipos MIME, hashes, tamanhos.
- **Uso:** registros de geração de pacotes e prompts (sem o conteúdo textual bruto
  dos prompts, salvo quando armazenado como parte do pacote).
- **Resultados:** dados inseridos pelos usuários em resultados/campanhas.

Não coletamos intencionalmente dados de menores sem base legal.

## Retenção
Dados mantidos enquanto a conta/org estiver ativa. Logs de auditoria retidos conforme
política do controlador (prazo configurável).

## Eliminação
Administradores podem excluir Brand Kits, clientes, campanhas e revogar sessões.
Exclusão em cascata é aplicada (soft-delete com `deletedAt`). Pedidos de eliminação
LGPD devem ser feitos ao controlador.

## Compartilhamento
Não vendemos dados. O armazenamento de objetos (MinIO/S3/R2) e o banco PostgreSQL
ficam no provedor de infraestrutura contratado. Não há compartilhamento com terceiros
para fins de marketing.

## Provedores de infraestrutura
- Banco de dados: PostgreSQL (contratado pelo controlador/operador).
- Storage de objetos: MinIO, Amazon S3 ou Cloudflare R2 (bucket privado, sem acesso anônimo).
- Compute: ambiente de hospedagem do app web.

## Segurança
- Tokens de sessão de extensão assinados (HMAC-SHA256) com expiração e revogação no banco.
- Storage em bucket privado; isolamento por `organizationId` em todas as rotas (testado).
- `API_BASE` aponta exclusivamente para a instância do controlador (HTTPS).

## Direitos LGPD
Titulares podem solicitar confirmação, acesso, correção, eliminação e revogação de
consentimento através do controlador. A revogação de sessão de extensão é imediata.

## Política específica sobre ChatGPT / IA gerativa
A extensão NÃO lê, captura nem transmite conversas, mensagens ou credenciais de
usuários do ChatGPT (ou de qualquer assistente de IA). A geração de prompts ocorre
dentro da própria interface da extensão/side panel, a partir dos Brand Kits e briefings
informados pelo usuário, e o envio de conteúdo para modelo de IA (quando houver) é
feito exclusivamente pela API do controlador, com consentimento do usuário.

A assinatura da Mants (uso da extensão) é independente da assinatura de qualquer
serviço de terceiros (ex.: assinatura ChatGPT/OpenAI). Uma não implica nem inclui a outra.

## Contato
Suporte: mitszukyo@gmail.com
