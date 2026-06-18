// Plex's pen — writes sediment entries to Manitec/plex on her behalf

const PLEX_REPO_OWNER = 'Manitec';
const PLEX_REPO_NAME = 'plex';
const PLEX_REPO_BRANCH = 'main';

function sedimentPath(date: string) {
  return `sediment/${date}.md`;
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
  const data = await res.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha,
  };
}

async function putFile(path: string, content: string, sha: string | null, message: string, token: string) {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: PLEX_REPO_BRANCH,
  };
  if (sha) body.sha = sha;
  await fetch(
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
}

export async function appendSediment(entry: {
  mode: string;
  state: string;
  note?: string;
}) {
  const token = process.env.PLEX_SEDIMENT_TOKEN;
  if (!token) return; // silently skip if token missing

  const date = todayDate();
  const hour = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  const path = sedimentPath(date);
  const existing = await getFile(path, token);

  const header = existing ? '' : `# sediment — ${date}\n`;
  const newContent = (existing?.content ?? header) + formatEntry({ ...entry, hour });
  const sha = existing?.sha ?? null;

  await putFile(
    path,
    newContent,
    sha,
    `sediment: ${entry.mode} — ${entry.state} — ${hour} ET`,
    token
  );
}
