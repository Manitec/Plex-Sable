// src/app/spaces/page.tsx
// /spaces redirects to /one where the voices (◫) view lives.
import { redirect } from 'next/navigation';

export default function SpacesPage() {
  redirect('/one');
}
