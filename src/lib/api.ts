/**
 * Custom fetch wrapper for internal APIs.
 * It automatically sends cookies (which contain our JWT) for authentication.
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  
  // Set Content-Type by default if sending JSON
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  const text = await res.text();
  let data: any = {};
  
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error("Failed to parse JSON response:", text);
    throw new Error("Invalid server response format");
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}
