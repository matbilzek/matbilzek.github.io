// app.js — Leaderboard frontend + optional Firebase integration
(() => {
  // Elements
  const tabButtons = Array.from(document.querySelectorAll('.tab'));
  const navTriggers = Array.from(document.querySelectorAll('[data-target]')); // now covers .tab, .go, back buttons
  const panels = Array.from(document.querySelectorAll('.panel'));
  const startButtons = Array.from(document.querySelectorAll('[id^="start-"]')); // start-... buttons

  // showPanel: set visibility, aria attributes and tab active state
  function showPanel(id, opts = {}) {
    // Panels
    panels.forEach(p => {
      const isTarget = p.id === id;
      p.classList.toggle('hidden', !isTarget);
      p.setAttribute('aria-hidden', (!isTarget).toString());
    });

    // Tabs: update active class + aria-selected + tabindex
    tabButtons.forEach(t => {
      const isSelected = t.dataset && t.dataset.target === id;
      t.classList.toggle('active', isSelected);
      t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        t.removeAttribute('tabindex');
        if (opts.focus) t.focus();
      } else {
        t.setAttribute('tabindex', '-1');
      }
    });

    // Scroll to top for better UX
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, 0);
    }

    // update hash without adding history entries (so back button not spammed)
    try {
      if (history && history.replaceState) history.replaceState(null, '', `#${id}`);
      else location.hash = `#${id}`;
    } catch (e) {
      // ignore
    }
  }

  // Attach nav listeners (for elements that have data-target)
  navTriggers.forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const target = btn.dataset && btn.dataset.target;
      if (!target) return;
      // If clicking a tab, focus it; if clicking a .go, focus corresponding tab if exists
      const tabToFocus = tabButtons.find(t => t.dataset && t.dataset.target === target);
      showPanel(target, { focus: !!tabToFocus });
      if (tabToFocus) tabToFocus.focus();
    });
  });

  // Attach start-button listeners (id starts with start-)
  startButtons.forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = btn.id; // e.g. "start-prime"
      const gameKey = id.replace(/^start-/, ''); // "prime"
      let called = false;

      // helper to camel-case the key for trying startGame names like startPrime
      function toPascal(s) {
        return s.split(/[^a-zA-Z0-9]/).map(part => part ? part[0].toUpperCase() + part.slice(1) : '').join('');
      }
      const pascal = toPascal(gameKey); // "Prime", "Frac6" etc.

      const candidates = [
        window[id], // window['start-prime'] (works via bracket)
        window['start_' + gameKey], // start_prime
        window['start' + pascal], // startPrime
        window['start' + pascal.toLowerCase()] // startprime (less likely, but harmless)
      ];

      for (const fn of candidates) {
        if (typeof fn === 'function') {
          try {
            // call; allow async functions
            const maybePromise = fn.call(window, ev);
            if (maybePromise && typeof maybePromise.then === 'function') {
              await maybePromise;
            }
            called = true;
            break;
          } catch (e) {
            console.error('start handler threw', e);
            // continue to next candidate
          }
        }
      }

      if (!called) {
        // Fallback: if there's a panel with same id as gameKey, show it
        const panelExists = panels.some(p => p.id === gameKey);
        if (panelExists) {
          showPanel(gameKey, { focus: true });
        } else {
          // Final fallback: inform user so they can wire a start function
          alert('Oyun başlatılamadı — oyun kodu bulunamadı. Geliştirici: start fonksiyonu ekleyin (ör. window.startPrime veya window["start-prime"]) veya panel id="' + gameKey + '" oluşturun.');
        }
      }
    });
  });

  // local storage key
  const LS_KEY = 'mathgames_scores_v1';

  // Save local score (optionally with name). Keep last 50 entries per game.
  function saveLocalScore(game, score, name = 'Anon') {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      if (!data[game]) data[game] = [];
      data[game].push({ score, name, date: new Date().toISOString() });
      // keep most recent 50
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
      return arr.slice().sort((a, b) => b.score - a.score).slice(0, n);
    } catch (e) {
      console.warn('LS read fail', e);
      return [];
    }
  }

  // ----- Firebase optional init -----
  let firestore = null;
  async function initFirebaseIfConfigured() {
    if (!window.FIREBASE_CONFIG) return false;
    if (!window.firebase) {
      try {
        await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
      } catch (e) {
        console.warn('Failed loading firebase scripts', e);
        return false;
      }
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
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = (err) => reject(err);
      document.head.appendChild(s);
    });
  }

  // ----- Global leaderboard functions -----
  async function fetchGlobalTop(game, limit = 10) {
    if (firestore) {
      try {
        const q = await firestore.collection('scores')
                 .where('game', '==', game)
                 .orderBy('score', 'desc')
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
    if (firestore) {
      try {
        await firestore.collection('scores').add({ game, name, score, date: new Date().toISOString() });
        return { ok: true, source: 'firebase' };
      } catch (e) {
        console.warn('Firestore write failed', e);
        saveLocalScore(game, score, name);
        return { ok: false, source: 'local' };
      }
    } else {
      saveLocalScore(game, score, name);
      return { ok: true, source: 'local' };
    }
  }

  // Expose rendering function to index.html inline call
  window.renderLeaderboardForGame = async function(game, forceRefresh = false) {
    const listEl = document.getElementById('lb-list');
    const titleEl = document.getElementById('lb-title');
    const sourceNote = document.getElementById('lb-source-note');

    if (!listEl || !titleEl || !sourceNote) {
      console.warn('Leaderboard elements not found in DOM; skipping render.');
      return;
    }

    titleEl.textContent = `${String(game).toUpperCase()} — Top 10`;
    listEl.innerHTML = '<div class="muted">Yükleniyor...</div>';

    if (window.FIREBASE_CONFIG && !firestore) {
      await initFirebaseIfConfigured();
    }

    const res = await fetchGlobalTop(game, 10);
    listEl.innerHTML = '';
    if (!res.items || res.items.length === 0) {
      listEl.innerHTML = '<div class="muted">Henüz skor yok.</div>';
    } else {
      res.items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'lb-item';
        row.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="lb-rank">${idx+1}</div><div class="lb-name">${escapeHtml(it.name || 'Anon')}</div></div><div class="lb-score">${escapeHtml(String(it.score))}</div>`;
        listEl.appendChild(row);
      });
    }
    sourceNote.textContent = res.source === 'firebase' ? 'Kaynak: Global (Firebase)' : 'Kaynak: Local (Tarayıcı)';
  };

  // submitScoreUI: prompt for name and send last local best score if available.
  window.submitScoreUI = async function(game) {
    const localTop = getLocalTop(game, 1);
    const candidateScore = localTop && localTop.length ? localTop[0].score : null;
    let scoreToSend = candidateScore;
    if (scoreToSend === null) {
      const s = prompt('Göndermek istediğin skoru gir (sayı):');
      if (!s) return;
      const n = parseInt(s.trim(), 10);
      if (isNaN(n)) { alert('Geçersiz skor'); return; }
      scoreToSend = n;
    } else {
      const ok = confirm(`En iyi yerel skorunuz ${scoreToSend}. Bunu global gönderiyorsunuz. Devam edilsin mi?`);
      if (!ok) return;
    }
    const name = prompt('Takma ad gir (en fazla 18 karakter):', 'Anon');
    if (name === null) return;
    const nickname = name.trim().slice(0, 18) || 'Anon';
    if (window.FIREBASE_CONFIG && !firestore) await initFirebaseIfConfigured();
    const res = await submitScoreToBackend(game, nickname, scoreToSend);
    if (res.ok) {
      alert(`Skor gönderildi (${res.source}). Teşekkürler!`);
    } else {
      alert('Skor local olarak kaydedildi (offline veya hata).');
    }
    if (window.renderLeaderboardForGame) window.renderLeaderboardForGame(game, true);
  };

  // helper escape
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Expose save/get functions for game code
  window._saveLocalScore = saveLocalScore;
  window._getLocalTop = getLocalTop;

  if (window.FIREBASE_CONFIG) {
    initFirebaseIfConfigured().then(ok => { if (ok) console.log('Firebase ready'); else console.log('Firebase failed to init'); });
  }

  // Start panel based on hash (if present) or fall back to home
  const initial = (location.hash && location.hash.slice(1)) || 'home';
  const validIds = panels.map(p => p.id);
  showPanel(validIds.includes(initial) ? initial : 'home');

})();
