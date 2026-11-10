import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { generateFaqs } from "../lib/faq-ai.server";
import {
  ensureFaqDefinition,
  FAQ_KEY,
  FAQ_NAMESPACE,
  parseFaqs,
  saveFaqs,
} from "../lib/faq-metafield.server";
import {
  addUsage,
  getUsage,
  isTestBilling,
} from "../lib/plans.server";
import {
  FREE_MONTHLY_LIMIT,
  PRO_MONTHLY_LIMIT,
  PRO_PLAN,
} from "../lib/plans";

const PAGE_SIZE = 25;
const MAX_PER_RUN = 10;

const PRODUCT_FIELDS = `#graphql
  fragment ProductFields on Product {
    id
    title
    status
    descriptionHtml
    productType
    vendor
    tags
    featuredMedia { preview { image { url altText } } }
    faq: metafield(namespace: "${FAQ_NAMESPACE}", key: "${FAQ_KEY}") { value }
  }
`;

type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

type ProductRow = {
  id: string;
  title: string;
  status: string;
  image?: string;
  faqCount: number;
};

async function getLimit(billing: Billing) {
  const { hasActivePayment } = await billing.check({
    plans: [PRO_PLAN],
    isTest: isTestBilling,
  });
  return {
    isPro: hasActivePayment,
    limit: hasActivePayment ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  await ensureFaqDefinition(admin.graphql);

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const query = url.searchParams.get("q") || "";

  const res = await admin.graphql(
    `#graphql
    ${PRODUCT_FIELDS}
    query listProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query, sortKey: TITLE) {
        nodes { ...ProductFields }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { variables: { first: PAGE_SIZE, after, query: query || null } },
  );
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: ProductRow[] = json.data!.products.nodes.map((p: any) => ({
    id: p.id as string,
    title: p.title as string,
    status: p.status as string,
    image: p.featuredMedia?.preview?.image?.url as string | undefined,
    faqCount: parseFaqs(p.faq?.value).length,
  }));

  const { isPro, limit } = await getLimit(billing);
  const used = await getUsage(session.shop);

  return {
    products,
    pageInfo: json.data!.products.pageInfo,
    query,
    isPro,
    limit,
    used,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const ids = String(form.get("ids") || "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_PER_RUN);
  if (!ids.length) return { ok: false, error: "Select at least one product." };

  const { limit } = await getLimit(billing);
  const used = await getUsage(session.shop);
  const remaining = limit - used;
  if (remaining <= 0) {
    return {
      ok: false,
      error: "You reached this month's limit. Upgrade to keep generating.",
    };
  }
  const batch = ids.slice(0, remaining);

  const res = await admin.graphql(
    `#graphql
    ${PRODUCT_FIELDS}
    query getProducts($ids: [ID!]!) {
      nodes(ids: $ids) { ... on Product { ...ProductFields } }
    }`,
    { variables: { ids: batch } },
  );
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = (json.data!.nodes as any[]).filter(Boolean);

  const results = await Promise.allSettled(
    products.map(async (p) => {
      const faqs = await generateFaqs({
        title: p.title,
        description: p.descriptionHtml,
        productType: p.productType,
        vendor: p.vendor,
        tags: p.tags,
      });
      await saveFaqs(admin.graphql, p.id, faqs);
      return p.id as string;
    }),
  );

  const done = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - done;
  results.forEach((r) => {
    if (r.status === "rejected") console.error("FAQ generation failed", r.reason);
  });
  if (done) await addUsage(session.shop, done);

  return {
    ok: failed === 0,
    done,
    failed,
    skipped: ids.length - batch.length,
  };
};

export default function Index() {
  const { products, pageInfo, query, isPro, limit, used } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selected, setSelected] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(query);

  const isGenerating = fetcher.state !== "idle";

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if ("error" in data && data.error) {
      shopify.toast.show(data.error, { isError: true });
    } else if ("done" in data) {
      let msg = `FAQ generated for ${data.done} product(s)`;
      if (data.failed) msg += `, ${data.failed} failed`;
      if (data.skipped) msg += `, ${data.skipped} skipped (monthly limit)`;
      shopify.toast.show(msg, { isError: !data.done });
    }
  }, [fetcher.data, shopify]);

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, MAX_PER_RUN),
    );

  const generate = (ids: string[]) => {
    fetcher.submit({ ids: ids.join(",") }, { method: "POST" });
    setSelected([]);
  };

  return (
    <s-page heading="FAQify">
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!selected.length || isGenerating}
        {...(isGenerating ? { loading: true } : {})}
        onClick={() => generate(selected)}
      >
        Generate FAQ ({selected.length})
      </s-button>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text>
            AI generations this month: <strong>{used}</strong> / {limit}
          </s-text>
          {!isPro && (
            <s-link href="/app/billing">Upgrade to Pro for {PRO_MONTHLY_LIMIT}/month</s-link>
          )}
        </s-stack>
        <s-paragraph>
          Select up to {MAX_PER_RUN} products and click <strong>Generate FAQ</strong>.
          Then add the <strong>Product FAQ</strong> block to your product page in
          the theme editor (Online Store → Themes → Customize).
        </s-paragraph>
      </s-section>

      <s-section heading="Products">
        <s-stack direction="inline" gap="base">
          <s-search-field
            label="Search products"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search products"
            value={search}
            onInput={(e: Event) =>
              setSearch((e.currentTarget as HTMLInputElement).value)
            }
            onChange={() => setSearchParams(search ? { q: search } : {})}
          />
        </s-stack>

        <s-table>
          <s-table-header-row>
            <s-table-header></s-table-header>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>FAQ</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {products.map((p) => (
              <s-table-row key={p.id}>
                <s-table-cell>
                  <s-checkbox
                    accessibilityLabel={`Select ${p.title}`}
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    {p.image && (
                      <s-thumbnail src={p.image} alt={p.title} size="small" />
                    )}
                    <s-link href={`/app/products/${p.id.split("/").pop()}`}>
                      {p.title}
                    </s-link>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>{p.status.toLowerCase()}</s-table-cell>
                <s-table-cell>
                  {p.faqCount ? (
                    <s-badge tone="success">{p.faqCount} questions</s-badge>
                  ) : (
                    <s-badge>None</s-badge>
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-button
                    variant="tertiary"
                    disabled={isGenerating}
                    onClick={() => generate([p.id])}
                  >
                    {p.faqCount ? "Regenerate" : "Generate"}
                  </s-button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {!products.length && <s-paragraph>No products found.</s-paragraph>}

        <s-stack direction="inline" gap="base">
          {searchParams.get("after") && (
            <s-button onClick={() => setSearchParams(query ? { q: query } : {})}>
              First page
            </s-button>
          )}
          {pageInfo.hasNextPage && (
            <s-button
              onClick={() =>
                setSearchParams({
                  ...(query ? { q: query } : {}),
                  after: pageInfo.endCursor,
                })
              }
            >
              Next page
            </s-button>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
