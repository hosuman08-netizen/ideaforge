// IdeaForge — pitch an idea, set a goal and a deadline, offer reward tiers,
// let the crowd vote / comment / back it. All-or-nothing.
// FICTIONAL DEMO. In-app tokens only. No real money, investment, returns or equity.

let wallet = null;
let balance = 1250;
let credits = 320;
let ideas = JSON.parse(localStorage.getItem('p12_ideas') || '[]');
let codex = JSON.parse(localStorage.getItem('p12_codex') || '[]');

let me = JSON.parse(localStorage.getItem('p12_me') || 'null') || {
  createdAt: Date.now(),   // account age → vote weight (anti-brigading)
  votedIds: [],
  stakes: {},              // ideaId -> total Credits pledged by me
  pledges: {},             // ideaId -> [{tierId, amount, time}]
  voteDay: todayKey(),
  votesUsed: 0,
  unlockedIds: [],
  following: []
};

const DAILY_VOTES = 10;
const DAY = 86400000;
const HOUR = 3600000;

// ── Domain constants ──────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'tech',    label: 'Technology', emoji: '⚙️' },
  { id: 'games',   label: 'Games',      emoji: '🎮' },
  { id: 'design',  label: 'Design',     emoji: '✏️' },
  { id: 'food',    label: 'Food',       emoji: '🍜' },
  { id: 'film',    label: 'Film',       emoji: '🎬' },
  { id: 'publish', label: 'Publishing', emoji: '📚' },
  { id: 'music',   label: 'Music',      emoji: '🎧' },
  { id: 'social',  label: 'Social good',emoji: '🌱' }
];
const COVER_MARKS = ['🚀','🧭','🔮','🛠','🌊','🪐','🎛','🧬','🕯','🪞','⚡','🗝'];

// Simulated instrument. Fixed cap → a backer's implied share never moves
// when someone else backs. Labelled fictional everywhere it is shown.
const CAP_MULTIPLE = 20;

// ── Small utilities ───────────────────────────────────────────────────
function todayKey() { return new Date().toISOString().slice(0, 10); }
function saveMe() { localStorage.setItem('p12_me', JSON.stringify(me)); }
function saveIdeas() { localStorage.setItem('p12_ideas', JSON.stringify(ideas)); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let _toastTimer = null;
function toast(msg, kind) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.innerHTML = msg;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3600);
}

function hueOf(id) { return Math.abs(Number(id) % 360); }
function catOf(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[0]; }
function pct(idea) { return idea.goal > 0 ? (idea.raised / idea.goal) * 100 : 0; }

// "6 days left" / "9 hours left" / "final 42 minutes"
function timeLeft(idea) {
  if (!idea.endsAt) return '';
  const ms = idea.endsAt - Date.now();
  if (ms <= 0) return 'ended';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  if (d >= 2) return d + ' days left';
  if (d === 1) return '1 day ' + h + 'h left';
  if (h >= 1) return h + 'h ' + m + 'm left';
  return 'final ' + m + ' minutes';
}
// compact form for the stat row, where the long phrasing crowds the other figures
function timeLeftShort(idea) {
  if (!idea.endsAt) return '—';
  const ms = idea.endsAt - Date.now();
  if (ms <= 0) return 'ended';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  if (d >= 1) return d + 'd ' + h + 'h';
  if (h >= 1) return h + 'h ' + m + 'm';
  return m + 'm';
}

function isUrgent(idea) {
  return idea.status === 'live' && idea.endsAt && (idea.endsAt - Date.now()) < 3 * DAY;
}

// ── Schema / migration ────────────────────────────────────────────────
function defaultTiers(goal) {
  const g = Math.max(50, goal || 500);
  const band = a => Math.max(5, Math.round(a / 5) * 5);
  return [
    { id: 1, amount: band(g * 0.02), title: 'Early supporter', desc: 'Name in the backer list + all project updates.', limit: 25, claimed: 0, delivery: 'Immediately', featured: false },
    { id: 2, amount: band(g * 0.05), title: 'Early bird kit',  desc: 'Everything above, plus first access when it ships.', limit: 50, claimed: 0, delivery: '2 months after close', featured: true },
    { id: 3, amount: band(g * 0.12), title: 'Founding backer', desc: 'Early access, a founding-backer credit, and a say in the roadmap.', limit: 0, claimed: 0, delivery: '3 months after close', featured: false }
  ];
}

function normalizeIdea(idea) {
  if (typeof idea.votes !== 'number') idea.votes = 0;
  if (typeof idea.weightedVotes !== 'number') idea.weightedVotes = idea.votes;
  if (!Array.isArray(idea.investors)) idea.investors = [];
  if (!Array.isArray(idea.backers)) idea.backers = idea.investors.slice();
  if (typeof idea.raised !== 'number') idea.raised = 0;
  if (!idea.category) idea.category = 'tech';
  if (!idea.cover) idea.cover = { mark: COVER_MARKS[Math.abs(Number(idea.id)) % COVER_MARKS.length], hue: hueOf(idea.id) };
  if (!idea.subtitle) idea.subtitle = '';
  if (!idea.createdAt) idea.createdAt = idea.timestamp ? Date.parse(idea.timestamp) : Date.now();
  if (!idea.launchedAt) idea.launchedAt = idea.createdAt;
  if (typeof idea.durationDays !== 'number') idea.durationDays = 30;
  if (!idea.endsAt) idea.endsAt = idea.launchedAt + idea.durationDays * DAY;
  if (!idea.status) idea.status = (idea.funded || idea.raised >= idea.goal) ? 'funded' : 'live';
  if (typeof idea.valuationCap !== 'number') idea.valuationCap = Math.max(1000, idea.goal * CAP_MULTIPLE);
  if (!Array.isArray(idea.tiers) || !idea.tiers.length) idea.tiers = defaultTiers(idea.goal);
  if (!Array.isArray(idea.updates)) idea.updates = [];
  if (!Array.isArray(idea.comments)) idea.comments = [];
  if (!Array.isArray(idea.faq)) idea.faq = [];
  if (typeof idea.flags !== 'number') idea.flags = 0;
  if (typeof idea.staffPick !== 'boolean') idea.staffPick = false;
  if (!idea.risks) idea.risks = '';
  if (typeof idea.surprise !== 'number') idea.surprise = 0.3;
  if (!idea.teaserProblem) idea.teaserProblem = ((idea.desc || '').split(/[.!?]/)[0] || 'High-potential concept') + '…';
  if (!Array.isArray(idea.keywords)) idea.keywords = (idea.title || '').toLowerCase().split(' ').slice(0, 4);
  if (!idea.secretSauce) idea.secretSauce = idea.desc || idea.fullDesc || '';
  if (!Array.isArray(idea.unlocks)) idea.unlocks = [];
  if (typeof idea.pendingEarnings !== 'number') idea.pendingEarnings = 0;
  if (typeof idea.lifetimeEarnings !== 'number') idea.lifetimeEarnings = 0;
  if (typeof idea.simEarnings !== 'number') idea.simEarnings = 0;
  idea.funded = idea.status === 'funded';
  return idea;
}
ideas = ideas.map(normalizeIdea);

// ── All-or-nothing resolution (the mechanic the whole category runs on) ──
function resolveDeadlines() {
  let changed = false;
  ideas.forEach(idea => {
    if (idea.status === 'review' && idea.reviewUntil && Date.now() >= idea.reviewUntil) {
      idea.status = 'live';
      idea.launchedAt = Date.now();
      idea.endsAt = idea.launchedAt + idea.durationDays * DAY;
      changed = true;
      if (wallet && idea.owner === wallet) {
        addToCodex('“' + idea.title + '” passed review and is live — ' + idea.durationDays + ' days on the clock.');
      }
    }
    if (idea.status === 'live' && idea.endsAt && Date.now() >= idea.endsAt) {
      if (idea.raised >= idea.goal) {
        idea.status = 'funded';
        idea.funded = true;
        if (wallet && idea.owner === wallet) addToCodex('🎉 “' + idea.title + '” closed successfully at ' + idea.raised + '/' + idea.goal + '.');
      } else {
        idea.status = 'failed';
        idea.funded = false;
        // All-or-nothing: pledges are returned.
        const mine = me.stakes[idea.id] || 0;
        if (mine > 0) {
          credits += mine;
          delete me.stakes[idea.id];
          delete me.pledges[idea.id];
          addToCodex('“' + idea.title + '” missed its goal (' + idea.raised + '/' + idea.goal + '). All-or-nothing — your ' + mine + ' cr was returned.');
          saveMe();
        }
      }
      changed = true;
    }
  });
  if (changed) { saveIdeas(); updateWallet(); }
  return changed;
}

// ── Creator track record (repeat creators are the strongest trust signal) ──
function creatorStats(owner) {
  const own = ideas.filter(i => i.owner === owner);
  const closed = own.filter(i => i.status === 'funded' || i.status === 'failed');
  const ok = own.filter(i => i.status === 'funded');
  return {
    launched: own.length,
    successful: ok.length,
    closed: closed.length,
    rate: closed.length ? Math.round((ok.length / closed.length) * 100) : null,
    firstTime: closed.length === 0
  };
}
function creatorBadge(owner) {
  const s = creatorStats(owner);
  if (s.successful > 0) return '<span class="badge good">' + s.successful + ' previously funded</span>';
  if (s.firstTime) return '<span class="badge">First-time creator</span>';
  return '<span class="badge">' + s.launched + ' launched</span>';
}

// ── Wallet ────────────────────────────────────────────────────────────
function updateWallet() {
  const el = document.getElementById('wallet-info');
  if (!el) return;
  const pending = wallet ? myPendingTotal() : 0;
  const earn = pending > 0 ? ' <span class="wallet-earn">+' + pending + ' cr to claim</span>' : '';
  el.innerHTML = escapeHtml(wallet || 'Guest') + ' • ' + balance + ' Tokens / ' + credits + ' Credits' + earn;
  const btn = document.getElementById('signbtn');
  if (btn) btn.textContent = wallet ? '⏻ Sign out' : '🔗 Sign in';
}

function connectWallet() {
  if (wallet) { signOut(); return; }
  wallet = 'user-' + Math.random().toString(16).slice(2, 10);
  if (!me.createdAt) { me.createdAt = Date.now(); saveMe(); }
  simulateBackerInterest();
  updateWallet();
  toast('Signed in as <b>' + escapeHtml(wallet) + '</b>');
  showDiscover();
}

function signOut() {
  wallet = null;
  updateWallet();
  toast('Signed out. Your ideas and pledges stay saved on this device.');
  showDiscover();
}

function requireWallet(what) {
  if (wallet) return true;
  toast('Sign in to ' + what + '.', 'warn');
  return false;
}

// ── Owner earnings ────────────────────────────────────────────────────
function accrueOwnerEarnings(idea, amount, note, simulated) {
  if (!idea || amount <= 0) return;
  idea.pendingEarnings = (idea.pendingEarnings || 0) + amount;
  idea.lifetimeEarnings = (idea.lifetimeEarnings || 0) + amount;
  if (simulated) idea.simEarnings = (idea.simEarnings || 0) + amount;
  if (note && wallet && idea.owner === wallet) addToCodex(note);
}
function myPendingTotal() {
  if (!wallet) return 0;
  return ideas.filter(i => i.owner === wallet).reduce((s, i) => s + (i.pendingEarnings || 0), 0);
}

// ── Voting: daily budget + credibility weight ─────────────────────────
function rollVoteDay() {
  const k = todayKey();
  if (me.voteDay !== k) { me.voteDay = k; me.votesUsed = 0; saveMe(); }
}
function votesLeft() { rollVoteDay(); return Math.max(0, DAILY_VOTES - me.votesUsed); }

// A brand-new account counts for less than an established one. Ranking uses the
// weighted total; the vote count shown to users is the honest raw count.
function myVoteWeight() {
  const days = (Date.now() - (me.createdAt || Date.now())) / DAY;
  return Math.round(Math.min(1, 0.4 + days * 0.15) * 100) / 100;
}

function voteIdea(id, ev) {
  if (ev) ev.stopPropagation();
  if (!requireWallet('vote')) return;
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  if (idea.status !== 'live') { toast('Voting is closed on this idea.', 'warn'); return; }

  const w = myVoteWeight();
  if (me.votedIds.includes(id)) {
    idea.votes = Math.max(0, idea.votes - 1);
    idea.weightedVotes = Math.max(0, (idea.weightedVotes || 0) - w);
    me.votedIds = me.votedIds.filter(x => x !== id);
    me.votesUsed = Math.max(0, me.votesUsed - 1);
    saveIdeas(); saveMe(); rerender();
    return;
  }
  if (votesLeft() <= 0) { toast('Out of votes today (' + DAILY_VOTES + '/day). Come back tomorrow.', 'warn'); return; }

  idea.votes += 1;
  idea.weightedVotes = (idea.weightedVotes || 0) + w;
  me.votedIds.push(id);
  me.votesUsed += 1;
  saveIdeas(); saveMe();
  addToCodex('Upvoted “' + idea.title + '” (weight ×' + w + ').');
  rerender();
}

// ── Ranking: velocity + engagement + decay, not a cumulative total ─────
function hotScore(idea) {
  const hours = Math.max(1, (Date.now() - idea.launchedAt) / HOUR);
  const engagement =
    (idea.weightedVotes || 0) * 1.0 +
    idea.comments.length * 1.6 +          // comment density is the strongest quality signal
    idea.backers.length * 2.2;
  const fundPct = Math.min(2, idea.goal > 0 ? idea.raised / idea.goal : 0);
  const base = engagement + fundPct * 8 + (idea.surprise || 0) * 2 + (idea.staffPick ? 4 : 0);
  return base / Math.pow(hours + 2, 0.55);  // time decay so the feed can't ossify
}

// ── Discovery state ───────────────────────────────────────────────────
let filters = { q: '', cat: 'all', tags: [], sort: 'trending', loved: false, followed: false };

function onSearch() { filters.q = (document.getElementById('q').value || '').trim().toLowerCase(); renderDiscover(); }
function onSort() {
  filters.sort = document.getElementById('sortby').value;
  filters.loved = document.getElementById('lovedonly').checked;
  filters.followed = document.getElementById('followedonly').checked;
  renderDiscover();
}
function setCat(c) { filters.cat = c; renderCatChips(); renderDiscover(); }
function toggleTag(t) {
  filters.tags = filters.tags.includes(t) ? filters.tags.filter(x => x !== t) : filters.tags.concat([t]);
  renderDiscover();
}
function clearTags() { filters.tags = []; renderDiscover(); }

function renderCatChips() {
  const box = document.getElementById('cat-chips');
  if (!box) return;
  const all = '<button class="chip' + (filters.cat === 'all' ? ' on' : '') + '" onclick="setCat(\'all\')">All</button>';
  box.innerHTML = all + CATEGORIES.map(c => {
    const n = ideas.filter(i => i.category === c.id && i.status !== 'review').length;
    return '<button class="chip' + (filters.cat === c.id ? ' on' : '') + '" onclick="setCat(\'' + c.id + '\')">' +
           c.emoji + ' ' + c.label + (n ? ' <span class="chipn">' + n + '</span>' : '') + '</button>';
  }).join('');
}

function visibleIdeas() {
  let list = ideas.filter(i => i.status !== 'review' || (wallet && i.owner === wallet));

  if (filters.cat !== 'all') list = list.filter(i => i.category === filters.cat);
  if (filters.loved) list = list.filter(i => i.staffPick);
  if (filters.followed) list = list.filter(i => me.following.includes(i.id));
  if (filters.tags.length) list = list.filter(i => filters.tags.every(t => (i.keywords || []).includes(t)));

  if (filters.q) {
    const q = filters.q;
    list = list.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.subtitle || '').toLowerCase().includes(q) ||
      (i.teaserProblem || '').toLowerCase().includes(q) ||
      (i.owner || '').toLowerCase().includes(q) ||
      (i.keywords || []).some(k => k.includes(q)) ||
      catOf(i.category).label.toLowerCase().includes(q)
    );
  }

  const cmp = {
    trending: (a, b) => hotScore(b) - hotScore(a),
    newest:   (a, b) => b.launchedAt - a.launchedAt,
    ending:   (a, b) => {
      const av = a.status === 'live' ? a.endsAt : Infinity;
      const bv = b.status === 'live' ? b.endsAt : Infinity;
      return av - bv;
    },
    funded:   (a, b) => pct(b) - pct(a),
    backed:   (a, b) => b.backers.length - a.backers.length
  }[filters.sort] || ((a, b) => hotScore(b) - hotScore(a));

  return list.slice().sort(cmp);
}

// ── Discover view ─────────────────────────────────────────────────────
function showDiscover() {
  hideAll();
  setActiveNav('showDiscover');
  document.getElementById('discover').classList.remove('hidden');
  renderCatChips();
  renderDiscover();
}

function renderDiscover() {
  const list = document.getElementById('idea-list');
  const sub = document.getElementById('feed-sub');
  if (!list) return;

  const liveCount = ideas.filter(i => i.status === 'live').length;
  const okCount = ideas.filter(i => i.status === 'funded').length;
  const closed = ideas.filter(i => i.status === 'funded' || i.status === 'failed').length;
  const rate = closed ? Math.round((okCount / closed) * 100) : null;
  const totalRaised = ideas.reduce((s, i) => s + i.raised, 0);

  if (sub) {
    sub.innerHTML =
      '<b>' + totalRaised.toLocaleString() + '</b> cr pledged · <b>' + liveCount + '</b> live · ' +
      okCount + ' funded' + (rate !== null ? ' · ' + rate + '% success rate' : '') +
      '<br>You have <b>' + votesLeft() + '</b> votes left today · your vote weight ×' + myVoteWeight() +
      (myVoteWeight() < 1 ? ' <span class="tinynote">(rises with account age — limits brigading)</span>' : '');
  }

  // tag facets from the current result set
  const tagBox = document.getElementById('active-tags');
  if (tagBox) {
    const counts = {};
    visibleIdeas().forEach(i => (i.keywords || []).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 10);
    const chips = top.map(t =>
      '<button class="tag' + (filters.tags.includes(t) ? ' on' : '') + '" onclick="toggleTag(\'' + escapeHtml(t) + '\')">#' + escapeHtml(t) + '</button>'
    ).join('');
    tagBox.innerHTML = chips + (filters.tags.length ? ' <button class="tag clear" onclick="clearTags()">clear</button>' : '');
  }

  const rows = visibleIdeas();
  list.innerHTML = '';

  if (!rows.length) {
    list.innerHTML = '<div class="empty">Nothing matches those filters.<br><button onclick="resetFilters()">Reset filters</button></div>';
    return;
  }

  rows.forEach((idea, rank) => {
    list.appendChild(ideaCard(idea, rank));
  });
}

function resetFilters() {
  filters = { q: '', cat: 'all', tags: [], sort: 'trending', loved: false, followed: false };
  const q = document.getElementById('q'); if (q) q.value = '';
  const l = document.getElementById('lovedonly'); if (l) l.checked = false;
  const f = document.getElementById('followedonly'); if (f) f.checked = false;
  const s = document.getElementById('sortby'); if (s) s.value = 'trending';
  renderCatChips(); renderDiscover();
}

function statusPill(idea) {
  if (idea.status === 'review')  return '<span class="pill review">In review</span>';
  if (idea.status === 'funded')  return '<span class="pill ok">Funded</span>';
  if (idea.status === 'failed')  return '<span class="pill bad">Not funded</span>';
  return '<span class="pill' + (isUrgent(idea) ? ' urgent' : '') + '" data-countdown="' + idea.id + '">' + timeLeft(idea) + '</span>';
}

function ideaCard(idea, rank) {
  const p = Math.min(100, Math.floor(pct(idea)));
  const over = pct(idea) > 100;
  const iVoted = me.votedIds.includes(idea.id);
  const cat = catOf(idea.category);
  const el = document.createElement('div');
  el.className = 'idea-card' + (idea.status === 'funded' ? ' funded' : '') + (idea.status === 'failed' ? ' failed' : '');
  el.onclick = () => showIdea(idea.id);

  const kw = (idea.keywords || []).slice(0, 3)
    .map(k => '<span class="kw">#' + escapeHtml(k) + '</span>').join(' ');

  el.innerHTML =
    '<div class="cover" style="--h:' + idea.cover.hue + '">' +
      '<span class="mark">' + escapeHtml(idea.cover.mark) + '</span>' +
      (idea.staffPick ? '<span class="loved">⭐ Loved</span>' : '') +
      (rank < 3 && filters.sort === 'trending' ? '<span class="rankbadge">#' + (rank + 1) + '</span>' : '') +
    '</div>' +
    '<div class="cardbody">' +
      '<div class="cardtop">' +
        '<span class="cat">' + cat.emoji + ' ' + cat.label + '</span>' +
        statusPill(idea) +
      '</div>' +
      '<strong>' + escapeHtml(idea.title) + '</strong>' +
      (idea.subtitle ? '<div class="subtitle">' + escapeHtml(idea.subtitle) + '</div>' : '') +
      '<div class="keywords">' + kw + '</div>' +
      '<div class="bar' + (over ? ' over' : '') + '"><span style="width:' + p + '%"></span></div>' +
      '<div class="meta"><b>' + Math.floor(pct(idea)) + '%</b> · ' + idea.raised.toLocaleString() + ' / ' + idea.goal.toLocaleString() + ' cr · ' +
        idea.backers.length + ' backer' + (idea.backers.length === 1 ? '' : 's') + '</div>' +
      '<div class="stats">' +
        '<button class="votebtn' + (iVoted ? ' voted' : '') + '" onclick="voteIdea(' + idea.id + ',event)">▲ ' + idea.votes + (iVoted ? ' ✓' : '') + '</button>' +
        '<span class="cardsignals">💬 ' + idea.comments.length + (idea.updates.length ? ' · 📣 ' + idea.updates.length : '') + (idea.voiceUrl ? ' · 🎙' : '') + '</span>' +
      '</div>' +
    '</div>';
  return el;
}

// ── Idea detail ───────────────────────────────────────────────────────
let _view = { ideaId: null, tab: 'story' };

function showIdea(id, tab) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) { showDiscover(); return; }
  _view = { ideaId: id, tab: tab || 'story' };
  hideAll();
  document.getElementById('detail').classList.remove('hidden');
  renderDetail();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setTab(t) { _view.tab = t; renderDetail(); }

function canSeeFull(idea) {
  if (!idea) return false;
  if (wallet && idea.owner === wallet) return true;
  if (me.unlockedIds.includes(idea.id)) return true;
  if ((me.stakes[idea.id] || 0) > 0) return true;
  return false;
}

function renderDetail() {
  const idea = ideas.find(i => i.id === _view.ideaId);
  const box = document.getElementById('detail-body');
  if (!idea || !box) return;

  const cat = catOf(idea.category);
  const p = Math.floor(pct(idea));
  const isOwner = wallet && idea.owner === wallet;
  const myStake = me.stakes[idea.id] || 0;
  const following = me.following.includes(idea.id);
  const s = creatorStats(idea.owner);

  const tabs = [
    ['story', 'Story'],
    ['rewards', 'Rewards ' + idea.tiers.length],
    ['updates', 'Updates ' + idea.updates.length],
    ['comments', 'Comments ' + idea.comments.length],
    ['faq', 'FAQ ' + idea.faq.length],
    ['risks', 'Risks']
  ];

  let cta = '';
  if (idea.status === 'review') {
    cta = '<div class="notice">This idea is in review and is not public yet.</div>';
  } else if (idea.status === 'failed') {
    cta = '<div class="notice bad">Didn\'t reach its goal by the deadline. Under all-or-nothing, every pledge was returned.</div>';
  } else if (idea.status === 'funded') {
    cta = '<button class="primary" onclick="setTab(\'rewards\')">Late pledge — still available</button>' +
          '<div class="tinynote">Funding succeeded. Late pledges stay open with no target and no deadline.</div>';
  } else {
    cta = '<button class="primary" onclick="setTab(\'rewards\')">Back this idea</button>';
  }

  box.innerHTML =
    '<div class="dcover" style="--h:' + idea.cover.hue + '"><span class="dmark">' + escapeHtml(idea.cover.mark) + '</span>' +
      (idea.staffPick ? '<span class="loved">⭐ Loved</span>' : '') + '</div>' +

    '<div class="dhead">' +
      '<div class="cardtop"><span class="cat">' + cat.emoji + ' ' + cat.label + '</span>' + statusPill(idea) + '</div>' +
      '<h2 class="dtitle">' + escapeHtml(idea.title) + '</h2>' +
      (idea.subtitle ? '<p class="dsub">' + escapeHtml(idea.subtitle) + '</p>' : '') +
    '</div>' +

    '<div class="dstats">' +
      '<div class="bar' + (pct(idea) > 100 ? ' over' : '') + '"><span style="width:' + Math.min(100, p) + '%"></span></div>' +
      '<div class="statrow">' +
        '<div class="stat"><b>' + idea.raised.toLocaleString() + '</b><span>of ' + idea.goal.toLocaleString() + ' cr</span></div>' +
        '<div class="stat"><b>' + p + '%</b><span>funded</span></div>' +
        '<div class="stat"><b>' + idea.backers.length + '</b><span>backers</span></div>' +
        '<div class="stat"><b data-countdown-short="' + idea.id + '">' + (idea.status === 'live' ? timeLeftShort(idea) : '—') + '</b><span>to go</span></div>' +
      '</div>' +
    '</div>' +

    cta +

    '<div class="dactions">' +
      '<button class="votebtn' + (me.votedIds.includes(idea.id) ? ' voted' : '') + '" onclick="voteIdea(' + idea.id + ',event)">▲ ' + idea.votes + '</button>' +
      '<button onclick="toggleFollow(' + idea.id + ')">' + (following ? '♥ Following' : '♡ Follow') + '</button>' +
      '<button onclick="shareIdea(' + idea.id + ')">↗ Share</button>' +
      '<button class="ghosty" onclick="flagIdea(' + idea.id + ')">⚑ Report</button>' +
    '</div>' +

    '<div class="creator">' +
      '<div class="avatar">' + escapeHtml((idea.owner || '?').slice(5, 7).toUpperCase()) + '</div>' +
      '<div><div class="cname">' + escapeHtml(idea.owner) + '</div>' +
      '<div class="cmeta">' + creatorBadge(idea.owner) +
      (s.rate !== null ? ' <span class="tinynote">' + s.rate + '% of ' + s.closed + ' closed campaigns funded</span>' : '') + '</div></div>' +
    '</div>' +

    (myStake > 0 ? instrumentBox(idea, myStake) : '') +

    '<div class="tabs">' + tabs.map(t =>
      '<button class="tab' + (_view.tab === t[0] ? ' on' : '') + '" onclick="setTab(\'' + t[0] + '\')">' + t[1] + '</button>'
    ).join('') + '</div>' +

    '<div class="tabpane">' + renderTab(idea, isOwner) + '</div>';
}

// The correctness fix: a fixed cap, so an implied share does not silently
// shrink as other people back the idea.
function instrumentBox(idea, myStake) {
  const share = (myStake / idea.valuationCap) * 100;
  return '<div class="instrument">' +
    '<div class="instr-head">Your position <span class="pill sim">simulated</span></div>' +
    '<div class="instr-row"><span>Pledged</span><b>' + myStake.toLocaleString() + ' cr</b></div>' +
    '<div class="instr-row"><span>Valuation cap</span><b>' + idea.valuationCap.toLocaleString() + ' cr</b></div>' +
    '<div class="instr-row"><span>Implied share at the cap</span><b>' + share.toFixed(2) + '%</b></div>' +
    '<div class="tinynote">Fixed against the cap — it does not change when other people back this idea. ' +
    'This is a fictional demo instrument. It is not equity, not a security, and confers no ownership or return of any kind.</div>' +
  '</div>';
}

function renderTab(idea, isOwner) {
  if (_view.tab === 'rewards')  return tabRewards(idea);
  if (_view.tab === 'updates')  return tabUpdates(idea, isOwner);
  if (_view.tab === 'comments') return tabComments(idea);
  if (_view.tab === 'faq')      return tabFaq(idea, isOwner);
  if (_view.tab === 'risks')    return tabRisks(idea);
  return tabStory(idea);
}

function tabStory(idea) {
  const kw = (idea.keywords || []).map(k => '<button class="tag" onclick="toggleTag(\'' + escapeHtml(k) + '\');showDiscover()">#' + escapeHtml(k) + '</button>').join(' ');
  if (canSeeFull(idea)) {
    return '<p class="prose">' + escapeHtml(idea.secretSauce || idea.desc || '') + '</p>' +
      (idea.voiceUrl ? '<audio controls src="' + escapeHtml(idea.voiceUrl) + '"></audio>' : '') +
      (idea.aiDisclosure ? '<div class="tinynote">AI tools disclosed by the creator: ' + escapeHtml(idea.aiDisclosure) + '</div>' : '') +
      '<div class="tagrow">' + kw + '</div>';
  }
  const cost = unlockCost(idea);
  return '<p class="prose teaser">' + escapeHtml(idea.teaserProblem) + '</p>' +
    '<div class="tagrow">' + kw + '</div>' +
    '<div class="lockbox">' +
      '<div class="lockhead">🔒 Full pitch protected</div>' +
      '<p class="tinynote">The creator published a teaser publicly and kept the mechanism private. ' +
      (idea.unlocks.length ? idea.unlocks.length + ' backer' + (idea.unlocks.length === 1 ? ' has' : 's have') + ' unlocked it.' : 'Nobody has unlocked it yet.') + '</p>' +
      '<button class="unlock-btn" onclick="unlockIdea(' + idea.id + ')">Unlock full pitch — ' + cost + ' cr</button>' +
      '<div class="tinynote">70% of that goes to the creator. Backing at any tier also unlocks it.</div>' +
    '</div>';
}

function tabRewards(idea) {
  if (idea.status === 'failed') return '<div class="notice bad">This campaign closed without reaching its goal. Rewards are no longer available.</div>';
  if (idea.status === 'review') return '<div class="notice">Rewards go live once the idea passes review.</div>';

  const late = idea.status === 'funded';
  const head = late
    ? '<div class="notice">Funding closed successfully — these are <b>late pledges</b>. No target, no deadline.</div>'
    : '<div class="tinynote">All-or-nothing: your Credits are returned in full if the goal isn\'t met by the deadline.</div>';

  const sorted = idea.tiers.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.amount - b.amount);

  const cards = sorted.map(t => {
    const limited = t.limit > 0;
    const left = limited ? Math.max(0, t.limit - t.claimed) : null;
    const soldOut = limited && left === 0;
    return '<div class="tier' + (t.featured ? ' featured' : '') + (soldOut ? ' soldout' : '') + '">' +
      (t.featured ? '<div class="tierflag">Most popular</div>' : '') +
      '<div class="tieramt">' + t.amount.toLocaleString() + ' cr</div>' +
      '<div class="tiertitle">' + escapeHtml(t.title) + '</div>' +
      '<div class="tierdesc">' + escapeHtml(t.desc) + '</div>' +
      '<div class="tiermeta">' +
        (t.delivery ? '<span>🚚 ' + escapeHtml(t.delivery) + '</span>' : '') +
        (limited ? '<span class="' + (left <= 5 ? 'fomo' : '') + '">' + (soldOut ? 'Gone' : left + ' of ' + t.limit + ' left') + '</span>'
                 : '<span>Unlimited</span>') +
        '<span>' + t.claimed + ' backer' + (t.claimed === 1 ? '' : 's') + '</span>' +
      '</div>' +
      (soldOut ? '<button disabled>All claimed</button>'
               : '<button onclick="openPledge(' + idea.id + ',' + t.id + ')">' + (late ? 'Late pledge' : 'Select') + ' — ' + t.amount + ' cr</button>') +
    '</div>';
  }).join('');

  return head + '<div class="tiers">' + cards + '</div>' +
    '<button class="noreward" onclick="openPledge(' + idea.id + ',0)">Pledge without a reward</button>';
}

function tabUpdates(idea, isOwner) {
  const composer = isOwner
    ? '<div class="composer">' +
        '<input id="up-title" placeholder="Update title — e.g. Prototype #2 is working">' +
        '<textarea id="up-body" placeholder="What changed, what\'s next, what you need."></textarea>' +
        '<button class="primary" onclick="postUpdate(' + idea.id + ')">Post update to ' + idea.backers.length + ' backer' + (idea.backers.length === 1 ? '' : 's') + '</button>' +
      '</div>'
    : '';
  if (!idea.updates.length) {
    return composer + '<div class="empty">No updates yet.' +
      (isOwner ? '<br><span class="tinynote">Backers read updates as the signal you\'re still committed. Post regularly.</span>' : '') + '</div>';
  }
  const items = idea.updates.map(u =>
    '<div class="update">' +
      '<div class="upmeta">Update #' + u.n + ' · ' + new Date(u.time).toLocaleDateString() + '</div>' +
      '<div class="uptitle">' + escapeHtml(u.title) + '</div>' +
      '<p class="prose">' + escapeHtml(u.body) + '</p>' +
    '</div>').join('');
  return composer + '<div class="updates">' + items + '</div>';
}

function tabComments(idea) {
  const composer = wallet
    ? '<div class="composer">' +
        '<textarea id="cm-body" placeholder="Ask the creator something, or say what you think."></textarea>' +
        '<button class="primary" onclick="postComment(' + idea.id + ')">Post comment</button>' +
      '</div>'
    : '<div class="notice">Sign in to comment.</div>';

  if (!idea.comments.length) return composer + '<div class="empty">No comments yet. Be first.</div>';

  const items = idea.comments.slice().reverse().map(c =>
    '<div class="comment' + (c.creator ? ' iscreator' : '') + '">' +
      '<div class="cmhead"><b>' + escapeHtml(c.author) + '</b>' +
        (c.creator ? '<span class="badge good">Creator</span>' : '') +
        (c.backer ? '<span class="badge">Backer</span>' : '') +
        '<span class="tinynote">' + new Date(c.time).toLocaleDateString() + '</span></div>' +
      '<p class="prose">' + escapeHtml(c.text) + '</p>' +
    '</div>').join('');
  return composer + '<div class="comments">' + items + '</div>';
}

function tabFaq(idea, isOwner) {
  const composer = isOwner
    ? '<div class="composer">' +
        '<input id="faq-q" placeholder="Question — e.g. When does it ship?">' +
        '<textarea id="faq-a" placeholder="Your answer."></textarea>' +
        '<button class="primary" onclick="addFaq(' + idea.id + ')">Add to FAQ</button>' +
      '</div>'
    : '';
  if (!idea.faq.length) {
    return composer + '<div class="empty">No FAQ entries yet.' +
      (isOwner ? '<br><span class="tinynote">Promote repeat questions from the comments up here — timeline, reward specifics, shipping, specs.</span>' : '') + '</div>';
  }
  const items = idea.faq.map((f, i) =>
    '<details class="faq"' + (i === 0 ? ' open' : '') + '><summary>' + escapeHtml(f.q) + '</summary><p class="prose">' + escapeHtml(f.a) + '</p></details>'
  ).join('');
  return composer + items;
}

function tabRisks(idea) {
  return '<div class="riskblock">' +
    '<div class="riskhead">Risks and challenges</div>' +
    (idea.risks
      ? '<p class="prose">' + escapeHtml(idea.risks) + '</p>'
      : '<p class="prose teaser">This creator submitted before the risks section was required.</p>') +
    '<div class="tinynote">This section\'s title is fixed by the platform and every creator must complete it. It exists so you can judge how openly a creator describes what could go wrong.</div>' +
  '</div>';
}

// ── Follow / share / flag ─────────────────────────────────────────────
function toggleFollow(id) {
  if (!requireWallet('follow ideas')) return;
  const on = me.following.includes(id);
  me.following = on ? me.following.filter(x => x !== id) : me.following.concat([id]);
  saveMe();
  toast(on ? 'Unfollowed.' : 'Following — filter by ♥ on Discover.');
  renderDetail();
}

function shareIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  const url = location.origin + location.pathname + '#idea-' + id;
  const text = '“' + idea.title + '” — ' + Math.floor(pct(idea)) + '% funded on IdeaForge';
  if (window.legionTrack) window.legionTrack('share');
  if (navigator.share) {
    navigator.share({ title: idea.title, text: text, url: url }).catch(() => {});
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(
      () => toast('Link copied.'),
      () => toast('Copy failed — ' + escapeHtml(url), 'warn')
    );
  } else {
    toast('Share link: ' + escapeHtml(url));
  }
}

function flagIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  if (!requireWallet('report an idea')) return;
  idea.flags += 1;
  saveIdeas();
  toast('Reported. The platform reviews rights, AI disclosure and inflated backer counts.');
  addToCodex('Reported “' + idea.title + '” for review.');
}

// ── Unlock ────────────────────────────────────────────────────────────
function unlockCost(idea) { return Math.max(5, Math.floor(8 + (idea.surprise || 0.3) * 5)); }

function unlockIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  if (!requireWallet('unlock a pitch')) return;
  if (canSeeFull(idea)) { renderDetail(); return; }

  const cost = unlockCost(idea);
  if (credits < cost) { toast('Need ' + cost + ' Credits — you have ' + credits + '.', 'warn'); return; }

  credits -= cost;
  me.unlockedIds.push(idea.id);
  const toOwner = Math.floor(cost * 0.7);
  accrueOwnerEarnings(idea, toOwner, '💰 Someone unlocked “' + idea.title + '” — +' + toOwner + ' cr pending.');
  if (!idea.unlocks.includes(wallet)) idea.unlocks.push(wallet);

  saveIdeas(); saveMe(); updateWallet();
  addToCodex('Unlocked the full pitch of “' + idea.title + '” for ' + cost + ' cr.');
  toast('Unlocked. ' + toOwner + ' cr went to the creator.');
  _view.tab = 'story';
  renderDetail();
}

// ── Pledging ──────────────────────────────────────────────────────────
let _pledge = null;

function openPledge(ideaId, tierId) {
  const idea = ideas.find(i => i.id === ideaId);
  if (!idea) return;
  if (!requireWallet('back an idea')) return;
  if (idea.status === 'failed' || idea.status === 'review') { toast('Not open for pledges.', 'warn'); return; }

  const tier = tierId ? idea.tiers.find(t => t.id === tierId) : null;
  if (tier && tier.limit > 0 && tier.claimed >= tier.limit) { toast('That tier is fully claimed.', 'warn'); return; }

  _pledge = { ideaId: ideaId, tierId: tierId || 0 };
  const min = tier ? tier.amount : 5;
  const share = (min / idea.valuationCap) * 100;

  document.getElementById('sheet-inner').innerHTML =
    '<div class="sheet-head">' +
      '<strong>' + escapeHtml(idea.title) + '</strong>' +
      '<button class="x" onclick="closeSheet()">✕</button>' +
    '</div>' +
    (tier
      ? '<div class="tier featured"><div class="tieramt">' + tier.amount.toLocaleString() + ' cr</div>' +
        '<div class="tiertitle">' + escapeHtml(tier.title) + '</div>' +
        '<div class="tierdesc">' + escapeHtml(tier.desc) + '</div>' +
        (tier.delivery ? '<div class="tiermeta"><span>🚚 ' + escapeHtml(tier.delivery) + '</span></div>' : '') + '</div>'
      : '<div class="notice">Pledging without a reward — you back the idea, you claim nothing.</div>') +
    '<label class="sheetlabel" for="pl-amt">Amount in Credits' + (tier ? ' (' + tier.amount + ' minimum for this tier)' : '') + '</label>' +
    '<input id="pl-amt" class="sheetamt" type="number" value="' + min + '" min="' + min + '">' +
    '<div class="tinynote">You hold ' + credits + ' cr. Implied share at this amount: ~' + share.toFixed(2) + '% of the ' +
      idea.valuationCap.toLocaleString() + ' cr cap — fixed, and fictional.</div>' +
    (idea.status === 'live'
      ? '<div class="tinynote">All-or-nothing: if “' + escapeHtml(idea.title) + '” doesn\'t reach ' + idea.goal.toLocaleString() +
        ' cr by the deadline, this is returned in full.</div>'
      : '<div class="tinynote">Late pledge — funding already succeeded.</div>') +
    '<button class="primary" onclick="confirmPledge()">Confirm pledge</button>';

  document.getElementById('sheet').classList.remove('hidden');
}

function closeSheet() {
  document.getElementById('sheet').classList.add('hidden');
  _pledge = null;
}

function confirmPledge() {
  if (!_pledge) return;
  const idea = ideas.find(i => i.id === _pledge.ideaId);
  if (!idea) return;
  const tier = _pledge.tierId ? idea.tiers.find(t => t.id === _pledge.tierId) : null;
  const amt = Math.floor(Number(document.getElementById('pl-amt').value));

  if (!Number.isFinite(amt) || amt <= 0) { toast('Enter a positive amount.', 'warn'); return; }
  if (tier && amt < tier.amount) { toast('That tier starts at ' + tier.amount + ' cr.', 'warn'); return; }
  if (amt > credits) { toast('Not enough Credits — you hold ' + credits + '.', 'warn'); return; }

  credits -= amt;
  idea.raised += amt;                      // overfunding allowed, as on real platforms
  if (!idea.backers.includes(wallet)) idea.backers.push(wallet);
  if (!idea.investors.includes(wallet)) idea.investors.push(wallet);
  me.stakes[idea.id] = (me.stakes[idea.id] || 0) + amt;
  if (!me.pledges[idea.id]) me.pledges[idea.id] = [];
  me.pledges[idea.id].push({ tierId: _pledge.tierId, amount: amt, time: Date.now() });
  if (tier) tier.claimed += 1;

  const royalty = Math.floor(amt * 0.05);
  if (royalty > 0) accrueOwnerEarnings(idea, royalty, '💰 “' + idea.title + '” took a pledge — +' + royalty + ' cr royalty pending.');

  const crossed = idea.status === 'live' && idea.raised >= idea.goal && !idea._hitGoal;
  if (crossed) idea._hitGoal = true;

  saveIdeas(); saveMe(); updateWallet();
  closeSheet();

  addToCodex('Pledged ' + amt + ' cr to “' + idea.title + '”' + (tier ? ' (' + tier.title + ')' : '') + '.');
  if (crossed) {
    toast('🎉 “' + escapeHtml(idea.title) + '” just hit its goal. It resolves at the deadline.');
    addToCodex('🎉 “' + idea.title + '” reached its ' + idea.goal + ' cr goal.');
  } else if (idea.status === 'live') {
    toast('Pledged ' + amt + ' cr — ' + Math.max(0, idea.goal - idea.raised).toLocaleString() + ' cr to go.');
  } else {
    toast('Late pledge of ' + amt + ' cr recorded.');
  }
  renderDetail();
}

// ── Comments / updates / FAQ ──────────────────────────────────────────
function postComment(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || !requireWallet('comment')) return;
  const el = document.getElementById('cm-body');
  const text = (el.value || '').trim();
  if (!text) { toast('Write something first.', 'warn'); return; }
  idea.comments.push({
    id: Date.now(), author: wallet, text: text, time: Date.now(),
    creator: idea.owner === wallet, backer: (me.stakes[id] || 0) > 0
  });
  saveIdeas();
  addToCodex('Commented on “' + idea.title + '”.');
  toast('Comment posted.');
  renderDetail();
}

function postUpdate(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || idea.owner !== wallet) return;
  const t = (document.getElementById('up-title').value || '').trim();
  const b = (document.getElementById('up-body').value || '').trim();
  if (!t || !b) { toast('Give the update a title and a body.', 'warn'); return; }
  idea.updates.unshift({ n: idea.updates.length + 1, title: t, body: b, time: Date.now() });
  saveIdeas();
  addToCodex('Posted update #' + idea.updates.length + ' on “' + idea.title + '”.');
  toast('Update sent to ' + idea.backers.length + ' backer' + (idea.backers.length === 1 ? '' : 's') + '.');
  renderDetail();
}

function addFaq(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || idea.owner !== wallet) return;
  const q = (document.getElementById('faq-q').value || '').trim();
  const a = (document.getElementById('faq-a').value || '').trim();
  if (!q || !a) { toast('Both a question and an answer.', 'warn'); return; }
  idea.faq.push({ q: q, a: a });
  saveIdeas();
  toast('Added to the FAQ.');
  renderDetail();
}

// ── Submit ────────────────────────────────────────────────────────────
let _cover = { mark: COVER_MARKS[0], hue: 210 };
let _tierDraft = [];

function showSubmit() {
  hideAll();
  setActiveNav('showSubmit');
  document.getElementById('submit').classList.remove('hidden');
  const sel = document.getElementById('idea-cat');
  if (sel && !sel.options.length) {
    sel.innerHTML = CATEGORIES.map(c => '<option value="' + c.id + '">' + c.emoji + ' ' + c.label + '</option>').join('');
  }
  renderCoverPicker();
  if (!_tierDraft.length) _tierDraft = defaultTiers(Number(document.getElementById('goal').value) || 500);
  renderTierEditor();
}

function renderCoverPicker() {
  const box = document.getElementById('cover-picker');
  if (!box) return;
  box.innerHTML = COVER_MARKS.map((m, i) => {
    const hue = (i * 31) % 360;
    return '<button class="covopt' + (_cover.mark === m ? ' on' : '') + '" style="--h:' + hue + '" onclick="pickCover(\'' + m + '\',' + hue + ')">' + m + '</button>';
  }).join('');
}
function pickCover(m, hue) { _cover = { mark: m, hue: hue }; renderCoverPicker(); }

function onGoalChange() {
  const g = Number(document.getElementById('goal').value) || 500;
  const note = document.getElementById('aon-note');
  if (note) {
    note.innerHTML = 'All-or-nothing: if ' + g.toLocaleString() + ' cr isn\'t reached by the deadline, every pledge is returned and you keep nothing. ' +
      'Simulated valuation cap: ' + (g * CAP_MULTIPLE).toLocaleString() + ' cr.';
  }
}

function renderTierEditor() {
  const box = document.getElementById('tier-rows');
  if (!box) return;
  box.innerHTML = _tierDraft.map((t, i) =>
    '<div class="tierrow">' +
      '<div class="tierrow-top">' +
        '<input type="number" class="tamt" value="' + t.amount + '" min="1" oninput="editTier(' + i + ',\'amount\',this.value)" aria-label="Amount">' +
        '<input class="ttitle" value="' + escapeHtml(t.title) + '" placeholder="Tier name" oninput="editTier(' + i + ',\'title\',this.value)">' +
        '<button class="x" onclick="removeTier(' + i + ')">✕</button>' +
      '</div>' +
      '<input class="tdesc" value="' + escapeHtml(t.desc) + '" placeholder="What the backer gets" oninput="editTier(' + i + ',\'desc\',this.value)">' +
      '<div class="tierrow-top">' +
        '<input type="number" class="tamt" value="' + t.limit + '" min="0" oninput="editTier(' + i + ',\'limit\',this.value)" aria-label="Quantity limit, 0 for unlimited">' +
        '<input class="tdesc" value="' + escapeHtml(t.delivery) + '" placeholder="Estimated delivery" oninput="editTier(' + i + ',\'delivery\',this.value)">' +
        '<label class="featlab"><input type="checkbox" ' + (t.featured ? 'checked' : '') + ' onchange="editTier(' + i + ',\'featured\',this.checked)"> pin</label>' +
      '</div>' +
      '<div class="tinynote">Limit 0 = unlimited. Limited quantities create genuine scarcity; pinned tier shows first.</div>' +
    '</div>').join('');
}

function editTier(i, key, val) {
  if (!_tierDraft[i]) return;
  if (key === 'amount' || key === 'limit') _tierDraft[i][key] = Math.max(0, Math.floor(Number(val) || 0));
  else if (key === 'featured') { _tierDraft.forEach(t => { t.featured = false; }); _tierDraft[i].featured = !!val; renderTierEditor(); }
  else _tierDraft[i][key] = val;
}
function addTierRow() {
  const last = _tierDraft[_tierDraft.length - 1];
  _tierDraft.push({ id: Date.now() % 100000 + _tierDraft.length, amount: last ? last.amount * 2 : 25, title: '', desc: '', limit: 0, claimed: 0, delivery: '', featured: false });
  renderTierEditor();
}
function removeTier(i) { _tierDraft.splice(i, 1); renderTierEditor(); }

function collectSubmission() {
  const title = document.getElementById('idea-title').value.trim();
  const subtitle = document.getElementById('idea-sub').value.trim();
  const category = document.getElementById('idea-cat').value || 'tech';
  const teaserInput = document.getElementById('idea-teaser').value.trim();
  const fullVision = document.getElementById('idea-desc').value.trim();
  const risks = document.getElementById('idea-risks').value.trim();
  const goal = Math.max(50, parseInt(document.getElementById('goal').value, 10) || 500);
  const durationDays = parseInt(document.getElementById('duration').value, 10) || 30;
  const aiDisclosure = document.getElementById('ai-disclosure').value.trim();
  return { title, subtitle, category, teaserInput, fullVision, risks, goal, durationDays, aiDisclosure };
}

function validateSubmission(d) {
  if (!d.title) return 'Give the idea a title.';
  if (!d.teaserInput) return 'Write a public teaser — it is what everyone sees.';
  if (!d.risks) return 'The risks and challenges section is required.';
  if (d.risks.length < 30) return 'Say a bit more in risks and challenges — backers read it closely.';
  const tiers = _tierDraft.filter(t => t.amount > 0 && t.title.trim());
  if (!tiers.length) return 'Add at least one reward tier with an amount and a name.';
  if (!document.getElementById('chk-rights').checked) return 'Confirm you hold the rights to this material.';
  if (!document.getElementById('chk-ai').checked) return 'Confirm the AI disclosure.';
  return null;
}

function previewIdea() {
  const d = collectSubmission();
  const out = document.getElementById('preview-out');
  const cat = catOf(d.category);
  const tiers = _tierDraft.filter(t => t.amount > 0 && t.title.trim());
  out.innerHTML =
    '<div class="previewwrap"><div class="prevlabel">Preview — this is how backers will see it</div>' +
    '<div class="idea-card">' +
      '<div class="cover" style="--h:' + _cover.hue + '"><span class="mark">' + _cover.mark + '</span></div>' +
      '<div class="cardbody">' +
        '<div class="cardtop"><span class="cat">' + cat.emoji + ' ' + cat.label + '</span><span class="pill">' + d.durationDays + ' days</span></div>' +
        '<strong>' + escapeHtml(d.title || 'Untitled idea') + '</strong>' +
        (d.subtitle ? '<div class="subtitle">' + escapeHtml(d.subtitle) + '</div>' : '') +
        '<div class="bar"><span style="width:0%"></span></div>' +
        '<div class="meta">0% · 0 / ' + d.goal.toLocaleString() + ' cr · 0 backers</div>' +
        '<div class="tinynote">' + tiers.length + ' reward tier' + (tiers.length === 1 ? '' : 's') +
        ' · risks section ' + (d.risks ? 'complete' : '<span class="fomo">missing</span>') + '</div>' +
      '</div>' +
    '</div></div>';
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function submitIdea() {
  if (!requireWallet('submit an idea')) return;
  const d = collectSubmission();
  const err = validateSubmission(d);
  if (err) { toast(err, 'warn'); return; }

  const keywords = (d.teaserInput || d.title).toLowerCase()
    .split(/[\s,]+/).filter(w => w.length > 2).slice(0, 5);

  const now = Date.now();
  const idea = normalizeIdea({
    id: now,
    title: d.title,
    subtitle: d.subtitle,
    category: d.category,
    cover: { mark: _cover.mark, hue: _cover.hue },
    teaserProblem: d.teaserInput,
    keywords: keywords,
    secretSauce: d.fullVision || 'The creator did not add a private section.',
    desc: d.fullVision,
    risks: d.risks,
    aiDisclosure: d.aiDisclosure,
    goal: d.goal,
    durationDays: d.durationDays,
    raised: 0,
    votes: 0,
    weightedVotes: 0,
    surprise: window._p12Voice ? window._p12Voice.surprise : 0.3,
    voiceUrl: window._p12Voice ? window._p12Voice.url : null,
    owner: wallet,
    createdAt: now,
    launchedAt: now,
    status: 'review',
    reviewUntil: now + 20000,           // short simulated review, resolves in-session
    valuationCap: d.goal * CAP_MULTIPLE,
    tiers: _tierDraft.filter(t => t.amount > 0 && t.title.trim())
                     .map((t, i) => ({ ...t, id: i + 1, claimed: 0 })),
    backers: [],
    investors: [],
    updates: [], comments: [], faq: [], unlocks: []
  });

  ideas.unshift(idea);
  saveIdeas();

  if (window.legionTrack) window.legionTrack('activate');

  const proof = 'idea-' + idea.id + '-' + btoa(unescape(encodeURIComponent(idea.title))).slice(0, 12);
  addToCodex('Submitted “' + idea.title + '” for review. Receipt ' + proof + ' (timestamped for prior art).');

  ['idea-title', 'idea-sub', 'idea-teaser', 'idea-desc', 'idea-risks', 'ai-disclosure'].forEach(k => {
    const el = document.getElementById(k); if (el) el.value = '';
  });
  document.getElementById('chk-rights').checked = false;
  document.getElementById('chk-ai').checked = false;
  document.getElementById('preview-out').innerHTML = '';
  document.getElementById('voice-preview').innerHTML = '';
  window._p12Voice = null;
  _tierDraft = defaultTiers(500);

  toast('Submitted. It goes live the moment review clears.');
  showMine();
}

// ── Voice ─────────────────────────────────────────────────────────────
function recordVoicePitch() {
  const preview = document.getElementById('voice-preview');
  preview.innerHTML = 'Recording voice pitch…';
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const rec = new MediaRecorder(stream);
    let chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const surprise = Math.min(0.9, 0.3 + Math.min(chunks.length, 6) * 0.1);
      preview.innerHTML = '<audio controls src="' + url + '"></audio><br>Pitch energy: ' + surprise.toFixed(2) + ' — adds a 🎙 badge.';
      window._p12Voice = { url: url, surprise: surprise };
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start();
    setTimeout(() => rec.stop(), 4000);
  }).catch(() => {
    preview.innerHTML = 'Microphone unavailable — using default pitch energy 0.65.';
    window._p12Voice = { surprise: 0.65 };
  });
}

// ── My Ideas (creator dashboard) ──────────────────────────────────────
function showMine() {
  hideAll();
  setActiveNav('showMine');
  document.getElementById('mine').classList.remove('hidden');
  renderMine();
}

function renderMine() {
  const sub = document.getElementById('mine-sub');
  const list = document.getElementById('mine-list');
  if (!list) return;
  list.innerHTML = '';

  if (!wallet) {
    sub.innerHTML = '';
    list.innerHTML = '<div class="empty">Sign in to see the ideas you submitted and what they\'ve earned.</div>';
    return;
  }

  const mine = ideas.filter(i => i.owner === wallet);
  const backed = ideas.filter(i => (me.stakes[i.id] || 0) > 0);
  const pending = myPendingTotal();
  const lifetime = mine.reduce((s, i) => s + (i.lifetimeEarnings || 0), 0);
  const st = creatorStats(wallet);

  sub.innerHTML =
    'You own <b>' + mine.length + '</b> idea' + (mine.length === 1 ? '' : 's') +
    ' · backed <b>' + backed.length + '</b> · <b>' + pending + '</b> cr ready to claim · ' + lifetime + ' cr all-time' +
    (st.rate !== null ? '<br>Track record: ' + st.successful + '/' + st.closed + ' funded (' + st.rate + '%)' : '');

  if (pending > 0) {
    const claim = document.createElement('button');
    claim.className = 'primary';
    claim.textContent = '💰 Claim ' + pending + ' Credits';
    claim.onclick = claimEarnings;
    list.appendChild(claim);
  }

  if (!mine.length && !backed.length) {
    list.innerHTML += '<div class="empty">Nothing yet. Submit an idea, or back one from Discover.</div>';
    return;
  }

  mine.slice().sort((a, b) => (b.pendingEarnings || 0) - (a.pendingEarnings || 0)).forEach(idea => {
    const p = Math.floor(pct(idea));
    const el = document.createElement('div');
    el.className = 'idea-card compact' + (idea.status === 'funded' ? ' funded' : '') + (idea.status === 'failed' ? ' failed' : '');
    el.onclick = () => showIdea(idea.id);
    const simNote = idea.simEarnings > 0
      ? '<span class="simtag">' + idea.simEarnings + ' cr of this is simulated demo activity</span>' : '';
    el.innerHTML =
      '<div class="cardbody">' +
        '<div class="cardtop"><span class="cat">Your idea</span>' + statusPill(idea) + '</div>' +
        '<strong>' + escapeHtml(idea.title) + '</strong>' +
        '<div class="bar"><span style="width:' + Math.min(100, p) + '%"></span></div>' +
        '<div class="meta">' + idea.raised.toLocaleString() + ' / ' + idea.goal.toLocaleString() + ' cr · ' + p + '% · ' +
          idea.backers.length + ' backers · ' + idea.votes + ' votes · 💬 ' + idea.comments.length + '</div>' +
        '<div class="earn-row"><span class="earn-pending">' + (idea.pendingEarnings || 0) + ' cr pending</span>' +
          '<span class="earn-life">' + (idea.lifetimeEarnings || 0) + ' cr earned</span></div>' +
        simNote +
        (idea.status === 'live'
          ? '<div class="tinynote">' + (idea.updates.length ? idea.updates.length + ' update(s) posted' : 'No updates posted yet — backers read silence as risk') + '</div>'
          : '') +
      '</div>';
    list.appendChild(el);
  });

  if (backed.length) {
    const h = document.createElement('h3');
    h.textContent = 'Ideas you backed';
    list.appendChild(h);
    backed.forEach(idea => {
      const el = document.createElement('div');
      el.className = 'idea-card compact';
      el.onclick = () => showIdea(idea.id);
      el.innerHTML =
        '<div class="cardbody">' +
          '<div class="cardtop"><span class="cat">' + catOf(idea.category).label + '</span>' + statusPill(idea) + '</div>' +
          '<strong>' + escapeHtml(idea.title) + '</strong>' +
          '<div class="meta">Your pledge ' + (me.stakes[idea.id] || 0) + ' cr · ' +
            ((me.stakes[idea.id] / idea.valuationCap) * 100).toFixed(2) + '% implied at the cap (simulated)</div>' +
        '</div>';
      list.appendChild(el);
    });
  }
}

// Simulated ambient interest so the earn loop is visible in single-player.
// Labelled at the point of accrual, not only in a footnote.
function simulateBackerInterest() {
  if (!wallet) return;
  const mine = ideas.filter(i => i.owner === wallet && i.status === 'live');
  if (!mine.length) return;
  let earned = 0;
  mine.forEach(idea => {
    const pull = idea.votes * 0.4 + (idea.surprise || 0.3);
    if (Math.random() < Math.min(0.8, 0.25 + pull * 0.15)) {
      const gain = 2 + Math.floor(Math.random() * 6 + pull * 3);
      accrueOwnerEarnings(idea, gain, null, true);
      earned += gain;
    }
  });
  if (earned > 0) {
    saveIdeas();
    addToCodex('📈 Simulated demo backers (not real people) accrued +' + earned + ' cr to your ideas while you were away.');
  }
}

function claimEarnings() {
  if (!requireWallet('claim earnings')) return;
  const pending = myPendingTotal();
  if (pending <= 0) { renderMine(); return; }
  credits += pending;
  ideas.forEach(i => { if (i.owner === wallet) i.pendingEarnings = 0; });
  saveIdeas(); updateWallet();
  addToCodex('Claimed ' + pending + ' cr in earnings.');
  toast('Claimed ' + pending + ' Credits.');
  renderMine();
}

// ── Pitch Room ────────────────────────────────────────────────────────
let _live = null;
const PITCH_COST = 5;
const REACTIONS = [
  { txt: '🔥 love this', hype: 3 },
  { txt: '👏 strong pitch', hype: 2 },
  { txt: '👀 interesting', hype: 1 },
  { txt: '💡 clever angle', hype: 2 },
  { txt: '🤔 not sure', hype: -1 },
  { txt: '🚀 take my credits', hype: 4 },
  { txt: '😴 seen it before', hype: -2 },
  { txt: '💬 tell me more', hype: 1 }
];

function renderLiveSetup() {
  const box = document.getElementById('live-setup');
  if (!box) return;
  if (!wallet) { box.innerHTML = '<div class="empty">Sign in to start a pitch session.</div>'; return; }
  const own = ideas.filter(i => i.owner === wallet && i.status === 'live');
  const pool = own.length ? own : ideas.filter(i => i.status === 'live');
  if (!pool.length) { box.innerHTML = '<div class="empty">No live ideas to pitch. Submit one first.</div>'; return; }
  const opts = pool.slice(0, 8).map(i => '<option value="' + i.id + '">' + escapeHtml(i.title) + ' — ' + i.votes + ' votes</option>').join('');
  box.innerHTML =
    '<label class="live-label">Pick an idea to pitch</label>' +
    '<select id="live-pick" class="live-select">' + opts + '</select>' +
    '<button class="primary" onclick="startPitch()">📡 Go live — ' + PITCH_COST + ' Credits</button>' +
    '<div class="tinynote">Room reactions are simulated demo activity, not real viewers. Banked votes are real and enter the same ranking as the feed.</div>';
}

function showLive() {
  hideAll();
  setActiveNav('showLive');
  document.getElementById('live').classList.remove('hidden');
  if (_live) {
    document.getElementById('live-setup').classList.add('hidden');
    document.getElementById('live-stage').classList.remove('hidden');
  } else {
    document.getElementById('live-setup').classList.remove('hidden');
    document.getElementById('live-stage').classList.add('hidden');
    renderLiveSetup();
  }
}

function startPitch() {
  if (!requireWallet('go live')) return;
  if (_live) return;
  if (credits < PITCH_COST) { toast('Need ' + PITCH_COST + ' Credits to go live.', 'warn'); return; }
  const pick = document.getElementById('live-pick');
  const id = pick ? Number(pick.value) : null;
  const idea = ideas.find(i => i.id === id);
  if (!idea) { toast('Pick an idea.', 'warn'); return; }

  credits -= PITCH_COST;
  updateWallet();
  _live = { ideaId: id, hype: 0, watching: 20 + Math.floor(Math.random() * 40), reactions: [] };

  document.getElementById('live-setup').classList.add('hidden');
  document.getElementById('live-stage').classList.remove('hidden');
  document.getElementById('live-title').textContent = '🔴 LIVE · ' + idea.title;
  document.getElementById('live-reactions').innerHTML = '';
  renderLiveMeter();
  addToCodex('Went live pitching “' + idea.title + '”.');
  _live.timer = setInterval(tickPitch, 900);
}

function tickPitch() {
  if (!_live) return;
  const idea = ideas.find(i => i.id === _live.ideaId);
  if (!idea) { endPitch(); return; }
  const energy = (idea.surprise || 0.3) + Math.max(0, _live.hype) * 0.02;
  _live.watching = Math.max(5, _live.watching + Math.floor((Math.random() - 0.35) * 6 + energy * 4));
  const r = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
  _live.hype = Math.max(0, _live.hype + r.hype);
  _live.reactions.unshift(r.txt);
  if (_live.reactions.length > 6) _live.reactions.pop();
  renderLiveMeter();
}

function renderLiveMeter() {
  if (!_live) return;
  const w = document.getElementById('live-watching');
  const meter = document.getElementById('live-meter');
  const fill = document.getElementById('hype-fill');
  const feed = document.getElementById('live-reactions');
  const v = hypeToVotes(_live.hype);
  if (w) w.textContent = '👀 ' + _live.watching + ' watching (simulated)';
  if (fill) fill.style.width = Math.min(100, _live.hype * 4) + '%';
  if (meter) meter.innerHTML = 'Hype <b>' + _live.hype + '</b> → converts to <b>' + v + '</b> vote' + (v === 1 ? '' : 's');
  if (feed) feed.innerHTML = _live.reactions.map(t => '<div class="react">' + escapeHtml(t) + '</div>').join('');
}

function hypeToVotes(hype) { return Math.min(15, Math.floor(Math.sqrt(Math.max(0, hype)) * 1.6)); }

function endPitch() {
  if (!_live) return;
  clearInterval(_live.timer);
  const idea = ideas.find(i => i.id === _live.ideaId);
  const votes = idea ? hypeToVotes(_live.hype) : 0;
  if (idea && votes > 0) {
    idea.votes += votes;
    idea.weightedVotes = (idea.weightedVotes || 0) + votes * 0.6;
    saveIdeas();
    addToCodex('🎤 Pitch of “' + idea.title + '” banked ' + votes + ' vote' + (votes === 1 ? '' : 's') + '.');
  }
  const title = idea ? idea.title : 'your idea';
  _live = null;
  document.getElementById('live-stage').classList.add('hidden');
  document.getElementById('live-setup').classList.remove('hidden');
  renderLiveSetup();
  toast(votes > 0 ? '“' + escapeHtml(title) + '” gained ' + votes + ' votes.' : 'The room didn\'t bite this time.');
  showDiscover();
}

// ── Activity ──────────────────────────────────────────────────────────
function showCodex() {
  hideAll();
  setActiveNav('showCodex');
  document.getElementById('codex').classList.remove('hidden');
  const list = document.getElementById('codex-list');
  list.innerHTML = '<h3>Your activity log</h3>';
  if (!codex.length) {
    list.innerHTML += '<div class="empty">Submit, vote, comment or back an idea to start your log.</div>';
    return;
  }
  codex.slice(0, 12).forEach(c => {
    const div = document.createElement('div');
    div.className = 'notebook-entry';
    div.innerHTML = '<small>' + new Date(c.time).toLocaleString() + '</small><br>' + escapeHtml(c.note);
    list.appendChild(div);
  });
}

function addToCodex(note) {
  codex.unshift({ time: Date.now(), note: note });
  if (codex.length > 40) codex.pop();
  localStorage.setItem('p12_codex', JSON.stringify(codex));
}

// ── Nav ───────────────────────────────────────────────────────────────
function hideAll() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
}
function setActiveNav(fnName) {
  document.querySelectorAll('.nav button').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    b.classList.toggle('active', oc.indexOf(fnName + '(') === 0);
  });
}
function rerender() {
  if (!document.getElementById('detail').classList.contains('hidden')) renderDetail();
  else if (!document.getElementById('discover').classList.contains('hidden')) renderDiscover();
  else if (!document.getElementById('mine').classList.contains('hidden')) renderMine();
}

// Live countdowns
function tickCountdowns() {
  const changed = resolveDeadlines();
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const idea = ideas.find(i => i.id === Number(el.getAttribute('data-countdown')));
    if (!idea || idea.status !== 'live') return;
    el.textContent = timeLeft(idea);
    if (isUrgent(idea)) el.classList.add('urgent');
  });
  document.querySelectorAll('[data-countdown-short]').forEach(el => {
    const idea = ideas.find(i => i.id === Number(el.getAttribute('data-countdown-short')));
    if (!idea || idea.status !== 'live') return;
    el.textContent = timeLeftShort(idea);
  });
  if (changed) rerender();
}

// ── Seed + init ───────────────────────────────────────────────────────
function seedIdeas() {
  const now = Date.now();
  const mk = (o) => normalizeIdea(o);
  return [
    mk({ id: 1001, title: 'Voice-powered errand matching', subtitle: 'Say what you need; a neighbour picks it up in under ten minutes.',
      category: 'tech', cover: { mark: '🚀', hue: 210 }, staffPick: true,
      teaserProblem: 'Last-mile errands are matched by typing into forms nobody fills in. Voice collapses that to one sentence.',
      keywords: ['voice', 'errands', 'logistics', 'matching'],
      secretSauce: 'The mechanism is an on-device matching model that ranks nearby helpers by route overlap rather than distance, so a helper already walking past your street outranks someone closer but stationary. Surge pricing learns individual habit windows instead of applying a blanket multiplier.',
      risks: 'The hard part is supply density in the first month — under roughly forty active helpers per district the match time collapses and the product feels broken. We are opening one district at a time rather than a city, and we hold back a paid-standby pool to cover thin hours. Voice recognition in noisy streets is the second risk; we fall back to a two-tap confirmation whenever confidence drops below threshold.',
      goal: 500, raised: 412, votes: 34, weightedVotes: 26, surprise: 0.72, owner: 'seed-nadia',
      createdAt: now - 18 * DAY, launchedAt: now - 18 * DAY, durationDays: 30, status: 'live',
      backers: ['backer-a', 'backer-b', 'backer-c', 'backer-d', 'backer-e', 'backer-f', 'backer-g'],
      comments: [
        { id: 1, author: 'backer-a', text: 'How do you stop helpers cherry-picking only the short jobs?', time: now - 6 * DAY, creator: false, backer: true },
        { id: 2, author: 'seed-nadia', text: 'Acceptance rate feeds the ranking directly — decline three in a row and you drop below people who take what comes. It is the single lever that keeps the queue honest.', time: now - 6 * DAY + HOUR, creator: true, backer: false },
        { id: 3, author: 'backer-c', text: 'Backed. The route-overlap idea is the part nobody else is doing.', time: now - 3 * DAY, creator: false, backer: true }
      ],
      updates: [
        { n: 2, title: 'District two opens Thursday', body: 'Ninety-one helpers signed up in district one, which is past the density line we said we needed. Median match is now four minutes twenty. District two opens Thursday and we are holding the standby pool at twelve people through the first fortnight.', time: now - 2 * DAY },
        { n: 1, title: 'Why we start with one district', body: 'Every failed version of this we studied launched city-wide and starved. We would rather be excellent in one postcode than unusable in thirty.', time: now - 12 * DAY }
      ],
      faq: [{ q: 'When does it ship?', a: 'The app is live in district one now. Backer access follows two months after the campaign closes.' }] }),

    mk({ id: 1002, title: 'Virtual land voice tours', subtitle: 'Spatial-audio walking tours generated for places that no longer exist.',
      category: 'film', cover: { mark: '🧭', hue: 28 },
      teaserProblem: 'Historical sites hand you a laminated board. We hand you the street as it sounded in 1890.',
      keywords: ['audio', 'tours', 'spatial', 'heritage'],
      secretSauce: 'Spatial audio guides generated on the fly from archival records, with creator revenue share on every tour.',
      risks: 'Archival licensing is the real constraint — three of our five pilot sites required separate permissions and one is still unresolved. Budget assumes we clear four of five. Spatial audio also drains phone battery fast; the current build runs ninety minutes and we want two hours.',
      goal: 800, raised: 806, votes: 21, weightedVotes: 15, surprise: 0.65, owner: 'seed-marek',
      createdAt: now - 40 * DAY, launchedAt: now - 40 * DAY, durationDays: 30, status: 'funded',
      backers: ['backer-h', 'backer-i', 'backer-j', 'backer-k'],
      updates: [{ n: 1, title: 'Funded — and the fifth site said yes', body: 'We closed at 806 and the site that was holding out came back Monday. All five pilots are cleared.', time: now - 8 * DAY }] }),

    mk({ id: 1003, title: 'Fermentation starter kit', subtitle: 'Six ferments, one shelf, no equipment you do not already own.',
      category: 'food', cover: { mark: '🍜', hue: 96 },
      teaserProblem: 'Every fermentation kit sells you a crock you use twice. This one fits what is already in your kitchen.',
      keywords: ['fermentation', 'kitchen', 'kit', 'food'],
      secretSauce: 'Cultures are freeze-dried in single-batch doses so nothing is wasted, and the guide is sequenced so each ferment feeds the next.',
      risks: 'Live cultures and summer shipping do not mix. We are holding fulfilment to spring and autumn windows and building cold-pack cost into the tier price rather than discovering it later.',
      goal: 300, raised: 66, votes: 8, weightedVotes: 5, surprise: 0.4, owner: 'seed-priya',
      createdAt: now - 2 * DAY, launchedAt: now - 2 * DAY, durationDays: 30, status: 'live',
      backers: ['backer-l', 'backer-m'] }),

    mk({ id: 1004, title: 'Tidepool — a game about patience', subtitle: 'A strategy game with no timers, no streaks and nothing to miss.',
      category: 'games', cover: { mark: '🌊', hue: 190 }, staffPick: true,
      teaserProblem: 'Built deliberately against every retention mechanic the genre relies on.',
      keywords: ['game', 'strategy', 'calm', 'indie'],
      secretSauce: 'Turns resolve on real tides. You cannot rush it, and the design makes that the point rather than a limitation.',
      risks: 'A game that refuses to nag you is a game people forget. We know this. The mitigation is a single weekly digest and nothing else, and we would rather have a smaller audience that stays than a larger one we harass.',
      goal: 1200, raised: 1043, votes: 52, weightedVotes: 41, surprise: 0.8, owner: 'seed-nadia',
      createdAt: now - 26 * DAY, launchedAt: now - 26 * DAY, durationDays: 28, status: 'live',
      backers: ['backer-n', 'backer-o', 'backer-p', 'backer-q', 'backer-r', 'backer-s', 'backer-t', 'backer-u', 'backer-v'],
      comments: [
        { id: 4, author: 'backer-n', text: 'Does the tide thing work if I travel between timezones?', time: now - 5 * DAY, creator: false, backer: true },
        { id: 5, author: 'seed-nadia', text: 'It locks to the coast you pick at the start, not your device. Move around all you like — your tide stays put.', time: now - 5 * DAY + 2 * HOUR, creator: true, backer: false }
      ],
      updates: [{ n: 1, title: 'Final week', body: 'We are 87% with six days left. The build is done; the remainder funds the audio pass.', time: now - 1 * DAY }] }),

    mk({ id: 1005, title: 'Repair manual for orphaned hardware', subtitle: 'Teardowns and schematics for devices the manufacturer abandoned.',
      category: 'publish', cover: { mark: '🛠', hue: 320 },
      teaserProblem: 'When support ends the schematics vanish. We are printing them before they do.',
      keywords: ['repair', 'hardware', 'manual', 'archive'],
      secretSauce: 'Community-sourced teardowns, verified by two independent repairers before anything is printed.',
      risks: 'Verification is slow and it is the whole value of the book — an unverified schematic is worse than none. We are budgeting for the verification pass to take twice as long as the writing.',
      goal: 600, raised: 188, votes: 17, weightedVotes: 12, surprise: 0.55, owner: 'seed-tomas',
      createdAt: now - 27 * DAY, launchedAt: now - 27 * DAY, durationDays: 30, status: 'live',
      backers: ['backer-w', 'backer-x', 'backer-y'] }),

    mk({ id: 1006, title: 'Modular desk lamp', subtitle: 'One arm, five heads, no proprietary anything.',
      category: 'design', cover: { mark: '🕯', hue: 48 },
      teaserProblem: 'Lamps break at the joint. This one is designed to be taken apart at the joint.',
      keywords: ['lamp', 'modular', 'design', 'repair'],
      secretSauce: 'Standard fasteners throughout and a published parts drawing, so the lamp outlives us.',
      risks: 'We missed. Tooling quotes came in at nearly twice our estimate and we did not adjust the goal in time — the honest read is that we under-researched manufacturing before launching.',
      goal: 900, raised: 402, votes: 11, weightedVotes: 8, surprise: 0.45, owner: 'seed-tomas',
      createdAt: now - 45 * DAY, launchedAt: now - 45 * DAY, durationDays: 30, status: 'failed',
      backers: ['backer-z', 'backer-aa'] })
  ];
}

// deep link: #idea-<id>
function handleHash() {
  const m = /^#idea-(\d+)$/.exec(location.hash || '');
  if (!m) { showDiscover(); return; }
  const target = ideas.find(i => i.id === Number(m[1]));
  if (target) showIdea(target.id);
  else { toast('That idea is no longer available.', 'warn'); showDiscover(); }
}

function initP12() {
  if (!ideas.length) { ideas = seedIdeas(); saveIdeas(); }
  if (!me.pledges) me.pledges = {};
  if (!me.following) me.following = [];
  if (!me.createdAt) me.createdAt = Date.now();
  saveMe();

  rollVoteDay();
  resolveDeadlines();
  updateWallet();

  handleHash();
  // a shared link opened while the app is already running is a fragment
  // navigation — onload never fires again, so listen for it explicitly
  window.addEventListener('hashchange', handleHash);

  setInterval(tickCountdowns, 1000);
}

window.onload = initP12;
