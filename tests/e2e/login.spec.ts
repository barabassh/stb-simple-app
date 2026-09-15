import { expect, messages, signIn, test, text } from "./fixtures";

test("an unauthenticated visitor is redirected to the login page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: messages.auth.login.title })).toBeVisible();
});

test("a user signs in with the right login and password", async ({ page, createUser }) => {
  const user = await createUser({ role: "CONTRACTOR" });

  // The login is not case-sensitive.
  await signIn(page, { ...user, login: user.login.toUpperCase() });

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: text(messages.home.greeting, { name: user.fullName }) }),
  ).toBeVisible();
});

test("a wrong password and an unknown login get the same message", async ({ page, createUser }) => {
  const user = await createUser();
  const error = page.getByText(messages.auth.errors.invalidCredentials);

  await signIn(page, { login: user.login, password: "Wrong2026pass" });
  await expect(error).toBeVisible();
  await expect(page).toHaveURL("/login");

  await signIn(page, { login: `${user.login}x`, password: user.password });
  await expect(error).toBeVisible();
  await expect(page).toHaveURL("/login");
});
