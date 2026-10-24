import { z } from "zod";

export const ErrorCodes = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_GOOGLE_TOKEN: 401,
  INVALID_REFRESH_TOKEN: 401,
  REFRESH_TOKEN_REUSED: 401,
  SESSION_REVOKED: 401,
  FORBIDDEN: 403,
  NOT_MESSAGE_SENDER: 403,
  MESSAGE_NOT_EDITABLE: 409,
  MESSAGE_EXPIRED: 410,
  RESEND_NOT_ALLOWED: 409,
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  INVITE_NOT_FOUND: 404,
  CHAT_NOT_FOUND: 404,
  CONTACT_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  UPLOAD_NOT_FOUND: 404,
  SCHEDULED_NOT_FOUND: 404,
  SCHEDULE_LIMIT_REACHED: 409,
  STICKER_NOT_FOUND: 404,
  STICKER_PACK_NOT_FOUND: 404,
  STICKER_LIMIT_REACHED: 409,
  GIF_NOT_FOUND: 404,
  GIFS_UNAVAILABLE: 503,
  UPLOAD_NOT_READY: 409,
  UPLOAD_IN_USE: 409,
  UPLOAD_MISSING: 422,
  SYNC_CURSOR_EXPIRED: 410,
  INVITE_EXHAUSTED: 409,
  INVITE_OWN: 409,
  INVITE_EXPIRED: 410,
  ALREADY_REFERRED: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.status = ErrorCodes[code];
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
