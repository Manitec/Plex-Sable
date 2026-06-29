// /api/see is now an alias for /api/observe
// Kept for backwards compatibility — redirect all traffic there
import { NextRequest, NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const observeUrl = new URL("/api/observe", req.url).toString();
  const forwarded = new Request(observeUrl, {
    method: "POST",
    headers: req.headers,
    body: req.body,
    // @ts-expect-error duplex required for streaming body
    duplex: "half",
  });
  const res = await fetch(forwarded);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status, headers: CORS });
}
