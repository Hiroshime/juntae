export async function packingListRequest(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    list?: { id: string };
  };
  if (!response.ok)
    throw new Error(result.error || "Não foi possível salvar. Atualize a lista e tente novamente.");
  return result;
}
