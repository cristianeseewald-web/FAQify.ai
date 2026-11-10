import type { FaqItem } from "./faq-ai.server";

// The storefront app block reads product.metafields.faqify.items
export const FAQ_NAMESPACE = "faqify";
export const FAQ_KEY = "items";

type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

export async function ensureFaqDefinition(graphql: AdminGraphql) {
  const res = await graphql(
    `#graphql
    mutation createFaqDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id }
        userErrors { code message }
      }
    }`,
    {
      variables: {
        definition: {
          name: "Product FAQ (FAQify)",
          namespace: FAQ_NAMESPACE,
          key: FAQ_KEY,
          type: "json",
          ownerType: "PRODUCT",
          access: { storefront: "PUBLIC_READ" },
        },
      },
    },
  );
  const json = await res.json();
  const errors = json.data?.metafieldDefinitionCreate?.userErrors ?? [];
  // TAKEN = definition already exists, which is fine.
  const real = errors.filter((e: { code: string }) => e.code !== "TAKEN");
  if (real.length) console.error("metafieldDefinitionCreate", real);
}

export async function saveFaqs(
  graphql: AdminGraphql,
  productId: string,
  faqs: FaqItem[],
) {
  const res = await graphql(
    `#graphql
    mutation saveFaq($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: FAQ_NAMESPACE,
            key: FAQ_KEY,
            type: "json",
            value: JSON.stringify(faqs),
          },
        ],
      },
    },
  );
  const json = await res.json();
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) throw new Error(errors[0].message);
}

export async function deleteFaqs(graphql: AdminGraphql, productId: string) {
  await graphql(
    `#graphql
    mutation deleteFaq($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          { ownerId: productId, namespace: FAQ_NAMESPACE, key: FAQ_KEY },
        ],
      },
    },
  );
}

export function parseFaqs(value: string | null | undefined): FaqItem[] {
  if (!value) return [];
  try {
    const data = JSON.parse(value);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
