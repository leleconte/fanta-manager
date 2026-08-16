function tvRender() {
  const user = requireAuth();
  if (!user) return;
  const league = currentLeague(user.id);
  if (!league) return;
  const data = loadData();
  const auction = getActiveAuction(league.id);
  const player = auction ? data.players.find(x => sameId(x.id, auction.playerId)) : null;
  const teams = data.teams.filter(x => sameId(x.leagueId, league.id));

  const name = document.querySelector('[data-tv-name]');
  const meta = document.querySelector('[data-tv-team]');
  const price = document.querySelector('[data-tv-price]');
  const bidder = document.querySelector('[data-tv-bidder]');
  const timer = document.querySelector('[data-tv-timer]');
  const teamList = document.querySelector('[data-tv-teams]');
  const history = document.querySelector('[data-tv-history]');

  if (name) name.textContent = player?.name || 'NESSUN GIOCATORE';
  if (meta) meta.textContent = player ? `${player.team} · ${player.role}` : 'ASTA PRONTA';
  if (price) price.textContent = String(auction?.currentPrice ?? 0);
  if (bidder) bidder.textContent = auction?.bestTeamId ? (teams.find(x => sameId(x.id, auction.bestTeamId))?.name || '—') : 'NESSUNA OFFERTA';
  if (timer) timer.textContent = auctionTimerText(auction);
  if (teamList) teamList.innerHTML = teams.map(x => `<div class="tv-team ${auction?.bestTeamId && sameId(auction.bestTeamId, x.id) ? 'is-leading' : ''}"><span class="team-mark">${escapeHtml(x.abbr || String(x.name || '').slice(0,3).toUpperCase())}</span><strong>${escapeHtml(x.name)}</strong><b>${Number(x.credits || 0)}</b></div>`).join('') || '<div class="empty">Nessuna squadra.</div>';
  if (history) history.innerHTML = (auction?.history || []).slice(-6).reverse().map(h => {
    const tm = teams.find(x => sameId(x.id, h.teamId));
    return `<span>${escapeHtml(tm?.name || 'Squadra')} · ${Number(h.amount || 0)} CR</span>`;
  }).join('') || '—';
}

function tvSetFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
      return Promise.resolve(exit ? exit.call(document) : undefined);
    }
    if (!request) throw new Error('Il browser non supporta la modalità schermo intero.');
    const result = request.call(root);
    return Promise.resolve(result).catch(() => { throw new Error('Il browser ha bloccato lo schermo intero. Premi di nuovo il pulsante.'); });
  } catch (error) {
    return Promise.reject(error);
  }
}

function tvUpdateFullscreenLabel() {
  const button = document.querySelector('[data-fullscreen]');
  if (!button) return;
  const active = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  button.textContent = active ? 'ESCI DA SCHERMO INTERO' : 'SCHERMO INTERO';
}

document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth();
  if (!user) return;
  const league = currentLeague(user.id);
  if (!league) { location.href = 'scelta-lega.html'; return; }

  tvRender();
  setInterval(tvRender, 500);

  const viewButton = document.querySelector('[data-view]');
  if (viewButton) {
    viewButton.addEventListener('click', () => {
      const active = document.body.classList.toggle('tv-view-only');
      viewButton.textContent = active ? 'MODALITÀ CONTROLLO' : 'SOLO VISUALIZZAZIONE';
      viewButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  const fullscreenButton = document.querySelector('[data-fullscreen]');
  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', async () => {
      try {
        await tvSetFullscreen();
        tvUpdateFullscreenLabel();
      } catch (error) {
        fullscreenButton.textContent = 'RIPROVA SCHERMO INTERO';
        fullscreenButton.title = error.message || 'Schermo intero non disponibile';
      }
    });
  }

  ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(eventName => {
    document.addEventListener(eventName, tvUpdateFullscreenLabel);
  });
  tvUpdateFullscreenLabel();
});
