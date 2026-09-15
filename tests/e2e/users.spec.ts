import { expect, messages, signIn, test, text, uniqueLogin, waitForHydration } from "./fixtures";

test("an administrator creates a user who then signs in", async ({ page, createUser }) => {
  const admin = await createUser({ role: "ADMIN" });
  const created = {
    login: uniqueLogin("created"),
    password: "Created2026pass",
    fullName: `Новый Подрядчик ${Date.now()}`,
  };

  await signIn(page, admin);
  await expect(page).toHaveURL("/");
  await page.goto("/users");
  await page.getByRole("link", { name: messages.users.list.create }).click();
  await expect(page).toHaveURL("/users/new");

  const submit = page.getByRole("button", { name: messages.users.form.create });
  const loginField = page.getByLabel(messages.users.fields.login, { exact: true });
  await waitForHydration(loginField);
  await loginField.fill(created.login);
  await page.getByLabel(messages.users.fields.password, { exact: true }).fill(created.password);
  await page.getByLabel(messages.users.fields.fullName, { exact: true }).fill(created.fullName);
  await page.getByRole("combobox", { name: messages.users.fields.role }).click();
  await page.getByRole("option", { name: messages.users.roles.CONTRACTOR }).click();
  await submit.click();

  await expect(page.getByRole("heading", { name: created.fullName })).toBeVisible();
  await expect(page).toHaveURL(/\/users\/c\w+$/);

  await page.getByRole("button", { name: messages.auth.signOut }).click();
  await expect(page).toHaveURL("/login");

  await signIn(page, created);
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: text(messages.home.greeting, { name: created.fullName }) }),
  ).toBeVisible();
});
