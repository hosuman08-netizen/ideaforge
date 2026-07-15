// p12 IdeaForge - Submit ideas, get investments. p6 Voice + Legion cross.
let wallet = null;
let balance = 1250;
let credits = 320;
let ideas = JSON.parse(localStorage.getItem('p12_ideas') || '[]');
let codex = JSON.parse(localStorage.getItem('p12_codex') || '[]');

function updateWallet() {
  const el = document.getElementById('wallet-info');
  if (el) el.innerHTML = `${wallet || '0xDemo'} • ${balance} $EROS / ${credits} Credits`;
}

function connectWallet() {
  wallet = '0x' + Math.random().toString(16).slice(2, 10);
  updateWallet();
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
  const title = document.getElementById('idea-title').value || 'Untitled Idea';
  const desc = document.getElementById('idea-desc').value || 'No description.';
  const goal = parseInt(document.getElementById('goal').value) || 500;
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
    surprise,
    voiceUrl: window._p12Voice ? window._p12Voice.url : null,
    timestamp: new Date().toISOString(),
    investors: []
  };
  
  ideas.unshift(idea);
  localStorage.setItem('p12_ideas', JSON.stringify(ideas));
  
  addToCodex(`Submitted: ${title}. Voice surprise ${surprise.toFixed(2)}. FOMO active.`);
  
  alert(`Idea submitted! FOMO: ${Math.floor(Math.random()*20)+5} investors viewing.`);
  document.getElementById('idea-title').value = '';
  document.getElementById('idea-desc').value = '';
  showFeed();
}

function showFeed() {
  hideAll();
  setActiveNav("showFeed");
  document.getElementById('feed').classList.remove('hidden');
  const list = document.getElementById('idea-list');
  list.innerHTML = '';
  
  if (ideas.length === 0) {
    list.innerHTML = '<p>No ideas yet. Submit one with voice!</p>';
    return;
  }
  
  ideas.forEach(idea => {
    const raisedPct = Math.min(100, Math.floor((idea.raised / idea.goal) * 100));
    const el = document.createElement('div');
    el.className = 'idea-card';
    const short = idea.desc.length > 60 ? idea.desc.substring(0,60) + '…' : idea.desc;
    el.innerHTML = `
      <strong>${idea.title}</strong>
      <span class="desc">${short}</span>
      <div class="surprise">👁 Surprise ${idea.surprise.toFixed(2)}${idea.voiceUrl ? ' · 🎙 voice' : ''}</div>
      <div class="bar"><span style="width:${raisedPct}%"></span></div>
      <div class="meta">${idea.raised} / ${idea.goal} raised · ${raisedPct}%</div>
      <button onclick="investInIdea(${idea.id})">Invest <span class="fomo">${Math.floor(Math.random()*10)+3} slots left</span></button>
    `;
    list.appendChild(el);
  });
}

function investInIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea || !wallet) {
    alert('Connect wallet.');
    return;
  }
  
  const investAmt = 25 + Math.floor(Math.random()*25); // variable
  if (credits < investAmt) {
    alert('Need more p10 Credits.');
    return;
  }
  
  credits -= investAmt;
  idea.raised += investAmt;
  idea.investors.push(wallet);
  localStorage.setItem('p12_ideas', JSON.stringify(ideas));
  
  const note = `Invested ${investAmt} in ${idea.title}. Near-miss FOMO!`;
  addToCodex(note);
  
  alert(`Invested! ${idea.title} now at ${idea.raised}/${idea.goal}. Voice replay in Codex.`);
  updateWallet();
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
    list.innerHTML += '<p>Submit or invest to start codex.</p>';
    return;
  }
  
  codex.slice(0,8).forEach(c => {
    const div = document.createElement('div');
    div.className = 'notebook-entry';
    div.innerHTML = `<small>${new Date(c.time).toLocaleString()}</small><br>${c.note}`;
    list.appendChild(div);
  });
}

function addToCodex(note) {
  codex.unshift({ time: Date.now(), note });
  if (codex.length > 20) codex.pop();
  localStorage.setItem('p12_codex', JSON.stringify(codex));
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
      { id: 1, title: "Voice-powered errand matching", desc: "p7 + p6 hybrid.", goal: 500, raised: 320, surprise: 0.72, voiceUrl: null, timestamp: new Date().toISOString(), investors: [] },
      { id: 2, title: "Metaverse land voice tours", desc: "p11 + p6 + p9 live.", goal: 800, raised: 450, surprise: 0.65, voiceUrl: null, timestamp: new Date().toISOString(), investors: [] }
    ];
    localStorage.setItem('p12_ideas', JSON.stringify(ideas));
  }
  
  // p6 cross
  if (window.getP6LungSurprise) {
    console.log('[p12] p6 Lung Surprise Eye ready for pitches.');
  }
  
  // Show feed (actually render the idea cards, not just unhide an empty grid)
  showFeed();
}

window.onload = initP12;
