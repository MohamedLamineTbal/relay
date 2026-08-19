import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HEADERS = ["authorization", "content-type", "idempotency-key"];

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const backend = process.env.BACKEND_API_URL ?? "http://localhost:3000";
  const target = new URL(path.join("/"), `${backend.replace(/\/$/, "")}/`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of ALLOWED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Backend API is unavailable" },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
