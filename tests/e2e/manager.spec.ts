import { expect, messages, signIn, test, text, waitForHydration } from "./fixtures";

const { actions } = messages.users;

test("a manager sees no buttons to create users, reset passwords or deactivate", async ({
  page,
  createUser,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const employee = await createUser();
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/users?q=${employee.login}`);
  const rowActions = page.getByRole("button", {
    name: text(messages.users.list.rowActions, { name: employee.fullName }),
  });
  await waitForHydration(rowActions);
  await expect(page.getByRole("link", { name: messages.users.list.create })).toHaveCount(0);

  await rowActions.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: actions.edit })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: actions.resetPassword })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: actions.deactivate })).toHaveCount(0);

  await page.goto(`/users/${employee.id}`);
  await expect(page.getByRole("link", { name: actions.edit })).toBeVisible();
  await expect(page.getByRole("button", { name: actions.resetPassword })).toHaveCount(0);
  await expect(page.getByRole("button", { name: actions.deactivate })).toHaveCount(0);
});

test("a manager cannot edit the profile of an administrator", async ({ page, createUser }) => {
  const manager = await createUser({ role: "MANAGER" });
  const admin = await createUser({ role: "ADMIN" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/users/${admin.id}`);
  await expect(page.getByRole("heading", { name: admin.fullName })).toBeVisible();
  await expect(page.getByRole("link", { name: actions.edit })).toHaveCount(0);

  await page.goto(`/users/${admin.id}/edit`);
  await expect(page).toHaveURL("/forbidden");
  await expect(page.getByRole("heading", { name: messages.errors.forbidden.title })).toBeVisible();
});
