import type { Page } from "@playwright/test";

import { formatMoney } from "@/lib/format";

import {
  chooseRecord,
  expect,
  messages,
  signIn,
  suggestedNumberTest,
  test,
  text,
  uniqueTag,
  waitForHydration,
} from "./fixtures";

const projects = messages.projects;
const form = messages.referenceBooks.form;

/** The value of a "name — value" row of a card. */
function detail(page: Page, label: string) {
  return page
    .locator("dt")
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::dd[1]");
}

async function chooseOption(page: Page, field: string, option: string) {
  await page.getByRole("combobox", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

suggestedNumberTest(
  "a manager creates a company customer and a project for it with the suggested number and a budget",
  async ({ page, createUser }) => {
    const manager = await createUser({ role: "MANAGER" });
    const tag = uniqueTag();
    const customerName = `E2E Bouw ${tag} B.V.`;
    const projectName = `E2E Renovatie ${tag}`;
    await signIn(page, manager);
    await expect(page).toHaveURL("/");

    await page.goto("/customers/new");
    const nameField = page.getByLabel(messages.customers.fields.name, { exact: true });
    await waitForHydration(nameField);
    await expect(page.getByRole("combobox", { name: messages.customers.fields.type })).toHaveText(
      messages.customers.types.COMPANY,
    );
    await nameField.fill(customerName);
    await page.getByRole("button", { name: form.create, exact: true }).click();
    await expect(page.getByRole("heading", { name: customerName })).toBeVisible();

    await page.goto("/projects/new");
    const numberField = page.getByLabel(projects.fields.number, { exact: true });
    await waitForHydration(numberField);
    const number = await numberField.inputValue();
    expect(number).toMatch(/^\d{4}-\d{3,}$/);

    await page.getByLabel(projects.fields.name, { exact: true }).fill(projectName);
    await chooseRecord(page, projects.fields.customer, projects.form.customerSearch, customerName);
    await page.getByLabel(projects.fields.startDate, { exact: true }).fill("2026-09-01");
    await page.getByLabel(messages.address.street, { exact: true }).fill("Damrak");
    await page.getByLabel(messages.address.houseNumber, { exact: true }).fill("1");
    await page.getByLabel(messages.address.postcode, { exact: true }).fill("1012 LG");
    await page.getByLabel(messages.address.city, { exact: true }).fill("Amsterdam");
    await page.getByLabel(projects.fields.budgetAmount, { exact: true }).fill("10000");
    await chooseOption(page, projects.fields.vatRate, projects.vatRates.STANDARD_21);
    await page.getByRole("button", { name: form.create, exact: true }).click();

    await expect(
      page.getByRole("heading", { name: text(projects.card.title, { number }) }),
    ).toBeVisible();
    await expect(detail(page, projects.fields.customer)).toHaveText(customerName);
    await expect(detail(page, projects.fields.budgetWithVat)).toHaveText(formatMoney("12100.00"));

    await page.goto(`/projects?q=${encodeURIComponent(tag)}`);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: number }) });
    await expect(row).toContainText(projectName);
    await expect(row).toContainText(customerName);
  },
);

test("a closed project is not edited until a manager brings it back to work", async ({
  page,
  createUser,
  createCustomer,
  createProject,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/projects/${project.id}`);
  const editLink = page.getByRole("link", { name: projects.actions.edit });
  const close = page.getByRole("button", { name: projects.actions.close, exact: true });
  await waitForHydration(close);
  await expect(editLink).toBeVisible();

  await close.click();
  const closeDialog = page.getByRole("dialog", {
    name: text(projects.dialogs.close.title, { number: project.number }),
  });
  await closeDialog.getByRole("button", { name: projects.dialogs.close.confirm }).click();
  const reopen = page.getByRole("button", { name: projects.actions.reopen, exact: true });
  await expect(reopen).toBeVisible();
  await expect(editLink).toHaveCount(0);

  await page.goto(`/projects/${project.id}/edit`);
  await expect(page.getByText(projects.form.closedMessage)).toBeVisible();
  await expect(page.getByLabel(projects.fields.number, { exact: true })).toHaveCount(0);

  await page.goto(`/projects/${project.id}`);
  await waitForHydration(reopen);
  await reopen.click();
  const reopenDialog = page.getByRole("dialog", {
    name: text(projects.dialogs.reopen.title, { number: project.number }),
  });
  await reopenDialog.getByRole("button", { name: projects.dialogs.reopen.confirm }).click();
  await expect(editLink).toBeVisible();

  await editLink.click();
  await expect(page.getByLabel(projects.fields.number, { exact: true })).toHaveValue(
    project.number,
  );
});

test("an employee sees a project without its budget and without buttons to edit or export", async ({
  page,
  createUser,
  createCustomer,
  createProject,
}) => {
  const employee = await createUser({ role: "EMPLOYEE" });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id, budgetAmount: "25000.00" });
  await signIn(page, employee);
  await expect(page).toHaveURL("/");

  await page.goto(`/projects?q=${project.number}`);
  await expect(page.getByRole("link", { name: project.number })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: projects.columns.customer })).toBeVisible();
  for (const column of [projects.columns.budgetAmount, projects.columns.budgetWithVat]) {
    await expect(page.getByRole("columnheader", { name: column })).toHaveCount(0);
  }
  for (const name of [messages.export.xlsx, messages.export.pdf, messages.export.print]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: projects.list.create })).toHaveCount(0);

  await page.goto(`/projects/${project.id}`);
  await expect(detail(page, projects.fields.customer)).toHaveText(customer.name);
  for (const field of [
    projects.fields.budgetAmount,
    projects.fields.vatRate,
    projects.fields.budgetWithVat,
    projects.fields.budgetHours,
  ]) {
    await expect(page.locator("dt").getByText(field, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: projects.actions.edit })).toHaveCount(0);
  for (const name of [projects.actions.close, projects.actions.delete]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
});

test("a contractor sees only projects in progress and no customers", async ({
  page,
  createUser,
  createCustomer,
  createProject,
}) => {
  const contractor = await createUser({ role: "CONTRACTOR" });
  const customer = await createCustomer();
  const tag = uniqueTag();
  const inProgress = await createProject({ customerId: customer.id, name: `E2E Open ${tag}` });
  const closed = await createProject({
    customerId: customer.id,
    name: `E2E Closed ${tag}`,
    status: "CLOSED",
  });
  await signIn(page, contractor);
  await expect(page).toHaveURL("/");

  await page.goto(`/projects?q=${tag}`);
  await expect(page.getByRole("link", { name: inProgress.number })).toBeVisible();
  await expect(page.getByRole("link", { name: closed.number })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: projects.columns.customer })).toHaveCount(0);

  await page.goto(`/projects/${inProgress.id}`);
  await expect(detail(page, projects.fields.name)).toHaveText(inProgress.name);

  await page.goto(`/projects/${closed.id}`);
  await expect(page.getByRole("heading", { name: messages.errors.notFound.title })).toBeVisible();
  await expect(page.getByText(closed.name)).toHaveCount(0);

  await page.goto("/customers");
  await expect(page).toHaveURL("/forbidden");
  await expect(page.getByRole("heading", { name: messages.errors.forbidden.title })).toBeVisible();
});

test("a customer in the archive is not offered in the form of a new project", async ({
  page,
  createUser,
  createCustomer,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const tag = uniqueTag();
  const active = await createCustomer({ name: `E2E Actief ${tag}` });
  const archived = await createCustomer({ name: `E2E Archief ${tag}`, isActive: false });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto("/projects/new");
  const picker = page.getByRole("combobox", { name: projects.fields.customer, exact: true });
  await waitForHydration(picker);
  await picker.click();
  const search = page.getByRole("searchbox", { name: projects.form.customerSearch });

  await search.fill(tag);
  await expect(page.getByRole("option", { name: active.name, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(archived.name) })).toHaveCount(0);

  await search.fill(archived.name);
  await expect(page.getByText(projects.form.customerNothingFound)).toBeVisible();
});

test("an administrator links a contractor account to its organisation", async ({
  page,
  createUser,
  createContractor,
}) => {
  const admin = await createUser({ role: "ADMIN" });
  const account = await createUser({ role: "CONTRACTOR" });
  const organisation = await createContractor();
  await signIn(page, admin);
  await expect(page).toHaveURL("/");

  await page.goto(`/users/${account.id}/edit`);
  await chooseRecord(
    page,
    messages.users.fields.contractor,
    messages.users.form.contractorSearch,
    organisation.name,
  );
  await page.getByRole("button", { name: messages.users.form.save, exact: true }).click();
  await expect(page).toHaveURL(`/users/${account.id}`);

  await page.goto(`/contractors/${organisation.id}`);
  const accounts = page.getByRole("tab", { name: messages.contractors.card.tabs.accounts });
  await waitForHydration(accounts);
  await accounts.click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: account.login }) });
  await expect(row).toContainText(account.fullName);
});
