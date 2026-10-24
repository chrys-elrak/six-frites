import type { ErrorBody, ErrorCode } from "@six/shared";

export class SixApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Unwraps an openapi-fetch result, throwing SixApiError on the API's standard error shape. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    const body = res.error as ErrorBody | undefined;
    throw new SixApiError(
      res.response.status,
      body?.error?.code ?? "INTERNAL",
      body?.error?.message ?? res.response.statusText,
      body?.error?.details,
    );
  }
  return res.data as T;
}
