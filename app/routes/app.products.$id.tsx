import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import type { FaqItem } from "../lib/faq-ai.server";
import {
  deleteFaqs,
  FAQ_KEY,
  FAQ_NAMESPACE,
  parseFaqs,
  saveFaqs,
} from "../lib/faq-metafield.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = `gid://shopify/Product/${params.id}`;
  const res = await admin.graphql(
    `#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        faq: metafield(namespace: "${FAQ_NAMESPACE}", key: "${FAQ_KEY}") { value }
      }
    }`,
    { variables: { id } },
  );
  const json = await res.json();
  const product = json.data?.product;
  if (!product) throw new Response("Product not found", { status: 404 });
  return {
    id: product.id as string,
    title: product.title as string,
    faqs: parseFaqs(product.faq?.value),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = `gid://shopify/Product/${params.id}`;
  const form = await request.formData();

  if (form.get("intent") === "delete") {
    await deleteFaqs(admin.graphql, id);
    return { ok: true, message: "FAQ removed" };
  }

  const faqs = (JSON.parse(String(form.get("faqs") || "[]")) as FaqItem[])
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer);
  await saveFaqs(admin.graphql, id, faqs);
  return { ok: true, message: "FAQ saved" };
};

export default function ProductFaq() {
  const { title, faqs: initial } = useLoaderData<typeof loader>();
  const [faqs, setFaqs] = useState<FaqItem[]>(initial);
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  const update = (i: number, field: keyof FaqItem, value: string) =>
    setFaqs((list) => list.map((f, j) => (j === i ? { ...f, [field]: value } : f)));

  const move = (i: number, dir: -1 | 1) =>
    setFaqs((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const saving = fetcher.state !== "idle";

  return (
    <s-page heading={`FAQ · ${title}`}>
      <s-link slot="breadcrumb-actions" href="/app">
        Products
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        {...(saving ? { loading: true } : {})}
        onClick={() =>
          fetcher.submit({ faqs: JSON.stringify(faqs) }, { method: "POST" })
        }
      >
        Save
      </s-button>
      <s-button
        slot="secondary-actions"
        tone="critical"
        onClick={() => fetcher.submit({ intent: "delete" }, { method: "POST" })}
      >
        Remove FAQ
      </s-button>

      {faqs.map((f, i) => (
        <s-section key={i} heading={`Question ${i + 1}`}>
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Question"
              value={f.question}
              onInput={(e: Event) =>
                update(i, "question", (e.currentTarget as HTMLInputElement).value)
              }
            />
            <s-text-area
              label="Answer"
              rows={3}
              value={f.answer}
              onInput={(e: Event) =>
                update(i, "answer", (e.currentTarget as HTMLTextAreaElement).value)
              }
            />
            <s-stack direction="inline" gap="small-200">
              <s-button variant="tertiary" onClick={() => move(i, -1)}>
                Move up
              </s-button>
              <s-button variant="tertiary" onClick={() => move(i, 1)}>
                Move down
              </s-button>
              <s-button
                variant="tertiary"
                tone="critical"
                onClick={() => setFaqs((l) => l.filter((_, j) => j !== i))}
              >
                Delete
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      ))}

      <s-section>
        <s-button
          onClick={() => setFaqs((l) => [...l, { question: "", answer: "" }])}
        >
          Add question
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
