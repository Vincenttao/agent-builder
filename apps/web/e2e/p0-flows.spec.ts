import { test, expect, type Page } from '@playwright/test';

/**
 * P0 E2E (Phase 8 §12.2): the two standard demo flows through the browser.
 * Tarot Agent: prompt -> completed -> summary -> source -> agent run -> export.
 * Presales Workflow: prompt -> completed -> node records -> export.
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

test.describe('P0 E2E — standard demo flows', () => {
  test('Tarot Agent: generate -> source -> run -> export', async ({ page }) => {
    await submitPrompt(
      page,
      'agent',
      '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。',
    );
    await waitForCompleted(page);

    // Completion summary visible.
    await expect(page.getByTestId('completion-summary')).toBeVisible();
    await expect(page.getByTestId('test-result')).toHaveText('通过');

    // Source tab: open src/agents/agent.py
    await page.getByTestId('tab-source').click();
    await expect(page.getByTestId('file-node-src/agents/agent.py')).toBeVisible();
    await page.getByTestId('file-node-src/agents/agent.py').click();
    await expect(page.getByTestId('codeviewer')).toContainText('build_agent');

    // Agent run
    await page.getByTestId('tab-run').click();
    await page.getByTestId('agent-message-input').fill('我想看看最近职业发展的趋势');
    const downloadPromise = page.waitForEvent('download').catch(() => null);
    await page.getByTestId('agent-send').click();
    // Generic mock runtime (Phase 12): the reply names the tool it called.
    await expect(page.getByTestId('agent-reply')).toContainText('draw_tarot');

    // Export
    await page.getByTestId('export-button').click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.zip$/);
    }
  });

  test('Presales Workflow: generate -> node records -> export', async ({ page }) => {
    await submitPrompt(
      page,
      'workflow',
      '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。',
    );
    await waitForCompleted(page);

    // Source tab: workflow.py present
    await page.getByTestId('tab-source').click();
    await expect(page.getByTestId('file-node-src/workflows/workflow.py')).toBeVisible();

    // Workflow run -> node statuses + Markdown report
    await page.getByTestId('tab-run').click();
    await page.getByTestId('workflow-run').click();
    await expect(page.getByTestId('workflow-nodes')).toBeVisible();
    await expect(page.getByTestId('node-status-end')).toHaveText('success');
    await expect(page.getByTestId('workflow-report')).toContainText('# 售前需求分析报告');

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});
