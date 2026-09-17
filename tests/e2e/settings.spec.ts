import { expect, messages, openCompanyDialog, signIn, test } from "./fixtures";

const company = messages.settings.company;

test("an employee has no settings in the menu and is refused its pages", async ({
  page,
  createUser,
}) => {
  const employee = await createUser();
  await signIn(page, employee);
  await expect(page).toHaveURL("/");

  const navigation = page.getByRole("navigation", { name: messages.nav.label });
  await expect(navigation.getByRole("link", { name: messages.nav.users })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: messages.nav.home })).toBeVisible();
  await expect(navigation.getByRole("link", { name: messages.nav.settings })).toHaveCount(0);
  await expect(page.getByRole("link", { name: messages.home.sections.settings.title })).toHaveCount(
    0,
  );

  for (const path of ["/settings", "/settings/company/history"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/forbidden");
    await expect(
      page.getByRole("heading", { name: messages.errors.forbidden.title }),
    ).toBeVisible();
  }
});

test("a KvK number of seven digits is reported under its field and keeps the dialog open", async ({
  page,
  createUser,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  const dialog = await openCompanyDialog(page);
  await dialog.getByLabel(company.fields.legalName).fill("E2E Format B.V.");
  const kvkNumber = dialog.getByLabel(company.fields.kvkNumber);
  await kvkNumber.fill("1234567");
  await dialog.getByRole("button", { name: company.dialog.save }).click();

  // `has` looks for its locator inside each field, so it must not start from the dialog again.
  const kvkField = dialog
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel(company.fields.kvkNumber) });
  await expect(kvkField.locator('[data-slot="field-error"]')).toHaveText(
    company.validation.kvkNumberInvalid,
  );
  await expect(kvkNumber).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toBeVisible();
  await expect(kvkNumber).toHaveValue("1234567");
});

test("closing the dialog with unsaved changes asks for confirmation", async ({
  page,
  createUser,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  const dialog = await openCompanyDialog(page);
  const legalName = dialog.getByLabel(company.fields.legalName);
  await legalName.fill("E2E Unsaved B.V.");

  const confirmation = page.getByRole("dialog", { name: company.dialog.confirmCloseTitle });
  await dialog.getByRole("button", { name: company.dialog.cancel }).click();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: company.dialog.confirmCloseKeep }).click();
  await expect(confirmation).toBeHidden();
  await expect(legalName).toHaveValue("E2E Unsaved B.V.");

  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: company.dialog.confirmCloseDiscard }).click();
  await expect(confirmation).toBeHidden();
  await expect(dialog).toBeHidden();
});
