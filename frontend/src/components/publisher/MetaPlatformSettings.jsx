import React, { useState } from "react";
import { SectionCard } from "../shared/Layout";
import { AlertCircle, Link2, Link2Off, RefreshCw, Loader2, ChevronDown as ChevDown } from "lucide-react";

// ─── Platform Settings Card ───────────────────────────────────────────────────
export default function MetaPlatformSettings({
  connection, accounts, connecting, loadingAccounts,
  onConnect, onDisconnect, onLoadAccounts, onSelectAdAccount, onSelectPage,
}) {
  const [showAdAccounts, setShowAdAccounts] = useState(false);
  const [showPages,      setShowPages]      = useState(false);

  const daysTilExpiry = connection?.token_expires_at
    ? Math.max(0, Math.round((new Date(connection.token_expires_at) - Date.now()) / 86400000))
    : null;

  const pillStyle = (color) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 10px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700,
    backgroundColor: `rgba(${color},0.12)`, color: `rgb(${color})`,
  });

  const dropdownStyle = {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
    border: "1px solid var(--color-card-border)", borderRadius: "8px",
    backgroundColor: "var(--color-card-bg)", boxShadow: "0 4px 16px rgba(0,0,0,.12)",
    maxHeight: "200px", overflowY: "auto",
  };

  const selectorBtnStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "7px 10px", borderRadius: "7px", fontSize: "0.8rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", cursor: "pointer", textAlign: "left",
  };

  return (
    <SectionCard
      title="Platform Settings"
      subtitle="Connect your ad accounts once — credentials are stored securely and reused for every publish"
    >
      {/* ── Meta/Instagram row ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
        padding: "16px", borderRadius: "10px",
        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
      }}>
        {/* Left: status + connect/disconnect */}
        <div style={{ flex: "0 0 auto", minWidth: 180 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 6 }}>
            Meta / Instagram
          </p>

          {connection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={pillStyle("34,197,94")}>
                <Link2 size={10} /> Connected
              </span>

              {connection.expires_soon && (
                <span style={pillStyle("234,179,8")}>
                  <AlertCircle size={10} /> Expires in {daysTilExpiry}d — reconnect soon
                </span>
              )}
              {!connection.expires_soon && daysTilExpiry !== null && (
                <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>
                  Token valid for ~{daysTilExpiry} days
                </span>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <button
                  className="btn--inline-action--ghost"
                  onClick={onConnect}
                  disabled={connecting}
                  title="Refresh OAuth token"
                >
                  <RefreshCw size={10} style={connecting ? { animation: "spin 1s linear infinite" } : {}} />
                  Reconnect
                </button>
                <button className="btn--inline-action--ghost" onClick={onDisconnect} style={{ color: "#ef4444" }}>
                  <Link2Off size={10} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div>
              <span style={pillStyle("156,163,175")}>
                <Link2Off size={10} /> Not connected
              </span>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn--accent"
                  onClick={onConnect}
                  disabled={connecting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}
                >
                  {connecting
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Link2 size={12} />}
                  {connecting ? "Opening Facebook…" : "Connect Meta Account"}
                </button>
                <p style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: 6 }}>
                  Opens Facebook login in a popup. No developer account needed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: account + page selectors (only shown when connected) */}
        {connection && (
          <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", minWidth: 260 }}>
            {/* Ad Account selector */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>
                Ad Account
              </label>
              <button
                style={selectorBtnStyle}
                onClick={() => {
                  setShowAdAccounts((v) => !v);
                  setShowPages(false);
                  if (!accounts) onLoadAccounts();
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {connection.ad_account_name || connection.ad_account_id || "Select ad account…"}
                </span>
                <ChevDown size={12} style={{ flexShrink: 0, marginLeft: 4 }} />
              </button>
              {showAdAccounts && (
                <div style={dropdownStyle}>
                  {loadingAccounts
                    ? <div style={{ padding: "12px", textAlign: "center" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /></div>
                    : accounts?.ad_accounts?.length
                      ? accounts.ad_accounts.map((acc) => (
                          <button
                            key={acc.id}
                            onClick={() => { onSelectAdAccount(acc); setShowAdAccounts(false); }}
                            style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left", fontSize: "0.8rem", color: "var(--color-input-text)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-card-border)" }}
                          >
                            <span style={{ fontWeight: 600 }}>{acc.name}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: 6 }}>{acc.id}</span>
                          </button>
                        ))
                      : <p style={{ padding: "10px 12px", fontSize: "0.78rem", color: "var(--color-muted)" }}>No ad accounts found</p>
                  }
                </div>
              )}
            </div>

            {/* Page selector */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>
                Facebook Page
              </label>
              <button
                style={selectorBtnStyle}
                onClick={() => {
                  setShowPages((v) => !v);
                  setShowAdAccounts(false);
                  if (!accounts) onLoadAccounts();
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {connection.page_name || connection.page_id || "Select page…"}
                </span>
                <ChevDown size={12} style={{ flexShrink: 0, marginLeft: 4 }} />
              </button>
              {showPages && (
                <div style={dropdownStyle}>
                  {loadingAccounts
                    ? <div style={{ padding: "12px", textAlign: "center" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /></div>
                    : accounts?.pages?.length
                      ? accounts.pages.map((pg) => (
                          <button
                            key={pg.id}
                            onClick={() => { onSelectPage(pg); setShowPages(false); }}
                            style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left", fontSize: "0.8rem", color: "var(--color-input-text)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-card-border)" }}
                          >
                            <span style={{ fontWeight: 600 }}>{pg.name}</span>
                            {pg.category && <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: 6 }}>{pg.category}</span>}
                          </button>
                        ))
                      : <p style={{ padding: "10px 12px", fontSize: "0.78rem", color: "var(--color-muted)" }}>No pages found</p>
                  }
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
