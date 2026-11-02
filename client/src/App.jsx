import { useCallback, useEffect, useState } from 'react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

async function api(path, body) {
  const res = await fetch(API_BASE + '/api' + path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

const KEY = 'mgr-session'
const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}

export default function App() {
  const [session, setSession] = useState(loadSession)
  const save = useCallback((s) => {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
    setSession(s)
  }, [])

  return (
    <main className="wrap">
      <header className="brand">
        <div className="logo" aria-hidden="true">↻</div>
        <div>
          <h1>Merry-Go-Round</h1>
        </div>
      </header>

      {!session && <Home onStart={save} />}
      {session?.role === 'leader' && (
        <Leader s={session} onChange={save} onLeave={() => save(null)} />
      )}
      {session?.role === 'member' && (
        <Member s={session} onChange={save} onLeave={() => save(null)} />
      )}
    </main>
  )
}

/* ---------- Home: join or create ---------- */
function Home({ onStart }) {
  const [tab, setTab] = useState('join')
  const [f, setF] = useState({ name: '', token: '', group: '', size: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (tab === 'join') {
        const token = f.token.trim().toUpperCase()
        const r = await api('/join', { name: f.name, token })
        onStart({ role: 'member', token, group: r.group, member: r.member })
      } else {
        const g = await api('/groups', { name: f.group, size: f.size })
        onStart({
          role: 'leader',
          token: g.token,
          adminKey: g.adminKey,
          group: { name: g.name, size: g.size },
        })
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home">
      <section className="welcome">
        <div className="decor-wheel" aria-hidden="true">
          <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
        </div>
      </section>

      <section className="card home-card">
        <div className="card-heading">
          <span className="eyebrow">LET'S GET STARTED</span>
          <h2>You're in the right place</h2>
          <p>Join your group or set one up in seconds.</p>
        </div>
        <div className="tabs" role="tablist" aria-label="Choose how to get started">
          <button type="button" role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>
            Join a group
          </button>
          <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>
            Create a group
          </button>
        </div>

        <form onSubmit={submit}>
          {tab === 'join' ? (
            <>
              <label htmlFor="member-name">Your name</label>
              <input id="member-name" value={f.name} onChange={set('name')} placeholder="e.g. Wanjiku" autoComplete="name" required />
              <label htmlFor="group-token">Group code</label>
              <input
                id="group-token"
                value={f.token}
                onChange={set('token')}
                placeholder="e.g. 410D54"
                className="mono"
                maxLength={6}
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="group-name">Give your group a name</label>
              <input id="group-name" value={f.group} onChange={set('group')} placeholder="e.g. Umoja Chama" required />
              <label htmlFor="group-size">How many people are joining?</label>
              <input
                id="group-size"
                type="number"
                min="2"
                max="100"
                value={f.size}
                onChange={set('size')}
                placeholder="Choose 2 to 100"
                required
              />
            </>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : tab === 'join' ? 'Join your group' : 'Create your group'}
            {!busy && <span aria-hidden="true">→</span>}
          </button>
        </form>
      </section>
    </div>
  )
}

/* ---------- Leader ---------- */
function Leader({ s, onChange, onLeave }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [participantName, setParticipantName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const copy = async () => {
    setCopyError('')
    try {
      await navigator.clipboard.writeText(s.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError('Could not copy the code. Please copy it manually.')
    }
  }

  async function joinAsParticipant(event) {
    event.preventDefault()
    setJoinError('')
    setBusy(true)
    try {
      const result = await api('/join', { name: participantName, token: s.token })
      onChange({ ...s, member: result.member })
    } catch (e) {
      setJoinError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function resetGroup() {
    if (!confirm('Reset everyone’s selected numbers? All participants will be able to draw again.')) return
    setResetError('')
    setResetMessage('')
    setBusy(true)
    try {
      const result = await api('/groups/reset', { token: s.token, adminKey: s.adminKey })
      setResetMessage(`Reset complete. ${result.reset} participant${result.reset === 1 ? '' : 's'} can draw again.`)
      setTick((value) => value + 1)
      if (s.member) onChange({ ...s, member: { ...s.member, number: null, submitted: false } })
    } catch (e) {
      setResetError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="card center">
        <p className="muted">{s.group.name} · {s.group.size} participants</p>
        <p className="muted">Share this token with your members</p>
        <div className="token mono">{s.token}</div>
        <button className="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy token'}</button>
        {copyError && <p className="err" role="alert">{copyError}</p>}
        <div className="leader-actions">
          <button className="ghost" disabled={busy || !s.adminKey} onClick={resetGroup}>
            Reset everyone’s numbers
          </button>
          {!s.member && (
            <form className="leader-join" onSubmit={joinAsParticipant}>
              <label htmlFor="leader-participant-name">Join as a participant</label>
              <input
                id="leader-participant-name"
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
              {joinError && <p className="err" role="alert">{joinError}</p>}
              <button className="primary" disabled={busy}>Join and choose a number</button>
            </form>
          )}
          {!s.adminKey && <p className="err">Reset isn’t available for this older group. Create a new group to enable it.</p>}
          {resetError && <p className="err" role="alert">{resetError}</p>}
          {resetMessage && <p className="ok" role="status">{resetMessage}</p>}
        </div>
      </section>
      {s.member ? (
        <Member
          s={{ ...s, role: 'member' }}
          onChange={(memberSession) => onChange({ ...s, member: memberSession.member })}
          onLeave={() => onChange({ ...s, member: undefined })}
        />
      ) : (
        <Board token={s.token} tick={tick} />
      )}
      <button className="link" onClick={onLeave}>Leave / create another group</button>
    </>
  )
}

/* ---------- Member ---------- */
function Member({ s, onChange, onLeave }) {
  const [m, setM] = useState(s.member)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [spinTarget, setSpinTarget] = useState(null)
  const [pendingMember, setPendingMember] = useState(null)

  // re-sync with the server on load
  useEffect(() => {
    let active = true
    const syncMember = async () => {
      try {
        const result = await api('/join', { name: s.member.name, token: s.token })
        if (!active) return
        if (result.member.number !== m.number || result.member.submitted !== m.submitted) {
          setM(result.member)
          onChange({ ...s, member: result.member })
          setTick((value) => value + 1)
        }
      } catch (e) {
        if (active) setErr(e.message)
      }
    }
    syncMember()
    const interval = setInterval(syncMember, 4000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [m.number, m.submitted, onChange, s])

  async function act(path) {
    setErr('')
    setBusy(true)
    if (path === '/draw') {
      setSpinning(true)
      setSpinTarget(null)
      setPendingMember(null)
    }
    try {
      const r = await api(path, { token: s.token, memberId: m.id })
      if (path === '/draw') {
        setPendingMember(r)
        setSpinTarget(r.number)
        return
      }
      setM(r)
      onChange({ ...s, member: r })
      setTick((t) => t + 1)
    } catch (e) {
      setErr(e.message)
      if (path === '/draw') setSpinning(false)
    } finally {
      if (path !== '/draw') setBusy(false)
    }
  }

  function finishSpin() {
    if (!pendingMember) return
    setM(pendingMember)
    onChange({ ...s, member: pendingMember })
    setTick((t) => t + 1)
    setPendingMember(null)
    setSpinning(false)
    setBusy(false)
  }

  const lockIn = () => {
    if (confirm(`Lock in number ${m.number}? This cannot be undone.`)) act('/submit')
  }

  return (
    <>
      <section className="card center">
        <p className="muted">{s.group.name} · Hi, {m.name}</p>

        {m.number === null ? (
          <>
            {spinning ? (
              <>
                <Wheel size={s.group.size} target={spinTarget} onComplete={finishSpin} />
                <p className="spin-caption" aria-live="polite">
                  {spinTarget === null ? 'Finding your lucky number…' : 'And the number is…'}
                </p>
              </>
            ) : (
              <>
                <p className="draw-prompt">Ready to find your number?</p>
                <button className="primary draw-button" disabled={busy} onClick={() => act('/draw')}>
                  Draw my number <span aria-hidden="true">↻</span>
                </button>
                <p className="small muted">Your number is picked fairly from those still available.</p>
              </>
            )}
          </>
        ) : (
          <>
            <div key={m.number} className={'ball' + (m.submitted ? ' locked' : '')}>
              {m.number}
            </div>
            {m.submitted ? (
              <p className="ok">🔒 Locked in. This is your final number.</p>
            ) : (
              <>
                <p className="muted">Your number is selected. Submit to lock it in.</p>
                <div className="actions">
                <button className="primary" disabled={busy} onClick={lockIn}>
                  Submit
                </button>
                </div>
              </>
            )}
          </>
        )}
        {err && <p className="err">{err}</p>}
      </section>

      <Board token={s.token} tick={tick} meName={m.name} />
      <button className="link" onClick={onLeave}>Leave group</button>
    </>
  )
}

function Wheel({ size, target, onComplete }) {
  const [rotation, setRotation] = useState(0)
  const step = 360 / size
  const colors = ['#7159e8', '#f4a647', '#26a58d', '#ed6b78', '#4b83dd', '#a653be']
  const slices = Array.from({ length: size }, (_, index) => {
    const start = (index * step - 90) * (Math.PI / 180)
    const end = ((index + 1) * step - 90) * (Math.PI / 180)
    const x1 = 150 + 142 * Math.cos(start)
    const y1 = 150 + 142 * Math.sin(start)
    const x2 = 150 + 142 * Math.cos(end)
    const y2 = 150 + 142 * Math.sin(end)
    const mid = (index + 0.5) * step - 90
    const labelRadius = size > 35 ? 112 : 105
    const labelX = 150 + labelRadius * Math.cos(mid * (Math.PI / 180))
    const labelY = 150 + labelRadius * Math.sin(mid * (Math.PI / 180))
    const fontSize = size > 60 ? 7 : size > 35 ? 9 : size > 20 ? 11 : 14
    return (
      <g key={index}>
        <path d={`M 150 150 L ${x1} ${y1} A 142 142 0 0 1 ${x2} ${y2} Z`} fill={colors[index % colors.length]} stroke="white" strokeWidth="2" />
        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
          {index + 1}
        </text>
      </g>
    )
  })

  useEffect(() => {
    if (target === null) return undefined
    const frame = requestAnimationFrame(() => {
      setRotation(360 * 5 - (target - 0.5) * step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, step])

  return (
    <div className="wheel-wrap" role="img" aria-label={target === null ? 'Spinning number wheel' : `Wheel landing on ${target}`}>
      <span className="wheel-pointer" aria-hidden="true" />
      <svg
        className={'wheel-disc' + (target === null ? ' spinning' : '')}
        viewBox="0 0 300 300"
        style={{ '--wheel-rotation': `${rotation}deg` }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && target !== null) onComplete()
        }}
      >
        <circle cx="150" cy="150" r="146" fill="white" />
        {slices}
        <circle cx="150" cy="150" r="18" fill="white" />
        <circle cx="150" cy="150" r="8" fill="#302268" />
      </svg>
    </div>
  )
}

/* ---------- Live board ---------- */
function Board({ token, tick, meName }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      api(`/groups/${token}/members`).then((d) => alive && setData(d)).catch(() => {})
    load()
    const id = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [token, tick])

  if (!data) return null
  const byNum = new Map(data.members.filter((x) => x.number).map((x) => [x.number, x]))
  const locked = data.members.filter((x) => x.submitted).length
  const waiting = data.members.filter((x) => !x.number).map((x) => x.name)

  return (
    <section className="card">
      <div className="row">
        <h2>Board</h2>
        <span className="muted">
          {locked}/{data.group.size} locked · {data.members.length} joined
        </span>
      </div>
      <div className="grid">
        {Array.from({ length: data.group.size }, (_, i) => i + 1).map((n) => {
          const o = byNum.get(n)
          const mine = o && meName && o.name.toLowerCase() === meName.toLowerCase()
          return (
            <div key={n} className={'tile' + (o ? (o.submitted ? ' locked' : ' held') : '') + (mine ? ' me' : '')}>
              <b>{n}</b>
              <small>{o ? o.name : 'free'}</small>
            </div>
          )
        })}
      </div>
      <p className="legend">
        <i className="dot held" /> drawing <i className="dot locked" /> locked
      </p>
      {waiting.length > 0 && <p className="muted small">Yet to draw: {waiting.join(', ')}</p>}
    </section>
  )
}
