import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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

/** Parts stay under Cloudflare's 100 MB request limit, and a dropped one is cheap to send again. */
export const PART_BYTES = 16 * 1024 * 1024;

export async function startMultipart(key: string, contentType: string) {
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  return UploadId!;
}

/** One link per part; each lasts a day because on a slow line the last parts start long after the first. */
export function presignParts(key: string, uploadId: string, size: number) {
  return Promise.all(
    Array.from({ length: Math.ceil(size / PART_BYTES) }, (_, i) =>
      getSignedUrl(
        signer,
        new UploadPartCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: i + 1,
          ContentLength: Math.min(PART_BYTES, size - i * PART_BYTES),
        }),
        { expiresIn: DAY },
      ),
    ),
  );
}

/** Joins the parts into the object once they add up to `size`; false while some are still missing. */
export async function completeMultipart(key: string, uploadId: string, size: number) {
  const { Parts = [] } = await s3.send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId }));
  if (Parts.reduce((sum, p) => sum + (p.Size ?? 0), 0) !== size) return false;
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: Parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) },
    }),
  );
  return true;
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
}

/**
 * Signed download link valid for 7 days. Signing as of the start of the current UTC day keeps the
 * URL identical all day, and objects are never overwritten, so the link tells browsers to keep the
 * file for a week instead of asking storage again on every render or video loop. Short-lived links
 * (opened self-destructing media) tell them not to keep a copy at all.
 */
export function presignGet(key: string, downloadName?: string, shortLivedSeconds?: number) {
  const signingDate = new Date();
  if (!shortLivedSeconds) signingDate.setUTCHours(0, 0, 0, 0);
  return presignGetSync(publicSigner, key, {
    expiresIn: shortLivedSeconds ?? 7 * DAY,
    signingDate,
    query: {
      "response-cache-control": shortLivedSeconds ? "no-store" : `private, max-age=${7 * DAY}, immutable`,
      ...(downloadName && {
        "response-content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      }),
    },
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

export async function downloadObject(key: string, path: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(path));
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function uploadObject(key: string, path: string, contentType: string) {
  const { size } = await stat(path);
  await s3.send(
    new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(path), ContentType: contentType, ContentLength: size }),
  );
}

export async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (chunk.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map((Key) => ({ Key })) } }));
    }
  }
}
