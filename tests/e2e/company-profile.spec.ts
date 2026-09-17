import type { Locator, Page } from "@playwright/test";

import {
  companyProfileTest as test,
  expect,
  messages,
  openCompanyDialog,
  signIn,
  text,
} from "./fixtures";

const company = messages.settings.company;
const { details, dialog: dialogTexts, fields } = company;

/** The value next to a label in a group of the company details. */
function detail(page: Page, group: string, label: string): Locator {
  return page
    .getByRole("region", { name: group, exact: true })
    .locator("dt")
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::dd[1]");
}

test("a manager fills in the company profile and sees it with its history", async ({
  page,
  createUser,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto("/settings");
  await expect(page.getByText(company.empty)).toBeVisible();
  const dialog = await openCompanyDialog(page);

  await dialog.getByLabel(fields.legalName).fill("E2E Bouw B.V.");
  await dialog.getByLabel(fields.street).fill("de Geerenweg");
  await dialog.getByLabel(fields.houseNumber).fill("4");
  await dialog.getByLabel(fields.houseNumberAddition).fill("E");
  await dialog.getByLabel(fields.postcode).fill("3741rs");
  await dialog.getByLabel(fields.city).fill("Baarn");
  await dialog.getByLabel(fields.phone).fill("06 84 61 47 32");
  await dialog.getByLabel(fields.kvkNumber).fill("12345678");
  await dialog.getByLabel(fields.vatId).fill("nl 0050.25949.b57");

  // The office address fields above are the only ones with these labels until a warehouse is added.
  await dialog.getByRole("button", { name: dialogTexts.addWarehouse }).click();
  const warehouse = dialog.getByRole("group", {
    name: text(dialogTexts.warehouse, { number: 1 }),
  });
  await warehouse.getByLabel(fields.warehouseName).fill("Magazijn Utrecht");
  await warehouse.getByLabel(fields.street).fill("Industrieweg");
  await warehouse.getByLabel(fields.houseNumber).fill("12");
  await warehouse.getByLabel(fields.postcode).fill("3542ad");
  await warehouse.getByLabel(fields.city).fill("Utrecht");

  await dialog.getByRole("button", { name: dialogTexts.addPhone }).click();
  const phone = dialog.getByRole("group", { name: text(dialogTexts.phone, { number: 1 }) });
  await phone.getByLabel(fields.phoneLabel, { exact: true }).fill("Mobiel");
  await phone.getByLabel(fields.phoneNumber, { exact: true }).fill("0031 6 12345678");

  await dialog.getByRole("button", { name: dialogTexts.addActivity }).click();
  const activity = dialog.getByRole("group", { name: text(dialogTexts.activity, { number: 1 }) });
  await activity.getByLabel(fields.sbiCode).fill("4120");
  await activity
    .getByLabel(fields.activityDescription, { exact: true })
    .fill("Algemene burgerlijke en utiliteitsbouw");
  await expect(activity.getByRole("checkbox", { name: fields.isMain })).toBeChecked();

  await dialog.getByRole("button", { name: dialogTexts.save }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(company.toasts.saved)).toBeVisible();

  const { groups } = details;
  await expect(detail(page, groups.main, details.legalName)).toHaveText("E2E Bouw B.V.");
  await expect(detail(page, groups.main, details.address)).toHaveText(
    "de Geerenweg 4 E, 3741 RS Baarn",
  );
  await expect(detail(page, groups.main, details.phone)).toHaveText("+31684614732");
  await expect(detail(page, groups.main, details.vatId)).toHaveText("NL005025949B57");
  await expect(detail(page, groups.main, details.kvkNumber)).toHaveText("12345678");
  await expect(detail(page, groups.addresses, details.postalAddress)).toHaveText(
    details.postalSameAsOffice,
  );
  await expect(detail(page, groups.addresses, "Magazijn Utrecht")).toHaveText(
    "Industrieweg 12, 3542 AD Utrecht",
  );
  await expect(detail(page, groups.contacts, "Mobiel")).toHaveText("+31612345678");
  const mainActivity = detail(page, groups.activities, "4120");
  await expect(mainActivity).toContainText("Algemene burgerlijke en utiliteitsbouw");
  await expect(mainActivity).toContainText(details.mainActivity);

  await page.getByRole("link", { name: company.historyLink }).click();
  await expect(page).toHaveURL("/settings/company/history");
  await expect(page.getByRole("heading", { name: company.history.title })).toBeVisible();
  const rows = page.getByRole("row").filter({ hasText: manager.fullName });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(messages.audit.summaries.companyProfileCreated);
});

test("of two people saving the same profile, the second is told about the other's change", async ({
  page,
  browser,
  createUser,
}) => {
  const first = await createUser({ role: "MANAGER" });
  const second = await createUser({ role: "ADMIN" });
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();

  try {
    await signIn(page, first);
    await expect(page).toHaveURL("/");
    await signIn(secondPage, second);
    await expect(secondPage).toHaveURL("/");

    const firstDialog = await openCompanyDialog(page);
    const secondDialog = await openCompanyDialog(secondPage);
    await firstDialog.getByLabel(fields.legalName).fill("E2E First B.V.");
    await secondDialog.getByLabel(fields.legalName).fill("E2E Second B.V.");

    await firstDialog.getByRole("button", { name: dialogTexts.save }).click();
    // The dialog closes only on success; what was saved is checked from the second page below.
    await expect(firstDialog).toBeHidden();
    await expect(detail(page, details.groups.main, details.legalName)).toHaveText("E2E First B.V.");

    await secondDialog.getByRole("button", { name: dialogTexts.save }).click();
    await expect(secondDialog.getByRole("alert")).toHaveText(company.errors.concurrentUpdate);
    await expect(secondDialog).toBeVisible();
    await expect(secondDialog.getByLabel(fields.legalName)).toHaveValue("E2E Second B.V.");

    await secondPage.reload();
    await expect(detail(secondPage, details.groups.main, details.legalName)).toHaveText(
      "E2E First B.V.",
    );
  } finally {
    await secondContext.close();
  }
});
