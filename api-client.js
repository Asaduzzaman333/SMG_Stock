async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function createPollingSubscription(load, onData, onError) {
  let stopped = false;

  async function run() {
    try {
      const rows = await load();
      if (!stopped) {
        onData(rows);
      }
    } catch (error) {
      if (!stopped) {
        onError?.(error);
      }
    }
  }

  run();
  const timer = window.setInterval(run, 5000);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export async function requireAuth(redirectTo = "/login") {
  try {
    const { user } = await request("/api/auth");
    return user;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace(redirectTo);
      throw new Error("Auth required");
    }

    throw error;
  }
}

export async function loginWithEmail(email, password) {
  const { user } = await request("/api/auth", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return user;
}

export async function logoutCurrentUser() {
  await request("/api/auth", { method: "DELETE" });
}

export async function refreshSession() {
  const { user } = await request("/api/auth", { method: "PATCH" });
  return user;
}

export function getPurchaseEntries() {
  return request("/api/purchase-entries");
}

export function subscribeToPurchaseEntries(onData, onError) {
  return createPollingSubscription(getPurchaseEntries, onData, onError);
}

export async function addPurchaseEntry(entry) {
  const { id } = await request("/api/purchase-entries", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return id;
}

export async function updatePurchaseEntry(id, entry) {
  await request("/api/purchase-entries", {
    method: "PUT",
    body: JSON.stringify({ id, ...entry }),
  });
}

export async function deletePurchaseEntry(id) {
  await request(`/api/purchase-entries?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getIssueEntries() {
  return request("/api/issue-entries");
}

export function subscribeToIssueEntries(onData, onError) {
  return createPollingSubscription(getIssueEntries, onData, onError);
}

export async function addIssueEntry(entry) {
  const { id } = await request("/api/issue-entries", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return id;
}

export async function updateIssueEntry(id, entry) {
  await request("/api/issue-entries", {
    method: "PUT",
    body: JSON.stringify({ id, ...entry }),
  });
}

export async function deleteIssueEntry(id) {
  await request(`/api/issue-entries?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
