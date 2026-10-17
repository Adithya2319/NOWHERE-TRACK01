export async function api(path, options = {}) {
  const { body, headers, signal, ...rest } = options;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  try {
    const response = await fetch(
      path.startsWith("/api/") ? path : `/api${path}`,
      {
        credentials: "same-origin",
        ...rest,
        signal: controller.signal,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
    );
    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error(
          "The API returned an unreadable response. Check the connection and refresh your records before repeating an action.",
          { cause: error },
        );
      }
    }
    if (!response.ok) {
      const error = new Error(
        payload?.error ||
          payload?.message ||
          `Server unavailable (${response.status}). Please retry.`,
      );
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    if (!payload)
      throw new Error(
        "The API did not return JSON. Start the Campus360 server and retry.",
      );
    return payload;
  } catch (error) {
    if (!timedOut) throw error;
    const failure = new Error(
      "The server took too long to respond. Refresh your records before repeating an action; it may already have been saved.",
      { cause: error },
    );
    failure.name = "TimeoutError";
    throw failure;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
