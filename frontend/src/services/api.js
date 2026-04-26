/**
 * Frontend API Service Layer
 * Owner: Frontend Dev 1
 *
 * Centralized API calls. Each section maps to a backend module.
 * All functions return parsed JSON or throw errors.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Token refresh helpers ────────────────────────────────────────────────────

function _getTokenExp() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000; // convert to ms
  } catch { return null; }
}

let _refreshPromise = null;

async function _refreshToken() {
  // Deduplicate: if a refresh is already in flight, wait for it.
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No token");
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Refresh failed — clear session and redirect to login
      localStorage.removeItem("token");
      window.dispatchEvent(new CustomEvent("auth:expired"));
      throw new Error("Session expired");
    }
    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    return data.access_token;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// Proactively refresh if token expires within 10 minutes.
// Call this from app boot and optionally on a timer.
export async function ensureFreshToken() {
  const exp = _getTokenExp();
  if (!exp) return;
  if (exp - Date.now() < 10 * 60 * 1000) {
    await _refreshToken().catch(() => {});
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function request(endpoint, options = {}) {
  // Proactively refresh if token will expire within 10 minutes
  if (endpoint !== "/auth/refresh" && endpoint !== "/auth/login") {
    const exp = _getTokenExp();
    if (exp && exp > Date.now() && (exp - Date.now()) < 10 * 60 * 1000) {
      await _refreshToken().catch(() => {});
    }
  }

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

  // On 401, attempt one token refresh then retry
  if (res.status === 401 && endpoint !== "/auth/refresh" && endpoint !== "/auth/login") {
    try {
      const newToken = await _refreshToken();
      const retryRes = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ detail: retryRes.statusText }));
        throw new Error(err.detail || `HTTP ${retryRes.status}: ${retryRes.statusText}`);
      }
      if (retryRes.status === 204 || retryRes.headers.get("content-length") === "0") return null;
      return retryRes.json();
    } catch {
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!res.ok) {
    // Token expired or invalid — clear session and redirect to login
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return;
    }
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

  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

async function requestBlob(endpoint) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

// ─── M2: Auth ────────────────────────────────────────────────────────────────

// company and role are verified by the backend against the DB on every login.
export const authAPI = {
  login: (email, password, company, role) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, company, role }),
    }),

  // Re-issue a fresh token without requiring the user to re-enter credentials.
  refresh: () => request("/auth/refresh", { method: "POST" }),

  // Check if an email is already registered (used at onboarding step 1).
  checkEmail: (email) => request(`/auth/check-email?email=${encodeURIComponent(email)}`),

  // Password change via email OTP (authenticated user only)
  requestPasswordChange: () =>
    request("/auth/request-password-change", { method: "POST" }),

  confirmPasswordChange: (code, newPassword) =>
    request("/auth/confirm-password-change", {
      method: "POST",
      body: JSON.stringify({ code, new_password: newPassword }),
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

    const readErr = async (res, fallbackLabel) => {
      const raw = await res.text().catch(() => "");
      let detail = "";
      try { detail = (JSON.parse(raw) || {}).detail || ""; } catch { /* not JSON */ }
      const snippet = raw && !detail ? ` — ${raw.slice(0, 200)}` : "";
      return detail || `${fallbackLabel} (HTTP ${res.status}${snippet})`;
    };

    const postJson = async (path, body) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readErr(res, "Document upload failed"));
      return res.json();
    };

    // When a file is present, use the WAF-safe S3 presign flow on the shared
    // /documents endpoints (whitelisted for pre-onboarded users). Fall back to
    // the multipart /onboarding/documents route when S3 is not configured, or
    // when the caller only has a content blob (no file).
    if (file) {
      const contentType = file.type || "application/octet-stream";
      const presign = await postJson("/documents/presign", {
        doc_type:     docType,
        title,
        filename:     file.name,
        content_type: contentType,
        file_size:    file.size,
      });

      if (presign.method === "s3") {
        const s3Res = await fetch(presign.upload_url, {
          method:  "PUT",
          headers: { "Content-Type": presign.content_type || contentType },
          body:    file,
        });
        if (s3Res.ok) {
          return postJson("/documents/confirm", {
            s3_key:       presign.s3_key,
            doc_type:     docType,
            title,
            filename:     file.name,
            content_type: presign.content_type || contentType,
          });
        }
        const errBody = await s3Res.text().catch(() => "");
        console.warn("S3 upload failed, falling back to direct:", s3Res.status, errBody);
      }
    }

    // Direct multipart fallback — used when no file, or S3 not configured.
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
    if (!res.ok) throw new Error(await readErr(res, "Document upload failed"));
    return res.json();
  },

  triggerTraining: () =>
    request("/onboarding/train", { method: "POST" }),
};

// ─── Company ─────────────────────────────────────────────────────────────────

export const companyAPI = {
  getProfile: () => request("/company/profile"),
  updateLocations: (locations) =>
    request("/company/locations", {
      method: "PATCH",
      body: JSON.stringify({ locations }),
    }),
  deleteAccount: (password) =>
    request("/company/account", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    }),
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

  uploadPdf: (file) => {
    const form = new FormData();
    form.append("file", file);
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/brand-kit/upload-pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return res.json(); // { pdf_path }
    });
  },

  extractPdf: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}/brand-kit/extract-pdf`, {
      method: "POST",
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return res.json();
    });
  },
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

  updateMe: (data) =>
    request("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
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

  // Upload a document with a file attachment.
  // Used by MyCompany "Add Document".
  //
  // Production (CloudFront + WAF): presign → PUT direct to S3 → confirm.
  // The multipart body never traverses CloudFront, so WAF body-inspection
  // rules (size + XSS patterns that match binary PDFs) cannot block it.
  //
  // Localhost / no-S3: backend returns method="direct" and we fall back to
  // the multipart /documents/upload endpoint.
  upload: async (docType, title, file) => {
    const token = localStorage.getItem("token");

    const readErr = async (res, fallbackLabel) => {
      const raw = await res.text().catch(() => "");
      let detail = "";
      try { detail = (JSON.parse(raw) || {}).detail || ""; } catch { /* not JSON */ }
      const snippet = raw && !detail ? ` — ${raw.slice(0, 200)}` : "";
      return detail || `${fallbackLabel} (HTTP ${res.status}${snippet})`;
    };

    const postJson = async (path, body) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readErr(res, "Document upload failed"));
      return res.json();
    };

    const contentType = file.type || "application/octet-stream";

    // 1. Ask backend whether to use S3 or direct multipart
    const presign = await postJson("/documents/presign", {
      doc_type:     docType,
      title,
      filename:     file.name,
      content_type: contentType,
      file_size:    file.size,
    });

    if (presign.method === "s3") {
      // 2a. PUT directly to S3 — bypasses CloudFront WAF entirely.
      // Content-Type MUST match what the URL was signed with or S3 returns 403.
      const s3Res = await fetch(presign.upload_url, {
        method:  "PUT",
        headers: { "Content-Type": presign.content_type || contentType },
        body:    file,
      });
      if (s3Res.ok) {
        return postJson("/documents/confirm", {
          s3_key:       presign.s3_key,
          doc_type:     docType,
          title,
          filename:     file.name,
          content_type: presign.content_type || contentType,
        });
      }
      const errBody = await s3Res.text().catch(() => "");
      console.warn("S3 upload failed, falling back to direct:", s3Res.status, errBody);
    }

    // 2b. Direct multipart fallback (localhost / S3 misconfig)
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error(await readErr(res, "Document upload failed"));
    return res.json();
  },

  // Returns the authenticated URL to stream the file for preview.
  // Token is passed as a query param so the browser can load it directly
  // in an iframe or anchor without needing a custom Authorization header.
  // When storage moves to Azure Blob, this will return the SAS URL instead.
  getFileUrl: (docId) => {
    const token = localStorage.getItem("token");
    return `${API_BASE}/documents/${docId}/file?token=${encodeURIComponent(token)}`;
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
  //
  // Production (CloudFront): uses S3 pre-signed URL so the file goes browser → S3
  // directly, completely bypassing CloudFront WAF body-size limits.
  // Backend then downloads from S3, extracts text, saves to EFS.
  //
  // Localhost / no-S3: falls back to direct multipart upload (no WAF in the way).
  //
  // Supports files up to 50 MB.
  uploadDocument: async (adId, docType, title, file) => {
    const token = localStorage.getItem("token");

    const postJson = async (path, body) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = Array.isArray(err.detail)
          ? err.detail
              .map((d) => {
                const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(" → ") : "";
                return field ? `${field}: ${d.msg}` : d.msg;
              })
              .join("; ")
          : err.detail
          ? String(err.detail)
          : `Upload failed (HTTP ${res.status})`;
        throw new Error(detail);
      }
      return res.json();
    };

    const contentType = file.type || "application/octet-stream";

    // 1. Ask backend: S3 or direct?
    const presign = await postJson(`/advertisements/${adId}/documents/presign`, {
      doc_type:     docType,
      title,
      filename:     file.name,
      content_type: contentType,
      file_size:    file.size,
    });

    if (presign.method === "s3") {
      // 2a. PUT file directly to S3 (bypasses CloudFront WAF entirely).
      // Must use the exact Content-Type the pre-signed URL was signed with,
      // otherwise S3 returns 403 SignatureDoesNotMatch.
      const s3Res = await fetch(presign.upload_url, {
        method:  "PUT",
        headers: { "Content-Type": presign.content_type || contentType },
        body:    file,
      });

      if (s3Res.ok) {
        // 3a. Tell backend to process the uploaded file
        return postJson(`/advertisements/${adId}/documents/confirm`, {
          s3_key:       presign.s3_key,
          doc_type:     docType,
          title,
          filename:     file.name,
          content_type: presign.content_type || contentType,
        });
      }

      // S3 PUT failed — log and fall through to direct multipart
      const errBody = await s3Res.text().catch(() => "");
      console.warn("S3 upload failed, falling back to direct upload:", s3Res.status, errBody);
    }

    // 2b. Direct multipart upload (localhost / S3 not configured / S3 permission error)
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("title", title);
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/advertisements/${adId}/documents`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = Array.isArray(err.detail)
        ? err.detail
            .map((d) => {
              const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(" → ") : "";
              return field ? `${field}: ${d.msg}` : d.msg;
            })
            .join("; ")
        : err.detail
        ? String(err.detail)
        : `Upload failed (HTTP ${res.status})`;
      throw new Error(detail);
    }
    return res.json();
  },

  listDocuments: (adId) => request(`/advertisements/${adId}/documents`),

  getDocFileUrl: (adId, docId) => {
    const token = localStorage.getItem("token");
    return `${API_BASE}/advertisements/${adId}/documents/${docId}/file?token=${encodeURIComponent(token)}`;
  },

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

  generateCreatives: (adId) =>
    request(`/advertisements/${adId}/generate-creatives`, { method: "POST" }),

  updateBotConfig: (adId, data) =>
    request(`/advertisements/${adId}/bot-config`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generateWebsite: (adId) =>
    request(`/advertisements/${adId}/generate-website`, { method: "POST" }),

  hostPage: (adId) =>
    request(`/advertisements/${adId}/host-page`, { method: "POST" }),

  // Returns URL strings (not API calls) — used for preview/download <a> hrefs.
  // No token needed: landing page is public (no secrets, safe as Meta Ads redirect URL).
  websitePreviewUrl: (adId) =>
    `/api/advertisements/${adId}/website`,
  websiteDownloadUrl: (adId) =>
    `/api/advertisements/${adId}/website?download=true`,

  minorEditStrategy: (adId, data) =>
    request(`/advertisements/${adId}/minor-edit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  rewriteStrategy: (adId, data) =>
    request(`/advertisements/${adId}/rewrite-strategy`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deployWebsite: (adId, data) =>
    request(`/advertisements/${adId}/deploy`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  distributeCreatives: (adId, data) =>
    request(`/advertisements/${adId}/distribute`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateQuestionnaire: (adId) =>
    request(`/advertisements/${adId}/generate-questionnaire`, { method: "POST" }),

  updateQuestionnaire: (adId, questionnaire) =>
    request(`/advertisements/${adId}/questionnaire`, {
      method: "PATCH",
      body: JSON.stringify({ questionnaire }),
    }),

  rewriteQuestion: (adId, question, instruction) =>
    request(`/advertisements/${adId}/questionnaire/rewrite-question`, {
      method: "POST",
      body: JSON.stringify({ question, instruction }),
    }),

  delete: (adId) =>
    request(`/advertisements/${adId}`, { method: "DELETE" }),

  // ── Voice Agent (ElevenLabs) ──────────────────────────────────────────────
  getAustralianVoices: () =>
    request(`/advertisements/voice-profiles/australian`),

  getVoiceRecommendation: (adId) =>
    request(`/advertisements/${adId}/voice-recommendation`),

  provisionVoiceAgent: (adId) =>
    request(`/advertisements/${adId}/voice-agent`, { method: "POST" }),

  getVoiceAgentStatus: (adId) =>
    request(`/advertisements/${adId}/voice-agent/status`),

  deleteVoiceAgent: (adId) =>
    request(`/advertisements/${adId}/voice-agent`, { method: "DELETE" }),

  listVoiceConversations: (adId, pageSize = 20) =>
    request(`/advertisements/${adId}/voice-conversations?page_size=${pageSize}`),

  getVoiceTranscript: (conversationId) =>
    request(`/advertisements/voice-conversations/${conversationId}/transcript`),

  fetchVoiceRecording: (conversationId) =>
    requestBlob(`/advertisements/voice-conversations/${conversationId}/audio`),

  analyzeVoiceConversation: (conversationId) =>
    request(`/advertisements/voice-conversations/${conversationId}/analyze`, { method: "POST" }),

  // Returns a short-lived signed WebSocket URL for the ElevenLabs browser SDK.
  // No auth required — designed for embedded landing page use.
  getVoiceSessionToken: (adId) =>
    request(`/advertisements/${adId}/voice-session/token`),

  // Trigger an outbound phone call via ElevenLabs voice agent.
  // Body: { phone: "+15551234567" }
  requestVoiceCall: (adId, body) =>
    request(`/advertisements/${adId}/voice-call/request`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Meta Ad Management ────────────────────────────────────────────────────
  // List live ads for a campaign (fetched from Meta API)
  listMetaAds: (adId) =>
    request(`/advertisements/${adId}/meta-ads`),

  // Toggle ACTIVE/PAUSED or update creative copy
  updateMetaAd: (adId, metaAdId, data) =>
    request(`/advertisements/${adId}/meta-ads/${metaAdId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Delete a Meta ad
  deleteMetaAd: (adId, metaAdId) =>
    request(`/advertisements/${adId}/meta-ads/${metaAdId}`, { method: "DELETE" }),

  // Optimizer changes (ethics review)
  listOptimizerChanges: () =>
    request("/advertisements/optimizer-changes"),

  approveOptimizerChanges: (adId, reviewIds) =>
    request(`/advertisements/${adId}/optimizer-changes/approve`, {
      method: "POST",
      body: JSON.stringify({ review_ids: reviewIds }),
    }),

  rejectOptimizerChanges: (adId, reviewIds) =>
    request(`/advertisements/${adId}/optimizer-changes/reject`, {
      method: "POST",
      body: JSON.stringify({ review_ids: reviewIds }),
    }),

  // Update the daily budget on Meta ad set (pushes to Meta)
  updateMetaBudget: (adId, dailyBudgetUsd) =>
    request(`/advertisements/${adId}/meta-budget`, {
      method: "POST",
      body: JSON.stringify({ daily_budget_usd: dailyBudgetUsd }),
    }),

  // Fetch insights from Meta and persist in AdAnalytics
  fetchMetaInsights: (adId, datePreset = "last_30d") =>
    request(`/advertisements/${adId}/meta-insights?date_preset=${datePreset}`),

  // AI-generated schedule suggestions
  getScheduleSuggestions: (adId) =>
    request(`/advertisements/${adId}/schedule-suggestions`),
};

// ─── Platform Connections (Meta OAuth) ───────────────────────────────────────

export const platformConnectionsAPI = {
  // Returns { url } — open in a popup to start OAuth
  getOAuthUrl: (platform) => request(`/platform-connections/${platform}/oauth-url`),

  // List stored connections for this company
  list: () => request("/platform-connections/"),

  // Fetch ad accounts + pages available under the stored Meta token
  getMetaAccounts: () => request("/platform-connections/meta/accounts"),

  // Save selected ad account and/or page
  updateMeta: (data) =>
    request("/platform-connections/meta", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Remove Meta connection
  disconnectMeta: () =>
    request("/platform-connections/meta", { method: "DELETE" }),
};

// ─── M7/M15: Analytics ───────────────────────────────────────────────────────

export const analyticsAPI = {
  get: (adId) => request(`/analytics/${adId}`),

  triggerOptimize: (adId) =>
    request(`/analytics/${adId}/optimize`, { method: "POST" }),

  getOptimizeStatus: (adId, logId) =>
    request(`/analytics/${adId}/optimize/status?log_id=${logId}`),

  regenerateItem: (adId, prompt, itemType = "general") =>
    request(`/analytics/${adId}/regenerate-item`, {
      method: "POST",
      body: JSON.stringify({ prompt, item_type: itemType }),
    }),

  submitDecision: (adId, data) =>
    request(`/analytics/${adId}/decision`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Survey Responses ─────────────────────────────────────────────────────────

export const participantsAPI = {
  // Unified list: survey + chatbot + voicebot participants for a campaign.
  list: (adId) => request(`/advertisements/${adId}/participants`),
};

export const surveyAPI = {
  // Submit participant details + answers (public — no auth token required).
  submit: (adId, data) =>
    fetch(`${API_BASE}/advertisements/${adId}/survey-responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Submission failed (HTTP ${res.status})`);
      }
      return res.json();
    }),

  // List all responses for a campaign (study coordinator — auth required).
  list: (adId) => request(`/advertisements/${adId}/survey-responses`),

  // Get a single response with full details.
  get: (adId, responseId) =>
    request(`/advertisements/${adId}/survey-responses/${responseId}`),

  // Pull completed call transcripts from ElevenLabs and store them (manual sync).
  syncTranscripts: (adId) =>
    request(`/advertisements/${adId}/sync-voice-transcripts`, { method: "POST" }),
};

export const analysisAPI = {
  // Background pass — analyze all sessions without analysis for this campaign
  autoAnalyze: (adId) =>
    request(`/advertisements/${adId}/auto-analyze`, { method: "POST" }),

  // Analyze all voice sessions for a participant
  analyzeParticipant: (adId, responseId) =>
    request(`/advertisements/${adId}/survey-responses/${responseId}/analyze`, { method: "POST" }),

  // Analyze a single voice session
  analyzeVoiceSession: (adId, sessionId) =>
    request(`/advertisements/${adId}/voice-sessions/${sessionId}/analyze`, { method: "POST" }),

  // List + analyze chatbot sessions for a campaign
  listChatSessions: (adId) =>
    request(`/advertisements/${adId}/chat-sessions`),

  analyzeChatSession: (adId, sessionId) =>
    request(`/advertisements/${adId}/chat-sessions/${sessionId}/analyze`, { method: "POST" }),
};

export const appointmentsAPI = {
  list: (adId) =>
    request(`/advertisements/${adId}/appointments`),

  getSlots: (adId, date) =>
    request(`/advertisements/${adId}/appointments/slots?date=${date}`),

  book: (adId, data) =>
    request(`/advertisements/${adId}/appointments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  cancel: (adId, appointmentId) =>
    request(`/advertisements/${adId}/appointments/${appointmentId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    }),

  getBookingConfig: (adId) =>
    request(`/advertisements/${adId}/booking-config`),

  updateBookingConfig: (adId, data) =>
    request(`/advertisements/${adId}/booking-config`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};