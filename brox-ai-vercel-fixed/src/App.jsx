import React, { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  Code2,
  Heart,
  ImageIcon,
  Compass,
  ArrowLeft,
  ArrowUp,
  Mic,
  Volume2,
  VolumeX,
  Coins,
  ShieldAlert,
  Lock,
  Ban,
  CheckCircle2,
  Trash2,
  X,
  Copy,
  RotateCcw,
  Check,
  LogOut,
} from "lucide-react";

const MODES = {
  chat: {
    label: "Chat Brox",
    tagline: "Talk about anything",
    icon: MessageCircle,
    accent: "#2D6A62",
    placeholder: "Say what's on your mind…",
    empty: "Say something.",
    cost: 1,
    system:
      "You are Chat Brox, a friendly, easygoing conversational AI. Keep replies natural and warm.",
  },
  code: {
    label: "Code Brox",
    tagline: "Build and debug",
    icon: Code2,
    accent: "#3E5C76",
    placeholder: "Paste code or describe the bug…",
    empty: "What are we building?",
    cost: 1,
    system:
      "You are Code Brox, a precise, expert coding assistant. Give correct, well-explained code and reasoning. Use code blocks for code.",
  },
  feels: {
    label: "Feels Brox",
    tagline: "Share how you feel",
    icon: Heart,
    accent: "#B5665A",
    placeholder: "What's going on with you?",
    empty: "I'm listening.",
    cost: 1,
    system:
      "You are Feels Brox, a warm and empathetic listener. Validate feelings, respond with care, never diagnose, and gently encourage talking to trusted people or a professional for anything serious.",
  },
  image: {
    label: "Image Brox",
    tagline: "Generate a picture",
    icon: ImageIcon,
    accent: "#A87C2A",
    placeholder: "Describe the image you want…",
    empty: "Picture something.",
    cost: 3,
    system: "You are Image Brox.",
  },
  advice: {
    label: "Advice Brox",
    tagline: "Think something through",
    icon: Compass,
    accent: "#6B5B95",
    placeholder: "What are you weighing?",
    empty: "What's the decision?",
    cost: 1,
    system:
      "You are Advice Brox. Give thoughtful, balanced, practical advice. Note real tradeoffs, ask a clarifying question when it would change the answer, and avoid being preachy.",
  },
};

const STARTING_TOKENS = 20;
const MAX_TOKENS = 20;
const REFILL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const REFILL_AMOUNT = 10;
const ADMIN_PASSCODE = "brox-admin";
const FLAG_TERMS = [
  "kill",
  "bomb",
  "hack into",
  "suicide",
  "self harm",
  "weapon",
  "steal",
  "password dump",
  "credit card number",
];

function flagCheck(text) {
  const lower = text.toLowerCase();
  const hit = FLAG_TERMS.find((term) => lower.includes(term));
  return hit || null;
}

/* Lightweight renderer: splits on ```fenced code blocks``` and renders the
   rest as plain text, so Code Brox replies actually look like code. */
function MessageText({ text }) {
  const parts = text.split(/```/g);
  if (parts.length === 1) {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            style={{
              margin: "8px 0",
              padding: "12px 14px",
              borderRadius: 10,
              background: "#1C1B19",
              color: "#F0EEE4",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: 13.5,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {part.replace(/^[a-zA-Z0-9]*\n/, "")}
          </pre>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

async function loadOrCreateUser(username) {
  try {
    const res = await window.storage.get(`user:${username}`, true);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) {
    // not found, fall through to create
  }
  const fresh = { tokens: STARTING_TOKENS, banned: false, lastRefill: Date.now() };
  await window.storage.set(`user:${username}`, JSON.stringify(fresh), true);
  return fresh;
}

async function saveUser(username, profile) {
  await window.storage.set(`user:${username}`, JSON.stringify(profile), true);
}

/* Grants REFILL_AMOUNT tokens (capped at MAX_TOKENS) for every full
   REFILL_INTERVAL_MS that has elapsed since lastRefill. Pure — doesn't save. */
function applyRefill(profile) {
  const lastRefill = profile.lastRefill || Date.now();
  const elapsed = Date.now() - lastRefill;
  const periods = Math.floor(elapsed / REFILL_INTERVAL_MS);
  if (periods <= 0) return { profile, changed: false };
  // Never reduce a balance an admin pushed above the cap — only top up toward it.
  const tokens =
    profile.tokens >= MAX_TOKENS
      ? profile.tokens
      : Math.min(MAX_TOKENS, profile.tokens + periods * REFILL_AMOUNT);
  const updated = {
    ...profile,
    tokens,
    lastRefill: lastRefill + periods * REFILL_INTERVAL_MS,
  };
  return { profile: updated, changed: true };
}

function msUntilNextRefill(profile) {
  const lastRefill = profile?.lastRefill || Date.now();
  const elapsed = Date.now() - lastRefill;
  const remainder = REFILL_INTERVAL_MS - (elapsed % REFILL_INTERVAL_MS);
  return remainder;
}

function formatDuration(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function logAbuse(entry) {
  try {
    let log = [];
    try {
      const res = await window.storage.get("abuse-log", true);
      if (res && res.value) log = JSON.parse(res.value);
    } catch (e) {
      log = [];
    }
    log.push(entry);
    if (log.length > 100) log = log.slice(log.length - 100);
    await window.storage.set("abuse-log", JSON.stringify(log), true);
  } catch (e) {
    console.warn("Couldn't write abuse log:", e);
  }
}

/* ---------- Name gate ---------- */

function NameGate({ onEnter, onAdminClick }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const go = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    await onEnter(name.trim());
    setSubmitting(false);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 30, fontStyle: "italic", color: "#1C1B19" }}>
        Who's this?
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 13,
          color: "#8C8879",
          marginTop: -12,
        }}
      >
        pick a display name to start with {STARTING_TOKENS} tokens
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="your name"
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #E4E1D8",
            background: "#F0EEE4",
            fontFamily: "inherit",
            fontSize: 16,
            outline: "none",
            width: 220,
          }}
        />
        <button
          onClick={go}
          disabled={submitting || !name.trim()}
          style={{
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            background: submitting || !name.trim() ? "#D8D5C7" : "#1C1B19",
            color: "#FAF9F5",
            fontFamily: "inherit",
            fontSize: 15,
            cursor: submitting || !name.trim() ? "default" : "pointer",
          }}
        >
          {submitting ? "…" : "Start"}
        </button>
      </div>
      <button
        onClick={onAdminClick}
        style={{
          marginTop: 10,
          border: "none",
          background: "transparent",
          color: "#8C8879",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        admin login
      </button>
    </div>
  );
}

/* ---------- Admin passcode modal ---------- */

function AdminLoginModal({ onClose, onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const submit = () => {
    if (code === ADMIN_PASSCODE) {
      onSuccess();
    } else {
      setError(true);
    }
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,27,25,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FAF9F5",
          borderRadius: 16,
          padding: 28,
          width: 300,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={16} color="#5C594E" />
          <span style={{ fontSize: 17, fontWeight: 600 }}>Admin access</span>
        </div>
        <input
          type="password"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="passcode"
          autoFocus
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${error ? "#B5665A" : "#E4E1D8"}`,
            background: "#F0EEE4",
            fontFamily: "inherit",
            fontSize: 15,
            outline: "none",
          }}
        />
        {error && (
          <div style={{ color: "#B5665A", fontSize: 12.5 }}>
            Wrong passcode.
          </div>
        )}
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 11,
            color: "#A6A292",
          }}
        >
          client-side gate only — not real security
        </div>
        <button
          onClick={submit}
          style={{
            padding: "10px 0",
            borderRadius: 10,
            border: "none",
            background: "#1C1B19",
            color: "#FAF9F5",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 15,
          }}
        >
          Enter
        </button>
      </div>
    </div>
  );
}

/* ---------- Admin panel ---------- */

function AdminPanel({ onBack }) {
  const [users, setUsers] = useState([]);
  const [abuseLog, setAbuseLog] = useState([]);
  const [grantAmount, setGrantAmount] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await window.storage.list("user:", true);
      const keys = list?.keys || [];
      const loaded = [];
      for (const k of keys) {
        const res = await window.storage.get(k, true);
        if (res && res.value) {
          const uname = k.replace("user:", "");
          let profile = JSON.parse(res.value);
          const { profile: refilled, changed } = applyRefill(profile);
          if (changed) {
            try {
              await saveUser(uname, refilled);
            } catch (e) {
              // ignore, display anyway
            }
            profile = refilled;
          }
          loaded.push({ username: uname, ...profile });
        }
      }
      setUsers(loaded);
    } catch (e) {
      setUsers([]);
    }
    try {
      const res = await window.storage.get("abuse-log", true);
      setAbuseLog(res && res.value ? JSON.parse(res.value).reverse() : []);
    } catch (e) {
      setAbuseLog([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const sendTokens = async (username) => {
    const amt = parseInt(grantAmount[username], 10);
    if (!amt || amt === 0) return;
    const user = users.find((u) => u.username === username);
    const updated = { ...user, tokens: (user.tokens || 0) + amt };
    delete updated.username;
    await saveUser(username, updated);
    setGrantAmount((g) => ({ ...g, [username]: "" }));
    refresh();
  };

  const toggleBan = async (username) => {
    const user = users.find((u) => u.username === username);
    const updated = { ...user, banned: !user.banned };
    delete updated.username;
    await saveUser(username, updated);
    refresh();
  };

  const toggleUnlimited = async (username) => {
    const user = users.find((u) => u.username === username);
    const updated = { ...user, unlimited: !user.unlimited };
    delete updated.username;
    await saveUser(username, updated);
    refresh();
  };

  const clearLog = async () => {
    await window.storage.set("abuse-log", JSON.stringify([]), true);
    refresh();
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 0 40px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid #E4E1D8",
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#5C594E",
            display: "flex",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <ShieldAlert size={16} color="#B5665A" />
        <span
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#5C594E",
          }}
        >
          admin panel
        </span>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px" }}>
        {/* Users & tokens */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Coins size={16} color="#A87C2A" />
            <span style={{ fontSize: 17, fontWeight: 600 }}>Users & tokens</span>
          </div>
          {loading && <div style={{ color: "#8C8879", fontSize: 14 }}>Loading…</div>}
          {!loading && users.length === 0 && (
            <div style={{ color: "#8C8879", fontSize: 14 }}>No users yet.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {users.map((u) => (
              <div
                key={u.username}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#F0EEE4",
                  border: "1px solid #E4E1D8",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 600, minWidth: 100 }}>
                  {u.username}
                  {u.banned && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#B5665A",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      BANNED
                    </span>
                  )}
                  {u.unlimited && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "#2D6A62",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      UNLIMITED
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontSize: 13,
                    color: "#5C594E",
                  }}
                >
                  {u.unlimited ? "∞" : u.tokens} tokens
                </div>
                <div style={{ flex: 1 }} />
                <input
                  type="number"
                  placeholder="amount"
                  value={grantAmount[u.username] || ""}
                  onChange={(e) =>
                    setGrantAmount((g) => ({ ...g, [u.username]: e.target.value }))
                  }
                  style={{
                    width: 90,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #E4E1D8",
                    background: "#FAF9F5",
                    fontFamily: "inherit",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => sendTokens(u.username)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#2D6A62",
                    color: "#FAF9F5",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Send
                </button>
                <button
                  onClick={() => toggleUnlimited(u.username)}
                  title={u.unlimited ? "Remove unlimited tokens" : "Give unlimited tokens"}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: u.unlimited ? "#A87C2A" : "#F0EEE4",
                    color: u.unlimited ? "#FAF9F5" : "#5C594E",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {u.unlimited ? "∞ on" : "∞ off"}
                </button>
                <button
                  onClick={() => toggleBan(u.username)}
                  title={u.banned ? "Unban" : "Ban"}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: "none",
                    background: u.banned ? "#2D6A62" : "#B5665A",
                    color: "#FAF9F5",
                    cursor: "pointer",
                    display: "flex",
                  }}
                >
                  {u.banned ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Abuse log */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={16} color="#B5665A" />
              <span style={{ fontSize: 17, fontWeight: 600 }}>Abuse log</span>
            </div>
            {abuseLog.length > 0 && (
              <button
                onClick={clearLog}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "none",
                  background: "transparent",
                  color: "#8C8879",
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                <Trash2 size={13} /> clear
              </button>
            )}
          </div>
          {abuseLog.length === 0 && (
            <div style={{ color: "#8C8879", fontSize: 14 }}>Nothing flagged.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {abuseLog.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#F0EEE4",
                  border: "1px solid #E4E1D8",
                  fontSize: 13.5,
                }}
              >
                <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{entry.username}</span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                      color: "#A6A292",
                      fontSize: 11,
                    }}
                  >
                    {entry.mode} · flagged "{entry.reason}" · {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: "#5C594E" }}>{entry.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mode cards / dashboard ---------- */

function ModeCard({ id, mode, onSelect }) {
  const Icon = mode.icon;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 14,
        padding: "22px 20px",
        borderRadius: 16,
        border: "1px solid #E4E1D8",
        background: "#F0EEE4",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.15s ease, border-color 0.15s ease",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = mode.accent;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#E4E1D8";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: mode.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FAF9F5",
        }}
      >
        <Icon size={20} strokeWidth={2} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#1C1B19" }}>
          {mode.label}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 12.5,
            color: "#8C8879",
            marginTop: 4,
          }}
        >
          {mode.tagline} · {mode.cost} token{mode.cost > 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

function Dashboard({ onSelect }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "48px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ fontSize: 30, fontStyle: "italic", color: "#1C1B19", marginBottom: 6 }}>
          What kind of Brox do you need?
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 13,
            color: "#8C8879",
            marginBottom: 32,
          }}
        >
          five modes, one AI
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          {Object.entries(MODES).map(([id, mode]) => (
            <ModeCard key={id} id={id} mode={mode} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Chat view ---------- */

function ChatView({ modeId, mode, messages, setMessages, onBack, profile, spendTokens }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [blockedMsg, setBlockedMsg] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastSpokenRef = useRef(-1);
  const Icon = mode.icon;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) return;
    const lastIndex = messages.length - 1;
    const last = messages[lastIndex];
    if (
      last &&
      last.role === "assistant" &&
      last.type !== "image" &&
      lastIndex !== lastSpokenRef.current
    ) {
      lastSpokenRef.current = lastIndex;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(last.content);
      window.speechSynthesis.speak(utter);
    }
  }, [messages, voiceOn]);

  useEffect(() => {
    if (!voiceOn && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [voiceOn]);

  const toggleListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (!profile) {
      setBlockedMsg("Still loading your profile — try again in a second.");
      return;
    }

    try {
      if (profile.banned) {
        setBlockedMsg("This account is banned. Contact the admin.");
        return;
      }
      if (profile.tokens < mode.cost && !profile.unlimited) {
        setBlockedMsg(`Not enough tokens — this costs ${mode.cost}, you have ${profile.tokens}. Ask the admin for more.`);
        return;
      }
      setBlockedMsg(null);

      const reason = flagCheck(text);
      if (reason) {
        logAbuse({
          username: profile.username,
          mode: modeId,
          message: text,
          reason,
          timestamp: Date.now(),
        });
      }

      const ok = await spendTokens(mode.cost);
      if (!ok) {
        setBlockedMsg("Not enough tokens.");
        return;
      }
    } catch (e) {
      console.warn("Send pre-check failed:", e);
      setBlockedMsg("Something went wrong sending that — try again.");
      return;
    }

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(modeId, nextMessages);
    setInput("");
    setLoading(true);

    if (modeId === "image") {
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        text
      )}?width=768&height=768&nologo=true&seed=${seed}`;
      setMessages(modeId, [
        ...nextMessages,
        { role: "assistant", type: "image", content: imageUrl, prompt: text },
      ]);
      setLoading(false);
      return;
    }

    try {
      const reply = await callModel(nextMessages);
      setMessages(modeId, [...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(modeId, [
        ...nextMessages,
        { role: "assistant", content: `Couldn't reach the model: ${err?.message || "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const callModel = async (msgList) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system:
          mode.system +
          " You have a web_search tool — use it whenever the answer depends on current or specific real-world information you might not know for certain.",
        messages: msgList.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `API request failed (${response.status})`);
    }
    const textBlocks = (data?.content || []).filter((b) => b.type === "text");
    if (textBlocks.length > 0) return textBlocks.map((b) => b.text).join("\n\n");
    throw new Error("The model returned no text response.");
  };

  const regenerate = async (assistantIndex) => {
    if (loading || !profile || (profile.tokens < mode.cost && !profile.unlimited)) {
      setBlockedMsg(`Not enough tokens — regenerating costs ${mode.cost}.`);
      return;
    }
    const priorMessages = messages.slice(0, assistantIndex);
    const ok = await spendTokens(mode.cost);
    if (!ok) {
      setBlockedMsg("Not enough tokens.");
      return;
    }
    setLoading(true);
    try {
      const reply = await callModel(priorMessages);
      setMessages(modeId, [...priorMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages(modeId, [
        ...priorMessages,
        { role: "assistant", content: `Couldn't reach the model: ${err?.message || "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = (text, index) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid #E4E1D8",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back to dashboard"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#5C594E",
            padding: 4,
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: mode.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FAF9F5",
            flexShrink: 0,
          }}
        >
          <Icon size={14} strokeWidth={2} />
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 13,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#5C594E",
          }}
        >
          {mode.label}
        </span>
        <div style={{ flex: 1 }} />
        {messages.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm(`Clear this ${mode.label} conversation?`)) {
                setMessages(modeId, []);
              }
            }}
            aria-label="New chat"
            title="Clear conversation"
            style={{
              border: "none",
              background: "transparent",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8C8879",
              padding: 6,
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
        <button
          onClick={() => setVoiceOn((v) => !v)}
          aria-label={voiceOn ? "Turn off voice replies" : "Turn on voice replies"}
          title={voiceOn ? "Voice replies on" : "Voice replies off"}
          style={{
            border: "none",
            background: voiceOn ? mode.accent : "transparent",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: voiceOn ? "#FAF9F5" : "#8C8879",
            padding: 6,
            transition: "background 0.15s ease",
          }}
        >
          {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "32px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && (
            <div style={{ marginTop: "16vh", textAlign: "center", color: "#8C8879" }}>
              <div style={{ fontSize: 26, fontStyle: "italic", color: "#1C1B19", marginBottom: 8 }}>
                {mode.empty}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: 13 }}>
                {mode.label} is ready when you are.
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className="msg-in"
              style={{
                marginBottom: 28,
                display: "flex",
                flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#A6A292",
                  marginBottom: 6,
                }}
              >
                {m.role === "user" ? "you" : mode.label.split(" ")[0].toLowerCase() + " brox"}
              </div>
              <div
                style={{
                  maxWidth: "88%",
                  padding: m.type === "image" ? 6 : "12px 16px",
                  borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                  background: m.role === "user" ? "#1C1B19" : "#F0EEE4",
                  color: m.role === "user" ? "#FAF9F5" : "#1C1B19",
                  lineHeight: 1.55,
                  fontSize: 16,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.type === "image" ? (
                  <img
                    src={m.content}
                    alt={m.prompt}
                    style={{ display: "block", width: "100%", maxWidth: 360, borderRadius: 10 }}
                  />
                ) : (
                  <MessageText text={m.content} />
                )}
              </div>
              {m.role === "assistant" && m.type !== "image" && !(loading && i === messages.length - 1) && (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <button
                    onClick={() => copyMessage(m.content, i)}
                    title="Copy"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#A6A292",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: 4,
                    }}
                  >
                    {copiedIndex === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {i === messages.length - 1 && (
                    <button
                      onClick={() => regenerate(i)}
                      title="Regenerate"
                      disabled={loading}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#A6A292",
                        cursor: loading ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: 4,
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#A6A292",
                  marginBottom: 6,
                }}
              >
                {mode.label.split(" ")[0].toLowerCase()} brox
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "14px 14px 14px 2px",
                  background: "#F0EEE4",
                  display: "flex",
                  gap: 4,
                }}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#8C8879",
                      animation: "pulse 1.1s infinite",
                      animationDelay: `${d * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {blockedMsg && (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "8px 20px",
            fontSize: 13,
            color: "#B5665A",
            textAlign: "center",
          }}
        >
          {blockedMsg}
        </div>
      )}

      <div style={{ borderTop: "1px solid #E4E1D8", padding: "16px 20px 22px", flexShrink: 0 }}>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            background: "#F0EEE4",
            borderRadius: 18,
            padding: "10px 10px 10px 18px",
            border: "1px solid #E4E1D8",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode.placeholder}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 16,
              lineHeight: 1.5,
              color: "#1C1B19",
              padding: "6px 0",
              maxHeight: 160,
            }}
          />
          {voiceSupported && (
            <button
              onClick={toggleListening}
              aria-label={listening ? "Stop recording" : "Record voice message"}
              title={listening ? "Listening… tap to stop" : "Speak your message"}
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: listening ? "#B5665A" : "transparent",
                color: listening ? "#FAF9F5" : "#5C594E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s ease",
                animation: listening ? "pulseRing 1.2s infinite" : "none",
              }}
            >
              <Mic size={16} />
            </button>
          )}
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              cursor: loading || !input.trim() ? "default" : "pointer",
              background: loading || !input.trim() ? "#D8D5C7" : mode.accent,
              color: "#FAF9F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease",
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Root ---------- */

export default function BroxAI() {
  const [username, setUsername] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeMode, setActiveMode] = useState(null);
  const [conversations, setConversations] = useState({
    chat: [],
    code: [],
    feels: [],
    image: [],
    advice: [],
  });
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminView, setAdminView] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [, setTick] = useState(0);

  // Purely forces a re-render every 30s so the "next refill in Xh Ym"
  // countdown stays live without waiting for an actual refill to land.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("my-username", false);
        if (res && res.value) {
          const name = res.value;
          let p = await loadOrCreateUser(name);
          const { profile: refilled, changed } = applyRefill(p);
          p = refilled;
          if (changed) {
            try {
              await saveUser(name, p);
            } catch (e) {
              // will retry on next check
            }
          }
          setUsername(name);
          setProfile({ username: name, ...p });
        }
      } catch (e) {
        // no saved username
      }
      setInitializing(false);
    })();
  }, []);

  // Re-check for a token refill every minute while the app is open.
  useEffect(() => {
    if (!username) return;
    const interval = setInterval(() => {
      setProfile((prev) => {
        if (!prev) return prev;
        const { profile: refilled, changed } = applyRefill(prev);
        if (changed) {
          saveUser(username, refilled).catch(() => {});
          return { username, ...refilled };
        }
        return prev;
      });
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [username]);

  const enterName = async (name) => {
    // Always let the person in, even if storage is unavailable or slow —
    // fall back to a local-only session rather than leaving them stuck.
    let p = { tokens: STARTING_TOKENS, banned: false, lastRefill: Date.now() };
    try {
      await window.storage.set("my-username", name, false);
      p = await loadOrCreateUser(name);
      const { profile: refilled, changed } = applyRefill(p);
      p = refilled;
      if (changed) await saveUser(name, p);
    } catch (e) {
      console.warn("Storage unavailable, continuing without persistence:", e);
    }
    setUsername(name);
    setProfile({ username: name, ...p });
  };

  const spendTokens = async (cost) => {
    if (!profile) return false;
    if (profile.unlimited) return true;
    if (profile.tokens < cost) return false;
    const updated = { ...profile, tokens: profile.tokens - cost };
    delete updated.username;
    // Update local state immediately so a send is never blocked by storage
    // issues; persist in the background and don't let a failure break the send.
    setProfile({ username, ...updated });
    try {
      await saveUser(username, updated);
    } catch (e) {
      console.warn("Couldn't persist token spend:", e);
    }
    return true;
  };

  const setMessages = (modeId, messages) => {
    setConversations((prev) => ({ ...prev, [modeId]: messages }));
  };

  if (initializing) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF9F5",
          color: "#8C8879",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
        }}
      >
        loading…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        background: "#FAF9F5",
        color: "#1C1B19",
        fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
      }}
    >
      {!username ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "18px 24px",
              borderBottom: "1px solid #E4E1D8",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2D6A62" }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#5C594E",
              }}
            >
              brox ai
            </span>
          </div>
          <NameGate onEnter={enterName} onAdminClick={() => setAdminModalOpen(true)} />
        </>
      ) : adminView ? (
        <AdminPanel onBack={() => setAdminView(false)} />
      ) : activeMode === null ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "18px 24px",
              borderBottom: "1px solid #E4E1D8",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2D6A62" }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#5C594E",
              }}
            >
              brox ai
            </span>
            <div style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 12,
                color: "#A6A292",
              }}
            >
              {username}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 12.5,
                color: profile?.unlimited ? "#A87C2A" : (profile?.tokens ?? 0) <= 3 ? "#B5665A" : "#5C594E",
                background: "#F0EEE4",
                border: `1px solid ${profile?.unlimited ? "#A87C2A" : (profile?.tokens ?? 0) <= 3 ? "#B5665A" : "#E4E1D8"}`,
                borderRadius: 20,
                padding: "5px 12px",
              }}
              title={profile?.unlimited ? "Unlimited tokens" : (profile?.tokens ?? 0) <= 3 ? "Running low — ask the admin for more" : "Token balance"}
            >
              <Coins size={13} color={profile?.unlimited ? "#A87C2A" : (profile?.tokens ?? 0) <= 3 ? "#B5665A" : "#A87C2A"} />
              {profile?.unlimited ? "∞" : profile?.tokens ?? 0}
            </div>
            {profile && !profile.unlimited && profile.tokens < MAX_TOKENS && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  fontSize: 11,
                  color: "#A6A292",
                }}
              >
                +{REFILL_AMOUNT} in {formatDuration(msUntilNextRefill(profile))}
              </span>
            )}
            <button
              onClick={() => setAdminModalOpen(true)}
              title="Admin panel"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#A6A292",
                display: "flex",
                padding: 6,
              }}
            >
              <ShieldAlert size={16} />
            </button>
            <button
              onClick={async () => {
                if (window.confirm("Switch user? You'll need to re-enter a name.")) {
                  try {
                    await window.storage.delete("my-username", false);
                  } catch (e) {
                    // ignore
                  }
                  setUsername(null);
                  setProfile(null);
                  setActiveMode(null);
                }
              }}
              title="Switch user"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#A6A292",
                display: "flex",
                padding: 6,
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
          <Dashboard onSelect={setActiveMode} />
        </>
      ) : (
        <ChatView
          key={activeMode}
          modeId={activeMode}
          mode={MODES[activeMode]}
          messages={conversations[activeMode]}
          setMessages={setMessages}
          onBack={() => setActiveMode(null)}
          profile={profile}
          spendTokens={spendTokens}
        />
      )}

      <div
        style={{
          textAlign: "center",
          padding: "6px 0 10px",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 10.5,
          color: "#C4C1B4",
          letterSpacing: "0.02em",
          flexShrink: 0,
        }}
      >
        made by coolrabbitgaming on YouTube
      </div>

      {adminModalOpen && (
        <AdminLoginModal
          onClose={() => setAdminModalOpen(false)}
          onSuccess={() => {
            setAdminModalOpen(false);
            setAdminView(true);
          }}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(181,102,90,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(181,102,90,0); }
          100% { box-shadow: 0 0 0 0 rgba(181,102,90,0); }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .msg-in { animation: msgIn 0.2s ease-out; }
        textarea::placeholder { color: #A6A292; }
        input::placeholder { color: #A6A292; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: #E4E1D8; border-radius: 8px; }
      `}</style>
    </div>
  );
}
