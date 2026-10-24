import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it } from "vitest";
import { presignGetSync } from "../src/lib/presign.js";

const cfg = {
  endpoint: "http://localhost:8333",
  region: "us-east-1",
  bucket: "six-media",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const sdk = new S3Client({
  region: cfg.region,
  endpoint: cfg.endpoint,
  forcePathStyle: true,
  credentials: cfg,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const signingDate = new Date(Date.UTC(2026, 9, 24));

describe("presignGetSync", () => {
  it.each([
    ["u/abc/xyz/original.jpg", undefined],
    ["c/a b/ü+(1)!.jpg", "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9 (final).pdf"],
  ])("signs %s exactly like the AWS SDK", async (key, disposition) => {
    const theirs = await getSignedUrl(
      sdk,
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key, ...(disposition && { ResponseContentDisposition: disposition }) }),
      { expiresIn: 604800, signingDate },
    );
    const mine = presignGetSync(cfg, key, {
      expiresIn: 604800,
      signingDate,
      query: disposition ? { "response-content-disposition": disposition } : undefined,
    });
    const sig = (u: string) => new URL(u).searchParams.get("X-Amz-Signature");
    expect(sig(mine)).toBe(sig(theirs));
    expect(new URL(mine).pathname).toBe(new URL(theirs).pathname);
  });
});
