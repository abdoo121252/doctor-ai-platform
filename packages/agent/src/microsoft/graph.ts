const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function graphRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const detail = text.slice(0, 500);
    throw new Error(`Microsoft Graph ${init?.method ?? "GET"} ${path} failed (${res.status}): ${detail}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
