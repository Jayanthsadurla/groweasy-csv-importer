// Thin wrapper around the Groq API.
// Uses Groq's OpenAI-compatible chat completions endpoint
// and returns structured JSON output.

const MODEL = "llama-3.3-70b-versatile";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface GroqCallOptions {
  systemInstruction: string;
  userContent: string;
  responseSchema: object;
  apiKey: string;
  maxRetries?: number;
}

export class GroqError extends Error {}

export async function callGroqJSON<T>({
  systemInstruction,
  userContent,
  responseSchema,
  apiKey,
  maxRetries = 2,
}: GroqCallOptions): Promise<T> {
  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `${systemInstruction}

You must return only valid JSON.
Do not include markdown code fences.
Do not include explanations before or after the JSON.
The JSON must follow the requested schema.`,
      },
      {
        role: "user",
        content: `${userContent}

Required JSON schema:
${JSON.stringify(responseSchema)}`,
      },
    ],
    temperature: 0.1,
    response_format: {
      type: "json_object",
    },
  };

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();

        // Do not retry permanent client, auth, or quota errors.
        if ([400, 401, 403, 429].includes(res.status)) {
          throw new GroqError(
            `Groq ${res.status}: ${text.slice(0, 1000)}`
          );
        }

        throw new Error(
          `Groq ${res.status}: ${text.slice(0, 1000)}`
        );
      }

      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;

      if (!text) {
        throw new GroqError("Empty response from Groq");
      }

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      return JSON.parse(cleaned) as T;
    } catch (err) {
      lastErr = err;

      // Do not retry known permanent Groq errors.
      if (err instanceof GroqError) {
        break;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 400 * Math.pow(2.2, attempt))
        );
        continue;
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new GroqError("Unknown Groq failure");
}