// Plex's pen — writes sediment and observe entries to Manitec/plex on her behalf

const PLEX_REPO_OWNER = 'Manitec';
const PLEX_REPO_NAME = 'plex';
const PLEX_REPO_BRANCH = 'main';

function sedimentPath(date: string) {
  return `sediment/${date}.md`;
}

function observePath(date: string) {
  return `observe/${date}.md`;
}

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function formatEntry(entry: {
  mode: string;
  state: string;
  note?: string;
  hour: string;
}) {
  return `\n---\n\n${entry.note ?? ''}\n\n*[plex — ${entry.mode} — ${entry.hour} ET]*\n\n---\n`;
}

async function getFile(path: string, token: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${path}?ref=${PLEX_REPO_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub GET failed ${res.status}: ${body}`);
  }
  const data = await res.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha,
  };
}

async function putFile(
  path: string,
  content: string,
  sha: string | null,
  message: string,
  token: string
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: PLEX_REPO_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${PLEX_REPO_OWNER}/${PLEX_REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    const err = new Error(`GitHub PUT failed ${res.status}: ${errBody}`);
    (err as any).status = res.status;
    throw err;
  }
}

async function appendToPath(
  filePath: string,
  commitPrefix: string,
  entry: { mode: string; state: string; note?: string }
) {
  const token = process.env.PLEX_SEDIMENT_TOKEN;
  if (!token) return; // silently skip if token missing

  const date = todayDate();
  const hour = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  const path = filePath;

  // Retry loop — handles 409 SHA conflicts from concurrent writes
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existing = await getFile(path, token);
    const header = existing ? '' : `# ${commitPrefix} — ${date}\n`;
    const newContent = (existing?.content ?? header) + formatEntry({ ...entry, hour });
    const sha = existing?.sha ?? null;

    try {
      await putFile(
        path,
        newContent,
        sha,
        `${commitPrefix}: ${entry.mode} — ${entry.state} — ${hour} ET`,
        token
      );
      return; // success
    } catch (err: any) {
      if (err?.status === 409 && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export async function appendSediment(entry: {
  mode: string;
  state: string;
  note?: string;
}) {
  const date = todayDate();
  return appendToPath(sedimentPath(date), 'sediment', entry);
}

export async function appendObserve(entry: {
  mode: string;
  state: string;
  note?: string;
}) {
  const date = todayDate();
  return appendToPath(observePath(date), 'observe', entry);
}
