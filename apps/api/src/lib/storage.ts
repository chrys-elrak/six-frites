import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";
import { presignGetSync } from "./presign.js";

const credentials = { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY };
const common = {
  region: env.S3_REGION,
  credentials,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED" as const,
  responseChecksumValidation: "WHEN_REQUIRED" as const,
};

/** Talks to storage from inside the network. */
export const s3 = new S3Client({ ...common, endpoint: env.S3_ENDPOINT });

/** Only signs URLs; uses the host name browsers can reach. Never sends requests itself. */
const signer = new S3Client({ ...common, endpoint: env.S3_PUBLIC_ENDPOINT });

const Bucket = env.S3_BUCKET;
const publicSigner = {
  endpoint: env.S3_PUBLIC_ENDPOINT,
  region: env.S3_REGION,
  bucket: Bucket,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
};
const DAY = 24 * 60 * 60;

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
}

export function presignPut(key: string, contentType: string, contentLength: number) {
  return getSignedUrl(signer, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), {
    expiresIn: 15 * 60,
  });
}

/**
 * Signed download link valid for 7 days. Signing as of the start of the current UTC day keeps the
 * URL identical all day, so browsers can cache the file instead of refetching it on every render.
 */
export function presignGet(key: string, downloadName?: string) {
  const signingDate = new Date();
  signingDate.setUTCHours(0, 0, 0, 0);
  return presignGetSync(publicSigner, key, {
    expiresIn: 7 * DAY,
    signingDate,
    query: downloadName
      ? { "response-content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` }
      : undefined,
  });
}

export async function headObject(key: string) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
  } catch {
    return null;
  }
}

export async function getObjectBytes(key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (chunk.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map((Key) => ({ Key })) } }));
    }
  }
}
