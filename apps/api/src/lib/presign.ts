import { createHash, createHmac } from "node:crypto";

export interface SignerConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * AWS Signature V4 query signing for a path-style GET, done synchronously so message DTOs can
 * embed download links without making every mapper async. Matches the AWS SDK's presigner output.
 */
export function presignGetSync(
  cfg: SignerConfig,
  key: string,
  opts: { expiresIn: number; signingDate: Date; query?: Record<string, string> },
) {
  const url = new URL(cfg.endpoint);
  const iso = opts.signingDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = iso.slice(0, 8);
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const path = `${url.pathname.replace(/\/$/, "")}/${encode(cfg.bucket)}/${key.split("/").map(encode).join("/")}`;

  const params: Record<string, string> = {
    ...opts.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(opts.expiresIn),
    "X-Amz-SignedHeaders": "host",
    "x-id": "GetObject",
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k]!)}`)
    .join("&");

  const canonical = ["GET", path, query, `host:${url.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", iso, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, day), cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");

  return `${url.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
