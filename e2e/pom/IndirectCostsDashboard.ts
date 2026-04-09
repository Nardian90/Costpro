import { Page, Locator } from '@playwright/test';

export class IndirectCostsDashboard {
  readonly page: Page;
  readonly coefficientButton: Locator;
  readonly fixedAmountButton: Locator;
  readonly coefficientSlider: Locator;
  readonly fixedAmountInput: Locator;
  readonly baseSectionSelect: Locator;
  readonly autoCalculateButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.coefficientButton = page.locator('button:has-text("COEFICIENTE")');
    this.fixedAmountButton = page.locator('button:has-text("MONTO FIJO")');
    this.coefficientSlider = page.locator('div[role="slider"]').first();
    this.fixedAmountInput = page.locator('input[type="number"]').first();
    this.baseSectionSelect = page.locator('select').first();
    this.autoCalculateButton = page.locator('button[title="Auto-calcular basado en selección"]');
  }

  async setMode(mode: 'coefficient' | 'fixed') {
    if (mode === 'coefficient') {
      await this.coefficientButton.click();
    } else {
      await this.fixedAmountButton.click();
    }
  }

  async setCoefficient(value: number) {
    // For sliders in Playwright, we might need a more complex interaction or just update the value via fill if possible
    // But since it's a slider, we'll try to click at a position or use keyboard
    await this.coefficientSlider.focus();
    // Simplified: we'll use evaluate if slider is hard to move
    await this.page.evaluate(({val}) => {
       // This depends on the specific slider implementation (Radix UI)
    }, {val: value});
  }

  async setFixedAmount(amount: number) {
    await this.fixedAmountInput.fill(amount.toString());
  }

  async toggleSection(sectionId: string) {
    await this.page.click(`label[for="section-${sectionId}"]`);
  }

  async setBaseSection(sectionId: string) {
    await this.baseSectionSelect.selectOption(sectionId);
  }
}
