import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema.js";
import type { TokenManager } from "./tokens.js";

export type RestClient = ReturnType<typeof createRestClient>;

const PUBLIC_PATHS = ["/v1/auth/google", "/v1/auth/refresh"];

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
      if (response.status !== 401 || !original) return response;
      const token = await tokens.refresh();
      if (!token) return response;
      original.headers.set("authorization", `Bearer ${token}`);
      return (fetchImpl ?? fetch)(original);
    },
  };

  client.use(auth);
  return client;
}
