export async function apiRequest(path, options = {}) {
  const token = options.token || localStorage.getItem("token");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Erro HTTP ${response.status}`);
  }
  return body;
}
