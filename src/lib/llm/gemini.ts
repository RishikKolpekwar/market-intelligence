const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-1.5-flash';

export async function callGemini(prompt: string, options: { 
  useSearch?: boolean, 
  jsonMode?: boolean 
} = {}) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
    }
  };

  if (options.jsonMode) {
    body.generationConfig.response_mime_type = 'application/json';
  }

  if (options.useSearch) {
    body.tools = [
      {
        google_search_retrieval: {
          dynamic_retrieval_config: {
            mode: 'DYNAMIC',
            dynamic_threshold: 0.1 // Be aggressive with search
          }
        }
      }
    ];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API Error:', error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Also extract grounding metadata if search was used
  const groundingMetadata = data.candidates?.[0]?.groundingMetadata;

  return { text, groundingMetadata };
}
