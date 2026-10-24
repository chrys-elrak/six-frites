import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { probe } from "../src/media/ffmpeg.js";
import { processUpload } from "../src/media/process.js";
import { getObjectBytes, headObject, putObject } from "../src/lib/storage.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const ctx = useApp();
const { get, send, makeFriends } = chatHelpers(ctx);
const dir = mkdtempSync(join(tmpdir(), "six-fixtures-"));

function fixture(name: string, args: string[]) {
  const out = join(dir, name);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  return readFileSync(out);
}

async function stage(ownerId: string, kind: string, mime: string, bytes: Buffer) {
  const id = createId();
  const key = `u/${ownerId}/${id}/original`;
  await putObject(key, bytes, mime);
  return prisma.upload.create({
    data: { id, ownerId, kind, mime, name: `test.${mime.split("/")[1]}`, size: bytes.length, key, status: "processing" },
  });
}

async function probeKey(key: string) {
  const file = join(dir, `probe-${createId()}`);
  execFileSync("sh", ["-c", `cat > ${file}`], { input: await getObjectBytes(key) });
  return { ...(await probe(file)), codecs: execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file]).toString().trim().split("\n") };
}

describe.skipIf(!hasFfmpeg)("media processing", () => {
  it("makes a thumbnail for images and keeps the original", async () => {
    const { host } = await makeFriends();
    const png = fixture("in.png", ["-f", "lavfi", "-i", "testsrc=size=1600x900:duration=1", "-frames:v", "1"]);
    const upload = await stage(host.user.id, "image", "image/png", png);
    await processUpload(upload.id);

    const done = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(done).toMatchObject({ status: "ready", width: 1600, height: 900, mainKey: null });
    const thumb = await probeKey(done.thumbKey!);
    expect(thumb).toMatchObject({ width: 480, height: 270, codecs: ["webp"] });
  });

  it("converts video to H.264 MP4 with a poster, and fixes rotation", async () => {
    const { host } = await makeFriends();
    const mov = fixture("in.mov", [
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", "-metadata:s:v:0", "rotate=90",
    ]);
    const upload = await stage(host.user.id, "video", "video/quicktime", mov);
    await processUpload(upload.id);

    const done = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(done).toMatchObject({ status: "ready", mainMime: "video/mp4" });
    expect(done.durationMs).toBeGreaterThan(1800);
    const main = await probeKey(done.mainKey!);
    expect(main.codecs).toEqual(["h264", "aac"]);
    expect({ w: done.width, h: done.height }).toEqual({ w: main.width, h: main.height });
    expect(await headObject(done.thumbKey!)).not.toBeNull();
  });

  it("crops round video messages to a small square and caps them at 60 seconds", async () => {
    const { host } = await makeFriends();
    const webm = fixture("note.webm", [
      "-f", "lavfi", "-i", "testsrc=size=640x480:rate=25:duration=62",
      "-f", "lavfi", "-i", "sine=frequency=500:duration=62",
      "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "200k", "-c:a", "libopus", "-shortest",
    ]);
    const upload = await stage(host.user.id, "video_note", "video/webm", webm);
    await processUpload(upload.id);

    const done = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(done).toMatchObject({ status: "ready", width: 384, height: 384, mainMime: "video/mp4" });
    const main = await probeKey(done.mainKey!);
    expect(main).toMatchObject({ width: 384, height: 384, codecs: ["h264", "aac"] });
    expect(done.durationMs).toBeLessThanOrEqual(60_100);
    expect(done.durationMs).toBeGreaterThan(59_000);
  }, 60_000);

  it("converts voice notes to AAC and draws a 64-bar waveform", async () => {
    const { host } = await makeFriends();
    const webm = fixture("in.webm", [
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-f", "lavfi", "-i", "sine=frequency=300:duration=1.5:sample_rate=48000",
      "-filter_complex", "[0]atrim=0:1.5[s];[s][1]concat=n=2:v=0:a=1", "-c:a", "libopus",
    ]);
    const upload = await stage(host.user.id, "voice", "audio/webm", webm);
    await processUpload(upload.id);

    const done = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(done).toMatchObject({ status: "ready", mainMime: "audio/mp4" });
    expect((await probeKey(done.mainKey!)).codecs).toEqual(["aac"]);
    const bars = done.waveform as number[];
    expect(bars).toHaveLength(64);
    expect(Math.max(...bars.slice(0, 24))).toBeLessThan(10);
    expect(Math.max(...bars.slice(40))).toBeGreaterThan(80);
  });

  it("tells the chat when an attached file finishes processing", async () => {
    const { host, guest, chatId } = await makeFriends();
    const png = fixture("chat.png", ["-f", "lavfi", "-i", "testsrc=size=320x240:duration=1", "-frames:v", "1"]);
    const upload = await stage(host.user.id, "image", "image/png", png);
    const sent = (await send(host, chatId, "pic", { attachmentId: upload.id })).json();
    const cursor = (await get(guest, "/v1/sync")).cursor;

    await processUpload(upload.id);
    const events = (await get(guest, `/v1/sync?since=${cursor}`)).events;
    expect(events).toMatchObject([
      { type: "message.edited", data: { id: sent.id, editedAt: null, attachment: { status: "ready" } } },
    ]);
    expect(events[0].data.attachment.thumbUrl).toMatch(/^http:\/\/localhost:8333\//);
    const done = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(await headObject(done.thumbKey!)).not.toBeNull();
  });

  it("marks broken media as failed", async () => {
    const { host } = await makeFriends();
    const upload = await stage(host.user.id, "video", "video/mp4", Buffer.from("definitely not a video"));
    await expect(processUpload(upload.id)).rejects.toThrow();
  });
});
