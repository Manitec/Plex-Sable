import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!process.env.PEXELS_API_KEY) {
      console.error('PEXELS_API_KEY is not set');
      return NextResponse.json({ error: 'Image search not configured' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`,
      {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('Pexels error:', res.status, res.statusText);
      return NextResponse.json({ error: 'Image search failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data.photos ?? []);

  } catch (error: any) {
    console.error('Images route error:', error?.message || error);
    return NextResponse.json({ error: 'Image service unreachable' }, { status: 500 });
  }
}
