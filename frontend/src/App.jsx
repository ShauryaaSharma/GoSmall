import { useState, useRef, useEffect } from "react"
import "./App.css"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

const pad = (n, d = 2) => String(n).padStart(d, "0")

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init }
    catch { return init }
  })
  const set = (v) => { setVal(v); localStorage.setItem(key, JSON.stringify(v)) }
  return [val, set]
}

// ─── Shared Google button renderer ───────────────────────────────────────────
function GoogleSignInButton({ onLogin }) {
  const googleBtnRef = useRef(null)
  const onLoginRef   = useRef(onLogin)
  onLoginRef.current = onLogin

  useEffect(() => {
    const handleCredentialResponse = async (response) => {
      try {
        const payload = JSON.parse(atob(response.credential.split(".")[1]))
        const googleUser = {
          name:    payload.name,
          email:   payload.email,
          picture: payload.picture,
          sub:     payload.sub,
        }
        // Persist Google user into Redis via our backend
        const res = await fetch("/api/auth/google", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(googleUser),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Google auth failed")
        onLoginRef.current(data.user)
      } catch (e) {
        console.error("GoSmall: Google auth error", e)
      }
    }

    const tryInit = () => {
      if (!window.google?.accounts?.id) return false
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback:  handleCredentialResponse,
        ux_mode:   "popup",
      })
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type:  "standard",
          theme: "outline",
          size:  "large",
          width: googleBtnRef.current.offsetWidth || 360,
        })
      }
      return true
    }

    if (!tryInit()) {
      const iv = setInterval(() => { if (tryInit()) clearInterval(iv) }, 200)
      return () => clearInterval(iv)
    }
  }, [])

  return (
    <div className="google-btn-shell">
      <div className="google-btn-decor">
        <span className="google-btn-label">
          <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          CONTINUE WITH GOOGLE
        </span>
      </div>
      <div ref={googleBtnRef} className="google-btn-real" />
    </div>
  )
}

// ─── Auth Page (Login + Signup tabs) ─────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [tab,      setTab]      = useState("login")   // "login" | "signup"
  const [username, setUsername] = useState("")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [success,  setSuccess]  = useState("")

  const reset = (t) => { setTab(t); setError(""); setSuccess(""); setUsername(""); setEmail(""); setPassword(""); setConfirm("") }

  const handleLogin = async () => {
    setError(""); setSuccess("")
    if (!email || !password) { setError("ERROR: All fields are required"); return }
    setLoading(true)
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Login failed")
      onLogin(data.user)
    } catch (e) {
      setError("ERROR: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    setError(""); setSuccess("")
    if (!username || !email || !password || !confirm) { setError("ERROR: All fields are required"); return }
    if (password !== confirm) { setError("ERROR: Passwords do not match"); return }
    if (password.length < 6)  { setError("ERROR: Password must be at least 6 characters"); return }
    setLoading(true)
    try {
      const res  = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Signup failed")
      setSuccess("Account created! You can now log in.")
      setTimeout(() => reset("login"), 1400)
    } catch (e) {
      setError("ERROR: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => { if (e.key === "Enter") tab === "login" ? handleLogin() : handleSignup() }

  return (
    <div className="login-page">
      <div className="grid-bg" />
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      <div className="login-container">
        <div className="login-card">
          <div className="card-corner-tr" />
          <div className="card-corner-bl" />

          {/* Logo */}
          <div className="login-logo">
            <div className="hex-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <h1 className="logo-text">GoSmall</h1>
          </div>
          <p className="login-tagline">URL COMPRESSION SYSTEM v1.0 <span className="cursor-blink">_</span></p>

          {/* Tabs */}
          <div className="auth-tabs">
            <button className={`auth-tab ${tab === "login"  ? "active" : ""}`} onClick={() => reset("login")}>[ LOGIN ]</button>
            <button className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => reset("signup")}>[ SIGN UP ]</button>
          </div>

          {/* Google button — works for both login and signup */}
          <GoogleSignInButton onLogin={onLogin} />

          <div className="login-sep">
            <span className="login-sep-text">// OR USE CREDENTIALS</span>
          </div>

          {/* ── Login form ── */}
          {tab === "login" && (
            <div className="auth-form">
              <div className="input-row">
                <label>Email</label>
                <input type="text" value={email} placeholder="agent@example.com"
                  onChange={e => setEmail(e.target.value)} onKeyDown={onKey} autoComplete="email" />
              </div>
              <div className="input-row">
                <label>Password</label>
                <input type="password" value={password} placeholder="••••••••"
                  onChange={e => setPassword(e.target.value)} onKeyDown={onKey} autoComplete="current-password" />
              </div>

              {error   && <div className="error-msg">{error}</div>}
              {success && <div className="success-msg">{success}</div>}

              <button className={`btn-fire ${loading ? "loading" : ""}`} onClick={handleLogin} disabled={loading}>
                <span className="btn-bg" /><span className="btn-label">{loading ? "// AUTHENTICATING..." : "⚡ LOGIN"}</span>
              </button>

              <p className="auth-switch">No account? <span onClick={() => reset("signup")}>Sign up →</span></p>
            </div>
          )}

          {/* ── Signup form ── */}
          {tab === "signup" && (
            <div className="auth-form">
              <div className="input-row">
                <label>Username</label>
                <input type="text" value={username} placeholder="agent_zero"
                  onChange={e => setUsername(e.target.value)} onKeyDown={onKey} autoComplete="username" />
              </div>
              <div className="input-row">
                <label>Email</label>
                <input type="text" value={email} placeholder="agent@example.com"
                  onChange={e => setEmail(e.target.value)} onKeyDown={onKey} autoComplete="email" />
              </div>
              <div className="input-row">
                <label>Password</label>
                <input type="password" value={password} placeholder="min 6 characters"
                  onChange={e => setPassword(e.target.value)} onKeyDown={onKey} autoComplete="new-password" />
              </div>
              <div className="input-row">
                <label>Confirm Password</label>
                <input type="password" value={confirm} placeholder="repeat password"
                  onChange={e => setConfirm(e.target.value)} onKeyDown={onKey} autoComplete="new-password" />
              </div>

              {error   && <div className="error-msg">{error}</div>}
              {success && <div className="success-msg">{success}</div>}

              <button className={`btn-fire ${loading ? "loading" : ""}`} onClick={handleSignup} disabled={loading}>
                <span className="btn-bg" /><span className="btn-label">{loading ? "// CREATING ACCOUNT..." : "⚡ CREATE ACCOUNT"}</span>
              </button>

              <p className="auth-switch">Have an account? <span onClick={() => reset("login")}>Login →</span></p>
            </div>
          )}

          <div className="login-note" style={{ marginTop: "18px" }}>
            <span className="note-label">SECURE</span>
            Authenticated via Google OAuth 2.0 or credentials · Data stored in Redis.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Welcome Modal ────────────────────────────────────────────────────────────
function WelcomeModal({ onClose }) {
  const steps = [
    { icon: "⚡", title: "PASTE YOUR URL",      body: "Drop any long URL into the Target URL field. Must start with https:// or http://." },
    { icon: "✏️", title: "SET CUSTOM ALIAS",    body: "Optionally type a custom alias — e.g. 'my-portfolio'. Leave blank to auto-generate one. Aliases must be 3–30 chars." },
    { icon: "🚀", title: "EXECUTE COMPRESSION", body: "Hit the button. Your Go server stores the mapping in Redis. Custom aliases are checked for availability first." },
    { icon: "📋", title: "COPY & SHARE",        body: "Copy the short link and paste anywhere. Visiting it redirects instantly to your original URL." },
  ]
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-corner tr" />
        <div className="modal-corner bl" />
        <div className="modal-header">
          <span className="modal-pre">// SYSTEM BRIEFING</span>
          <h2 className="modal-title">HOW TO USE GoSmall</h2>
          <p className="modal-sub">Read before proceeding, agent.</p>
        </div>
        <div className="modal-steps">
          {steps.map((s, i) => (
            <div className="modal-step" key={i} style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="step-num">{pad(i + 1)}</div>
              <div className="step-icon">{s.icon}</div>
              <div className="step-body">
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="modal-btn" onClick={onClose}>
          <span className="btn-bg" />
          <span>INITIATE SESSION</span>
          <span className="btn-arrow">→</span>
        </button>
      </div>
    </div>
  )
}

// ─── Particle burst ───────────────────────────────────────────────────────────
function spawnParticles(x, y) {
  const colors = ["#00ff88","#00e5ff","#ff2d78","#ffe600","#ffffff"]
  for (let i = 0; i < 22; i++) {
    const p     = document.createElement("div")
    const angle = Math.random() * Math.PI * 2
    const dist  = 50 + Math.random() * 90
    const size  = 2  + Math.random() * 4
    Object.assign(p.style, {
      position: "fixed", left: x + "px", top: y + "px",
      width: size + "px", height: size + "px", borderRadius: "50%",
      background: colors[Math.floor(Math.random() * colors.length)],
      pointerEvents: "none", zIndex: 9999,
      "--tx": Math.cos(angle) * dist + "px",
      "--ty": Math.sin(angle) * dist + "px",
      animation: "particle-fly 0.9s ease-out forwards",
    })
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 900)
  }
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function ResultCard({ url, onNew }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="result-card">
      <div className="result-label">// SHORT LINK GENERATED</div>
      <div className="result-url">{url}</div>
      <div className="result-actions">
        <button className={`btn-sm ${copied ? "copied" : ""}`} onClick={copy}>
          {copied ? "[ ✓ COPIED ]" : "[ COPY ]"}
        </button>
        <button className="btn-sm" onClick={() => window.open(url, "_blank")}>[ OPEN ]</button>
        <button className="btn-sm" onClick={onNew}>[ NEW ]</button>
      </div>
    </div>
  )
}

// ─── History Item ─────────────────────────────────────────────────────────────
function HistoryItem({ item, index, total }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(item.shortened).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  const code = item.shortened.split("/").pop()
  return (
    <div className="history-item">
      <div className="h-idx">#{pad(total - index)}</div>
      <div className="h-original" title={item.original}>{item.original}</div>
      <div className="h-short" onClick={copy} title="Click to copy">
        {copied ? "✓ copied" : `/${code}`}
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,      setUser]      = useState(null)
  const [showModal, setShowModal] = useState(true)
  const [urlVal,    setUrlVal]    = useState("")
  const [aliasVal,  setAliasVal]  = useState("")
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState("")
  const [history,   setHistory]   = useLocalStorage("gosmall_history", [])
  const btnRef = useRef(null)

  const aliasValid = aliasVal === "" || /^[a-zA-Z0-9_-]{3,30}$/.test(aliasVal)

  const handleSignOut = () => {
    window.google?.accounts?.id?.disableAutoSelect()
    setUser(null)
  }

  const shorten = async () => {
    setError(""); setResult(null)
    const long_url     = urlVal.trim()
    const user_id      = user?.email || user?.sub || "anonymous"
    const custom_alias = aliasVal.trim()

    if (!long_url) { setError("ERROR: Target URL cannot be empty"); return }
    if (!long_url.startsWith("http://") && !long_url.startsWith("https://")) {
      setError("ERROR: URL must start with http:// or https://"); return
    }
    if (custom_alias && !aliasValid) {
      setError("ERROR: Alias must be 3–30 chars, letters/numbers/hyphens/underscores only"); return
    }

    setLoading(true)
    try {
      const body = { long_url, user_id }
      if (custom_alias) body.custom_alias = custom_alias

      const res  = await fetch("/api/create-short-url", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Server error")

      setResult(data.short_url)
      setHistory(prev =>
        [{ original: long_url, shortened: data.short_url, ts: Date.now() }, ...prev].slice(0, 10)
      )
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        spawnParticles(r.left + r.width / 2, r.top + r.height / 2)
      }
    } catch (e) {
      setError("ERROR: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => { if (e.key === "Enter") shorten() }

  if (!user) return <AuthPage onLogin={setUser} />

  return (
    <>
      {showModal && <WelcomeModal onClose={() => setShowModal(false)} />}

      <div className="grid-bg" />
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      <div className="container">
        <header>
          <div className="logo-row">
            <div className="hex-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <h1 className="logo-text">GoSmall</h1>
          </div>
          <p className="tagline">URL COMPRESSION SYSTEM v1.0 <span className="cursor-blink">_</span></p>
          <div className="user-info">
            {user.picture && <img src={user.picture} alt={user.name} className="user-avatar" />}
            <span className="user-name">{user.name || user.username}</span>
            {user.provider === "google"
              ? <span className="provider-badge google">G</span>
              : <span className="provider-badge pass">PW</span>
            }
            <button className="btn-signout" onClick={handleSignOut}>[ SIGN OUT ]</button>
          </div>
        </header>

        <div className="stats-bar">
          <div className="stat">
            <div className="stat-val cyan">{pad(history.length)}</div>
            <div className="stat-label">Links Created</div>
          </div>
          <div className="stat">
            <div className="stat-val pink">LIVE</div>
            <div className="stat-label">Status</div>
          </div>
          <div className="stat help-stat" onClick={() => setShowModal(true)} title="Show instructions">
            <div className="stat-val dim">?</div>
            <div className="stat-label">Help</div>
          </div>
        </div>

        <div className="card">
          <div className="card-corner-tr" /><div className="card-corner-bl" />
          <div className="section-label"><span className="arrow-blink">&gt;</span> Initialize Short Link</div>

          <div className="input-group">
            <div className="input-row">
              <label>Target URL</label>
              <input
                type="url" value={urlVal}
                placeholder="https://your-very-long-url.com/goes/here"
                onChange={e => setUrlVal(e.target.value)}
                onKeyDown={onKey} autoComplete="off" spellCheck="false"
              />
            </div>

            <div className="input-row">
              <label>Custom Alias <span className="label-optional">— optional</span></label>
              <div className="alias-input-wrap">
                <span className="alias-prefix">localhost:9808/</span>
                <input
                  type="text" value={aliasVal} placeholder="my-cool-link"
                  onChange={e => setAliasVal(e.target.value.toLowerCase())}
                  onKeyDown={onKey} autoComplete="off" spellCheck="false"
                  className={`alias-input ${aliasVal && !aliasValid ? "invalid" : ""}`}
                />
              </div>
              {aliasVal && !aliasValid && (
                <div className="alias-hint">3–30 chars · letters, numbers, - and _ only</div>
              )}
              {aliasVal === "" && (
                <div className="alias-hint muted">Leave blank to auto-generate</div>
              )}
            </div>
          </div>

          <button ref={btnRef} className={`btn-fire ${loading ? "loading" : ""}`} onClick={shorten} disabled={loading}>
            <span className="btn-bg" />
            <span className="btn-label">{loading ? "// PROCESSING..." : "⚡ EXECUTE COMPRESSION"}</span>
          </button>

          {error  && <div className="error-msg">{error}</div>}
          {result && (
            <ResultCard
              url={result}
              onNew={() => { setResult(null); setUrlVal(""); setAliasVal(""); setError("") }}
            />
          )}
        </div>

        <div className="card history-card">
          <div className="card-corner-tr pink" /><div className="card-corner-bl green" />
          <div className="section-label"><span className="arrow-blink">&gt;</span> Compression Log</div>
          {history.length === 0
            ? <div className="empty-log">// no compressions yet — awaiting input</div>
            : <>
                <div className="history-list">
                  {history.map((item, i) => (
                    <HistoryItem key={item.ts} item={item} index={i} total={history.length} />
                  ))}
                </div>
                <button className="btn-clear" onClick={() => setHistory([])}>[ CLEAR LOG ]</button>
              </>
          }
        </div>

        <footer>
          <a className="credit-link" href="https://github.com/ShauryaaSharma" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
            <span>built by <strong>Shaurya Sharma</strong></span>
          </a>
        </footer>
      </div>
    </>
  )
}
