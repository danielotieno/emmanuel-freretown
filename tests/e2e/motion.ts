import type { Page } from "@playwright/test";

/**
 * Waits until no finite animation or transition is running, so axe measures the colours a member
 * sees once the page is still. A form fades back from its busy opacity over 200 ms after each
 * step; on a busy CI runner axe could catch it half-faded and report text as low contrast (#133).
 * Endless animations (a busy button's spinner) are ignored: they never finish.
 */
export async function waitForStillness(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}
