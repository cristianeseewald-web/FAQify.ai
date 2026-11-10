import Anthropic from "@anthropic-ai/sdk";

export type FaqItem = { question: string; answer: string };

export type ProductInput = {
  title: string;
  description: string;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[];
};

// Override with ANTHROPIC_MODEL (e.g. "claude-haiku-5-5" to cut cost per generation).
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const client = new Anthropic();

const SYSTEM_PROMPT = `You write product-page FAQs for Shopify stores selling to US shoppers.
Goal: answer the doubts that make shoppers hesitate or abandon their cart, so they buy with confidence.

Rules:
- Write in natural, friendly US English.
- Base every answer ONLY on the product information provided. Never invent specs, materials, certifications, shipping times, warranties or return policies.
- If a common question cannot be answered from the information, either skip it or answer with a safe, honest phrasing such as "Check the size chart above" or "Contact us and we'll be happy to help".
- Questions must be specific to this product (sizing, materials, use, care, compatibility, what's included...), not generic.
- Answers: 1-3 short sentences each.`;

const FAQ_SCHEMA = {
  type: "object",
  properties: {
    faqs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
        required: ["question", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["faqs"],
  additionalProperties: false,
} as const;

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateFaqs(
  product: ProductInput,
  count = 5,
): Promise<FaqItem[]> {
  const info = [
    `Title: ${product.title}`,
    product.vendor ? `Brand: ${product.vendor}` : "",
    product.productType ? `Type: ${product.productType}` : "",
    product.tags?.length ? `Tags: ${product.tags.join(", ")}` : "",
    `Description: ${stripHtml(product.description) || "(no description)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: FAQ_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write ${count} FAQs for this product.\n\n<product>\n${info}\n</product>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to generate FAQs for this product.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The AI response was cut off. Please try again.");
  }

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const parsed = JSON.parse(text) as { faqs: FaqItem[] };
  return parsed.faqs
    .filter((f) => f.question?.trim() && f.answer?.trim())
    .slice(0, count);
}
