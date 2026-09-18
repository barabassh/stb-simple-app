import type { Page } from "@playwright/test";

import { expect, messages, signIn, test, waitForHydration } from "./fixtures";

async function expectNoPageScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(360);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test("on a phone the projects registry and the project form fit the screen", async ({
  page,
  createUser,
  createCustomer,
  createProject,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id, budgetAmount: "1250000.00" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/projects?q=${project.number}`);
  await expect(page.getByRole("link", { name: project.number })).toBeVisible();
  await expectNoPageScroll(page);

  await page.goto("/projects/new");
  const submit = page.getByRole("button", { name: messages.referenceBooks.form.create });
  await waitForHydration(page.getByLabel(messages.projects.fields.number, { exact: true }));
  await expectNoPageScroll(page);

  // The messages under the empty fields are the longest lines of the form.
  await page.getByLabel(messages.projects.fields.number, { exact: true }).fill("");
  await submit.click();
  await expect(page.getByText(messages.projects.validation.numberRequired)).toBeVisible();
  await expectNoPageScroll(page);
});
