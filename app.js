// app.js — Leaderboard frontend + optional Firebase integration
(() => {
  // Basic nav from existing app
  const navButtons = Array.from(document.querySelectorAll('.tab, .go'));
  function showPanel(id) {
    const panels = Array.from(document.querySelectorAll('.panel'));
    panels.forEach(p => p.id === id ? p.classList.remove('hidden') : p.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.target === id));
    window.scrollTo({top:0, behavior:'smooth'});
  }
  navButtons.forEach(t => t.addEventListener('click', () => {
    const target = t.dataset.target;
    if (!target) return;
    // if there's a panel with this id, show it
    const panelEl = document.getElementById(target);
    if (panelEl && panelEl.classList.contains('panel')) {
      showPanel(target);
      return;
    }
    // if no panel, try to find a start button with id start-<target> and trigger it
    const startBtn = document.getElementById('start-' + target);
    if (startBtn) {
      startBtn.click();
      return;
    }
    // try conventional global start functions: start_<target> or window.startGame?.[target]
    const fn1 = window['start_' + target];
    const fn2 = window.startGame && window.startGame[target];
    if (typeof fn1 === 'function') { fn1(); return; }
    if (typeof fn2 === 'function') { fn2(); return; }
    // fallback: if this button is inside a panel, show that panel (so user stays within a section)
    const parentPanel = t.closest('.panel');
    if (parentPanel && parentPanel.id) {
      showPanel(parentPanel.id);
      return;
    }
    // last resort: warn user and log
    console.warn('Hedef panel veya başlatıcı bulunamadı:', target);
    alert('Bu oyun henüz yüklenmedi veya bulunamadı. Lütfen ana sayfaya dönün.');
  }));

  // local storage key
  const LS_KEY = 'mathgames_scores_v1';

  // Save local score (optionally with name). Keep last 50 entries per game.
  function saveLocalScore(game, score, name = 'Anon') {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      if (!data[game]) data[game] = [];
      data[game].push({ score, name, date: new Date().toISOString() });
      data[game] = data[game].slice(-50);
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('LS save fail', e);
      return false;
    }
  }

  // Get local top N for a game
  function getLocalTop(game, n = 10) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      const arr = data[game] || [];
      return arr.slice().sort((a,b)=>b.score-a.score).slice(0,n);
    } catch (e) {
      return [];
    }
  }

  // ----- Firebase optional init -----
  let firestore = null;
  async function initFirebaseIfConfigured() {
    // The developer/user can add a firebase-config.js file that sets window.FIREBASE_CONFIG
    if (!window.FIREBASE_CONFIG) return false;
    // dynamic load Firebase scripts if not loaded
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
    }
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      firestore = firebase.firestore();
      return true;
    } catch (e) {
      console.warn('Firebase init failed', e);
      return false;
    }
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ----- Global leaderboard functions -----
  async function fetchGlobalTop(game, limit = 10) {
    // If firestore available, query; otherwise return local
    if (firestore) {
      try {
        const q = await firestore.collection('scores')
                 .where('game','==',game)
                 .orderBy('score','desc')
                 .limit(limit)
                 .get();
        const items = [];
        q.forEach(doc => items.push(doc.data()));
        return { source: 'firebase', items };
      } catch (e) {
        console.warn('Firestore read failed', e);
        return { source: 'local', items: getLocalTop(game, limit) };
      }
    } else {
      return { source: 'local', items: getLocalTop(game, limit) };
    }
  }

  async function submitScoreToBackend(game, name, score) {
    // prefer firestore if available
    if (firestore) {
      try {
        await firestore.collection('scores').add({ game, name, score, date: new Date().toISOString() });
        return { ok:true, source:'firebase' };
      } catch (e) {
        console.warn('Firestore write failed', e);
        saveLocalScore(game, score, name);
        return { ok:false, source:'local' };
      }
    } else {
      saveLocalScore(game, score, name);
      return { ok:true, source:'local' };
    }
  }

  // Expose rendering function to index.html inline call
  window.renderLeaderboardForGame = async function(game, forceRefresh = false) {
    const listEl = document.getElementById('lb-list');
    const titleEl = document.getElementById('lb-title');
    const sourceNote = document.getElementById('lb-source-note');
    if (titleEl) titleEl.textContent = `${game.toUpperCase()} — Top 10`;
    if (listEl) listEl.innerHTML = '<div class="muted">Yükleniyor...</div>';
    // init firebase if window.FIREBASE_CONFIG exists (only once)
    if (window.FIREBASE_CONFIG && !firestore) {
      await initFirebaseIfConfigured();
    }
    const res = await fetchGlobalTop(game, 10);
    if (listEl) {
      listEl.innerHTML = '';
      if (!res.items || res.items.length===0) {
        listEl.innerHTML = '<div class="muted">Henüz skor yok.</div>';
      } else {
        res.items.forEach((it, idx) => {
          const row = document.createElement('div');
          row.className = 'lb-item';
          row.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="lb-rank">${idx+1}</div><div class="lb-name">${escapeHtml(it.name||'Anon')}</div></div><div class="lb-score">${escapeHtml(String(it.score))}</div>`;
          listEl.appendChild(row);
        });
      }
    }
    if (sourceNote) sourceNote.textContent = res.source === 'firebase' ? 'Kaynak: Global (Firebase)' : 'Kaynak: Local (Tarayıcı)';
  };

  // submitScoreUI: prompt for name and send last local best score if available.
  window.submitScoreUI = async function(game) {
    // find best local score for this game
    const localTop = getLocalTop(game,1);
    const candidateScore = localTop && localTop.length ? localTop[0].score : null;
    let scoreToSend = candidateScore;
    if (scoreToSend === null) {
      // ask user to enter their score manually
      const s = prompt('Göndermek istediğin skoru gir (sayı):');
      if (!s) return;
      const n = parseInt(s.trim(),10);
      if (isNaN(n)) { alert('Geçersiz skor'); return; }
      scoreToSend = n;
    } else {
      const ok = confirm(`En iyi yerel skorunuz ${scoreToSend}. Bunu global gönderiyorsunuz. Devam edilsin mi?`);
      if (!ok) return;
    }
    const name = prompt('Takma ad gir (en fazla 18 karakter):', 'Anon');
    if (name === null) return;
    const nickname = name.trim().slice(0,18) || 'Anon';
    // init firebase if necessary
    if (window.FIREBASE_CONFIG && !firestore) await initFirebaseIfConfigured();
    const res = await submitScoreToBackend(game, nickname, scoreToSend);
    if (res.ok) {
      alert(`Skor gönderildi (${res.source}). Teşekkürler!`);
    } else {
      alert('Skor local olarak kaydedildi (offline veya hata).');
    }
    // refresh leaderboard
    if (window.renderLeaderboardForGame) window.renderLeaderboardForGame(game, true);
  };

  // helper escape
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));
  }

  // Initialize a small demo: attach saveLocalScore to some global events in your game logic.
  // Note: Existing game code should call saveLocalScore(game,score, name?) when ending a game.
  // We expose the function globally so older code can call it:
  window._saveLocalScore = saveLocalScore;
  window._getLocalTop = getLocalTop;

  // optional: auto-init firebase if config exists (non-blocking)
  if (window.FIREBASE_CONFIG) {
    initFirebaseIfConfigured().then(ok=> { if(ok) console.log('Firebase ready'); else console.log('Firebase failed to init'); });
  }

  // start at home
  showPanel('home');

})();
