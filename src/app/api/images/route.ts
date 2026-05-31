import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { query } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`, {
    headers: {
      Authorization: process.env.PEXELS_API_KEY ?? ''
    }
  });

  const data = await res.json();
  return NextResponse.json(data.photos ?? []);
}
