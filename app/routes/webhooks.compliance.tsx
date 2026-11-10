import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteShopData } from "../lib/plans.server";

// Mandatory GDPR/privacy webhooks for App Store apps.
// Smart FAQ stores no customer data, so customer requests need no action.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  if (topic === "SHOP_REDACT") {
    await deleteShopData(shop);
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
