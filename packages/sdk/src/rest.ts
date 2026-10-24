import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema.js";
import type { TokenManager } from "./tokens.js";

export type RestClient = ReturnType<typeof createRestClient>;

const PUBLIC_PATHS = ["/v1/auth/google", "/v1/auth/refresh"];

/**
 * openapi-fetch only accepts middleware results that are `instanceof Response`, which fails in
 * React Native where `fetch` (expo/fetch) returns its own response class; rebuild one in that case.
 */
async function asResponse(res: Response): Promise<Response> {
  if ((res as unknown) instanceof Response) return res;
  const { status, statusText, headers } = res;
  return new Response(await res.arrayBuffer(), { status, statusText, headers });
}

export function createRestClient(baseUrl: string, tokens: TokenManager, fetchImpl?: typeof fetch) {
  const client = createClient<paths>({ baseUrl, credentials: "include", fetch: fetchImpl });
  const retryBodies = new WeakMap<Request, Request>();

  const auth: Middleware = {
    async onRequest({ request, schemaPath }) {
      if (PUBLIC_PATHS.includes(schemaPath)) return request;
      const token = await tokens.getAccessToken();
      if (token) request.headers.set("authorization", `Bearer ${token}`);
      retryBodies.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      const original = retryBodies.get(request);
      if (response.status !== 401 || !original) return undefined;
      const token = await tokens.refresh();
      if (!token) return undefined;
      original.headers.set("authorization", `Bearer ${token}`);
      return asResponse(await (fetchImpl ?? fetch)(original));
    },
  };

  client.use(auth);
  return client;
}
