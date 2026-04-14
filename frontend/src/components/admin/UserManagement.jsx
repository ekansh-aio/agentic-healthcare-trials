/**
 * M11: User Management
 * Owner: Frontend Dev 2
 * Dependencies: usersAPI
 *
 * Add/manage users with roles: Study Coordinator, Project Manager, Ethics Manager, Publisher
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { usersAPI } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { UserPlus, Shield, Eye, Send, Settings, UserMinus, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const ROLES = [
  { value: "study_coordinator", label: "Study Coordinator", icon: Settings },
  { value: "project_manager",   label: "Project Manager",   icon: Eye },
  { value: "ethics_manager",    label: "Ethics Manager",    icon: Shield },
  { value: "publisher",         label: "Publisher",         icon: Send },
];

const EMPTY_FORM = { email: "", password: "", full_name: "", role: "project_manager" };

export default function UserManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formOk, setFormOk] = useState(false);
  const [deactivating, setDeactivating] = useState(null); // userId being deactivated
  const [confirmTarget, setConfirmTarget] = useState(null); // userId awaiting confirmation
  useEffect(() => {
    usersAPI.list()
      .then(setUsers)
      .catch((err) => setFetchError(err.message || "Failed to load users."));
  }, []);

  const handleCreate = async () => {
    setFormError(null);
    if (!form.full_name.trim()) { setFormError("Full name is required."); return; }
    if (!form.email.trim())     { setFormError("Email is required."); return; }
    if (form.password.length < 8) { setFormError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      const user = await usersAPI.create(form);
      setUsers((p) => [...p, user]);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setFormOk(true);
      setTimeout(() => setFormOk(false), 4000);
    } catch (err) {
      setFormError(err.message || "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (userId) => {
    setConfirmTarget(null);
    setDeactivating(userId);
    try {
      const updated = await usersAPI.deactivate(userId);
      setUsers((p) => p.map((u) => u.id === userId ? updated : u));
    } catch (err) {
      setFetchError(err.message || "Failed to deactivate user.");
      setTimeout(() => setFetchError(null), 6000);
    } finally {
      setDeactivating(null);
    }
  };

  const openForm  = () => { setShowForm(true); setFormError(null); setFormOk(false); };
  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null); };

  const isValid = form.full_name.trim() && form.email.trim() && form.password.length >= 8;

  return (
    <PageWithSidebar>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">User Management</h1>
          <p className="page-header__subtitle">Add and manage team members for your company</p>
        </div>
        <button onClick={openForm} className="btn--accent">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Success banner */}
      {formOk && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderRadius: 10, marginBottom: 20,
          backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
        }}>
          <CheckCircle2 size={16} style={{ color: "#22c55e", flexShrink: 0 }} />
          <p style={{ fontSize: "0.85rem", color: "#22c55e", fontWeight: 500 }}>User created successfully.</p>
        </div>
      )}

      {/* Fetch error banner */}
      {fetchError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderRadius: 10, marginBottom: 20,
          backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
        }}>
          <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.85rem", color: "#ef4444" }}>{fetchError}</p>
        </div>
      )}

      {/* Add user form */}
      {showForm && (
        <SectionCard title="Add New User" style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 6 }}>
                Full Name *
              </label>
              <input
                placeholder="Jane Smith"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 6 }}>
                Email *
              </label>
              <input
                placeholder="jane@company.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 6 }}>
                Password * <span style={{ fontWeight: 400, opacity: 0.7 }}>(min 8 chars)</span>
              </label>
              <input
                placeholder="••••••••"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="field-input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 6 }}>
                Role *
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="field-select"
                style={{ marginBottom: 0 }}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Form error */}
          {formError && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8, marginBottom: 14,
              backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            }}>
              <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
              <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{formError}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleCreate}
              disabled={loading || !isValid}
              className="btn--primary"
              style={{ opacity: (loading || !isValid) ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
                : <><UserPlus size={14} /> Create User</>
              }
            </button>
            <button onClick={closeForm} className="btn--ghost" disabled={loading}>
              Cancel
            </button>
          </div>
        </SectionCard>
      )}

      {/* Team member list */}
      <SectionCard title={`Team Members (${users.length})`}>
        {users.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>No team members yet. Add someone above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => {
              const isSelf   = u.id === currentUser?.id;
              const isTarget = confirmTarget === u.id;
              return (
                <div key={u.id} style={{
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "space-between",
                  padding:         "12px 16px",
                  borderRadius:    "10px",
                  border:          "1px solid var(--color-card-border)",
                  backgroundColor: "var(--color-card-bg)",
                  opacity:         u.is_active ? 1 : 0.55,
                }}>
                  {/* Left: avatar + name + email */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div className="user-avatar">{u.full_name?.charAt(0)?.toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <p className="table-row__title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.full_name}{isSelf && <span style={{ fontSize: "0.68rem", marginLeft: 6, color: "var(--color-accent)", fontWeight: 600 }}>You</span>}
                      </p>
                      <p className="table-row__meta">{u.email}</p>
                    </div>
                  </div>

                  {/* Right: role badge + deactivate */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <div style={{
                      display:         "flex",
                      alignItems:      "center",
                      gap:             "6px",
                      padding:         "4px 10px",
                      borderRadius:    "20px",
                      border:          "1px solid var(--color-card-border)",
                      backgroundColor: "var(--color-page-bg)",
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                        backgroundColor: u.is_active ? "var(--color-accent)" : "#f87171",
                        boxShadow: u.is_active ? "0 0 0 2px var(--color-accent-subtle)" : "none",
                      }} />
                      <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-input-text)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                        {u.role?.replace(/_/g, " ")}
                      </span>
                    </div>

                    {u.is_active && !isSelf && (
                      isTarget ? (
                        /* Confirmation row */
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 500 }}>Deactivate?</span>
                          <button
                            onClick={() => handleDeactivate(u.id)}
                            disabled={deactivating === u.id}
                            style={{
                              padding: "4px 10px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 600,
                              border: "1px solid rgba(239,68,68,0.5)", backgroundColor: "rgba(239,68,68,0.12)",
                              color: "#f87171", cursor: "pointer",
                            }}
                          >
                            {deactivating === u.id
                              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                              : "Yes, deactivate"}
                          </button>
                          <button
                            onClick={() => setConfirmTarget(null)}
                            style={{
                              padding: "4px 10px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 500,
                              border: "1px solid var(--color-card-border)", backgroundColor: "transparent",
                              color: "var(--color-sidebar-text)", cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmTarget(u.id)}
                          title="Deactivate user"
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 10px", borderRadius: 7, fontSize: "0.75rem", fontWeight: 500,
                            border: "1px solid rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)",
                            color: "#f87171", cursor: "pointer",
                          }}
                        >
                          <UserMinus size={12} />
                          Deactivate
                        </button>
                      )
                    )}

                    {!u.is_active && (
                      <span style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 500 }}>Inactive</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </PageWithSidebar>
  );
}
