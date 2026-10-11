// Follow the visible opening flow; room invites already arrive at the title menu.
export async function enterTitle(page) {
  await page.locator('.screen-intro, .screen-title').waitFor();
  const intro = page.getByTestId('intro-continue');
  if (await intro.isVisible()) await intro.click();
  await page.locator('.title-screen').waitFor();
}

// Use the visible game hierarchy; no hidden shortcuts or navigation state injection.
export async function chooseMode(page, mode) {
  if (['online', 'public', 'tournaments'].includes(mode)) {
    if (!(await page.getByTestId(`mode-${mode}`).isVisible())) {
      if (!(await page.getByTestId('mode-online-hub').isVisible())) await page.locator('.brand-button').click();
      await page.getByTestId('mode-online-hub').click();
    }
  } else if (mode === 'practice') {
    if (!(await page.getByRole('button', {name:/LAB.*(Training|Entrenamiento)/}).isVisible())) {
      if (!(await page.getByTestId('mode-solo').isVisible())) await page.locator('.brand-button').click();
      await page.getByTestId('mode-solo').click();
    }
    await page.getByRole('button', {name:/LAB.*(Training|Entrenamiento)/}).click();
    return;
  }
  await page.getByTestId(`mode-${mode}`).click();
}
