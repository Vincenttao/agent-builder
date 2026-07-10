import { test, expect, type Page } from '@playwright/test';

/**
 * P1 E2E (Phase 12 §1 #1/#2/#6/#7): non-example prompts go end-to-end through
 * the real LLM parser path (mock provider) — generate -> source -> simulate
 * run -> export. The mock run replies must NOT leak tarot/presales demo language.
 *
 * These exercise the Phase 9 hybrid parser (non-demo prompt -> mock LLM -> a
 * generic Spec) and the Phase 12 generic mock runtime.
 */

async function waitForCompleted(page: Page) {
  await expect(page.getByTestId('status-badge')).toHaveText(/已完成|失败/, { timeout: 180_000 });
  const text = (await page.getByTestId('status-badge').textContent()) ?? '';
  expect(text).toContain('已完成');
}

async function submitPrompt(page: Page, type: 'agent' | 'workflow', prompt: string) {
  await page.goto('/');
  if (type === 'workflow') {
    await page.getByTestId('type-workflow').click();
  } else {
    await page.getByTestId('type-agent').click();
  }
  await page.getByTestId('prompt-input').fill(prompt);
  await page.getByTestId('submit-button').click();
  await page.waitForURL(/\/generations\/gen_.+/);
}

test.describe('P1 E2E — non-example prompts (LLM parser + generic runtime)', () => {
  test('Weather Agent: generate -> source -> run -> export (no demo leakage)', async ({ page }) => {
    await submitPrompt(
      page,
      'agent',
      '做一个天气查询 Agent，用户输入城市后调用工具返回该城市的天气信息。',
    );
    await waitForCompleted(page);

    await expect(page.getByTestId('completion-summary')).toBeVisible();
    await expect(page.getByTestId('test-result')).toHaveText('通过');

    // Source tab: agent.py present
    await page.getByTestId('tab-source').click();
    await expect(page.getByTestId('file-node-src/agents/agent.py')).toBeVisible();

    // Agent run: reply names the generic tool, never tarot language (§1 #6).
    await page.getByTestId('tab-run').click();
    await page.getByTestId('agent-message-input').fill('北京今天天气');
    await page.getByTestId('agent-send').click();
    const reply = page.getByTestId('agent-reply');
    await expect(reply).toBeVisible();
    await expect(reply).toContainText('query_info');
    await expect(reply).not.toContainText('牌');
    await expect(reply).not.toContainText('占卜');

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('Contract Review Workflow: generate -> source -> run -> export', async ({ page }) => {
    await submitPrompt(
      page,
      'workflow',
      '合同审核流程，读取合同文档，抽取关键条款，标注风险等级，输出审核结果。',
    );
    await waitForCompleted(page);

    await page.getByTestId('tab-source').click();
    await expect(page.getByTestId('file-node-src/workflows/workflow.py')).toBeVisible();

    // Workflow run: generic node statuses; end node succeeds (§1 #2/#7).
    await page.getByTestId('tab-run').click();
    await page.getByTestId('workflow-run').click();
    await expect(page.getByTestId('workflow-nodes')).toBeVisible();
    await expect(page.getByTestId('node-status-end')).toHaveText('success');

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});
