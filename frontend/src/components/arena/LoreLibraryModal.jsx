import React, { useState, useEffect } from "react";
import { searchArenaLore } from "../../api/client";

export default function LoreLibraryModal({ sessionId, gameBible, onClose }) {
  const [query, setQuery] = useState("architecture");
  const [loreRecords, setLoreRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const term = gameBible?.vocabulary?.memories || "Knowledge Archives";

  const fetchLore = async (searchQuery) => {
    setIsLoading(true);
    try {
      const data = await searchArenaLore(sessionId, searchQuery);
      setLoreRecords(data.lore_records || []);
    } catch (e) {
      console.warn("Could not retrieve Hindsight lore:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLore("architecture");
  }, [sessionId]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) fetchLore(query);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#f8fafc" }}>
              📖 {term} (Hindsight Memory)
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
              Immutable team architectural decisions and historical lore backed by Hindsight.
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", margin: "16px 0" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search architecture lore, decisions, policies..."
            style={inputStyle}
          />
          <button type="submit" disabled={isLoading} style={searchBtnStyle}>
            {isLoading ? "Recalling..." : "Recall Lore"}
          </button>
        </form>

        {/* Lore List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto" }}>
          {loreRecords.length === 0 ? (
            <div style={{ color: "#64748b", textAlign: "center", padding: "20px" }}>
              No lore records found for "{query}".
            </div>
          ) : (
            loreRecords.map((item, idx) => (
              <div key={item.id || idx} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "bold" }}>
                    📜 {item.category?.toUpperCase() || "DECISION"}
                  </span>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    Author: {item.author || "Architect"}
                  </span>
                </div>
                <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#e2e8f0", lineHeight: "1.4" }}>
                  {item.text || item.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const modalStyle = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "12px",
  width: "90%",
  maxWidth: "600px",
  maxHeight: "85vh",
  overflowY: "auto",
  padding: "24px",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  borderBottom: "1px solid #1e293b",
  paddingBottom: "14px",
};

const closeBtnStyle = {
  background: "transparent",
  border: "none",
  color: "#94a3b8",
  fontSize: "20px",
  cursor: "pointer",
};

const inputStyle = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#f8fafc",
  fontSize: "13px",
};

const searchBtnStyle = {
  padding: "10px 16px",
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};

const cardStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "14px",
};
