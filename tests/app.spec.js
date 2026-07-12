const { test, expect } = require("@playwright/test");
const fs = require("fs");
const {
  isoWeek, openApp, gotoTab, addMedicine, addPurchase, addSale, seedStandardData,
} = require("./helpers");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe("Grundläggande", () => {
  test("appen laddar med två vårdcentraler och fyra flikar", async ({ page }) => {
    await expect(page).toHaveTitle("Inventering – Vårdcentraler");
    await expect(page.locator("#center-seg button")).toHaveText(["Vårdcentral 1", "Vårdcentral 2"]);
    await expect(page.locator("#tabs button")).toHaveText(["Inköp", "Försäljning", "Resultat", "Mediciner"]);
  });

  test("inga emojis förekommer i gränssnittet", async ({ page }) => {
    for (const tab of ["inkop", "salj", "resultat", "mediciner"]) {
      await gotoTab(page, tab);
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  test("vårdcentral kan döpas om via prompt", async ({ page }) => {
    page.once("dialog", (d) => d.accept("VC Söder"));
    await page.click("#rename-btn");
    await expect(page.locator("#center-seg button").first()).toHaveText("VC Söder");
    await expect(page.locator("#hdr-center")).toHaveText("– VC Söder");
  });
});

test.describe("Mediciner", () => {
  test("medicin kan läggas till och dyker upp i inköps-/säljlistorna", async ({ page }) => {
    await addMedicine(page, { name: "Alvedon 500 mg", size: 20, pricePack: 100, priceUnit: 6 });
    await expect(page.locator("#m-rows tr")).toHaveCount(1);
    await gotoTab(page, "inkop");
    await expect(page.locator("#p-med option")).toHaveText(["Alvedon 500 mg"]);
    await gotoTab(page, "salj");
    await expect(page.locator("#s-med option")).toHaveText(["Alvedon 500 mg"]);
  });

  test("Enter i inmatningsraden lägger till medicinen", async ({ page }) => {
    await gotoTab(page, "mediciner");
    await page.fill("#m-name", "Enter-medicin");
    await page.press("#m-name", "Enter");
    await expect(page.locator("#m-rows tr")).toHaveCount(1);
    await expect(page.locator("#m-rows input[data-f='name']")).toHaveValue("Enter-medicin");
  });
});

test.describe("Inköp", () => {
  test("påfyllningar blir egna rader med veckonummer, styckberäkning och totalsumma", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    const rows = page.locator("#p-rows tr");
    await expect(rows).toHaveCount(2);
    // Sorterat nyast först: Ipren (2026-07-06) överst
    await expect(rows.nth(0)).toContainText("Ipren 200 mg");
    await expect(rows.nth(0)).toContainText(isoWeek("2026-07-06"));
    await expect(rows.nth(0)).toContainText("30"); // 3 förp * 10 st
    await expect(rows.nth(1)).toContainText("Alvedon 500 mg");
    await expect(rows.nth(1)).toContainText("40"); // 2 förp * 20 st
    await expect(page.locator("#p-foot")).toContainText("210,00 kr"); // 2*60 + 3*30
  });

  test("kopiera-knappen förifyller formuläret med dagens datum", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    await page.locator("#p-rows .cpy").first().click(); // Ipren-raden (nyast först)
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.locator("#p-date")).toHaveValue(today);
    await expect(page.locator("#p-qty")).toHaveValue("3");
    await expect(page.locator("#p-cost")).toHaveValue("30");
    await expect(page.locator("#p-med option:checked")).toHaveText("Ipren 200 mg");
  });

  test("rad kan tas bort efter bekräftelse", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    page.once("dialog", (d) => d.accept());
    await page.locator("#p-rows .del").first().click();
    await expect(page.locator("#p-rows tr")).toHaveCount(1);
  });

  test("sökfältet filtrerar rader och visar filtrerad summa", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    await page.fill("#p-search", "ipren");
    await expect(page.locator("#p-rows tr")).toHaveCount(1);
    await expect(page.locator("#p-count")).toHaveText("1 av 2 rader");
    await expect(page.locator("#p-foot")).toContainText("90,00 kr");
    await page.fill("#p-search", "");
    await expect(page.locator("#p-rows tr")).toHaveCount(2);
  });

  test("lagerchipen visar saldo för vald medicin", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    await page.selectOption("#p-med", { label: "Alvedon 500 mg" });
    await expect(page.locator("#p-stock")).toContainText("I lager: 13 st");
    await page.selectOption("#p-med", { label: "Ipren 200 mg" });
    await expect(page.locator("#p-stock")).toContainText("I lager: 30 st (3 förp.)");
  });
});

test.describe("Försäljning", () => {
  test.beforeEach(async ({ page }) => {
    await addMedicine(page, { name: "Alvedon 500 mg", size: 20, pricePack: 100, priceUnit: 6 });
    await addPurchase(page, { date: "2026-06-15", medicine: "Alvedon 500 mg", qty: 2, cost: 60 });
  });

  test("pris föreslås per typ: förpackning, enskild och donation", async ({ page }) => {
    await gotoTab(page, "salj");
    await page.selectOption("#s-med", { label: "Alvedon 500 mg" });
    await page.selectOption("#s-type", "forp");
    await expect(page.locator("#s-price")).toHaveValue("100");
    await page.selectOption("#s-type", "st");
    await expect(page.locator("#s-price")).toHaveValue("6");
    await page.selectOption("#s-type", "don_st");
    await expect(page.locator("#s-price")).toHaveValue("0");
    await expect(page.locator("#s-price")).toBeDisabled();
  });

  test("försäljningar och donationer summeras korrekt", async ({ page }) => {
    await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "forp", qty: 1 });
    await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "st", qty: 5 });
    await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "don_st", qty: 2 });
    await expect(page.locator("#s-rows tr")).toHaveCount(3);
    await expect(page.locator("#s-foot")).toContainText("130,00 kr"); // 100 + 30 + 0
    await expect(page.locator("#s-rows .pill.don")).toHaveCount(1);
  });

  test("varning visas när lagersaldot blir negativt", async ({ page }) => {
    await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "forp", qty: 5 }); // 100 st > 40 i lager
    await expect(page.locator("#toast")).toContainText("negativt");
  });
});

test.describe("Resultat", () => {
  test.beforeEach(async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "resultat");
  });

  test("lager, vinst och donerat värde räknas rätt per medicin", async ({ page }) => {
    const alvedon = page.locator("#r-rows tr", { hasText: "Alvedon" });
    await expect(alvedon).toContainText("40");             // inköpt st
    await expect(alvedon).toContainText("25");             // sålt st
    await expect(alvedon).toContainText("13 st");          // kvar
    await expect(alvedon).toContainText("130,00 kr");      // försäljning
    await expect(alvedon).toContainText("55,00 kr");       // vinst = 130 - 25*3
    await expect(alvedon).toContainText("6,00 kr");        // donerat värde = 2*3
    const ipren = page.locator("#r-rows tr", { hasText: "Ipren" });
    await expect(ipren).toContainText("30 st (3 förp.)");
    await expect(page.locator("#r-foot")).toContainText("55,00 kr");
  });

  test("nyckeltalen stämmer, inklusive lagervärde och lågt lager", async ({ page }) => {
    const kpis = page.locator(".kpi");
    await expect(kpis.filter({ hasText: "Försäljning" })).toContainText("130,00 kr");
    await expect(kpis.filter({ hasText: "Inköpskostnad" })).toContainText("210,00 kr");
    await expect(kpis.filter({ hasText: "Vinst" })).toContainText("55,00 kr");
    await expect(kpis.filter({ hasText: "Donerat värde" })).toContainText("6,00 kr");
    await expect(kpis.filter({ hasText: "Lagervärde" })).toContainText("129,00 kr"); // 13*3 + 30*3
    await expect(kpis.filter({ hasText: "Lågt lager" })).toContainText("1 st"); // Alvedon 13 <= varna vid 15
  });

  test("periodfiltret avgränsar flöden men lagersaldot visar alltid totalen", async ({ page }) => {
    await expect(page.locator("#r-period option")).toHaveText(["Hela tiden", "juli 2026", "juni 2026"]);
    await page.selectOption("#r-period", "2026-07");
    const alvedon = page.locator("#r-rows tr", { hasText: "Alvedon" });
    await expect(alvedon.locator("td").nth(1)).toHaveText("0");   // inget Alvedon-inköp i juli
    await expect(alvedon).toContainText("13 st");                  // kvar = totalen ändå
    await expect(alvedon).toContainText("130,00 kr");              // julis försäljning
    const kpis = page.locator(".kpi");
    await expect(kpis.filter({ hasText: "Inköpskostnad" })).toContainText("90,00 kr"); // bara Ipren i juli
    await page.selectOption("#r-period", "2026-06");
    await expect(kpis.filter({ hasText: "Försäljning" })).toContainText("0,00 kr");    // inget såldes i juni
  });
});

test.describe("Vårdcentraler & lagring", () => {
  test("vårdcentralerna är helt separata", async ({ page }) => {
    await seedStandardData(page);
    await page.locator("#center-seg button").nth(1).click();
    await gotoTab(page, "mediciner");
    await expect(page.locator("#m-rows .empty")).toBeVisible();
    await page.locator("#center-seg button").nth(0).click();
    await expect(page.locator("#m-rows tr")).toHaveCount(2);
  });

  test("data överlever omladdning av sidan", async ({ page }) => {
    await seedStandardData(page);
    await page.reload();
    await gotoTab(page, "inkop");
    await expect(page.locator("#p-rows tr")).toHaveCount(2);
    await expect(page.locator("#p-foot")).toContainText("210,00 kr");
  });

  test("spara till fil laddar ned komplett JSON-backup", async ({ page }) => {
    await seedStandardData(page);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; }); // tvinga nedladdningsvägen
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("#btn-save-file"),
    ]);
    expect(download.suggestedFilename()).toBe("inventering-data.json");
    const data = JSON.parse(fs.readFileSync(await download.path(), "utf-8"));
    expect(data.centers).toHaveLength(2);
    expect(data.centers[0].medicines).toHaveLength(2);
    expect(data.centers[0].purchases).toHaveLength(2);
    expect(data.centers[0].sales).toHaveLength(3);
  });
});

test.describe("Excel-export (CSV)", () => {
  test("inköpsexporten har BOM, semikolon och svenska decimaler", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "inkop");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("#btn-csv"),
    ]);
    expect(download.suggestedFilename()).toMatch(/inkop.*\.csv$/);
    const csv = fs.readFileSync(await download.path(), "utf-8");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM för svensk Excel
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Datum;Vecka;Medicin;Antal förp;Styck totalt;Pris per förp (kr);Totalt (kr)");
    expect(lines).toHaveLength(3); // rubrik + 2 inköp
    expect(lines[1]).toContain("Alvedon 500 mg;2;40;60;120");
  });

  test("resultatexporten följer vald period", async ({ page }) => {
    await seedStandardData(page);
    await gotoTab(page, "resultat");
    await page.selectOption("#r-period", "2026-07");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("#btn-csv"),
    ]);
    expect(download.suggestedFilename()).toContain("juli 2026");
    const csv = fs.readFileSync(await download.path(), "utf-8");
    const alvedon = csv.split("\r\n").find((l) => l.startsWith("Alvedon"));
    // Inköpt 0 i juli, sålt 25, donerat 2, kvar 13 (total), vinst 55
    expect(alvedon).toContain(";0;25;2;13;0;130;6;55;39");
  });
});
