import { useEffect, useMemo, useState } from 'react'
import { loadManifest, loadSnapshot } from './data'
import { MapCanvas } from './MapCanvas'
import type { BuilderCard, Manifest } from './types'

type View = 'map' | 'list'
type LoadState = 'loading' | 'ready' | 'error'

const registry = '0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c'

function truncate(value: string, start = 8, end = 6): string {
  return value.length > start + end + 3 ? `${value.slice(0, start)}…${value.slice(-end)}` : value
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)
}

function safeUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span></a>
}

function Details({ card, color, onClose }: { card: BuilderCard | null; color: string | undefined; onClose: () => void }) {
  if (!card) return <div className="detail-empty"><div className="detail-orbit">✦</div><h3>Pick a builder</h3><p>Select a bubble or a row to see the card and its creation record.</p></div>
  const website = safeUrl(card.websiteUrl)
  return <div className="detail-content">
    <div className="detail-heading"><span className="eyebrow">BUILDERCARD #{card.builderNo ?? '—'}</span><button className="text-button" onClick={onClose} aria-label="Close details">✕</button></div>
    <h2>{card.builderName || 'Unnamed builder'}</h2>
    <div className="detail-community"><span className="detail-dot" style={{ backgroundColor: color }} />{card.communityRaw || card.communityLabel || 'Unknown / unlisted'}</div>
    <p className="detail-note">Community is self-declared on the card.</p>
    <dl className="facts">
      {card.profession && <><dt>Profession</dt><dd>{card.profession}</dd></>}
      {card.focus && <><dt>Focus</dt><dd>{card.focus}</dd></>}
      {card.country && <><dt>Country</dt><dd>{card.country}</dd></>}
      <dt>Created</dt><dd>{dateLabel(card.timestamp)}</dd>
      <dt>Checkpoint</dt><dd>{card.checkpoint.toLocaleString()}</dd>
      <dt>Creator wallet</dt><dd className="mono" title={card.sender}>{truncate(card.sender, 12, 10)}</dd>
      <dt>Card object</dt><dd className="mono" title={card.cardObjectId}>{truncate(card.cardObjectId, 12, 10)}</dd>
      <dt>Transaction</dt><dd className="mono" title={card.txDigest}>{truncate(card.txDigest, 12, 10)}</dd>
      <dt>Package</dt><dd className="mono" title={card.packageId}>{truncate(card.packageId, 12, 10)}</dd>
    </dl>
    <div className="detail-links">
      <SourceLink href={`https://suiscan.xyz/mainnet/object/${encodeURIComponent(card.cardObjectId)}`}>View card on SuiScan</SourceLink>
      <SourceLink href={`https://suiscan.xyz/mainnet/tx/${encodeURIComponent(card.txDigest)}`}>View creation transaction</SourceLink>
      {website && <SourceLink href={website}>Builder-provided website</SourceLink>}
    </div>
    <p className="edge-explainer">The highlighted line shows that this card was created using the shared Builder Registry. It does not represent a payment or a relationship between builders.</p>
  </div>
}

function ListView({ cards, selectedId, onSelect }: { cards: BuilderCard[]; selectedId: string | null; onSelect: (card: BuilderCard) => void }) {
  const [page, setPage] = useState(0)
  const pageSize = 40
  const maxPage = Math.max(0, Math.ceil(cards.length / pageSize) - 1)
  useEffect(() => { if (page > maxPage) setPage(maxPage) }, [page, maxPage])
  const visible = cards.slice(page * pageSize, (page + 1) * pageSize)
  return <div className="list-view">
    <div className="list-head"><div><span className="eyebrow">ACCESSIBLE DIRECTORY</span><h2>BuilderCards</h2></div><p>Use the same filters as the map. Select a row for its full record.</p></div>
    {cards.length === 0 ? <div className="empty-state">No cards match these filters. Try another search or date range.</div> : <>
      <div className="table-scroll"><table><thead><tr><th scope="col">Builder</th><th scope="col">Community</th><th scope="col">Created</th><th scope="col">Card #</th></tr></thead><tbody>{visible.map(card => <tr key={card.cardObjectId} className={card.cardObjectId === selectedId ? 'selected-row' : ''}><td><button className="row-button" onClick={() => onSelect(card)}>{card.builderName || 'Unnamed builder'}<span className="row-sub">{truncate(card.cardObjectId)}</span></button></td><td>{card.communityLabel || 'Unknown / unlisted'}</td><td>{dateLabel(card.timestamp)}</td><td>{card.builderNo ?? '—'}</td></tr>)}</tbody></table></div>
      <div className="pagination"><span>Page {page + 1} of {maxPage + 1}</span><div><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={page === maxPage} onClick={() => setPage(p => p + 1)}>Next</button></div></div>
    </>}
  </div>
}

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [cards, setCards] = useState<BuilderCard[]>([])
  const [view, setView] = useState<View>('map')
  const [search, setSearch] = useState('')
  const [community, setCommunity] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replayCount, setReplayCount] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [newSnapshot, setNewSnapshot] = useState(false)

  const refresh = () => {
    setLoadState('loading')
    setError('')
    loadSnapshot().then(snapshot => { setManifest(snapshot.manifest); setCards(snapshot.cards); setLoadState('ready'); setNewSnapshot(false) }).catch(err => { setError(err instanceof Error ? err.message : String(err)); setLoadState('error') })
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!manifest) return
    const timer = window.setInterval(() => {
      loadManifest().then(next => {
        if (next.generatedAt !== manifest.generatedAt) {
          loadSnapshot().then(snapshot => { setManifest(snapshot.manifest); setCards(snapshot.cards); setNewSnapshot(true) }).catch(() => {})
        }
      }).catch(() => {})
    }, 15 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [manifest])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const fromTime = from ? new Date(`${from}-01T00:00:00Z`).getTime() : -Infinity
    const toTime = to ? new Date(`${to}-01T00:00:00Z`).getTime() : Infinity
    const toEnd = Number.isFinite(toTime) ? Date.UTC(new Date(toTime).getUTCFullYear(), new Date(toTime).getUTCMonth() + 1, 1) : Infinity
    return cards.filter(card => {
      const t = new Date(card.timestamp).getTime()
      return (community === 'all' || card.communityKey === community) && t >= fromTime && t < toEnd &&
        (!term || [card.builderName, String(card.builderNo ?? ''), card.cardObjectId, card.communityRaw, card.communityLabel].some(value => value.toLocaleLowerCase().includes(term)))
    })
  }, [cards, search, community, from, to])
  const visibleCards = replayCount === null ? filtered : filtered.slice(0, replayCount)
  const selected = cards.find(c => c.cardObjectId === selectedId) ?? null
  const lagDays = manifest ? (Date.now() - new Date(manifest.lastSyncedAt).getTime()) / 86400000 : 0
  const stale = !Number.isFinite(lagDays) || lagDays > 2
  const incomplete = manifest ? !manifest.completeHistory || manifest.coverageGaps.length > 0 : false

  useEffect(() => {
    if (!playing) return
    if (reducedMotion || filtered.length === 0) { setPlaying(false); return }
    const timer = window.setInterval(() => setReplayCount(current => {
      const next = Math.min(filtered.length, (current ?? 0) + Math.max(1, Math.ceil(filtered.length / 100)))
      if (next >= filtered.length) setPlaying(false)
      return next
    }), 120)
    return () => window.clearInterval(timer)
  }, [playing, reducedMotion, filtered.length])

  const selectCard = (card: BuilderCard) => setSelectedId(card.cardObjectId)
  const clearFilters = () => { setSearch(''); setCommunity('all'); setFrom(''); setTo(''); setReplayCount(null); setPlaying(false) }

  return <div className="app-shell">
    <header className="site-header"><div className="brand"><div className="brand-mark" aria-hidden="true">✦</div><div><span className="brand-kicker">CRYPTITA PLAYS</span><strong>Builder Constellation</strong></div></div><div className="header-meta"><span className="network-pill"><span /> SUI MAINNET</span><SourceLink href={`https://suiscan.xyz/mainnet/object/${registry}`}>View registry</SourceLink></div></header>
    <main className="main-grid">
      <aside className="explore-panel">
        <div className="panel-intro"><span className="eyebrow">THE BUILDER WORKSHOP</span><h1>Every card,<br /><em>a story.</em></h1><p>Explore BuilderCards created with one shared registry. Bubbles are grouped by the community written on each card.</p></div>
        <div className="metric-strip"><div><strong>{manifest ? manifest.totalCards.toLocaleString() : '—'}</strong><span>Cards indexed</span></div><div><strong>{manifest ? manifest.totalCommunities.toLocaleString() : '—'}</strong><span>Communities</span></div></div>
        <div className="filter-section"><div className="section-title"><h2>Explore</h2><button className="text-button" onClick={clearFilters}>Clear</button></div>
          <label className="field-label" htmlFor="search">Search cards</label><input id="search" type="search" placeholder="Name, number, card ID…" value={search} onChange={e => setSearch(e.target.value)} />
          <label className="field-label" htmlFor="community">Community</label><select id="community" value={community} onChange={e => setCommunity(e.target.value)}><option value="all">All communities</option>{manifest?.communities.map(c => <option key={c.key} value={c.key}>{c.label} ({c.count})</option>)}</select>
          <div className="date-grid"><div><label className="field-label" htmlFor="from">From month</label><input id="from" type="month" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></div><div><label className="field-label" htmlFor="to">To month</label><input id="to" type="month" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></div></div>
        </div>
        <div className="legend-section"><div className="section-title"><h2>Communities</h2><span>{manifest?.communities.length ?? 0}</span></div><div className="legend-list">{manifest?.communities.map(c => <button key={c.key} className={`legend-item ${community === c.key ? 'active' : ''}`} onClick={() => setCommunity(value => value === c.key ? 'all' : c.key)}><span className="legend-dot" style={{ backgroundColor: c.color }} /><span>{c.label}</span><span className="legend-count">{c.count}</span></button>)}</div><p className="small-note">Labels are self-declared. Similar names can represent separate groups.</p></div>
      </aside>

      <section className="workspace" aria-label="BuilderCard explorer">
        <div className="workspace-top"><div><span className="eyebrow">INTERACTIVE DIRECTORY</span><h2>Discover the builders</h2></div><div className="view-switch" role="group" aria-label="Choose view"><button aria-pressed={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Map</button><button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button></div></div>
        {newSnapshot && <div className="status-banner notice" role="status">The map has loaded a newer snapshot. <button onClick={() => setNewSnapshot(false)}>Dismiss</button></div>}
        {manifest && incomplete && <div className="status-banner warning" role="status">Historical coverage is incomplete{manifest.coverageGaps.length ? ` (${manifest.coverageGaps.length} gap${manifest.coverageGaps.length === 1 ? '' : 's'})` : ''}. The map shows confirmed cards indexed so far.</div>}
        {manifest && stale && <div className="status-banner warning" role="status">Data may be delayed. Last successful sync: {dateLabel(manifest.lastSyncedAt)}.</div>}
        {loadState === 'loading' ? <div className="state-card" role="status"><div className="loading-ring" /><h3>Loading BuilderCards</h3><p>Checking the latest snapshot and its data files…</p></div> :
          loadState === 'error' ? <div className="state-card" role="alert"><h3>Couldn’t load the map</h3><p>{error}</p><button className="primary-button" onClick={refresh}>Try again</button></div> :
          cards.length === 0 ? <div className="state-card"><h3>No confirmed cards indexed yet</h3><p>The map will fill after the first successful data update.</p><p>Last sync: {dateLabel(manifest?.lastSyncedAt)}</p></div> : <>
            <div className="result-line"><span><strong>{visibleCards.length.toLocaleString()}</strong> shown of <strong>{cards.length.toLocaleString()}</strong> indexed cards</span><span>Last indexed {dateLabel(manifest?.lastSyncedAt)}</span></div>
            {view === 'map' ? <div className="visual-stage"><MapCanvas cards={visibleCards} allCards={cards} communities={manifest?.communities ?? []} selectedId={selectedId} onSelect={selectCard} reducedMotion={reducedMotion} />{visibleCards.length === 0 && <div className="map-empty">No cards match these filters.</div>}</div> : <ListView cards={visibleCards} selectedId={selectedId} onSelect={selectCard} />}
            <div className="replay-bar"><div className="replay-heading"><strong>Chronological replay</strong><span>{replayCount === null ? 'All cards visible' : `${visibleCards.length} of ${filtered.length} filtered cards`}</span></div><div className="replay-controls"><button onClick={() => { if (replayCount === null || replayCount >= filtered.length) setReplayCount(0); setPlaying(!playing) }} disabled={reducedMotion || filtered.length === 0} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button><input aria-label="Replay position" type="range" min="0" max={filtered.length} value={replayCount ?? filtered.length} onChange={e => { setPlaying(false); setReplayCount(Number(e.target.value)) }} /><button onClick={() => { setPlaying(false); setReplayCount(null) }}>Show all</button></div>{reducedMotion && <p className="small-note">Automatic replay is paused by your reduced-motion setting. The slider remains available.</p>}</div>
          </>}
      </section>
      <aside className="details-panel" aria-label="Selected card details"><Details card={selected} color={manifest?.communities.find(c => c.key === selected?.communityKey)?.color} onClose={() => setSelectedId(null)} /></aside>
    </main>
    <footer className="site-footer"><span>Each bubble is one successful BuilderCard creation. Community colors represent self-declared card text.</span><span>Registry · {truncate(registry, 12, 10)} {manifest?.lastContiguousCheckpoint != null && `· Through checkpoint ${manifest.lastContiguousCheckpoint.toLocaleString()}`}</span></footer>
  </div>
}
