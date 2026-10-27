// Small fetch wrapper used by client components to call the API routes.
export async function callApi<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: boolean; data: T & { error?: string; message?: string } }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  } catch {
    return { ok: false, data: { error: "Could not connect to the server." } as T & { error: string } };
  }
}
