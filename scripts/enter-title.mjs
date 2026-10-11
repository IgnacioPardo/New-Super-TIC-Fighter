// Follow the visible opening flow; room invites already arrive at the title menu.
export async function enterTitle(page) {
  await page.locator('.screen-intro, .screen-title').waitFor();
  const intro = page.getByTestId('intro-continue');
  if (await intro.isVisible()) await intro.click();
  await page.locator('.title-screen').waitFor();
}
