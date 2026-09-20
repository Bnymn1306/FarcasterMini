export type ResearchProvider = "exa-direct" | "replit-connector" | "unavailable";

type ProviderEnvironment = Record<string, string | undefined>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function selectResearchProvider(env: ProviderEnvironment = process.env): ResearchProvider {
  if (env.EXA_API_KEY?.trim()) return "exa-direct";
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return "unavailable";
  if (env.REPL_ID || env.REPLIT_DEPLOYMENT_URL || env.REPLIT_DEV_DOMAIN) {
    return "replit-connector";
  }
  return "unavailable";
}

export class ResearchProviderConfigurationError extends Error {
  readonly code = "RESEARCH_PROVIDER_NOT_CONFIGURED";

  constructor(readonly isVercel: boolean) {
    super(isVercel
      ? "EXA_API_KEY is required for AskBase research on Vercel."
      : "AskBase research requires EXA_API_KEY outside Replit.");
    this.name = "ResearchProviderConfigurationError";
  }
}

type RequestOptions = {
  env?: ProviderEnvironment;
  fetchImpl?: FetchLike;
  connectorRequest?: (path: string, init: RequestInit) => Promise<Response>;
};

export async function requestExaAnswer(query: string, options: RequestOptions = {}): Promise<Response> {
  const env = options.env ?? process.env;
  const provider = selectResearchProvider(env);
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, text: true }),
  };

  if (provider === "exa-direct") {
    const headers = new Headers(init.headers);
    headers.set("x-api-key", env.EXA_API_KEY!.trim());
    return (options.fetchImpl ?? fetch)("https://api.exa.ai/answer", { ...init, headers });
  }

  if (provider === "replit-connector") {
    if (options.connectorRequest) return options.connectorRequest("/answer", init);
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    return new ReplitConnectors().proxy("exa", "/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, text: true }),
    });
  }

  throw new ResearchProviderConfigurationError(Boolean(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL));
}