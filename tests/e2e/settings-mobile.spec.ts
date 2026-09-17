import { expect, messages, openCompanyDialog, signIn, test } from "./fixtures";

const { dialog: dialogTexts } = messages.settings.company;

test("on a phone the settings page fits the screen and the dialog takes all of it", async ({
  page,
  createUser,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  const dialog = await openCompanyDialog(page);
  const viewport = page.viewportSize()!;
  expect(viewport.width).toBe(360);
  // The dialog opens with a zoom-in animation: measure once it has settled.
  await expect
    .poll(() => dialog.boundingBox())
    .toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  for (const name of [dialogTexts.save, dialogTexts.cancel]) {
    await expect(dialog.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
  }

  await dialog.getByRole("button", { name: dialogTexts.close }).click();
  await expect(dialog).toBeHidden();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
