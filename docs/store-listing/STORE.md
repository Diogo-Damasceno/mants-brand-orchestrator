# Listagem da Loja — Mants Brand Orchestrator

## Descrição curta (≤132 caracteres)
Governança de marca em um clique: selecione Brand Kits, gere prompts e exporte pacotes prontos direto no navegador.

## Descrição completa
O Mants Brand Orchestrator é uma extensão de governança de marca para times de marketing e
cursos de publicidade. A partir do seu Brand Kit (cores, fontes, logos, regras aprovadas),
a extensão gera prompts alinhados à identidade, permite editar o texto, salvar versões e
exportar um pacote (ZIP) com hashes e direitos declarados.

Destaques:
- Autenticação PKCE com sessão revogável (validada no banco).
- Isolamento por organização em todas as rotas.
- Storage em bucket privado (MinIO/S3/R2).
- Exportação de pacotes com manifesto e direitos comerciais.

## Versão
0.1.0

## Changelog
- 0.1.0 (2026-08-26): versão inicial de estabilização.
  - PKCE com sessão no banco e revogação.
  - Alarmes duráveis (≥30s Chrome/Edge, 1min Firefox).
  - Validação de sessão no backend (expiração + role da membership).
  - Isolamento multitenant por organização (testado por integração).
  - Storage provider S3-compatível com bucket privado.

## Ícones e arte promocional
Ícones tecnicamente gerados e validados (PNG reais, dimensões exatas, presentes no
manifesto e nos três builds/ZIPs):
- [x] icon-16.png (16×16)
- [x] icon-32.png (32×32)
- [x] icon-48.png (48×48)
- [x] icon-96.png (96×96)
- [x] icon-128.png (128×128)

PENDENTE (aprovação humana obrigatória antes da publicação):
- [ ] Aprovação visual humana dos ícones (identidade Mants, leitura em 16×16).
- [ ] Imagem promocional (440×280 ou 1400×560, conforme loja).
- [ ] Screenshots (1280×800 ou 640×400).
- [ ] Descrição curta e completa (acima) revisada por humano.
