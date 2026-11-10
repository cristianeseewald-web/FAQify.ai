import db from "../db.server";


// Charges are test charges unless SHOPIFY_BILLING_TEST=false (set it in production).
export const isTestBilling = process.env.SHOPIFY_BILLING_TEST !== "false";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export async function getUsage(shop: string) {
  const row = await db.usage.findUnique({
    where: { shop_period: { shop, period: currentPeriod() } },
  });
  return row?.generations ?? 0;
}

export async function addUsage(shop: string, amount: number) {
  const period = currentPeriod();
  await db.usage.upsert({
    where: { shop_period: { shop, period } },
    create: { shop, period, generations: amount },
    update: { generations: { increment: amount } },
  });
}

export async function deleteShopData(shop: string) {
  await db.usage.deleteMany({ where: { shop } });
}
