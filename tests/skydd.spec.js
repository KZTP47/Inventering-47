const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// --host-resolver-rules pekar kenny.github.io på testservern, och https-porten
// (självsignerat cert) ger secure context med crypto.subtle precis som
// riktiga https-GitHub Pages.
const FAKE_HOST = "kenny.github.io";
const PORT = 8613;
const HTTPS_PORT = 8614;
const APP_PATH = path.join(__dirname, "..", "index.html");
const TMP = path.join(__dirname, ".tmp");

async function openTool(page) {
  await page.goto("/verktyg/bygg-skyddad.html");
}

// Bygger en skyddad fil via verktygets riktiga UI och sparar den under tests/.tmp/
async function buildProtected(page, outDir, configure) {
  await openTool(page);
  await page.setInputFiles("#file", APP_PATH);
  await configure(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#go"),
  ]);
  expect(download.suggestedFilename()).toBe("index.html");
  const dir = path.join(TMP, outDir);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "index.html");
  await download.saveAs(outPath);
  await expect(page.locator("#status")).toHaveClass("ok");
  return fs.readFileSync(outPath, "utf-8");
}

test.describe("Verktygets validering", () => {
  test("kräver att en fil väljs", async ({ page }) => {
    await openTool(page);
    await page.fill("#domains", FAKE_HOST);
    await page.click("#go");
    await expect(page.locator("#status")).toContainText("Välj en HTML-fil");
  });

  test("vägrar bygga med localhost i domänlistan", async ({ page }) => {
    await openTool(page);
    await page.setInputFiles("#file", APP_PATH);
    await page.fill("#domains", `${FAKE_HOST}, localhost`);
    await page.click("#go");
    await expect(page.locator("#status")).toContainText("localhost");
  });

  test("lösenordsläget kräver minst 8 tecken och matchande lösenord", async ({ page }) => {
    await openTool(page);
    await page.setInputFiles("#file", APP_PATH);
    await page.check('input[value="password"]');
    await page.fill("#pw", "kort");
    await page.click("#go");
    await expect(page.locator("#status")).toContainText("minst 8 tecken");
    await page.fill("#pw", "korrekt-losen");
    await page.fill("#pw2", "annat-losen");
    await page.click("#go");
    await expect(page.locator("#status")).toContainText("matchar inte");
  });
});

test.describe("Domänlåst version", () => {
  test("byggd fil läcker varken kod, data eller domännamn", async ({ page }) => {
    const built = await buildProtected(page, "domain", async (p) => {
      // Klistrar medvetet in hela URL:en – verktyget ska normalisera till hostname
      await p.fill("#domains", `https://${FAKE_HOST}/inventering/`);
    });
    expect(built).not.toContain("Medicinregister");   // ingen klartext-app
    expect(built).not.toContain("localStorage");       // ingen appkod
    expect(built).not.toContain(FAKE_HOST);            // inte ens domänen i klartext
    expect(built).toContain("Alla rättigheter förbehållna");
  });

  test("appen startar automatiskt på rätt domän", async ({ page }) => {
    await buildProtected(page, "domain", async (p) => {
      await p.fill("#domains", FAKE_HOST);
    });
    await page.goto(`https://${FAKE_HOST}:${HTTPS_PORT}/tests/.tmp/domain/index.html`);
    await page.waitForSelector("#tabs");
    await expect(page).toHaveTitle("Inventering – Vårdcentraler");
    await expect(page.locator("#center-seg button")).toHaveCount(2);
    // Appen är fullt funktionell: lägg till en medicin
    await page.click('#tabs button[data-tab="mediciner"]');
    await page.fill("#m-name", "Testmedicin");
    await page.click("#m-add");
    await expect(page.locator("#m-rows tr")).toHaveCount(1);
  });

  test("kopior på fel domän vägrar starta", async ({ page }) => {
    await buildProtected(page, "domain", async (p) => {
      await p.fill("#domains", FAKE_HOST);
    });
    await page.goto(`http://localhost:${PORT}/tests/.tmp/domain/index.html`);
    await expect(page.locator("#msg")).toContainText("låst till sin ursprungliga webbadress");
    await expect(page.locator("#tabs")).toHaveCount(0);
  });
});

test.describe("Lösenordsskyddad version", () => {
  const PW = "hemligt-losen-123";

  test.beforeEach(async ({ page }) => {
    await buildProtected(page, "pw", async (p) => {
      await p.check('input[value="password"]');
      await p.fill("#pw", PW);
      await p.fill("#pw2", PW);
    });
    await page.goto(`/tests/.tmp/pw/index.html`);
  });

  test("fel lösenord ger felmeddelande utan att öppna appen", async ({ page }) => {
    await page.fill("#pw", "fel-losenord");
    await page.click("#go");
    await expect(page.locator("#err")).toHaveText("Fel lösenord – försök igen.");
    await expect(page.locator("#tabs")).toHaveCount(0);
  });

  test("rätt lösenord öppnar appen (även via Enter)", async ({ page }) => {
    await page.fill("#pw", PW);
    await page.press("#pw", "Enter");
    await page.waitForSelector("#tabs");
    await expect(page).toHaveTitle("Inventering – Vårdcentraler");
  });
});
