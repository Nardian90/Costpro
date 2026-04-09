import { Page, Locator, expect } from '@playwright/test';

export class CostSheetPage {
  readonly page: Page;
  readonly terminalButton: Locator;
  readonly costosAction: Locator;
  readonly dashboardTab: Locator;
  readonly kpisTab: Locator;
  readonly saveButton: Locator;
  readonly tableRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.terminalButton = page.locator('button:has-text("Terminal")');
    this.costosAction = page.locator('div[id="new-cost"]');
    this.dashboardTab = page.locator('button:has-text("DASHBOARD")');
    this.kpisTab = page.locator('button:has-text("KPIS")');
    this.saveButton = page.locator('button:has-text("Guardar Cambios")');
    this.tableRows = page.locator('table tr');
  }

  async goto() {
    await this.page.goto('/');
  }

  async openCostos() {
    // Navigate via command palette or sidebar if terminal is already open
    // For simplicity, we'll try to find the action in the main dashboard or command palette
    await this.page.keyboard.press('Control+k');
    await this.page.fill('input[placeholder*="Buscar acción"]', 'Nueva Ficha');
    await this.page.click('div[role="option"]:has-text("Nueva Ficha de Costo")');
  }

  async goToDashboard() {
    await this.dashboardTab.click();
    await this.kpisTab.click();
  }

  async goToTable() {
    await this.page.locator('button:has-text("TABLA INTERACTIVA")').click();
  }

  async getRowFormula(rowId: string) {
    // Open the popover to see the formula
    const rowSelector = `div[id="row-${rowId}"]`;
    const appliedIcon = this.page.locator(`${rowSelector} .cursor-help`);
    await appliedIcon.click();
    const formulaText = this.page.locator('div:has-text("Fórmula Ejecutada") + div').first();
    const text = await formulaText.textContent();
    // Close popover
    await this.page.keyboard.press('Escape');
    return text?.trim();
  }

  async isRowAffected(rowId: string) {
    const indicator = this.page.locator(`div[id="row-${rowId}"] svg.lucide-settings2`);
    return await indicator.isVisible();
  }
}
