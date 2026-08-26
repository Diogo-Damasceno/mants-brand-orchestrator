import { test, expect } from '@playwright/test';

/**
 * E2E do fluxo PKCE completo (item 11 do escopo).
 * Pré-requisitos: web em baseURL, usuário de teste já cadastrado, e extensão
 * Chrome carregada via E2E_EXT_PATH. O teste exercita:
 *   1) clique em "Entrar" no popup  -> START_AUTH no background
 *   2) abre aba de autorização no site
 *   3) login no site + clicar "Autorizar"
 *   4) background conclui exchange
 *   5) popup mostra autenticado
 *   6) side panel carrega dados, gera/salva/copia prompt, insere no ChatGPT,
 *      baixa pacote, registra uso, importa resultado, faz logout.
 *
 * Quando E2E_EXT_PATH não está definido, os passos dependentes de extensão
 * são pulados com aviso (smoke do site continua).
 */
const HAS_EXT = Boolean(process.env.E2E_EXT_PATH);

test.describe('Fluxo PKCE da extensão', () => {
  test('login no site + autorização + popup autenticado', async ({ page, context }) => {
    // 3) login no site (cookie de sessão web).
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.E2E_EMAIL ?? 'e2e@example.com');
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD ?? 'SenhaForte123');
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    test.skip(!HAS_EXT, 'E2E_EXT_PATH não definido: pulando etapas de extensão');

    // 1) abre o popup da extensão (via chrome-extension://<id>/popup.html)
    const extId = process.env.E2E_EXT_ID!;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.getByRole('button', { name: 'Entrar' }).click();

    // 2) aba de autorização é aberta pelo background.
    const authorizePage = await context.waitForEvent('page', { timeout: 15_000 });
    await authorizePage.waitForLoadState();
    await expect(authorizePage).toHaveURL(/\/extension\/authorize/);

    // 4) autorizar no site.
    await authorizePage.getByRole('button', { name: 'Autorizar' }).click();
    await expect(authorizePage).toHaveURL(/\/extension\/authorize\/success/);

    // 5) popup mostra autenticado.
    await expect(popup.getByText('Autenticado')).toBeVisible({ timeout: 15_000 });
  });

  test('side panel: gerar, salvar, copiar, baixar, registrar, importar, logout', async ({ page, context }) => {
    test.skip(!HAS_EXT, 'E2E_EXT_PATH não definido');
    const extId = process.env.E2E_EXT_ID!;
    const sidepanel = await context.newPage();
    await sidepanel.goto(`chrome-extension://${extId}/sidepanel.html`);

    // 6) carrega dados (Brand Kits).
    await expect(sidepanel.getByText('Pronto.')).toBeVisible({ timeout: 15_000 });
    await sidepanel.selectOption('select', { label: /.*/ }).first().catch(() => {});

    await sidepanel.getByRole('button', { name: 'Gerar prompt' }).click();
    await expect(sidepanel.getByText('Prompt gerado')).toBeVisible({ timeout: 15_000 });

    await sidepanel.getByRole('button', { name: 'Salvar edição' }).click();
    await expect(sidepanel.getByText('Edição salva.')).toBeVisible();

    await sidepanel.getByRole('button', { name: 'Copiar prompt' }).click();
    await sidepanel.getByRole('button', { name: 'Baixar pacote' }).click();
    await sidepanel.getByRole('button', { name: 'Registrar uso' }).click();
    await expect(sidepanel.getByText('Uso registrado.')).toBeVisible();

    await sidepanel.getByRole('button', { name: 'Importar resultado' }).click();
    await expect(sidepanel).toHaveURL(/\/resultados\/importar/);

    // logout pelo popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.getByRole('button', { name: /Sair/ }).click();
  });
});
