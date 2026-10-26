import { createId } from "@paralleldrive/cuid2";
import type { AppRelease } from "../generated/prisma/client.js";
import { APK_MIME, type AppReleaseDTO, AppError, type CreateReleaseInput, type LatestAppDTO } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, headObject, presignGet, presignPut } from "../lib/storage.js";

const DOWNLOAD_LINK_SECONDS = 60 * 60;

const toDTO = (r: AppRelease): AppReleaseDTO => ({
  id: r.id,
  version: r.version,
  notes: r.notes,
  size: r.size,
  published: !!r.publishedAt,
  createdAt: r.createdAt.toISOString(),
});

const fileName = (r: Pick<AppRelease, "version">) => `six-frites-${r.version.replace(/[^\w.-]+/g, "-")}.apk`;

export async function createRelease(adminId: string, input: CreateReleaseInput) {
  const id = createId();
  const release = await prisma.appRelease.create({
    data: {
      id,
      version: input.version,
      notes: input.notes || null,
      size: input.size,
      key: `releases/android/${id}/${fileName(input)}`,
      createdById: adminId,
    },
  });
  return {
    release: toDTO(release),
    url: await presignPut(release.key, APK_MIME, release.size),
    headers: { "Content-Type": APK_MIME },
  };
}

async function findRelease(id: string) {
  const release = await prisma.appRelease.findUnique({ where: { id } });
  if (!release) throw new AppError("RELEASE_NOT_FOUND");
  return release;
}

/** Offers an uploaded APK for download, once storage confirms the whole file arrived. */
export async function publishRelease(id: string) {
  const release = await findRelease(id);
  const head = await headObject(release.key);
  if (!head || head.size !== release.size) throw new AppError("UPLOAD_MISSING", "The APK hasn't finished uploading");
  return toDTO(await prisma.appRelease.update({ where: { id }, data: { publishedAt: release.publishedAt ?? new Date() } }));
}

export async function listReleases() {
  const releases = await prisma.appRelease.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return releases.map(toDTO);
}

export async function deleteRelease(id: string) {
  const release = await findRelease(id);
  await deleteObjects([release.key]);
  await prisma.appRelease.delete({ where: { id } });
}

const latest = () =>
  prisma.appRelease.findFirst({
    where: { platform: "android", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
  });

export async function latestRelease(): Promise<LatestAppDTO | null> {
  const release = await latest();
  if (!release) return null;
  return {
    version: release.version,
    notes: release.notes,
    size: release.size,
    publishedAt: release.publishedAt!.toISOString(),
    downloadUrl: `${env.PUBLIC_URL}/v1/app/android/download`,
  };
}

export async function latestDownloadUrl() {
  const release = await latest();
  if (!release) throw new AppError("RELEASE_NOT_FOUND", "No Android app has been published yet");
  return presignGet(release.key, fileName(release), DOWNLOAD_LINK_SECONDS);
}
