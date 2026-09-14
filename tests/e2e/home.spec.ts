import { expect, test } from "@playwright/test";

import messages from "../../messages/ru.json";

test("home page renders in Russian", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: messages.app.name })).toBeVisible();
  await expect(page.getByText(messages.home.placeholder)).toBeVisible();
});
