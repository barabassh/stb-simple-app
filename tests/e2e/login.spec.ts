import { expect, test } from "@playwright/test";

import messages from "../../messages/ru.json";

test("unauthenticated visitor is redirected to the login page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: messages.auth.login.title })).toBeVisible();
});
