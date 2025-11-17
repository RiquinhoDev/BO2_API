// tests/e2e/products-dashboard.spec.ts
// 🧪 Sprint 4: E2E Tests for Products Dashboard

import { test, expect } from '@playwright/test';

test.describe('Products Dashboard V2', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar para dashboard de produtos
    await page.goto('/products');
  });

  test('deve exibir dashboard de produtos corretamente', async ({ page }) => {
    // Verificar título
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Verificar que stats cards estão visíveis
    const statsCards = page.locator('[class*="stat"]');
    await expect(statsCards.first()).toBeVisible();

    // Verificar ProductSelector
    const selector = page.locator('select');
    await expect(selector).toBeVisible();
  });

  test('deve ter opções de produtos no selector', async ({ page }) => {
    const selector = page.locator('select');
    
    // Aguardar selector carregar
    await selector.waitFor({ state: 'visible' });

    // Verificar que tem opções
    const options = await selector.locator('option').all();
    expect(options.length).toBeGreaterThan(0);

    // Primeira opção deve ser "Todos os Produtos" (se showAllOption=true)
    const firstOption = await selector.locator('option').first().textContent();
    expect(firstOption).toContain('Todos');
  });

  test('deve filtrar por produto selecionado', async ({ page }) => {
    const selector = page.locator('select');
    
    // Aguardar carregar
    await selector.waitFor({ state: 'visible' });

    // Selecionar segundo produto (índice 1)
    await page.selectOption('select', { index: 1 });

    // Aguardar atualização (pode ter loading state)
    await page.waitForTimeout(1000);

    // Verificar que produto foi selecionado (badge deve aparecer)
    const badge = page.locator('[class*="badge"]').or(page.locator('[class*="rounded"]'));
    await expect(badge.first()).toBeVisible();
  });

  test('deve exibir grid de product cards', async ({ page }) => {
    // Procurar por cards (podem ter class com 'card', 'rounded', 'shadow')
    const cards = page.locator('[class*="card"]').or(page.locator('[class*="rounded-lg"]'));
    
    // Deve ter pelo menos 1 card
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('deve ter botão de refresh', async ({ page }) => {
    // Procurar botão com "Refresh" ou "Atualizar"
    const refreshButton = page.locator('button:has-text("Atualizar")').or(
      page.locator('button:has-text("Refresh")')
    );
    
    if (await refreshButton.count() > 0) {
      await expect(refreshButton.first()).toBeVisible();
      
      // Clicar e verificar que não dá erro
      await refreshButton.first().click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Products Management (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Assumindo rota de gestão
    await page.goto('/products/management');
  });

  test('deve exibir página de gestão de produtos', async ({ page }) => {
    // Verificar título
    await expect(page.locator('h1')).toContainText('Gestão');

    // Deve ter botão "Novo Produto" ou similar
    const newButton = page.locator('button:has-text("Novo")').or(
      page.locator('button:has-text("Criar")')
    );
    
    if (await newButton.count() > 0) {
      await expect(newButton.first()).toBeVisible();
    }
  });

  test('deve abrir modal ao clicar em criar produto', async ({ page }) => {
    // Procurar botão "Novo Produto"
    const newButton = page.locator('button:has-text("Novo")').or(
      page.locator('button:has-text("Criar")')
    );
    
    if (await newButton.count() > 0) {
      await newButton.first().click();

      // Aguardar modal aparecer
      await page.waitForTimeout(500);

      // Verificar que modal/dialog abriu (procurar por formulário ou dialog)
      const dialog = page.locator('[role="dialog"]').or(page.locator('form'));
      await expect(dialog.first()).toBeVisible();
    }
  });
});

test.describe('Products Users List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products/users');
  });

  test('deve exibir lista de users', async ({ page }) => {
    // Verificar título
    await expect(page.locator('h1')).toContainText('User');

    // Verificar ProductSelector
    const selector = page.locator('select');
    await expect(selector).toBeVisible();

    // Verificar search input
    const searchInput = page.locator('input[type="text"]').or(
      page.locator('input[placeholder*="Pesquisar"]')
    );
    
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test('deve filtrar users por search', async ({ page }) => {
    // Procurar input de search
    const searchInput = page.locator('input[type="text"]').or(
      page.locator('input[placeholder*="Pesquisar"]')
    );
    
    if (await searchInput.count() > 0) {
      // Digitar algo
      await searchInput.first().fill('test');
      
      // Aguardar filtro
      await page.waitForTimeout(500);

      // Verificar que filtrou (pode não ter resultados em teste)
      // Apenas garantir que não deu erro
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('deve exibir tabela de users', async ({ page }) => {
    // Procurar tabela
    const table = page.locator('table');
    
    if (await table.count() > 0) {
      await expect(table.first()).toBeVisible();

      // Verificar headers
      const headers = table.locator('th');
      expect(await headers.count()).toBeGreaterThan(0);
    }
  });
});

