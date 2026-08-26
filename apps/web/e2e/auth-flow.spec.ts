import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');

test.describe('Fluxo PKCE completo (extensão carregada)', () => {
  test('entrar, autorizar, exchange no background e popup autenticado', async () => {
    test.skip(!fs.existsSync(EXTENSION_PATH), 'Extensão não buildada (.output/chrome-mv3). Rode pnpm extension:build:chrome.');

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // 1. Abre o popup da extensão a partir das páginas do contexto.
    const popup = context.pages()[0] ?? (await context.newPage());

    // 2. Clica em "Entrar".
    await popup.getByText(/entrar|login/i).first().click();

    // 3. O background abre a autorização no site; faz login e autoriza.
    const auth = await context.waitForEvent('page');
    await auth.waitForURL(/extension\/authorize/);
    await auth.getByText(/autorizar|concordar/i).first().click();

    // 4. Background conclui o exchange; popup mostra autenticado.
    await popup.getByText(/autenticado|sessão válida/i).first().waitFor({ timeout: 30_000 });

    // 5. Side panel carrega dados.
    await popup.getByText(/painel|side panel/i).first().click();

    // 6-13. Gera prompt, edita, copia, insere, baixa pacote, registra uso, importa, logout.
    const panel =
      context.pages().find((p) => p.url().includes('sidepanel')) ?? (await context.newPage());
    await panel.getByText(/gerar prompt/i).first().click();
    await panel.getByText(/salvar edição/i).first().click();
    await panel.getByText(/copiar prompt/i).first().click();
    await panel.getByText(/inserir/i).first().click();
    await panel.getByText(/baixar pacote/i).first().click();
    await panel.getByText(/registrar uso/i).first().click();
    await panel.getByText(/importar resultado/i).first().click();
    await popup.getByText(/logout|sair/i).first().click();

    expect(await popup.getByText(/não autenticado|faça login/i).first().isVisible()).toBe(true);

    await context.close();
  });
});
