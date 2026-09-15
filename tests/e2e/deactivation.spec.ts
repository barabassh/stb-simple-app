import { expect, messages, signIn, test, waitForHydration } from "./fixtures";

test("deactivating a user ends their open session", async ({ page, browser, createUser }) => {
  const admin = await createUser({ role: "ADMIN" });
  const employee = await createUser();

  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  await signIn(employeePage, employee);
  await expect(employeePage).toHaveURL("/");

  await signIn(page, admin);
  await expect(page).toHaveURL("/");
  await page.goto(`/users/${employee.id}`);
  const deactivate = page.getByRole("button", { name: messages.users.actions.deactivate });
  await waitForHydration(deactivate);
  await deactivate.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(employee.fullName);
  await dialog.getByRole("button", { name: messages.users.dialogs.deactivate.confirm }).click();
  await expect(page.getByRole("heading", { name: employee.fullName })).toContainText(
    messages.users.statuses.inactive,
  );

  await employeePage.goto("/profile");
  await expect(employeePage).toHaveURL("/login");
  await employeeContext.close();
});
