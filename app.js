// app.js — Leaderboard frontend + optional Firebase integration
(() => {
  // Basic nav from existing app
  const tabs = Array.from(document.querySelectorAll('.tab, .go'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  function showPanel(id) {
    panels.forEach(p => p.id === id ? p.classList.remove('hidden') : p.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.target === id));
    window.scrollTo({top:0, behavior:'smooth'});
  }
  tabs.forEach(t => t.addEventListener('click', () => { 
    const target = t.dataset.target; 
    if (target) showPanel(target); 
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
      return arr.slice().sort((a,b) => b.score - a.score).slice(0, n);
    } catch (e) {
      console.warn('LS parse fail', e);
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
        console.warn('Firebase script load failed', e);
        return false;
      }
    }

    try {
      if (!firebase.apps?.length) {
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
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Script load error: ${src}`));
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
      }
    }
    // Fallback to local
    return { source: 'local', items: getLocalTop(game, limit) };
  }

  async function submitScoreToBackend(game, name, score) {
    if (firestore) {
      try {
        await firestore.collection('scores').add({
          game,
          name,
          score,
          date: new Date().toISOString()
        });
        return { ok: true, source: 'firebase' };
      } catch (e) {
        console.warn('Firestore write failed', e);
      }
    }
    // Fallback: save locally
    saveLocalScore(game, score, name);
    return { ok: true, source: 'local' };
  }

  // Expose rendering function
  window.renderLeaderboardForGame = async function(game, forceRefresh = false) {
    const listEl = document.getElementById('lb-list');
    const titleEl = document.getElementById('lb-title');
    const sourceNote = document.getElementById('lb-source-note');

    titleEl.textContent = `${game.toUpperCase()} — Top 10`;
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
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px">
            <div class="lb-rank">${idx + 1}</div>
            <div class="lb-name">${escapeHtml(it.name || 'Anon')}</div>
          </div>
          <div class="lb-score">${escapeHtml(String(it.score))}</div>
        `;
        listEl.appendChild(row);
      });
    }

    sourceNote.textContent = res.source === 'firebase' 
      ? 'Kaynak: Global (Firebase)' 
      : 'Kaynak: Local (Tarayıcı)';
  };

  // Submit score UI — SADECE yerel skor varsa gönderilebilir
  window.submitScoreUI = async function(game) {
    const localTop = getLocalTop(game, 1);
    if (!localTop || localTop.length === 0) {
      alert('Gönderecek yerel skor bulunamadı. Önce oyunu oynayıp skoru yerel olarak kaydetmelisiniz.');
      return;
    }

    const bestScore = localTop[0].score;
    const confirmMsg = `En iyi yerel skorunuz: ${bestScore}\nBu skoru global leaderboard'a göndermek istiyor musunuz?`;
    if (!confirm(confirmMsg)) return;

    let name = prompt('Takma ad gir (en fazla 18 karakter):', 'Anon');
    if (name === null) return;
    const nickname = (name.trim().slice(0, 18) || 'Anon');

    if (window.FIREBASE_CONFIG && !firestore) {
      await initFirebaseIfConfigured();
    }

    const res = await submitScoreToBackend(game, nickname, bestScore);

    if (res.source === 'firebase') {
      alert('Skor global leaderboard\'a gönderildi! Teşekkürler!');
    } else {
      alert('Skor yerel olarak kaydedildi (çevrimdışı veya hata).');
    }

    // Refresh leaderboard
    await window.renderLeaderboardForGame(game, true);
  };

  // Güvenli HTML escape
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose for game code
  window._saveLocalScore = saveLocalScore;
  window._getLocalTop = getLocalTop;

  // Auto-init Firebase if config exists
  if (window.FIREBASE_CONFIG) {
    initFirebaseIfConfigured().then(ok => {
      console.log(ok ? 'Firebase ready' : 'Firebase init failed');
    });
  }

  // Start at home
  showPanel('home');
})();
