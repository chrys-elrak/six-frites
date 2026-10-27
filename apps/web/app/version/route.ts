export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: process.env.BUILD_ID });
}
