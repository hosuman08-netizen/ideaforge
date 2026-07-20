// IdeaForge - Post ideas, vote, fund. Fictional demo, in-app tokens only.
let wallet = null;
let balance = 1250;
let credits = 320;
let ideas = JSON.parse(localStorage.getItem('p12_ideas') || '[]');
let codex = JSON.parse(localStorage.getItem('p12_codex') || '[]');

// ── Per-user state (persisted) — extended for unlocks ──
let me = JSON.parse(localStorage.getItem('p12_me') || 'null') || {
  votedIds: [],          // idea ids I have upvoted (dedupe)
  stakes: {},            // ideaId -> credits I personally invested
  voteDay: todayKey(),   // resets vote budget each calendar day
  votesUsed: 0,
  unlockedIds: []        // ideas where I paid to see full vision (protection + commitment)
};
const DAILY_VOTES = 10;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function saveMe() { localStorage.setItem('p12_me', JSON.stringify(me)); }
function saveIdeas() { localStorage.setItem('p12_ideas', JSON.stringify(ideas)); }

// ── Owner earnings: credits accrued to an idea's owner, waiting to be claimed. ──
// This closes the submitter loop: post an idea → backers unlock/invest → you earn → you claim.
function accrueOwnerEarnings(idea, amount, note) {
  if (!idea || amount <= 0) return;
  idea.pendingEarnings = (idea.pendingEarnings || 0) + amount;
  idea.lifetimeEarnings = (idea.lifetimeEarnings || 0) + amount;
  if (note && wallet && idea.owner === wallet) {
    addToCodex(note);
  }
}

// Ideas I own that have unclaimed earnings.
function myPendingTotal() {
  if (!wallet) return 0;
  return ideas.filter(i => i.owner === wallet)
              .reduce((s, i) => s + (i.pendingEarnings || 0), 0);
}

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
  // Protection fields (teaser system)
  if (!idea.teaserProblem) idea.teaserProblem = (idea.desc || '').split(/[.!?]/)[0] + '...' || 'High-potential concept';
  if (!Array.isArray(idea.keywords)) idea.keywords = (idea.title || '').toLowerCase().split(' ').slice(0,4);
  if (!idea.secretSauce) idea.secretSauce = idea.desc || idea.fullDesc || '';
  if (!idea.unlocks) idea.unlocks = []; // wallets who paid to unlock full
  if (typeof idea.pendingEarnings !== 'number') idea.pendingEarnings = 0;
  if (typeof idea.lifetimeEarnings !== 'number') idea.lifetimeEarnings = 0;
  return idea;
}
ideas = ideas.map(normalizeIdea);

function updateWallet() {
  const el = document.getElementById('wallet-info');
  if (!el) return;
  const pending = wallet ? myPendingTotal() : 0;
  const earn = pending > 0 ? ` <span class="wallet-earn">+${pending} cr to claim</span>` : '';
  el.innerHTML = `${wallet || 'Guest'} • ${balance} Tokens / ${credits} Credits${earn}`;
}

function connectWallet() {
  wallet = 'user-' + Math.random().toString(16).slice(2, 10);
  simulateBackerInterest();
  updateWallet();
  showFeed();
}

function recordVoicePitch() {
  const preview = document.getElementById('voice-preview');
  preview.innerHTML = 'Recording voice pitch...';

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const rec = new MediaRecorder(stream);
    let chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, {type:'audio/webm'});
      const url = URL.createObjectURL(blob);

      // Pitch energy score, derived from clip length (fictional demo signal).
      const surprise = Math.min(0.9, 0.3 + Math.min(chunks.length, 6) * 0.1);

      preview.innerHTML = `<audio controls src="${url}"></audio><br>Pitch energy: ${surprise.toFixed(2)} — boosts visibility!`;
      window._p12Voice = { url, surprise };
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start();
    setTimeout(() => rec.stop(), 4000);
  }).catch(() => {
    preview.innerHTML = 'Microphone unavailable — using default pitch energy 0.65.';
    window._p12Voice = { surprise: 0.65 };
  });
}

function submitIdea() {
  const title = document.getElementById('idea-title').value.trim() || 'Untitled Idea';
  const teaserInput = (document.getElementById('idea-teaser') || {}).value || '';
  const fullVision = document.getElementById('idea-desc').value.trim() || 'Detailed vision withheld for protection.';
  const goal = Math.max(50, parseInt(document.getElementById('goal').value) || 500);
  const surprise = window._p12Voice ? window._p12Voice.surprise : 0.3;

  if (!wallet) {
    alert('Sign in to submit an idea.');
    return;
  }

  // Auto-generate strong teaser if empty (protects submitter)
  const teaserProblem = teaserInput.trim() || (fullVision.split(/[.!?]/)[0] || 'Powerful concept in growing market').trim() + ' (details protected)';

  // Keywords for discovery without full leak (investors filter by these)
  const keywords = teaserInput ? teaserInput.toLowerCase().split(/[\s,]+/).filter(w=>w.length>2).slice(0,5) : 
                   title.toLowerCase().split(' ').filter(w=>w.length>2).slice(0,5);

  const idea = {
    id: Date.now(),
    title,
    teaserProblem,
    keywords,
    secretSauce: fullVision,   // full pitch, shown only to owner or unlocked backers
    desc: fullVision,          // legacy compat
    goal,
    raised: 0,
    votes: 0,
    funded: false,
    surprise,
    voiceUrl: window._p12Voice ? window._p12Voice.url : null,
    owner: wallet,
    timestamp: new Date().toISOString(),
    investors: [],
    unlocks: []
  };

  ideas.unshift(idea);
  saveIdeas();

  addToCodex(`Submitted “${title}”. Teaser is public, full pitch protected. Pitch energy ${surprise.toFixed(2)}.`);

  // Simple proof hash for submitter protection (timestamped record)
  const proofHash = 'idea-' + idea.id + '-' + btoa(unescape(encodeURIComponent(title + teaserProblem))).slice(0,12);
  addToCodex(`Submission receipt: ${proofHash} (timestamped for prior art)`);

  document.getElementById('idea-title').value = '';
  if (document.getElementById('idea-teaser')) document.getElementById('idea-teaser').value = '';
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

// ── PROTECTION CORE: who can see the real idea? ──
function canSeeFull(idea) {
  if (!idea) return false;
  if (wallet && idea.owner === wallet) return true;
  if (me.unlockedIds && me.unlockedIds.includes(idea.id)) return true;
  // Investors who already put real stake can see (win-win commitment)
  if (me.stakes && me.stakes[idea.id] > 0) return true;
  return false;
}

// Unlock full vision: pay a small Credit cost → submitter gets most of it, you get the real pitch.
function unlockIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || !wallet) { alert('Sign in first.'); return; }
  if (canSeeFull(idea)) { showFeed(); return; }

  const cost = Math.max(5, Math.floor(8 + (idea.surprise || 0.3) * 5)); // varies with pitch energy
  if (credits < cost) {
    alert(`Need ${cost} Credits to unlock the full pitch. You have ${credits}.`);
    return;
  }

  credits -= cost;
  updateWallet();

  // Record unlock
  if (!me.unlockedIds) me.unlockedIds = [];
  me.unlockedIds.push(idea.id);

  // Win-win: 70% of the fee accrues to the submitter as claimable earnings.
  const toOwner = Math.floor(cost * 0.7);
  accrueOwnerEarnings(idea, toOwner, `💰 Someone unlocked your “${idea.title}” — +${toOwner} cr pending in My Ideas.`);
  if (!idea.unlocks) idea.unlocks = [];
  if (!idea.unlocks.includes(wallet)) idea.unlocks.push(wallet);

  saveIdeas(); saveMe();

  const unlockedCount = idea.unlocks.length;
  addToCodex(`Unlocked the full pitch of “${idea.title}” for ${cost} cr. ${unlockedCount} backers have seen it.`);

  alert(`Full pitch unlocked! ${cost} Credits spent. ${toOwner} accrue to the submitter.\n\nYou can now read the full plan and invest, or walk away.`);

  showFeed();
}

function joinLive() {
  alert('Live pitches are coming soon in this demo.');
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
    const unlockedCount = (idea.unlocks || []).length;
    const el = document.createElement('div');
    el.className = 'idea-card' + (idea.funded ? ' funded' : '');

    const seesFull = canSeeFull(idea);
    const CAP = 12;
    const slotsLeft = Math.max(0, CAP - (idea.investors || []).length);

    // Protection: viewers see only teaser + keywords. Owner and unlocked backers see full.
    let teaserHTML = '';
    if (seesFull) {
      teaserHTML = `<span class="desc full">${escapeHtml(idea.secretSauce || idea.desc || '')}</span>`;
    } else {
      const kw = (idea.keywords || []).map(k => `<span class="kw">#${escapeHtml(k)}</span>`).join(' ');
      teaserHTML = `
        <div class="keywords">${kw}</div>
        <span class="desc teaser">${escapeHtml(idea.teaserProblem || 'Protected concept — keywords only')}</span>
        <div class="redact-note">🔒 Full pitch hidden. Unlock to see the plan.</div>
      `;
    }

    el.innerHTML = `
      ${rank < 3 ? `<span class="rankbadge">#${rank + 1} Hot</span>` : ''}
      <strong>${escapeHtml(idea.title)}</strong>
      ${teaserHTML}
      <div class="surprise">👁 Pitch energy ${idea.surprise.toFixed(2)}${idea.voiceUrl ? ' · 🎙 voice' : ''} ${seesFull ? '· <b>FULL PITCH</b>' : ''}</div>
      <div class="bar"><span style="width:${raisedPct}%"></span></div>
      <div class="meta">${idea.raised} / ${idea.goal} raised · ${raisedPct}%${idea.funded ? ' · ✅ FUNDED' : ''} · ${unlockedCount} unlocked full</div>
      <div class="stats">
        <button class="votebtn${iVoted ? ' voted' : ''}" onclick="voteIdea(${idea.id})">▲ ${idea.votes}${iVoted ? ' ✓' : ''}</button>
        <span class="mystake">${myStake > 0 ? `Your stake: ${myStake} cr (${ownershipPct(idea)}%)` : ''}</span>
      </div>
      ${seesFull 
        ? (idea.funded 
            ? `<button disabled>✅ Funded by ${idea.investors.length} backers</button>` 
            : `<button onclick="openInvest(${idea.id})">Invest ${slotsLeft > 0 ? `<span class="fomo">${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left</span>` : '<span class="fomo">last call</span>'}</button>`)
        : `<button class="unlock-btn" onclick="unlockIdea(${idea.id})">🔓 Unlock Full Pitch — ${unlockedCount} already did</button>`
      }
    `;
    list.appendChild(el);
  });
}

function renderFeedHeader() {
  const h = document.getElementById('feed-sub');
  if (!h) return;
  const totalVotes = ideas.reduce((s, i) => s + i.votes, 0);
  const fundedCount = ideas.filter(i => i.funded).length;
  h.innerHTML = `🔥 ${totalVotes} votes cast · ${fundedCount} funded · you have <b>${votesLeft()}</b> votes left today<br><small>Teasers are public. Full pitches are protected — unlock with Credits (owners see their own).</small>`;
}

function ownershipPct(idea) {
  const myStake = me.stakes[idea.id] || 0;
  if (idea.raised <= 0) return '0';
  return ((myStake / idea.raised) * 100).toFixed(1);
}

// ── VOTING (real): finite daily budget, one vote per idea, persisted ──
function voteIdea(id) {
  if (!wallet) { alert('Sign in to vote.'); return; }
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
  if (!idea || !wallet) { alert('Sign in first.'); return; }
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

  // Submitter royalty: 5% of each investment accrues to the idea owner as claimable earnings.
  const royalty = Math.floor(amt * 0.05);
  if (royalty > 0) accrueOwnerEarnings(idea, royalty, `💰 “${idea.title}” took an investment — +${royalty} cr royalty pending.`);

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

// ── MY IDEAS: the submitter payoff surface — see your ideas earn, then claim. ──
function showMine() {
  hideAll();
  setActiveNav("showMine");
  document.getElementById('mine').classList.remove('hidden');

  const sub = document.getElementById('mine-sub');
  const list = document.getElementById('mine-list');
  list.innerHTML = '';

  if (!wallet) {
    sub.innerHTML = '';
    list.innerHTML = '<p>Sign in to see the ideas you submitted and what they’ve earned.</p>';
    return;
  }

  const mine = ideas.filter(i => i.owner === wallet);
  const pending = myPendingTotal();
  const lifetime = mine.reduce((s, i) => s + (i.lifetimeEarnings || 0), 0);

  sub.innerHTML = `You own <b>${mine.length}</b> idea${mine.length === 1 ? '' : 's'} · ` +
                  `<b>${pending}</b> cr ready to claim · ${lifetime} cr earned all-time` +
                  `<br><small>Earnings come from unlocks, investment royalties, and simulated demo backers.</small>`;

  if (mine.length === 0) {
    list.innerHTML = '<p>You haven’t submitted an idea yet. Post one — every unlock and investment earns you Credits.</p>';
    return;
  }

  if (pending > 0) {
    const claim = document.createElement('button');
    claim.className = 'primary';
    claim.textContent = `💰 Claim ${pending} Credits`;
    claim.onclick = claimEarnings;
    list.appendChild(claim);
  }

  mine.slice().sort((a, b) => (b.pendingEarnings || 0) - (a.pendingEarnings || 0)).forEach(idea => {
    const raisedPct = idea.goal > 0 ? Math.min(100, Math.floor((idea.raised / idea.goal) * 100)) : 0;
    const el = document.createElement('div');
    el.className = 'idea-card' + (idea.funded ? ' funded' : '');
    el.innerHTML = `
      <strong>${escapeHtml(idea.title)}</strong>
      <div class="bar"><span style="width:${raisedPct}%"></span></div>
      <div class="meta">${idea.raised} / ${idea.goal} raised · ${raisedPct}%${idea.funded ? ' · ✅ FUNDED' : ''} · ${(idea.unlocks || []).length} unlocked · ${idea.votes} votes</div>
      <div class="earn-row">
        <span class="earn-pending">${idea.pendingEarnings || 0} cr pending</span>
        <span class="earn-life">${idea.lifetimeEarnings || 0} cr earned</span>
      </div>
    `;
    list.appendChild(el);
  });
}

// Demo ambient backers: simulated interest in YOUR ideas so the earn loop is visible
// in single-player. Clearly a demo signal (disclosed in the sub text). Runs once per app open.
function simulateBackerInterest() {
  if (!wallet) return;
  const mine = ideas.filter(i => i.owner === wallet && !i.funded);
  if (mine.length === 0) return;
  let earned = 0;
  mine.forEach(idea => {
    // Higher-voted / higher-energy ideas draw more simulated interest.
    const pull = idea.votes * 0.4 + (idea.surprise || 0.3);
    if (Math.random() < Math.min(0.8, 0.25 + pull * 0.15)) {
      const gain = 2 + Math.floor(Math.random() * 6 + pull * 3);
      accrueOwnerEarnings(idea, gain);
      earned += gain;
    }
  });
  if (earned > 0) {
    saveIdeas();
    addToCodex(`📈 Demo backers noticed your ideas — +${earned} cr accrued while you were away. Claim in My Ideas.`);
  }
}

function claimEarnings() {
  if (!wallet) { alert('Sign in first.'); return; }
  const pending = myPendingTotal();
  if (pending <= 0) { showMine(); return; }

  credits += pending;
  ideas.forEach(i => { if (i.owner === wallet) i.pendingEarnings = 0; });
  saveIdeas();
  updateWallet();
  addToCodex(`Claimed ${pending} cr in earnings from your ideas.`);
  alert(`Claimed ${pending} Credits from your ideas. They’re now in your balance.`);
  showMine();
}

function showCodex() {
  hideAll();
  setActiveNav("showCodex");
  document.getElementById('codex').classList.remove('hidden');
  const list = document.getElementById('codex-list');
  list.innerHTML = '<h3>Your activity log</h3>';

  if (codex.length === 0) {
    list.innerHTML += '<p>Submit, vote, or invest to start your activity log.</p>';
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

  // Seed demo ideas (normalize will fill teaser/keywords)
  if (ideas.length === 0) {
    ideas = [
      { id: 1, title: "Voice-powered errand matching", desc: "Full mechanism: real-time voice matching plus surge pricing that learns user habits. The unfair advantage is the on-device matching model.", goal: 500, raised: 320, votes: 7, funded: false, surprise: 0.72, voiceUrl: null, owner: 'seed-01', timestamp: new Date().toISOString(), investors: ['backer-a', 'backer-b', 'backer-c'] },
      { id: 2, title: "Virtual land voice tours", desc: "Detailed plan: spatial audio guides generated on the fly plus monetized creator content.", goal: 800, raised: 450, votes: 4, funded: false, surprise: 0.65, voiceUrl: null, owner: 'seed-02', timestamp: new Date().toISOString(), investors: ['backer-d', 'backer-e'] }
    ];
    saveIdeas();
  }

  rollVoteDay();
  simulateBackerInterest();
  updateWallet();
  showFeed();
}

window.onload = initP12;
