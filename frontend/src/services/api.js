/**
 * Frontend API Service Layer
 * Owner: Frontend Dev 1
 *
 * Centralized API calls. Each section maps to a backend module.
 * All functions return parsed JSON or throw errors.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    let message;
    if (Array.isArray(err.detail)) {
      message = err.detail
        .map((d) => {
          const field = Array.isArray(d.loc) ? d.loc.filter(x => x !== "body").join(" → ") : "";
          return field ? `${field}: ${d.msg}` : d.msg;
        })
        .join("\n");
    } else {
      message = err.detail || err.message || `HTTP ${res.status}: ${res.statusText}`;
    }
    throw new Error(message);
  }

  return res.json();
}

// ─── M2: Auth ────────────────────────────────────────────────────────────────

// company and role are verified by the backend against the DB on every login.
export const authAPI = {
  login: (email, password, company, role) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, company, role }),
    }),
};

// ─── M3: Onboarding ─────────────────────────────────────────────────────────

export const onboardingAPI = {
  register: (data) =>
    request("/onboarding/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  uploadLogo: async (file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/onboarding/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Logo upload failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  uploadDocument: async (docType, title, content, file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    if (content) formData.append("content", content);
    if (file)    formData.append("file", file);

    const res = await fetch(`${API_BASE}/onboarding/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Document upload failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  triggerTraining: () =>
    request("/onboarding/train", { method: "POST" }),
};

// ─── Brand Kit ───────────────────────────────────────────────────────────────

export const brandKitAPI = {
  create: (data) =>
    request("/brand-kit/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: () => request("/brand-kit/"),

  update: (data) =>
    request("/brand-kit/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ─── M2: Users ───────────────────────────────────────────────────────────────

export const usersAPI = {
  list: () => request("/users/"),

  create: (data) =>
    request("/users/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deactivate: (userId) =>
    request(`/users/${userId}/deactivate`, { method: "PATCH" }),
};

// ─── M3: Documents ───────────────────────────────────────────────────────────

export const documentsAPI = {
  list: (docType) =>
    request(`/documents/${docType ? `?doc_type=${docType}` : ""}`),

  create: (data) =>
    request("/documents/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Upload a document with a file attachment (multipart).
  // Used by MyCompany "Add Document" — mirrors onboarding/documents.
  upload: async (docType, title, file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Document upload failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  // Returns the authenticated URL to stream the file for preview.
  // Token is passed as a query param so the browser can load it directly
  // in an iframe or anchor without needing a custom Authorization header.
  // When storage moves to Azure Blob, this will return the SAS URL instead.
  getFileUrl: (docId) => {
    const token = localStorage.getItem("token");
    return `${API_BASE}/documents/${docId}/file?token=${token}`;
  },

  update: (docId, data) =>
    request(`/documents/${docId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (docId) =>
    request(`/documents/${docId}`, { method: "DELETE" }),
};

// ─── M8: Advertisements ──────────────────────────────────────────────────────

export const adsAPI = {
  list: (status) =>
    request(`/advertisements/${status ? `?status=${status}` : ""}`),

  get: (adId) => request(`/advertisements/${adId}`),

  create: (data) =>
    request("/advertisements/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (adId, data) =>
    request(`/advertisements/${adId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Upload a campaign-specific protocol document.
  // Stored at uploads/docs/<company_id>/<ad_id>/<filename> — separate from company docs.
  uploadDocument: async (adId, docType, title, file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/advertisements/${adId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Protocol document upload failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  listDocuments: (adId) => request(`/advertisements/${adId}/documents`),

  generateStrategy: (adId) =>
    request(`/advertisements/${adId}/generate-strategy`, { method: "POST" }),

  submitForReview: (adId) =>
    request(`/advertisements/${adId}/submit-for-review`, { method: "POST" }),

  createReview: (adId, data) =>
    request(`/advertisements/${adId}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listReviews: (adId) => request(`/advertisements/${adId}/reviews`),

  publish: (adId) =>
    request(`/advertisements/${adId}/publish`, { method: "POST" }),

  updateBotConfig: (adId, data) =>
    request(`/advertisements/${adId}/bot-config`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ─── M7/M15: Analytics ───────────────────────────────────────────────────────

export const analyticsAPI = {
  get: (adId) => request(`/analytics/${adId}`),

  triggerOptimize: (adId) =>
    request(`/analytics/${adId}/optimize`, { method: "POST" }),

  submitDecision: (adId, data) =>
    request(`/analytics/${adId}/decision`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};