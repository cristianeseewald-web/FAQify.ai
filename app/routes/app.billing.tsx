import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getUsage,
  isTestBilling,
} from "../lib/plans.server";
import {
  FREE_MONTHLY_LIMIT,
  PRO_MONTHLY_LIMIT,
  PRO_PLAN,
  PRO_PRICE_USD,
} from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [PRO_PLAN],
    isTest: isTestBilling,
  });
  return {
    isPro: hasActivePayment,
    subscriptionId: appSubscriptions[0]?.id ?? null,
    used: await getUsage(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();

  if (form.get("intent") === "cancel") {
    await billing.cancel({
      subscriptionId: String(form.get("subscriptionId")),
      isTest: isTestBilling,
      prorate: true,
    });
    return null;
  }

  const storeHandle = session.shop.replace(".myshopify.com", "");
  // Redirects the merchant to Shopify's approval page.
  return billing.request({
    plan: PRO_PLAN,
    isTest: isTestBilling,
    returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${process.env.SHOPIFY_API_KEY}/app`,
  });
};

export default function Billing() {
  const { isPro, subscriptionId, used } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Plan & billing">
      <s-section heading={isPro ? "You're on Pro" : "You're on Free"}>
        <s-paragraph>
          Used this month: {used} / {isPro ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT}{" "}
          AI generations.
        </s-paragraph>
      </s-section>

      <s-section heading="Free">
        <s-unordered-list>
          <s-list-item>{FREE_MONTHLY_LIMIT} AI FAQ generations per month</s-list-item>
          <s-list-item>Storefront FAQ block with SEO schema</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading={`Pro: $${PRO_PRICE_USD}/month · 7-day free trial`}>
        <s-unordered-list>
          <s-list-item>{PRO_MONTHLY_LIMIT} AI FAQ generations per month</s-list-item>
          <s-list-item>Bulk generation</s-list-item>
          <s-list-item>Priority support</s-list-item>
        </s-unordered-list>
        <Form method="post">
          {isPro ? (
            <>
              <input type="hidden" name="intent" value="cancel" />
              <input type="hidden" name="subscriptionId" value={subscriptionId ?? ""} />
              <s-button type="submit" tone="critical">
                Cancel Pro
              </s-button>
            </>
          ) : (
            <s-button type="submit" variant="primary">
              Start free trial
            </s-button>
          )}
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
