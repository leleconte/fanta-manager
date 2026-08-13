let auctionInterval = null;
let auctionChannelBound = false;

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
  const data = loadData();
  return data.auctions.find(a => a.leagueId === leagueId && ['running', 'paused'].includes(a.status)) || null;
}

function getNextTurnTeamId(data, leagueId, currentTeamId) {
  const teams = data.teams.filter(t => t.leagueId === leagueId);
  if (teams.length <= 1) return currentTeamId || teams[0]?.id || null;
  const index = teams.findIndex(t => t.id === currentTeamId);
  return teams[(index + 1) % teams.length]?.id || teams[0]?.id || null;
}

function startAuction(leagueId, playerId, starterTeamId) {
  updateData(data => {
    const active = data.auctions.find(a => a.leagueId === leagueId && ['running', 'paused'].includes(a.status));
    if (active) throw new Error('C’è già un’asta in corso.');
    const league = data.leagues.find(x => x.id === leagueId);
    const player = data.players.find(x => x.id === playerId);
    if (!league) throw new Error('Lega non trovata.');
    if (!player) throw new Error('Giocatore non trovato.');
    if (player.available === false) throw new Error('Questo giocatore è già stato acquistato.');
    if (!starterTeamId) throw new Error('Crea prima la tua squadra.');
    data.auctions.push({
      id: uid('auc'),
      leagueId,
      playerId,
      currentPrice: 0,
      bestTeamId: null,
      starterTeamId,
      turnTeamId: starterTeamId,
      status: 'running',
      endsAt: Date.now() + Number(league.timer || 30) * 1000,
      history: [],
      createdAt: Date.now()
    });
  });
}

function placeBid(leagueId, teamId, increment) {
  const amount = Number(increment);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Rilancio non valido.');
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && ['running', 'paused'].includes(a.status));
  if (!auction) throw new Error('Nessuna asta attiva.');
  if (auction.status !== 'running') throw new Error('L’asta è in pausa. Riprendila prima di rilanciare.');
  const team = data.teams.find(x => x.id === teamId && x.leagueId === leagueId);
  if (!team) throw new Error('Squadra non trovata.');
  const league = data.leagues.find(x => x.id === leagueId);
  const nextPrice = Number(auction.currentPrice || 0) + amount;
  if (nextPrice > Number(team.credits || 0)) throw new Error(`Crediti insufficienti: hai ${team.credits} CR disponibili.`);
  auction.currentPrice = nextPrice;
  auction.bestTeamId = team.id;
  auction.turnTeamId = team.id;
  auction.endsAt = Date.now() + Number(league?.timer || 30) * 1000;
  auction.history = Array.isArray(auction.history) ? auction.history : [];
  auction.history.push({ teamId: team.id, amount: nextPrice, increment: amount, at: Date.now() });
  saveData(data);
}

function passTurn(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && ['running', 'paused'].includes(a.status));
  if (!auction) return;
  auction.turnTeamId = getNextTurnTeamId(data, leagueId, auction.turnTeamId || auction.starterTeamId);
  saveData(data);
}

function settleAuction(leagueId) {
  const data = loadData();
  const auction = data.auctions.find(a => a.leagueId === leagueId && ['running', 'paused'].includes(a.status));
  if (!auction) return;
  const player = data.players.find(x => x.id === auction.playerId);
  if (!player) return;
  if (auction.bestTeamId && auction.currentPrice > 0) {
    const team = data.teams.find(x => x.id === auction.bestTeamId && x.leagueId === leagueId);
    if (!team) throw new Error('Squadra vincitrice non trovata.');
    if (auction.currentPrice > team.credits) throw new Error('I crediti della squadra vincitrice non sono sufficienti.');
    team.credits -= auction.currentPrice;
    team.spent = Number(team.spent || 0) + auction.currentPrice;
    team.players = Array.isArray(team.players) ? team.players : [];
    if (!team.players.includes(player.id)) team.players.push(player.id);
    player.available = false;
    player.price = auction.currentPrice;
    data.bids.push({ id: uid('bid'), auctionId: auction.id, leagueId, playerId: player.id, teamId: team.id, price: auction.currentPrice, at: Date.now() });
    data.rosters.push({ teamId: team.id, playerId: player.id, price: auction.currentPrice, at: Date.now() });
  }
  auction.status = 'finished';
  auction.finishedAt = Date.now();
  saveData(data);
}

function cancelAuction(leagueId) {
  updateData(data => {
    const auction = data.auctions.find(x => x.leagueId === leagueId && ['running', 'paused'].includes(x.status));
    if (auction) {
      auction.status = 'cancelled';
      auction.cancelledAt = Date.now();
    }
  });
}

function pauseAuction(leagueId) {
  updateData(data => {
    const auction = data.auctions.find(x => x.leagueId === leagueId && x.status === 'running');
    if (!auction) return;
    const remaining = Math.max(0, Number(auction.endsAt || Date.now()) - Date.now());
    auction.remainingMs = remaining;
    auction.status = 'paused';
  });
}

function resumeAuction(leagueId) {
  updateData(data => {
    const auction = data.auctions.find(x => x.leagueId === leagueId && x.status === 'paused');
    if (!auction) return;
    auction.status = 'running';
    const remaining = Number(auction.remainingMs || 0);
    auction.endsAt = Date.now() + (remaining > 0 ? remaining : Number(data.leagues.find(l => l.id === leagueId)?.timer || 30) * 1000);
    delete auction.remainingMs;
  });
}

function teamName(teams, teamId) {
  return teams.find(team => team.id === teamId)?.name || '—';
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

  if (stateEl) stateEl.textContent = auction ? (auction.status === 'paused' ? 'ASTA IN PAUSA' : 'ASTA IN CORSO') : 'PRONTA A PARTIRE';
  if (playerNameEl) playerNameEl.textContent = player?.name || 'Seleziona un giocatore';
  if (playerMetaEl) playerMetaEl.textContent = player ? `${player.team} · ${player.role}` : `${league.name} · ${teams.length} ${teams.length === 1 ? 'squadra' : 'squadre'}`;
  if (priceEl) priceEl.textContent = String(auction?.currentPrice ?? 0);
  if (bidderEl) bidderEl.textContent = auction?.bestTeamId ? teamName(teams, auction.bestTeamId) : 'Nessuna offerta';
  if (turnEl) turnEl.textContent = auction?.turnTeamId ? teamName(teams, auction.turnTeamId) : (team?.name || '—');
  if (timerEl) timerEl.textContent = auction ? Math.max(0, Math.ceil((auction.endsAt - Date.now()) / 1000)).toString().padStart(2, '0') : '—';
  if (noteEl) noteEl.textContent = teams.length === 1 ? 'Sei da solo nella lega: puoi gestire e testare l’asta senza altri partecipanti.' : `${teams.length} squadre collegate alla lega.`;

  if (teamsEl) {
    teamsEl.innerHTML = teams.map(t => `<div class="team-line ${auction?.bestTeamId === t.id ? 'is-leading' : ''}">
      <div class="team-mark">${escapeHtml(t.abbr || t.name.slice(0,3).toUpperCase())}</div>
      <div><strong>${escapeHtml(t.name)}</strong><span>${Number(t.credits || 0)} CR disponibili</span></div>
      <em>${auction?.bestTeamId === t.id ? 'IN TESTA' : auction?.turnTeamId === t.id ? 'TURNO' : ''}</em>
    </div>`).join('') || '<div class="empty">Nessuna squadra.</div>';
  }

  if (historyEl) {
    historyEl.innerHTML = (auction?.history || []).slice(-8).reverse().map(h => {
      const t = teams.find(x => x.id === h.teamId);
      return `<div class="history-row"><span>${escapeHtml(t?.name || 'Squadra')}</span><b>${h.amount} CR</b><small>+${h.increment || '?'} · ${formatTime(h.at)}</small></div>`;
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
  document.querySelector('[data-pause]')?.toggleAttribute('disabled', !auction || auction.status !== 'running');
  document.querySelector('[data-resume]')?.toggleAttribute('disabled', !auction || auction.status !== 'paused');
  document.querySelector('[data-pass]')?.toggleAttribute('disabled', !auction || teams.length <= 1);
  document.querySelector('[data-confirm]')?.toggleAttribute('disabled', !auction || !auction.bestTeamId);
  document.querySelector('[data-cancel]')?.toggleAttribute('disabled', !auction);

  return auction;
}

async function initAuctionPage() {
  const ctx = getAuctionContext();
  if (!ctx) return;
  if (!ctx.league) {
    location.href = 'scelta-lega.html';
    return;
  }
  if (!ctx.team) {
    location.href = 'crea-squadra.html';
    return;
  }

  const players = await loadPlayers();
  const select = document.querySelector('[data-player-select]');
  if (select) {
    const available = players.filter(p => p.available !== false);
    select.innerHTML = available.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.team)} · ${escapeHtml(p.role)}</option>`).join('') || '<option value="">Nessun giocatore disponibile</option>';
  }

  document.querySelector('[data-start]')?.addEventListener('click', () => {
    const messageEl=document.querySelector('[data-auction-message]');
    try {
      if (!select?.value) throw new Error('Seleziona un giocatore prima di iniziare.');
      startAuction(ctx.league.id, select.value, ctx.team.id);
      if(messageEl){messageEl.textContent='Asta avviata correttamente.';messageEl.className='auction-message success';}
      renderAuction();
    } catch (error) {
      if(messageEl){messageEl.textContent=error.message || 'Impossibile avviare l’asta.';messageEl.className='auction-message error';}
      console.error(error);
    }
  });

  document.querySelectorAll('[data-bid]').forEach(button => button.addEventListener('click', () => {
    try {
      const current = getAuctionContext();
      if (!current?.team) throw new Error('Squadra non disponibile.');
      placeBid(ctx.league.id, current.team.id, button.dataset.bid);
      renderAuction();
    } catch (error) { alert(error.message || 'Impossibile effettuare il rilancio.'); }
  }));

  document.querySelector('[data-pause]')?.addEventListener('click', () => { pauseAuction(ctx.league.id); renderAuction(); });
  document.querySelector('[data-resume]')?.addEventListener('click', () => { resumeAuction(ctx.league.id); renderAuction(); });
  document.querySelector('[data-pass]')?.addEventListener('click', () => { passTurn(ctx.league.id); renderAuction(); });
  document.querySelector('[data-cancel]')?.addEventListener('click', () => { cancelAuction(ctx.league.id); renderAuction(); });
  document.querySelector('[data-confirm]')?.addEventListener('click', () => {
    try { settleAuction(ctx.league.id); renderAuction(); } catch (error) { alert(error.message || 'Impossibile confermare l’acquisto.'); }
  });

  renderAuction();
  if (auctionInterval) clearInterval(auctionInterval);
  auctionInterval = setInterval(() => {
    const active = renderAuction();
    if (active && active.status === 'running' && Date.now() >= active.endsAt) {
      try { settleAuction(ctx.league.id); } catch (error) { console.warn(error); }
      renderAuction();
      refreshPlayerOptions(ctx.league.id);
    }
  }, 450);

  if (!auctionChannelBound) {
    window.addEventListener('storage', () => { renderAuction(); refreshPlayerOptions(ctx.league.id); });
    window.addEventListener('app:update', () => { renderAuction(); refreshPlayerOptions(ctx.league.id); });
    auctionChannelBound = true;
  }
}

async function refreshPlayerOptions(leagueId) {
  const select = document.querySelector('[data-player-select]');
  if (!select) return;
  const data = loadData();
  const players = data.players.length ? data.players : await loadPlayers();
  const active = getActiveAuction(leagueId);
  if (active) return;
  const currentValue = select.value;
  const available = players.filter(p => p.available !== false);
  select.innerHTML = available.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.team)} · ${escapeHtml(p.role)}</option>`).join('') || '<option value="">Nessun giocatore disponibile</option>';
  if (available.some(p => p.id === currentValue)) select.value = currentValue;
}

document.addEventListener('DOMContentLoaded', initAuctionPage);
