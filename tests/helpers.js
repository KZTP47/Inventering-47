// Delade hjälpfunktioner för testerna.

// Samma ISO-veckoberäkning som appen använder – hålls i synk med index.html.
function isoWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return "v" + Math.ceil(((t - yStart) / 86400000 + 1) / 7);
}

async function openApp(page) {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.removeItem("inventering-vc-v1"));
  await page.reload();
  await page.waitForSelector("#tabs");
}

async function gotoTab(page, tab) {
  await page.click(`#tabs button[data-tab="${tab}"]`);
}

async function addMedicine(page, { name, size = 1, pricePack = 0, priceUnit = 0, warn = 0 }) {
  await gotoTab(page, "mediciner");
  await page.fill("#m-name", name);
  await page.fill("#m-size", String(size));
  await page.fill("#m-ppack", String(pricePack));
  await page.fill("#m-punit", String(priceUnit));
  await page.fill("#m-warn", String(warn));
  await page.click("#m-add");
}

async function addPurchase(page, { date, medicine, qty, cost }) {
  await gotoTab(page, "inkop");
  await page.fill("#p-date", date);
  await page.selectOption("#p-med", { label: medicine });
  await page.fill("#p-qty", String(qty));
  await page.fill("#p-cost", String(cost));
  await page.click("#p-add");
}

async function addSale(page, { date, medicine, type, qty, price }) {
  await gotoTab(page, "salj");
  await page.fill("#s-date", date);
  await page.selectOption("#s-med", { label: medicine });
  await page.selectOption("#s-type", type);
  await page.fill("#s-qty", String(qty));
  if (price !== undefined) await page.fill("#s-price", String(price));
  await page.click("#s-add");
}

// Standardscenariot som all resultatmatematik verifieras mot:
//   Alvedon: 20 st/förp, 100 kr/förp, 6 kr/st, varna vid 15.
//     Köpt 2 förp à 60 kr i juni = 40 st för 120 kr (3 kr/st).
//     Sålt i juli: 1 förp à 100 + 5 st à 6 = 130 kr (25 st). Donerat 2 st.
//     Kvar 13 st. Vinst = 130 - 25*3 = 55 kr. Donerat värde 6 kr. Lagervärde 39 kr.
//   Ipren: 10 st/förp. Köpt 3 förp à 30 kr i juli = 30 st för 90 kr. Lagervärde 90 kr.
async function seedStandardData(page) {
  await addMedicine(page, { name: "Alvedon 500 mg", size: 20, pricePack: 100, priceUnit: 6, warn: 15 });
  await addMedicine(page, { name: "Ipren 200 mg", size: 10, pricePack: 50, priceUnit: 7 });
  await addPurchase(page, { date: "2026-06-15", medicine: "Alvedon 500 mg", qty: 2, cost: 60 });
  await addPurchase(page, { date: "2026-07-06", medicine: "Ipren 200 mg", qty: 3, cost: 30 });
  await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "forp", qty: 1 });
  await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "st", qty: 5 });
  await addSale(page, { date: "2026-07-10", medicine: "Alvedon 500 mg", type: "don_st", qty: 2 });
}

module.exports = { isoWeek, openApp, gotoTab, addMedicine, addPurchase, addSale, seedStandardData };
