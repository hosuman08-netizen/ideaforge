// p12 IdeaForge - Post ideas, vote, fund. Real core loop. Fictional tokens only.
let wallet = null;
let balance = 1250;
let credits = 320;
let ideas = JSON.parse(localStorage.getItem('p12_ideas') || '[]');
let codex = JSON.parse(localStorage.getItem('p12_codex') || '[]');

// ── Per-user state (persisted): which ideas I voted, how much I staked, daily vote budget ──
let me = JSON.parse(localStorage.getItem('p12_me') || 'null') || {
  votedIds: [],          // idea ids I have upvoted (dedupe)
  stakes: {},            // ideaId -> credits I personally invested
  voteDay: todayKey(),   // resets vote budget each calendar day
  votesUsed: 0
};
const DAILY_VOTES = 10;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function saveMe() { localStorage.setItem('p12_me', JSON.stringify(me)); }
function saveIdeas() { localStorage.setItem('p12_ideas', JSON.stringify(ideas)); }

function rollVoteDay() {
  const k = todayKey();
  if (me.voteDay !== k) { me.voteDay = k; me.votesUsed = 0; saveMe(); }
}
function votesLeft() { rollVoteDay(); return Math.max(0, DAILY_VOTES - me.votesUsed); }

// ── Migrate older seeded ideas that lack the new fields ──
function normalizeIdea(idea) {
  if (typeof idea.votes !== 'number') idea.votes = 0;
  if (!Array.isArray(idea.investors)) idea.investors = [];
  if (typeof idea.raised !== 'number') idea.raised = 0;
  if (typeof idea.funded !== 'boolean') idea.funded = idea.raised >= idea.goal;
  return idea;
}
ideas = ideas.map(normalizeIdea);

function updateWallet() {
  const el = document.getElementById('wallet-info');
  if (el) el.innerHTML = `${wallet || '0xDemo'} • ${balance} $EROS / ${credits} Credits`;
}

function connectWallet() {
  wallet = '0x' + Math.random().toString(16).slice(2, 10);
  updateWallet();
  showFeed();
}

function recordVoicePitch() {
  const preview = document.getElementById('voice-preview');
  preview.innerHTML = 'Recording p6 Voice Pitch (Lung Surprise Eye)...';

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const rec = new MediaRecorder(stream);
    let chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, {type:'audio/webm'});
      const url = URL.createObjectURL(blob);

      let surprise = 0.3;
      if (window.getP6LungSurprise) surprise = window.getP6LungSurprise();

      preview.innerHTML = `<audio controls src="${url}"></audio><br>Surprise: ${surprise.toFixed(2)} — Boosts investor attention!`;
      window._p12Voice = { url, surprise };
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start();
    setTimeout(() => rec.stop(), 4000);
  }).catch(() => {
    preview.innerHTML = 'Voice fallback. Surprise 0.65';
    window._p12Voice = { surprise: 0.65 };
  });
}

function submitIdea() {
  const title = document.getElementById('idea-title').value.trim() || 'Untitled Idea';
  const desc = document.getElementById('idea-desc').value.trim() || 'No description.';
  const goal = Math.max(50, parseInt(document.getElementById('goal').value) || 500);
  const surprise = window._p12Voice ? window._p12Voice.surprise : 0.3;

  if (!wallet) {
    alert('Connect wallet (p10 credits linked).');
    return;
  }

  const idea = {
    id: Date.now(),
    title,
    desc,
    goal,
    raised: 0,
    votes: 0,
    funded: false,
    surprise,
    voiceUrl: window._p12Voice ? window._p12Voice.url : null,
    owner: wallet,
    timestamp: new Date().toISOString(),
    investors: []
  };

  ideas.unshift(idea);
  saveIdeas();

  addToCodex(`Submitted “${title}”. Voice surprise ${surprise.toFixed(2)}.`);

  document.getElementById('idea-title').value = '';
  document.getElementById('idea-desc').value = '';
  window._p12Voice = null;
  document.getElementById('voice-preview').innerHTML = '';
  showFeed();
}

// ── Ranking: real community signal, not Math.random ──
// Hot score = votes (community) + funding momentum + a fixed surprise nudge.
function hotScore(idea) {
  const fundPct = idea.goal > 0 ? idea.raised / idea.goal : 0;
  return idea.votes * 3 + fundPct * 5 + idea.surprise * 2;
}

function sortedIdeas() {
  return ideas.slice().sort((a, b) => hotScore(b) - hotScore(a));
}

function showFeed() {
  hideAll();
  setActiveNav("showFeed");
  document.getElementById('feed').classList.remove('hidden');
  renderFeedHeader();
  const list = document.getElementById('idea-list');
  list.innerHTML = '';

  if (ideas.length === 0) {
    list.innerHTML = '<p>No ideas yet. Submit one with voice!</p>';
    return;
  }

  const ranked = sortedIdeas();
  ranked.forEach((idea, rank) => {
    const raisedPct = idea.goal > 0 ? Math.min(100, Math.floor((idea.raised / idea.goal) * 100)) : 0;
    const iVoted = me.votedIds.includes(idea.id);
    const myStake = me.stakes[idea.id] || 0;
    const el = document.createElement('div');
    el.className = 'idea-card' + (idea.funded ? ' funded' : '');
    const short = idea.desc.length > 60 ? idea.desc.substring(0, 60) + '…' : idea.desc;

    // "slots left" derived from REAL data (investor cap = 12), so code === display.
    const CAP = 12;
    const slotsLeft = Math.max(0, CAP - idea.investors.length);

    el.innerHTML = `
      ${rank < 3 ? `<span class="rankbadge">#${rank + 1} Hot</span>` : ''}
      <strong>${escapeHtml(idea.title)}</strong>
      <span class="desc">${escapeHtml(short)}</span>
      <div class="surprise">👁 Surprise ${idea.surprise.toFixed(2)}${idea.voiceUrl ? ' · 🎙 voice' : ''}</div>
      <div class="bar"><span style="width:${raisedPct}%"></span></div>
      <div class="meta">${idea.raised} / ${idea.goal} raised · ${raisedPct}%${idea.funded ? ' · ✅ FUNDED' : ''}</div>
      <div class="stats">
        <button class="votebtn${iVoted ? ' voted' : ''}" onclick="voteIdea(${idea.id})">▲ ${idea.votes}${iVoted ? ' ✓' : ''}</button>
        <span class="mystake">${myStake > 0 ? `Your stake: ${myStake} cr (${ownershipPct(idea)}%)` : ''}</span>
      </div>
      ${idea.funded
        ? `<button disabled>✅ Goal reached — funded by ${idea.investors.length} backer${idea.investors.length === 1 ? '' : 's'}</button>`
        : `<button onclick="openInvest(${idea.id})">Invest ${slotsLeft > 0 ? `<span class="fomo">${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left</span>` : '<span class="fomo">last call</span>'}</button>`}
    `;
    list.appendChild(el);
  });
}

function renderFeedHeader() {
  const h = document.getElementById('feed-sub');
  if (!h) return;
  const totalVotes = ideas.reduce((s, i) => s + i.votes, 0);
  const fundedCount = ideas.filter(i => i.funded).length;
  h.innerHTML = `🔥 ${totalVotes} votes cast · ${fundedCount} funded · you have <b>${votesLeft()}</b> votes left today`;
}

function ownershipPct(idea) {
  const myStake = me.stakes[idea.id] || 0;
  if (idea.raised <= 0) return '0';
  return ((myStake / idea.raised) * 100).toFixed(1);
}

// ── VOTING (real): finite daily budget, one vote per idea, persisted ──
function voteIdea(id) {
  if (!wallet) { alert('Connect wallet to vote.'); return; }
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  if (me.votedIds.includes(id)) {
    // toggle off — return the vote to the budget
    idea.votes = Math.max(0, idea.votes - 1);
    me.votedIds = me.votedIds.filter(x => x !== id);
    me.votesUsed = Math.max(0, me.votesUsed - 1);
    saveIdeas(); saveMe();
    showFeed();
    return;
  }

  if (votesLeft() <= 0) {
    alert(`Out of votes today (${DAILY_VOTES}/day). Come back tomorrow.`);
    return;
  }

  idea.votes += 1;
  me.votedIds.push(id);
  me.votesUsed += 1;
  saveIdeas(); saveMe();
  addToCodex(`Upvoted “${idea.title}” → now #${sortedIdeas().indexOf(idea) + 1} hot.`);
  showFeed();
}

// ── FUNDING (real): user chooses amount, stake tracked, funded state ──
let _investTarget = null;
function openInvest(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || !wallet) { alert('Connect wallet.'); return; }
  if (idea.funded) return;
  _investTarget = id;

  const remaining = Math.max(0, idea.goal - idea.raised);
  const suggested = Math.min(remaining, Math.max(25, Math.min(credits, 50)));
  const raw = prompt(
    `Invest in “${idea.title}”\n` +
    `Raised ${idea.raised}/${idea.goal} · ${remaining} cr to goal\n` +
    `You have ${credits} Credits.\n\n` +
    `How many Credits to invest?`,
    String(suggested)
  );
  if (raw === null) return;

  const amt = Math.floor(Number(raw));
  if (!Number.isFinite(amt) || amt <= 0) { alert('Enter a positive number.'); return; }
  if (amt > credits) { alert(`Not enough Credits (you have ${credits}).`); return; }
  if (amt > remaining) {
    // don't let anyone overfund past goal — cap it
    alert(`Only ${remaining} cr needed to hit the goal — investing ${remaining}.`);
    doInvest(id, remaining);
    return;
  }
  doInvest(id, amt);
}

function doInvest(id, amt) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || amt <= 0) return;

  credits -= amt;
  idea.raised += amt;
  if (!idea.investors.includes(wallet)) idea.investors.push(wallet);
  me.stakes[id] = (me.stakes[id] || 0) + amt;

  const justFunded = !idea.funded && idea.raised >= idea.goal;
  if (justFunded) idea.funded = true;

  saveIdeas(); saveMe();
  updateWallet();

  const own = ownershipPct(idea);
  if (justFunded) {
    addToCodex(`🎉 “${idea.title}” hit its ${idea.goal} goal! Your stake ${me.stakes[id]} cr = ${own}%.`);
    alert(`🎉 FUNDED! “${idea.title}” reached ${idea.goal}. You own ${own}% (${me.stakes[id]} cr).`);
  } else {
    const toGoal = idea.goal - idea.raised;
    addToCodex(`Invested ${amt} in “${idea.title}”. ${toGoal} cr to goal. Your stake ${me.stakes[id]} cr (${own}%).`);
    alert(`Invested ${amt}. “${idea.title}” at ${idea.raised}/${idea.goal}. ${toGoal} to goal · you own ${own}%.`);
  }
  showFeed();
}

function showSubmit() {
  hideAll();
  setActiveNav("showSubmit");
  document.getElementById('submit').classList.remove('hidden');
}

function showLive() {
  hideAll();
  setActiveNav("showLive");
  document.getElementById('live').classList.remove('hidden');
}

function showCodex() {
  hideAll();
  setActiveNav("showCodex");
  document.getElementById('codex').classList.remove('hidden');
  const list = document.getElementById('codex-list');
  list.innerHTML = '<h3>Idea Codex (ALWAYS LEARNING + p6 spores)</h3>';

  if (codex.length === 0) {
    list.innerHTML += '<p>Submit, vote, or invest to start codex.</p>';
    return;
  }

  codex.slice(0, 8).forEach(c => {
    const div = document.createElement('div');
    div.className = 'notebook-entry';
    div.innerHTML = `<small>${new Date(c.time).toLocaleString()}</small><br>${escapeHtml(c.note)}`;
    list.appendChild(div);
  });
}

function addToCodex(note) {
  codex.unshift({ time: Date.now(), note });
  if (codex.length > 20) codex.pop();
  localStorage.setItem('p12_codex', JSON.stringify(codex));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function hideAll() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
}

// 액티브 탭 하이라이트 — onclick 함수명으로 매칭 (절제된 금빛 1곳)
function setActiveNav(fnName) {
  document.querySelectorAll('.nav button').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    b.classList.toggle('active', oc.indexOf(fnName + '(') === 0);
  });
}

function initP12() {
  updateWallet();

  // Seed demo ideas
  if (ideas.length === 0) {
    ideas = [
      { id: 1, title: "Voice-powered errand matching", desc: "p7 + p6 hybrid.", goal: 500, raised: 320, votes: 7, funded: false, surprise: 0.72, voiceUrl: null, owner: '0xSeed01', timestamp: new Date().toISOString(), investors: ['0xa', '0xb', '0xc'] },
      { id: 2, title: "Metaverse land voice tours", desc: "p11 + p6 + p9 live.", goal: 800, raised: 450, votes: 4, funded: false, surprise: 0.65, voiceUrl: null, owner: '0xSeed02', timestamp: new Date().toISOString(), investors: ['0xd', '0xe'] }
    ];
    saveIdeas();
  }

  // p6 cross
  if (window.getP6LungSurprise) {
    console.log('[p12] p6 Lung Surprise Eye ready for pitches.');
  }

  rollVoteDay();
  showFeed();
}

window.onload = initP12;
