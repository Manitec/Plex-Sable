export type SessionMessageRole = "joe" | "user" | "plex" | "assistant";

export type SessionHistoryMessage = {
  role: "user" | "plex";
  content: string;
};

export type SessionHistorySelection =
  | { kind: "stored" }
  | { kind: "override"; messages: SessionHistoryMessage[] };

const supportedRoles = new Set<SessionMessageRole>([
  "joe",
  "user",
  "plex",
  "assistant",
]);

export function selectSessionHistory(value: unknown): SessionHistorySelection {
  if (value === undefined || value === null) return { kind: "stored" };
  if (!Array.isArray(value)) {
    throw new TypeError("overrideHistory must be an array when provided");
  }

  const messages = value.map((entry: unknown, index): SessionHistoryMessage => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`overrideHistory[${index}] must be an object`);
    }

    const item = entry as { role?: unknown; content?: unknown };
    if (
      typeof item.role !== "string" ||
      !supportedRoles.has(item.role as SessionMessageRole) ||
      typeof item.content !== "string"
    ) {
      throw new TypeError(
        `overrideHistory[${index}] requires a supported role and string content`,
      );
    }

    return {
      role: item.role === "plex" || item.role === "assistant" ? "plex" : "user",
      content: item.content,
    };
  });

  return { kind: "override", messages };
}

export function toModelHistoryRole(role: string): "user" | "assistant" {
  if (role === "plex" || role === "assistant") return "assistant";
  if (role === "joe" || role === "user") return "user";
  throw new TypeError(`Unsupported session history role: ${role}`);
}
