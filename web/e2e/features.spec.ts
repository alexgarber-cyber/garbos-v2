/**
 * E2E tests for:
 *   1. Leads page — company ComboBox (render, filter, "+ New", selection)
 *   2. Sequence step — "Done" button opens modal with textarea
 *   3. ActivityLog — collapse to 3 + expand, and message_sent truncation
 *
 * Requires the app stack running (web :3000, api :8000, db :5432).
 * Run via Docker:
 *   docker run --rm --network host -v /home/alexg/garbos-v2/web:/work -w /work \
 *     mcr.microsoft.com/playwright:v1.60.0-noble npx playwright test
 */

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const WEB = "http://localhost:3000";
const API_BASE = "http://localhost:8000";
const EMAIL = "alex@garbos.app";
const PASSWORD = "changeme-please";
const LONG_MSG = "A".repeat(250); // 250 chars → truncated at 200

// Module-level state captured in the global beforeAll.
let sessionCookie = "";
let authCookies: Parameters<BrowserContext["addCookies"]>[0] = [];
let activityTypeId = 0;

// ─── Global auth setup ────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${WEB}/login`);
  await page.waitForTimeout(700); // client hydration
  await page.fill('[type=email]', EMAIL);
  await page.fill('[type=password]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('[type=submit]'),
  ]);

  const state = await ctx.storageState();
  authCookies = state.cookies;
  const sc = state.cookies.find((c) => c.name === "session");
  sessionCookie = sc ? `session=${sc.value}` : "";

  await ctx.close();

  // Fetch a valid activity type ID for test data creation.
  const types = await apiGet<{ id: number }[]>("/activity-types");
  activityTypeId = types[0].id;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function authedPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: { cookies: authCookies, origins: [] },
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Cookie: sessionCookie },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Cookie: sessionCookie },
  });
}

// ─── 1. Leads — company ComboBox ──────────────────────────────────────────────

test.describe("Leads — company ComboBox", () => {
  test("opens dropdown on focus and lists companies", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/leads`);
      await page.getByRole("button", { name: "+ Add Lead" }).click();

      const input = page.getByPlaceholder("Company *");
      await expect(input).toBeVisible();
      await input.focus();
      // Dropdown should appear with at least one company button.
      const items = input.locator("xpath=..").locator("ul li button");
      await expect(items.first()).toBeVisible({ timeout: 5000 });
      expect(await items.count()).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });

  test("filters dropdown as you type", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/leads`);
      await page.getByRole("button", { name: "+ Add Lead" }).click();

      const input = page.getByPlaceholder("Company *");
      await input.fill("Aer");

      const items = input.locator("xpath=..").locator("ul li button");
      await expect(items.first()).toBeVisible({ timeout: 5000 });

      // Every non-"+ New" item must contain "aer" (case-insensitive).
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        const text = (await items.nth(i).textContent()) ?? "";
        if (!text.startsWith("+ New")) {
          expect(text.toLowerCase()).toContain("aer");
        }
      }
    } finally {
      await ctx.close();
    }
  });

  test("shows '+ New' for a name that matches no existing company", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/leads`);
      await page.getByRole("button", { name: "+ Add Lead" }).click();

      const input = page.getByPlaceholder("Company *");
      const unique = `__PW_UNKNOWN_${Date.now()}__`;
      await input.fill(unique);

      await expect(
        input.locator("xpath=..").locator(`ul li button:has-text("+ New")`),
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await ctx.close();
    }
  });

  test("selecting a company sets the input value and closes dropdown", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/leads`);
      await page.getByRole("button", { name: "+ Add Lead" }).click();

      const input = page.getByPlaceholder("Company *");
      await input.fill("Aer");

      const allItems = input.locator("xpath=..").locator("ul li button");
      // Exclude the "+ New" row; we want to click an existing company entry.
      const existingItems = allItems.filter({ hasNotText: "+ New" });
      const first = existingItems.first();
      await expect(first).toBeVisible({ timeout: 5000 });
      const companyName = (await first.textContent()) ?? "";
      await first.click();

      await expect(input).toHaveValue(companyName);
      // Dropdown should close.
      await expect(allItems.first()).not.toBeVisible({ timeout: 2000 });
    } finally {
      await ctx.close();
    }
  });
});

// ─── 2. Sequence step — Done modal ────────────────────────────────────────────

test.describe("Sequence step — Done modal", () => {
  let chainId = 0;
  let stepId = 0;

  test.beforeAll(async () => {
    // Create a test chain with one step.
    const chain = await apiPost<{ id: number; steps: { id: number }[] }>("/chains", {
      title: "__PW_DONE_MODAL_TEST__",
    });
    chainId = chain.id;
    const chainWithStep = await apiPost<{ steps: { id: number }[] }>(
      `/chains/${chainId}/steps`,
      {
        activity_type_id: activityTypeId,
        due_date: new Date(Date.now() + 86_400_000).toISOString(),
        responsible_party: "me",
      },
    );
    stepId = chainWithStep.steps[0].id;
  });

  test.afterAll(async () => {
    // Clean up: delete the chain and any auto-logged activity.
    await apiDelete(`/chains/${chainId}`);
    const acts = await apiGet<{ id: number; note: string | null }[]>("/activities");
    for (const a of acts) {
      if (a.note?.startsWith("Completed: __PW_DONE_MODAL_TEST__")) {
        await apiDelete(`/activities/${a.id}`);
      }
    }
  });

  test("Done button opens modal with textarea and action buttons", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/chains/${chainId}`);
      // Wait directly for the Done button (avoids networkidle timeout on Next.js pages).
      const doneButton = page.getByRole("button", { name: "Done" });
      await expect(doneButton).toBeVisible({ timeout: 20000 });
      await doneButton.click();

      await expect(page.getByText("What did you send/say?")).toBeVisible();
      await expect(page.getByPlaceholder(/Paste or summarize/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("Save completes the step and closes the modal", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/chains/${chainId}`);
      const doneButton = page.getByRole("button", { name: "Done" });
      await expect(doneButton).toBeVisible({ timeout: 20000 });
      await doneButton.click();
      await expect(page.getByText("What did you send/say?")).toBeVisible();

      await page.getByPlaceholder(/Paste or summarize/).fill("Test message from Playwright");
      await page.getByRole("button", { name: "Save" }).click();

      // Modal should close.
      await expect(page.getByText("What did you send/say?")).not.toBeVisible({ timeout: 5000 });
      // Step should now be marked done (no "Done" button remains).
      await expect(page.getByRole("button", { name: "Done" })).not.toBeVisible({ timeout: 3000 });
    } finally {
      await ctx.close();
    }
  });
});

// ─── 3. ActivityLog — collapse + message_sent truncation ──────────────────────

test.describe("ActivityLog — collapse and truncation", () => {
  let companyId = 0;
  let manualActivityIds: number[] = [];
  let chainId = 0;

  test.beforeAll(async () => {
    // 1. Create a test company.
    const company = await apiPost<{ id: number }>("/companies", {
      name: `__PW_ACTLOG_TEST_${Date.now()}__`,
    });
    companyId = company.id;

    // 2. Create 4 manual activities at explicit past dates so the step-completion
    //    activity (occurred_at = now) naturally floats to the top.
    for (let i = 1; i <= 4; i++) {
      const a = await apiPost<{ id: number }>("/activities", {
        activity_type_id: activityTypeId,
        company_id: companyId,
        occurred_at: new Date(`2024-01-0${i}T12:00:00Z`).toISOString(),
        note: `__PW_activity_${i}__`,
      });
      manualActivityIds.push(a.id);
    }

    // 3. Create a chain linked to the company, add a step, complete it with a
    //    long message so we can test message_sent truncation.
    const chain = await apiPost<{ id: number }>("/chains", {
      title: "__PW_ACTLOG_CHAIN__",
      company_id: companyId,
    });
    chainId = chain.id;
    const chainWithStep = await apiPost<{ steps: { id: number }[] }>(
      `/chains/${chainId}/steps`,
      {
        activity_type_id: activityTypeId,
        due_date: new Date(Date.now() + 86_400_000).toISOString(),
        responsible_party: "me",
      },
    );
    const stepId = chainWithStep.steps[0].id;
    await apiPost(`/chains/${chainId}/steps/${stepId}/complete`, {
      message_sent: LONG_MSG,
    });
  });

  test.afterAll(async () => {
    for (const id of manualActivityIds) await apiDelete(`/activities/${id}`);
    // Delete the step-completion activity.
    const acts = await apiGet<{ id: number; note: string | null }[]>(
      `/activities?company_id=${companyId}`,
    );
    for (const a of acts) await apiDelete(`/activities/${a.id}`);
    await apiDelete(`/chains/${chainId}`);
    await apiDelete(`/companies/${companyId}`);
  });

  test("shows only 3 most recent activities initially", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/companies/${companyId}`);
      await page.waitForLoadState("networkidle");

      // ActivityLog: h2 is inside div.mb-3, which is inside the ActivityLog root div.
      // xpath=../.. goes: h2 → div.mb-3 → ActivityLog root div.
      const h2 = page.getByRole("heading", { name: "Activity", level: 2 });
      await expect(h2).toBeVisible({ timeout: 8000 });
      const logRoot = h2.locator("xpath=../.."); // ActivityLog root div
      const rows = logRoot.locator("ul li");
      await expect(rows).toHaveCount(3, { timeout: 5000 });
    } finally {
      await ctx.close();
    }
  });

  test("'+ Show N more' expands all activities", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/companies/${companyId}`);
      await page.waitForLoadState("networkidle");

      // Click expand.
      const showMore = page.getByRole("button", { name: /Show \d+ more/ });
      await expect(showMore).toBeVisible({ timeout: 8000 });
      await showMore.click();

      // All 5 activities now visible.
      const h2 = page.getByRole("heading", { name: "Activity", level: 2 });
      await expect(h2).toBeVisible();
      const logRoot = h2.locator("xpath=../.."); // ActivityLog root div
      await expect(logRoot.locator("ul li")).toHaveCount(5, { timeout: 3000 });
    } finally {
      await ctx.close();
    }
  });

  test("long message_sent is truncated with a 'Read more' button", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/companies/${companyId}`);
      await page.waitForLoadState("networkidle");

      // The step-completion activity is the most recent — visible in the collapsed 3.
      const readMore = page.getByRole("button", { name: "Read more" });
      await expect(readMore).toBeVisible({ timeout: 5000 });
    } finally {
      await ctx.close();
    }
  });

  test("'Read more' expands message, 'Show less' collapses it", async ({ browser }) => {
    const { ctx, page } = await authedPage(browser);
    try {
      await page.goto(`${WEB}/companies/${companyId}`);
      await page.waitForLoadState("networkidle");

      const readMore = page.getByRole("button", { name: "Read more" });
      await expect(readMore).toBeVisible({ timeout: 5000 });
      await readMore.click();

      // "Show less" replaces "Read more".
      await expect(page.getByRole("button", { name: "Show less" })).toBeVisible({
        timeout: 3000,
      });
      await expect(page.getByRole("button", { name: "Read more" })).not.toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
