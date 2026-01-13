/**
 * Groq API client (OpenAI-compatible) with:
 * - Model fallbacks (GROQ_MODEL_FALLBACKS)
 * - Decommissioned-model auto-skip
 * - Prompt-size guard (TPM/request-too-large mitigation)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Defaults that are known to exist on Groq Cloud today (check your console if needed)
const DEFAULT_FALLBACKS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

// Rough token estimate: 1 token ~= 4 chars (good enough for guarding)
function estimateTokens(text: string) {
  return Math.ceil((text?.length ?? 0) / 4);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type GroqOptions = {
  temperature?: number;
  maxTokens?: number; // output tokens
  jsonMode?: boolean;
  // Hard caps to avoid TPM/request-too-large
  maxInputTokens?: number; // input token budget (approx)
  maxTotalTokens?: number; // input+output cap (approx)
};

function parseModelFallbacks(): string[] {
  const envSingle = (process.env.GROQ_MODEL || "").trim();
  const envFallbacks = (process.env.GROQ_MODEL_FALLBACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Priority:
  // 1) GROQ_MODEL (if set) first
  // 2) GROQ_MODEL_FALLBACKS (if set)
  // 3) defaults
  const out: string[] = [];
  if (envSingle) out.push(envSingle);
  for (const m of envFallbacks) out.push(m);
  for (const m of DEFAULT_FALLBACKS) out.push(m);

  // de-dupe preserving order
  return Array.from(new Set(out));
}

function isDecommissionedModelError(errorText: string) {
  return (
    errorText.includes("model_decommissioned") ||
    errorText.toLowerCase().includes("decommissioned") ||
    errorText.toLowerCase().includes("no longer supported")
  );
}

function isTokensOrTooLargeError(status: number, errorText: string) {
  // Groq sometimes returns 400 with token/rate messages; sometimes 429.
  return (
    status === 429 ||
    errorText.toLowerCase().includes("request too large") ||
    errorText.toLowerCase().includes("tokens per minute") ||
    errorText.toLowerCase().includes("rate_limit_exceeded") ||
    errorText.toLowerCase().includes("tpm")
  );
}

function isPayloadTooLargeError(status: number, errorText: string) {
  return (
    status === 413 ||
    errorText.toLowerCase().includes("payload too large") ||
    errorText.toLowerCase().includes("request entity too large")
  );
}

function truncateToTokenBudget(text: string, budgetTokens: number) {
  if (!text) return text;
  const est = estimateTokens(text);
  if (est <= budgetTokens) return text;

  // Convert token budget back to char budget (approx) and truncate
  const charBudget = Math.max(500, budgetTokens * 4);
  const truncated = text.slice(0, charBudget);

  return truncated + "\n\n[TRUNCATED to fit token budget]";
}

/**
 * Call Groq API with system and user prompts
 */
export async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  options: GroqOptions = {}
): Promise<{ text: string; modelUsed: string }> {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured. Add it to .env.local and restart."
    );
  }

  const models = parseModelFallbacks();

  // Conservative defaults to avoid TPM spikes
  const maxInputTokens = options.maxInputTokens ?? 4000; // approx input budget (reduced for cron stability)
  const maxTotalTokens = options.maxTotalTokens ?? 5500; // approx input+output (reduced for cron stability)
  const requestedMaxOut = options.maxTokens ?? 1200; // SAFE DEFAULT: prevent truncation
  const temperature = options.temperature ?? 0.2;

  let lastErr: any = null;

  for (const model of models) {
    // Guard input size BEFORE sending
    let sys = systemPrompt ?? "";
    let usr = userPrompt ?? "";

    // First, truncate user prompt to fit budget (system is usually smaller but keep it too)
    const combined = sys + "\n\n" + usr;
    const combinedTokens = estimateTokens(combined);

    if (combinedTokens > maxInputTokens) {
      // Prefer truncating USER heavily, preserve SYSTEM
      const allowedForUser = Math.max(800, maxInputTokens - estimateTokens(sys) - 50);
      usr = truncateToTokenBudget(usr, allowedForUser);
    }

    // Also cap output tokens so total stays under maxTotalTokens
    const inputNow = estimateTokens(sys + "\n\n" + usr);
    const maxOut = Math.max(
      300,
      Math.min(requestedMaxOut, maxTotalTokens - inputNow)
    );

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const messages: Array<{ role: "system" | "user"; content: string }> = [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ];

        const body: any = {
          model,
          messages,
          temperature,
          max_tokens: maxOut,
        };

        if (options.jsonMode) {
          body.response_format = { type: "json_object" };
        }

        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // If model is decommissioned, immediately move to next model
          if (isDecommissionedModelError(errorText)) {
            lastErr = new Error(
              `Groq model decommissioned: ${model}\n${errorText}`
            );
            break; // break retry loop, try next model
          }

          // CRITICAL: If payload is too large (413), surface clear message - DO NOT RETRY
          if (isPayloadTooLargeError(response.status, errorText)) {
            throw new Error(
              `[Groq] Request payload too large (413) for model ${model}.\n` +
              `Estimated input tokens: ${inputNow}. Max allowed: ~${maxInputTokens}.\n` +
              `ACTION REQUIRED: Reduce prompt size in briefing-generator.ts (fewer assets, shorter snippets).\n` +
              `Response: ${errorText}`
            );
          }

          // Retry on rate-limit / too-large / server errors
          if (
            (response.status === 429 || response.status >= 500 || isTokensOrTooLargeError(response.status, errorText)) &&
            attempt < maxRetries
          ) {
            const waitMs = 1200 * attempt;
            console.warn(
              `[Groq] ${response.status} error on ${model}. Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`
            );
            await sleep(waitMs);
            continue;
          }

          // For 400 errors (except decommissioned/payload), do NOT retry (likely bad request)
          if (response.status === 400) {
            throw new Error(
              `Groq API 400 Bad Request (model: ${model}). This usually means invalid request parameters.\nResponse: ${errorText}`
            );
          }

          throw new Error(
            `Groq API failed (${response.status} ${response.statusText})
Model: ${model}
Response: ${errorText}`
          );
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;

        if (!text) {
          throw new Error(
            `Groq returned no text.
Model: ${model}
Response: ${JSON.stringify(data, null, 2)}`
          );
        }

        return { text, modelUsed: model };
      } catch (err) {
        lastErr = err;
        // Do NOT retry on 400/413 errors (those throw above)
        if (err instanceof Error && (err.message.includes("413") || err.message.includes("400"))) {
          throw err;
        }
        if (attempt < maxRetries) {
          const waitMs = 1200 * attempt;
          console.warn(`[Groq] Error on ${model} attempt ${attempt}. Retrying in ${waitMs}ms...`);
          await sleep(waitMs);
          continue;
        }
      }
    }
  }

  throw lastErr ?? new Error("Groq call failed (no models succeeded).");
}
