import { displayTodayIso, formatDate } from "@/lib/format";

import {
  chooseRecord,
  expect,
  expectNoPageScroll,
  messages,
  signIn,
  test,
  text,
  uniqueTag,
  waitForHydration,
} from "./fixtures";

// The phone is where a contractor files a report (docs/ТЗ.md, 7.5): the form, the registry and the
// card of a report are checked on the 360 px profile alone.

const reports = messages.reports;

test("on a phone a contractor files a report that a colleague of the same organisation does not see", async ({
  page,
  browser,
  createUser,
  createContractor,
  createCustomer,
  createProject,
}) => {
  const organisation = await createContractor();
  const worker = await createUser({ role: "CONTRACTOR", contractorId: organisation.id });
  const colleague = await createUser({ role: "CONTRACTOR", contractorId: organisation.id });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  const tag = uniqueTag();
  const description = `E2E Stucwerk ${tag}`;

  await signIn(page, worker);
  await expect(page).toHaveURL("/");

  await page.goto("/reports/new");
  const workDate = page.getByLabel(reports.fields.workDate, { exact: true });
  await waitForHydration(workDate);
  await expectNoPageScroll(page);
  // A contractor files a report of their own, so the form offers no choice of worker.
  await expect(page.getByRole("combobox", { name: reports.fields.worker })).toHaveCount(0);

  await workDate.fill(displayTodayIso());
  await chooseRecord(
    page,
    reports.fields.project,
    reports.form.projectSearch,
    text(reports.form.projectOption, {
      number: project.number,
      name: project.name,
      city: "Amsterdam",
    }),
  );
  await page.getByLabel(reports.fields.workDescription, { exact: true }).fill(description);
  await page.getByLabel(reports.fields.startTime, { exact: true }).fill("08:00");
  await page.getByLabel(reports.fields.endTime, { exact: true }).fill("16:30");
  await page.getByLabel(reports.fields.lunchMinutes, { exact: true }).fill("30");
  await page.getByLabel(reports.fields.mileageKm, { exact: true }).fill("42");
  // The hours are counted while the times are typed: 16:30 − 08:00 − 30 min.
  await expect(page.getByLabel(reports.fields.worked)).toHaveText("8,00");
  await expectNoPageScroll(page);

  await page.getByRole("button", { name: messages.referenceBooks.form.create }).click();
  await expect(page.getByText(reports.toasts.created)).toBeVisible();
  await expect(page).toHaveURL("/reports");

  const row = page.getByRole("row").filter({ hasText: description });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: reports.statuses.UNAPPROVED })).toBeVisible();
  await expectNoPageScroll(page);

  await row.getByRole("link", { name: formatDate(Date.now()) }).click();
  await expect(page).toHaveURL(/\/reports\/c\w+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(reports.statuses.UNAPPROVED);
  await expect(page.getByText(description)).toBeVisible();
  await expectNoPageScroll(page);

  // Workers of one organisation see only their own reports (docs/ПРАВА-ДОСТУПА.md, rule 16).
  const colleagueContext = await browser.newContext();
  const colleaguePage = await colleagueContext.newPage();
  await signIn(colleaguePage, colleague);
  await expect(colleaguePage).toHaveURL("/");

  await colleaguePage.goto(`/reports?q=${tag}`);
  await expect(colleaguePage.getByText(reports.list.nothingFound)).toBeVisible();
  await expect(colleaguePage.getByText(description)).toHaveCount(0);
  await colleagueContext.close();
});
