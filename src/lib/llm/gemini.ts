/**
 * Gemini client helper (Google Generative Language API)
 * - Tries multiple models (GEMINI_MODEL, then GEMINI_MODEL_FALLBACKS)
 * - Tries API versions in order: v1 then v1beta (because some models move)
 * - Retries on 429 and transient 5xx
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DEFAULT_MODEL_FALLBACKS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
const API_VERSIONS: Array<"v1" | "v1beta"> = ["v1", "v1beta"];

type CallGeminiOptions = {
  jsonMode?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  useSearch?: boolean; // only if enabled in your project
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryDelaySecondsFromError(data: any): number | null {
  const retryInfo = data?.error?.details?.find(
    (d: any) => d?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
  );
  const retryDelay = retryInfo?.retryDelay; // e.g. "42s"
  if (typeof retryDelay === "string" && retryDelay.endsWith("s")) {
    const n = Number(retryDelay.slice(0, -1));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getModelCandidates(): string[] {
  const explicit = (process.env.GEMINI_MODEL || "").trim();

  const fallbacksRaw = (process.env.GEMINI_MODEL_FALLBACKS || "").trim();
  const fallbacks =
    fallbacksRaw.length > 0
      ? fallbacksRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_MODEL_FALLBACKS;

  const merged = [explicit, ...fallbacks].filter(Boolean);

  // de-dupe preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of merged) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out.length ? out : DEFAULT_MODEL_FALLBACKS;
}

async function tryOneGeminiCall(args: {
  model: string;
  apiVersion: "v1" | "v1beta";
  prompt: string;
  options: CallGeminiOptions;
}) {
  const { model, apiVersion, prompt, options } = args;

  const url =
    `https://generativelanguage.googleapis.com/${apiVersion}/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY!)}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 2400,
    },
  };

  if (options.jsonMode) {
    // Gemini supports this on many models; if a model rejects it, we'll fall back automatically
    body.generationConfig.response_mime_type = "application/json";
  }

  if (options.useSearch) {
    body.tools = [
      {
        google_search_retrieval: {
          dynamic_retrieval_config: { mode: "DYNAMIC", dynamic_threshold: 0.1 },
        },
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw as string
  }

  if (!res.ok) {
    const err: any = new Error(
      `Gemini API failed (${res.status} ${res.statusText})\nModel=${model}\nVersion=${apiVersion}\nResponse:\n${raw}`
    );
    err.status = res.status;
    err.parsed = parsed;
    throw err;
  }

  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error(
      `Gemini returned no text.\nModel=${model}\nVersion=${apiVersion}\nFull:\n${JSON.stringify(parsed, null, 2)}`
    );
  }

  return { text, raw: parsed, modelUsed: model, apiVersionUsed: apiVersion };
}

export async function callGemini(prompt: string, options: CallGeminiOptions = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Add it to .env.local and restart.");
  }

  const models = getModelCandidates();

  // We’ll try a few attempts total across models/versions for transient 429/5xx
  const maxTotalAttempts = 6;
  let attempt = 0;

  let lastError: any = null;

  for (const model of models) {
    for (const apiVersion of API_VERSIONS) {
      // for each model/version pair, allow up to 2 retries on 429/5xx
      for (let localTry = 1; localTry <= 2; localTry++) {
        attempt++;
        if (attempt > maxTotalAttempts) break;

        try {
          return await tryOneGeminiCall({ model, apiVersion, prompt, options });
        } catch (e: any) {
          lastError = e;

          const status = e?.status;
          const parsed = e?.parsed;

          // If model not found on this version, immediately try next version/model
          if (status === 404) {
            console.warn(`[Gemini] 404 for ${model} on ${apiVersion}. Trying next...`);
            break;
          }

          // If JSON mode is rejected (400), retry once without jsonMode (some models are picky)
          if (status === 400 && options.jsonMode) {
            console.warn(`[Gemini] 400 in jsonMode for ${model} on ${apiVersion}. Retrying without jsonMode...`);
            options = { ...options, jsonMode: false };
            continue;
          }

          // Rate limit or transient server errors -> wait then retry
          if (status === 429 || (status >= 500 && status <= 599)) {
            const retrySec = parseRetryDelaySecondsFromError(parsed);
            const waitMs = retrySec ? retrySec * 1000 : 1200 * localTry * localTry;

            console.warn(
              `[Gemini] ${status} on ${model}/${apiVersion}. Waiting ${Math.round(waitMs / 1000)}s then retrying (try ${localTry}/2)...`
            );
            await sleep(waitMs);
            continue;
          }

          // Otherwise, hard fail this pair and move on
          console.warn(`[Gemini] Non-retryable error on ${model}/${apiVersion}:`, e?.message || e);
          break;
        }
      }
    }
  }

  throw lastError ?? new Error("Gemini call failed unexpectedly.");
}

/**
 * Convenience wrapper (system + user prompt)
 */
export async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    responseFormat?: "json" | "text";
  } = {}
): Promise<{ text: string; modelUsed: string; apiVersionUsed: string } | null> {
  try {
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const result = await callGemini(combinedPrompt, {
      temperature: options.temperature ?? 0.3,
      jsonMode: options.responseFormat === "json",
      maxOutputTokens: 4000,
    });

    return {
      text: result.text,
      modelUsed: result.modelUsed,
      apiVersionUsed: result.apiVersionUsed,
    };
  } catch (error) {
    console.error("[Gemini] generateWithGemini failed:", error);
    return null;
  }
}
