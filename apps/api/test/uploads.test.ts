import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { downloadObject, headObject, putObject, uploadObject } from "../src/lib/storage.js";
import { mediaQueue } from "../src/lib/queue.js";
import { type Auth, chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

async function upload(who: Auth, kind: string, mime: string, body: Buffer, name = "file.bin") {
  const presign = await call(who, "POST", "/v1/uploads/presign", { kind, mime, size: body.length, name });
  expect(presign.statusCode, presign.body).toBe(201);
  const { url, headers, upload } = presign.json();
  const put = await fetch(url, { method: "PUT", body: new Uint8Array(body), headers });
  expect(put.status).toBe(200);
  const done = await call(who, "POST", `/v1/uploads/${upload.id}/complete`);
  expect(done.statusCode, done.body).toBe(200);
  return done.json();
}

describe("uploads", () => {
  it("stores a plain file, attaches it once, and serves it with its name", async () => {
    const { host, guest, chatId } = await makeFriends();
    const pdf = Buffer.from("%PDF-1.4 tiny");
    const file = await upload(host, "file", "application/pdf", pdf, "résumé (final).pdf");
    expect(file).toMatchObject({ kind: "file", status: "ready", size: pdf.length, name: "résumé (final).pdf" });

    const sent = await send(host, chatId, "my cv", { attachmentId: file.id });
    expect(sent.json()).toMatchObject({ type: "file", text: "my cv", attachment: { id: file.id, status: "ready" } });

    const seen = (await get(guest, `/v1/chats/${chatId}/messages`)).items[0];
    const download = await fetch(seen.attachment.url);
    expect(Buffer.from(await download.arrayBuffer()).equals(pdf)).toBe(true);
    expect(download.headers.get("content-disposition")).toContain("r%C3%A9sum%C3%A9");

    expect((await send(host, chatId, "again", { attachmentId: file.id })).json().error.code).toBe("UPLOAD_IN_USE");
    expect((await send(guest, chatId, "mine?", { attachmentId: file.id })).json().error.code).toBe("UPLOAD_NOT_FOUND");
    expect((await get(guest, `/v1/uploads/${file.id}`)).error.code).toBe("UPLOAD_NOT_FOUND");
  });

  it("allows a message with only an attachment but not an empty one", async () => {
    const { host, chatId } = await makeFriends();
    const file = await upload(host, "file", "text/plain", Buffer.from("hi"));
    const sent = await send(host, chatId, undefined as unknown as string, { attachmentId: file.id });
    expect(sent.json()).toMatchObject({ text: null, type: "file" });
    const empty = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "empty" });
    expect(empty.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("refuses to complete before the file arrives, and validates kinds and sizes", async () => {
    const { host } = await makeFriends();
    const presign = await call(host, "POST", "/v1/uploads/presign", { kind: "file", mime: "text/plain", size: 5, name: "a" });
    const early = await call(host, "POST", `/v1/uploads/${presign.json().upload.id}/complete`);
    expect(early.json().error.code).toBe("UPLOAD_MISSING");

    const wrongKind = await call(host, "POST", "/v1/uploads/presign", { kind: "image", mime: "application/pdf", size: 5, name: "a" });
    expect(wrongKind.json().error.code).toBe("VALIDATION_FAILED");
    const presignZip = (size: number, encrypted?: boolean) =>
      call(host, "POST", "/v1/uploads/presign", {
        kind: "file",
        size,
        ...(encrypted ? { mime: "application/octet-stream", name: "encrypted", encrypted } : { mime: "application/zip", name: "big.zip" }),
      });
    const gig = await presignZip(1024 * 1024 * 1024);
    expect(gig.statusCode).toBe(201);
    await prisma.upload.delete({ where: { id: gig.json().upload.id } });
    expect((await presignZip(1024 * 1024 * 1024 + 1)).json().error.code).toBe("VALIDATION_FAILED");
    expect((await presignZip(101 * 1024 * 1024, true)).json().error.code).toBe("VALIDATION_FAILED");
    const withCodec = await call(host, "POST", "/v1/uploads/presign", {
      kind: "voice",
      mime: "audio/webm;codecs=opus",
      size: 5,
      name: "voice.webm",
    });
    expect(withCodec.statusCode).toBe(201);
  });

  it("queues media for processing and lets it be sent straight away", async () => {
    const { host, chatId } = await makeFriends();
    const image = await upload(host, "image", "image/png", Buffer.from("not really a png"), "pic.png");
    expect(image).toMatchObject({ status: "processing", url: null });
    expect(await (await mediaQueue().getJob(image.id))?.getState()).toBeDefined();

    const sent = await send(host, chatId, "look", { attachmentId: image.id });
    expect(sent.json()).toMatchObject({ type: "image", attachment: { status: "processing" } });
    await (await mediaQueue().getJob(image.id))?.remove();
  });

  it("lists a chat's shared media, files and links, without deleted or self-destructing ones", async () => {
    const { host, guest, chatId } = await makeFriends();
    const image = await upload(host, "image", "image/png", Buffer.from("not really a png"), "pic.png");
    const photo = (await send(host, chatId, "look", { attachmentId: image.id })).json();
    await (await mediaQueue().getJob(image.id))?.remove();
    const doc = (await send(guest, chatId, "cv", { attachmentId: (await upload(guest, "file", "text/plain", Buffer.from("cv"))).id })).json();
    const gone = (await send(guest, chatId, "old", { attachmentId: (await upload(guest, "file", "text/plain", Buffer.from("x"))).id })).json();
    await call(guest, "DELETE", `/v1/messages?ids=${gone.id}&scope=all`);
    const link = (await send(host, chatId, "see https://example.com")).json();
    await send(host, chatId, "no link here");
    await send(host, chatId, "www.secret.mg", { ephemeral: { maxViews: 1 } });

    const ids = async (only: string) =>
      (await get(guest, `/v1/chats/${chatId}/messages?only=${only}`)).items.map((m: { id: string }) => m.id);
    expect(await ids("media")).toEqual([photo.id]);
    expect(await ids("files")).toEqual([doc.id]);
    expect(await ids("links")).toEqual([link.id]);
    expect((await get(guest, `/v1/chats/${chatId}/messages?only=gifs`)).error.code).toBe("VALIDATION_FAILED");
  });

  it("streams files between storage and disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "six-stream-"));
    const body = randomBytes(300_000);
    await putObject("t/stream/in", body, "application/octet-stream");
    await downloadObject("t/stream/in", join(dir, "a"));
    await uploadObject("t/stream/out", join(dir, "a"), "video/mp4");
    await downloadObject("t/stream/out", join(dir, "b"));
    expect((await readFile(join(dir, "b"))).equals(body)).toBe(true);
    expect(await headObject("t/stream/out")).toMatchObject({ size: body.length, contentType: "video/mp4" });
    await rm(dir, { recursive: true });
  });

  it("deletes the stored files when the message is deleted for everyone", async () => {
    const { host, guest, chatId } = await makeFriends();
    const file = await upload(host, "file", "text/plain", Buffer.from("secret doc"));
    const sent = (await send(host, chatId, "doc", { attachmentId: file.id })).json();
    const row = await prisma.upload.findUnique({ where: { id: file.id } });
    expect(await headObject(row!.key)).not.toBeNull();

    await call(guest, "DELETE", `/v1/messages?ids=${sent.id}&scope=all`);
    expect(await headObject(row!.key)).toBeNull();
    expect(await prisma.upload.findUnique({ where: { id: file.id } })).toBeNull();
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items[0]).toMatchObject({ attachment: null, text: null });
  });
});
