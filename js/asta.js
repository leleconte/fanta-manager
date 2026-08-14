let auctionInterval = null;
let auctionListenersBound = false;

function getAuctionContext() {
  const user = requireAuth();
  if (!user) return null;
  const data = loadData();
  const league = currentLeague(user.id);
  if (!league) return { user, data, league: null, team: null, teams: [] };
  const team = currentTeam(user.id, league.id);
  const teams = data.teams.filter(t => t.leagueId === league.id);
  return { user, data, league, team, teams };
}

function getActiveAuction(leagueId) {
  if (!leagueId) return null;
  const data = loadData();
  return data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused')) || null;
}

function getNextTurnTeamId(data, leagueId, currentTeamId) {
  const teams = data.teams.filter(t => t.leagueId === leagueId);
  if (!teams.length) return null;
  if (teams.length === 1) return teams[0].id;
  const index = teams.findIndex(t => t.id === currentTeamId);
  return teams[(index + 1 + teams.length) % teams.length].id;
}

function ensurePlayerAvailability(data) {
  let changed = false;
  data.players = Array.isArray(data.players) ? data.players.map(player => {
    const next = { ...player };
    if (typeof next.available !== 'boolean') {
      next.available = true;
      changed = true;
    }
    return next;
  }) : [];
  if (changed) saveData(data);
  return data.players;
}

function startAuction(leagueId, playerId, starterTeamId) {
  if (!leagueId) throw new Error('Lega non disponibile.');
  if (!starterTeamId) throw new Error('Crea prima la tua squadra.');

  const data = loadData();
  ensurePlayerAvailability(data);
  const active = data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused'));
  if (active) throw new Error('C’è già un’asta in corso.');

  const league = data.leagues.find(x => x.id === leagueId);
  if (!league) throw new Error('Lega non trovata.');
  const player = data.players.find(x => String(x.id) === String(playerId));
  if (!player) throw new Error('Giocatore non trovato.');
  if (player.available === false) throw new Error('Questo giocatore è già stato acquistato.');

  const starterTeam = data.teams.find(t => t.id === starterTeamId && t.leagueId === leagueId);
  if (!starterTeam) throw new Error('Squadra non trovata nella lega.');

  const timer = Math.max(5, Number(league.timer) || 30);
  const now = Date.now();
  data.auctions.push({
    id: uid('auc'),
    leagueId,
    playerId: player.id,
    currentPrice: 0,
    bestTeamId: null,
    starterTeamId: starterTeam.id,
    turnTeamId: starterTeam.id,
    status: 'running',
    endsAt: now + timer * 1000,
    history: [],
    createdAt: now
  });
  saveData(data);
  return data.auctions[data.auctions.length - 1];
}

function placeBid(leagueId, teamId, increment) {
  const amount = Number(increment);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Rilancio non valido.');
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused'));
  if (!auction) throw new Error('Nessuna asta attiva.');
  if (auction.status !== 'running') throw new Error('L’asta è in pausa.');

  const team = data.teams.find(x => x.id === teamId && x.leagueId === leagueId);
  if (!team) throw new Error('Squadra non trovata.');
  const league = data.leagues.find(x => x.id === leagueId);
  const nextPrice = Number(auction.currentPrice || 0) + amount;
  const credits = Number(team.credits || 0);
  if (nextPrice > credits) throw new Error(`Crediti insufficienti: ${credits} CR disponibili.`);

  const now = Date.now();
  auction.currentPrice = nextPrice;
  auction.bestTeamId = team.id;
  auction.turnTeamId = team.id;
  auction.endsAt = now + Math.max(5, Number(league?.timer) || 30) * 1000;
  auction.history = Array.isArray(auction.history) ? auction.history : [];
  auction.history.push({ teamId: team.id, amount: nextPrice, increment: amount, at: now });
  saveData(data);
  return auction;
}

function passTurn(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused'));
  if (!auction) throw new Error('Nessuna asta attiva.');
  const next = getNextTurnTeamId(data, leagueId, auction.turnTeamId || auction.starterTeamId);
  if (!next) throw new Error('Nessuna squadra disponibile.');
  auction.turnTeamId = next;
  saveData(data);
}

function settleAuction(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused'));
  if (!auction) throw new Error('Nessuna asta attiva.');
  const player = data.players.find(x => x.id === auction.playerId);
  if (!player) throw new Error('Giocatore non trovato.');

  if (auction.bestTeamId && Number(auction.currentPrice) > 0) {
    const team = data.teams.find(x => x.id === auction.bestTeamId && x.leagueId === leagueId);
    if (!team) throw new Error('Squadra vincitrice non trovata.');
    if (Number(auction.currentPrice) > Number(team.credits || 0)) throw new Error('Crediti insufficienti per aggiudicare il giocatore.');
    team.credits = Number(team.credits || 0) - Number(auction.currentPrice);
    team.spent = Number(team.spent || 0) + Number(auction.currentPrice);
    team.players = Array.isArray(team.players) ? team.players : [];
    if (!team.players.includes(player.id)) team.players.push(player.id);
    player.available = false;
    player.price = Number(auction.currentPrice);
    data.bids = Array.isArray(data.bids) ? data.bids : [];
    data.rosters = Array.isArray(data.rosters) ? data.rosters : [];
    data.bids.push({ id: uid('bid'), auctionId: auction.id, leagueId, playerId: player.id, teamId: team.id, price: Number(auction.currentPrice), at: Date.now() });
    data.rosters.push({ teamId: team.id, playerId: player.id, price: Number(auction.currentPrice), at: Date.now() });
  }

  auction.status = 'finished';
  auction.finishedAt = Date.now();
  saveData(data);
}

function cancelAuction(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && (a.status === 'running' || a.status === 'paused'));
  if (!auction) throw new Error('Nessuna asta attiva.');
  auction.status = 'cancelled';
  auction.cancelledAt = Date.now();
  saveData(data);
}

function pauseAuction(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && a.status === 'running');
  if (!auction) throw new Error('Nessuna asta in corso.');
  auction.remainingMs = Math.max(0, Number(auction.endsAt || Date.now()) - Date.now());
  auction.status = 'paused';
  saveData(data);
}

function resumeAuction(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && a.status === 'paused');
  if (!auction) throw new Error('Nessuna asta in pausa.');
  const league = data.leagues.find(l => l.id === leagueId);
  const remaining = Number(auction.remainingMs || 0);
  auction.endsAt = Date.now() + (remaining > 0 ? remaining : Math.max(5, Number(league?.timer) || 30) * 1000);
  delete auction.remainingMs;
  auction.status = 'running';
  saveData(data);
}

function teamName(teams, teamId) {
  return teams.find(team => team.id === teamId)?.name || '—';
}

function showAuctionMessage(text, type = '') {
  const el = document.querySelector('[data-auction-message]');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auction-message${type ? ` ${type}` : ''}`;
}

function renderAuction() {
  const ctx = getAuctionContext();
  if (!ctx || !ctx.league) return null;
  const { data, league, team, teams } = ctx;
  const auction = getActiveAuction(league.id);
  const player = auction ? data.players.find(x => x.id === auction.playerId) : null;

  const stateEl = document.querySelector('[data-auction-state]');
  const playerNameEl = document.querySelector('[data-player-name]');
  const playerMetaEl = document.querySelector('[data-player-meta]');
  const priceEl = document.querySelector('[data-price]');
  const bidderEl = document.querySelector('[data-bidder]');
  const timerEl = document.querySelector('[data-timer]');
  const turnEl = document.querySelector('[data-turn]');
  const noteEl = document.querySelector('[data-single-note]');
  const teamsEl = document.querySelector('[data-teams]');
  const historyEl = document.querySelector('[data-history]');

  if (stateEl) stateEl.textContent = auction ? (auction.status === 'paused' ? 'ASTA IN PAUSA' : 'ASTA IN CORSO') : 'PRONTO PER L’ASTA';
  if (playerNameEl) playerNameEl.textContent = player?.name || 'Seleziona un giocatore';
  if (playerMetaEl) playerMetaEl.textContent = player ? `${player.team} · ${player.role}` : `${league.name} · ${teams.length} ${teams.length === 1 ? 'squadra' : 'squadre'}`;
  if (priceEl) priceEl.textContent = String(auction?.currentPrice ?? 0);
  if (bidderEl) bidderEl.textContent = auction?.bestTeamId ? teamName(teams, auction.bestTeamId) : 'Nessuna offerta';
  if (turnEl) turnEl.textContent = auction?.turnTeamId ? teamName(teams, auction.turnTeamId) : (team?.name || '—');
  if (timerEl) timerEl.textContent = auction ? Math.max(0, Math.ceil((Number(auction.endsAt) - Date.now()) / 1000)).toString().padStart(2, '0') : '—';
  if (noteEl) noteEl.textContent = teams.length === 1 ? 'Sei da solo nella lega: puoi gestire e testare l’asta senza altri partecipanti.' : `${teams.length} squadre collegate alla lega.`;

  if (teamsEl) {
    teamsEl.innerHTML = teams.map(t => `<div class="team-line ${auction?.bestTeamId === t.id ? 'is-leading' : ''}">
      <div class="team-mark">${escapeHtml(t.abbr || String(t.name || '').slice(0, 3).toUpperCase())}</div>
      <div><strong>${escapeHtml(t.name)}</strong><span>${Number(t.credits || 0)} CR disponibili</span></div>
      <em>${auction?.bestTeamId === t.id ? 'IN TESTA' : auction?.turnTeamId === t.id ? 'TURNO' : ''}</em>
    </div>`).join('') || '<div class="empty">Nessuna squadra.</div>';
  }

  if (historyEl) {
    historyEl.innerHTML = (auction?.history || []).slice(-8).reverse().map(h => {
      const t = teams.find(x => x.id === h.teamId);
      return `<div class="history-row"><span>${escapeHtml(t?.name || 'Squadra')}</span><b>${Number(h.amount || 0)} CR</b><small>+${Number(h.increment || 0)} · ${formatTime(h.at)}</small></div>`;
    }).join('') || '<div class="empty">I rilanci compariranno qui.</div>';
  }

  const running = auction?.status === 'running';
  document.querySelectorAll('[data-bid]').forEach(button => {
    const increment = Number(button.dataset.bid);
    button.disabled = !running || !team || Number(auction.currentPrice || 0) + increment > Number(team.credits || 0);
  });

  const startButton = document.querySelector('[data-start]');
  if (startButton) startButton.disabled = Boolean(auction);
  const selector = document.querySelector('[data-player-select]');
  if (selector) selector.disabled = Boolean(auction);
  const pause = document.querySelector('[data-pause]');
  const resume = document.querySelector('[data-resume]');
  const pass = document.querySelector('[data-pass]');
  const confirm = document.querySelector('[data-confirm]');
  const cancel = document.querySelector('[data-cancel]');
  if (pause) pause.disabled = !auction || auction.status !== 'running';
  if (resume) resume.disabled = !auction || auction.status !== 'paused';
  if (pass) pass.disabled = !auction || teams.length <= 1;
  if (confirm) confirm.disabled = !auction || !auction.bestTeamId;
  if (cancel) cancel.disabled = !auction;

  return auction;
}

async function populatePlayerSelect() {
  const ctx = getAuctionContext();
  const select = document.querySelector('[data-player-select]');
  if (!ctx || !select) return;
  const players = await loadPlayers();
  const available = players.filter(p => p.available !== false);
  const oldValue = select.value;
  select.innerHTML = available.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.team)} · ${escapeHtml(p.role)}</option>`).join('') || '<option value="">Nessun giocatore disponibile</option>';
  if (available.some(p => String(p.id) === String(oldValue))) select.value = oldValue;
}

async function initAuctionPage() {
  const ctx = getAuctionContext();
  if (!ctx) return;
  if (!ctx.league) { location.href = 'scelta-lega.html'; return; }
  if (!ctx.team) { location.href = 'crea-squadra.html'; return; }

  try {
    await populatePlayerSelect();
    renderAuction();
  } catch (error) {
    showAuctionMessage(error.message || 'Impossibile preparare l’asta.', 'error');
  }

  const select = document.querySelector('[data-player-select]');
  const startButton = document.querySelector('[data-start]');
  if (startButton && !startButton.dataset.bound) {
    startButton.dataset.bound = '1';
    startButton.addEventListener('click', () => {
      const liveCtx = getAuctionContext();
      try {
        if (!liveCtx?.league) throw new Error('Lega non disponibile.');
        if (!liveCtx.team) throw new Error('Squadra non disponibile.');
        if (!select?.value) throw new Error('Seleziona un giocatore prima di iniziare.');
        startButton.disabled = true;
        startAuction(liveCtx.league.id, select.value, liveCtx.team.id);
        showAuctionMessage('ASTA AVVIATA. Ora puoi effettuare i rilanci.', 'success');
        renderAuction();
      } catch (error) {
        startButton.disabled = false;
        showAuctionMessage(error.message || 'Impossibile avviare l’asta.', 'error');
        console.error('L-STORE startAuction:', error);
      }
    });
  }

  document.querySelectorAll('[data-bid]').forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      try {
        const liveCtx = getAuctionContext();
        if (!liveCtx?.league || !liveCtx.team) throw new Error('Squadra non disponibile.');
        placeBid(liveCtx.league.id, liveCtx.team.id, Number(button.dataset.bid));
        showAuctionMessage(`Rilancio +${button.dataset.bid} registrato.`, 'success');
        renderAuction();
      } catch (error) {
        showAuctionMessage(error.message || 'Impossibile effettuare il rilancio.', 'error');
      }
    });
  });

  const bindAction = (selector, handler) => {
    const button = document.querySelector(selector);
    if (!button || button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      try { handler(); renderAuction(); }
      catch (error) { showAuctionMessage(error.message || 'Operazione non riuscita.', 'error'); }
    });
  };

  bindAction('[data-pause]', () => pauseAuction(ctx.league.id));
  bindAction('[data-resume]', () => resumeAuction(ctx.league.id));
  bindAction('[data-pass]', () => passTurn(ctx.league.id));
  bindAction('[data-cancel]', () => cancelAuction(ctx.league.id));
  bindAction('[data-confirm]', () => { settleAuction(ctx.league.id); showAuctionMessage('Acquisto confermato. Il giocatore è stato aggiunto alla rosa.', 'success'); });

  if (auctionInterval) clearInterval(auctionInterval);
  auctionInterval = setInterval(() => {
    try {
      const active = renderAuction();
      if (active && active.status === 'running' && Date.now() >= Number(active.endsAt)) {
        try {
          settleAuction(ctx.league.id);
          showAuctionMessage('Tempo scaduto: asta conclusa.', 'success');
          populatePlayerSelect();
        } catch (error) {
          showAuctionMessage(error.message || 'Impossibile chiudere l’asta.', 'error');
        }
        renderAuction();
      }
    } catch (error) {
      console.warn('L-STORE auction loop:', error);
    }
  }, 500);

  if (!auctionListenersBound) {
    const refresh = () => { populatePlayerSelect(); renderAuction(); };
    window.addEventListener('storage', refresh);
    window.addEventListener('app:update', refresh);
    auctionListenersBound = true;
  }
}

window.addEventListener('beforeunload', () => {
  if (auctionInterval) clearInterval(auctionInterval);
});

document.addEventListener('DOMContentLoaded', initAuctionPage);
