let auctionInterval = null;
let auctionListenersBound = false;
let auctionPlayerCache = [];
let selectedAuctionPlayerId = '';
let auctionSearchCursor = -1;
let catalogLoading = false;

function getAuctionContext() {
  const user = requireAuth();
  if (!user) return null;
  const data = loadData();
  const league = currentLeague(user.id);
  if (!league) return { user, data, league: null, team: null, teams: [] };
  const team = currentTeam(user.id, league.id);
  const teams = data.teams.filter(t => sameId(t.leagueId, league.id));
  return { user, data, league, team, teams };
}

function getActiveAuctionFromData(data, leagueId) {
  if (!leagueId) return null;
  return (data.auctions || []).find(a => sameId(a.leagueId, leagueId) && (a.status === 'running' || a.status === 'paused')) || null;
}

function getActiveAuction(leagueId) {
  if (!leagueId) return null;
  return getActiveAuctionFromData(loadData(), leagueId);
}

function getNextTurnTeamId(data, leagueId, currentTeamId) {
  const teams = (data.teams || []).filter(t => sameId(t.leagueId, leagueId));
  if (!teams.length) return null;
  if (teams.length === 1) return teams[0].id;
  const index = teams.findIndex(t => sameId(t.id, currentTeamId));
  if (index < 0) return teams[0].id;
  return teams[(index + 1) % teams.length].id;
}

function startAuction(leagueId, playerId, starterTeamId) {
  if (!leagueId) throw new Error('Lega non disponibile.');
  if (!starterTeamId) throw new Error('Crea prima la tua squadra.');
  if (!playerId) throw new Error('Seleziona un giocatore prima di iniziare.');

  const data = loadData();
  if (getActiveAuctionFromData(data, leagueId)) throw new Error('C’è già un’asta in corso.');

  const league = data.leagues.find(x => sameId(x.id, leagueId));
  if (!league) throw new Error('Lega non trovata.');
  const player = data.players.find(x => sameId(x.id, playerId));
  if (!player) throw new Error('Giocatore non trovato nel database. Aggiorna il catalogo e riprova.');
  if (!isPlayerAvailableInLeague(data, player.id, leagueId)) throw new Error('Questo giocatore è già stato acquistato in questa lega.');

  const starterTeam = data.teams.find(t => sameId(t.id, starterTeamId) && sameId(t.leagueId, leagueId));
  if (!starterTeam) throw new Error('Squadra non trovata nella lega.');

  const timer = Math.max(5, Number(league.timer) || 30);
  const now = Date.now();
  const auction = {
    id: uid('auc'),
    leagueId: league.id,
    playerId: player.id,
    currentPrice: 0,
    bestTeamId: null,
    starterTeamId: starterTeam.id,
    turnTeamId: starterTeam.id,
    status: 'running',
    endsAt: now + timer * 1000,
    history: [],
    createdAt: now
  };
  data.auctions.push(auction);
  saveData(data);
  return auction;
}

function placeBid(leagueId, teamId, increment) {
  const amount = Number(increment);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Rilancio non valido.');
  const data = loadData();
  const auction = getActiveAuctionFromData(data, leagueId);
  if (!auction) throw new Error('Nessuna asta attiva.');
  if (auction.status !== 'running') throw new Error('L’asta è in pausa.');

  const team = data.teams.find(x => sameId(x.id, teamId) && sameId(x.leagueId, leagueId));
  if (!team) throw new Error('Squadra non trovata.');
  const leagueTeams = data.teams.filter(x => sameId(x.leagueId, leagueId));
  if (leagueTeams.length > 1 && auction.turnTeamId && !sameId(auction.turnTeamId, team.id)) {
    throw new Error(`Non è il tuo turno. Tocca a ${teamName(leagueTeams, auction.turnTeamId)}.`);
  }

  const league = data.leagues.find(x => sameId(x.id, leagueId));
  const nextPrice = Number(auction.currentPrice || 0) + amount;
  const credits = Number(team.credits || 0);
  if (nextPrice > credits) throw new Error(`Crediti insufficienti: ${credits} CR disponibili.`);

  const now = Date.now();
  auction.currentPrice = nextPrice;
  auction.bestTeamId = team.id;
  auction.turnTeamId = getNextTurnTeamId(data, leagueId, team.id) || team.id;
  auction.endsAt = now + Math.max(5, Number(league?.timer) || 30) * 1000;
  auction.history = Array.isArray(auction.history) ? auction.history : [];
  auction.history.push({ teamId: team.id, amount: nextPrice, increment: amount, at: now });
  saveData(data);
  return auction;
}

function passTurn(leagueId) {
  const data = loadData();
  const auction = getActiveAuctionFromData(data, leagueId);
  if (!auction) throw new Error('Nessuna asta attiva.');
  if (auction.status !== 'running') throw new Error('L’asta è in pausa.');
  const next = getNextTurnTeamId(data, leagueId, auction.turnTeamId || auction.starterTeamId);
  if (!next) throw new Error('Nessuna squadra disponibile.');
  auction.turnTeamId = next;
  saveData(data);
}

function settleAuction(leagueId) {
  const data = loadData();
  const auction = getActiveAuctionFromData(data, leagueId);
  if (!auction) throw new Error('Nessuna asta attiva.');
  const player = data.players.find(x => sameId(x.id, auction.playerId));
  if (!player) throw new Error('Giocatore non trovato.');

  if (auction.bestTeamId && Number(auction.currentPrice) > 0) {
    if (!isPlayerAvailableInLeague(data, player.id, leagueId)) throw new Error('Il giocatore risulta già assegnato in questa lega.');
    const team = data.teams.find(x => sameId(x.id, auction.bestTeamId) && sameId(x.leagueId, leagueId));
    if (!team) throw new Error('Squadra vincitrice non trovata.');
    if (Number(auction.currentPrice) > Number(team.credits || 0)) throw new Error('Crediti insufficienti per aggiudicare il giocatore.');

    team.credits = Number(team.credits || 0) - Number(auction.currentPrice);
    team.spent = Number(team.spent || 0) + Number(auction.currentPrice);
    team.players = Array.isArray(team.players) ? team.players : [];
    if (!team.players.some(id => sameId(id, player.id))) team.players.push(player.id);

    const now=Date.now();
    data.bids = Array.isArray(data.bids) ? data.bids : [];
    data.rosters = Array.isArray(data.rosters) ? data.rosters : [];
    data.bids.push({ id: uid('bid'), auctionId: auction.id, leagueId, playerId: player.id, teamId: team.id, price: Number(auction.currentPrice), at: now });
    data.rosters.push({ leagueId, teamId: team.id, playerId: player.id, price: Number(auction.currentPrice), at: now });
  }

  auction.status = 'finished';
  auction.finishedAt = Date.now();
  saveData(data);
  return auction;
}

function cancelAuction(leagueId) {
  const data = loadData();
  const auction = getActiveAuctionFromData(data, leagueId);
  if (!auction) throw new Error('Nessuna asta attiva.');
  auction.status = 'cancelled';
  auction.cancelledAt = Date.now();
  saveData(data);
}

function pauseAuction(leagueId) {
  const data = loadData();
  const auction = (data.auctions || []).find(a => sameId(a.leagueId, leagueId) && a.status === 'running');
  if (!auction) throw new Error('Nessuna asta in corso.');
  auction.remainingMs = Math.max(0, Number(auction.endsAt || Date.now()) - Date.now());
  auction.status = 'paused';
  saveData(data);
}

function resumeAuction(leagueId) {
  const data = loadData();
  const auction = (data.auctions || []).find(a => sameId(a.leagueId, leagueId) && a.status === 'paused');
  if (!auction) throw new Error('Nessuna asta in pausa.');
  const league = data.leagues.find(l => sameId(l.id, leagueId));
  const remaining = Number(auction.remainingMs || 0);
  auction.endsAt = Date.now() + (remaining > 0 ? remaining : Math.max(5, Number(league?.timer) || 30) * 1000);
  delete auction.remainingMs;
  auction.status = 'running';
  saveData(data);
}

function teamName(teams, teamId) {
  return teams.find(team => sameId(team.id, teamId))?.name || '—';
}

function showAuctionMessage(text, type = '') {
  const el = document.querySelector('[data-auction-message]');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auction-message${type ? ` ${type}` : ''}`;
}

function setCatalogStatus(text, type=''){
  const el=document.querySelector('[data-catalog-status]');
  if(!el) return;
  el.textContent=text||'';
  el.className=`auction-sub catalog-status${type?` ${type}`:''}`;
}

function auctionTimerText(auction){
  if(!auction) return '—';
  const ms=auction.status==='paused' ? Number(auction.remainingMs||0) : Math.max(0,Number(auction.endsAt||0)-Date.now());
  return Math.ceil(ms/1000).toString().padStart(2,'0');
}

function getSelectedPlayer(data){
  if(!selectedAuctionPlayerId) return null;
  return (data.players||[]).find(p=>sameId(p.id,selectedAuctionPlayerId))||null;
}

function renderAuction() {
  const ctx = getAuctionContext();
  if (!ctx || !ctx.league) return null;
  const { data, league, team, teams } = ctx;
  const auction = getActiveAuctionFromData(data, league.id);
  const activePlayer = auction ? data.players.find(x => sameId(x.id, auction.playerId)) : null;
  const selectedPlayer = !auction ? getSelectedPlayer(data) : null;
  const player = activePlayer || selectedPlayer;

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
  const avatarEl = document.querySelector('[data-player-avatar]');

  if (stateEl) stateEl.textContent = auction ? (auction.status === 'paused' ? 'ASTA IN PAUSA' : 'ASTA IN CORSO') : (selectedPlayer ? 'GIOCATORE PRONTO' : 'PRONTO PER L’ASTA');
  if (playerNameEl) playerNameEl.textContent = player?.name || 'Seleziona un giocatore';
  if (playerMetaEl) playerMetaEl.textContent = player ? `${player.team} · ${player.role}${player.position && player.position!==player.role ? ` · ${player.position}` : ''}` : `${league.name} · ${teams.length} ${teams.length === 1 ? 'squadra' : 'squadre'}`;
  if (priceEl) priceEl.textContent = String(auction?.currentPrice ?? 0);
  if (bidderEl) bidderEl.textContent = auction?.bestTeamId ? teamName(teams, auction.bestTeamId) : 'Nessuna offerta';
  if (turnEl) turnEl.textContent = auction?.turnTeamId ? teamName(teams, auction.turnTeamId) : (team?.name || '—');
  if (timerEl) timerEl.textContent = auctionTimerText(auction);
  if (noteEl) noteEl.textContent = teams.length === 1 ? 'Modalità test: sei l’unica squadra presente nella lega.' : `${teams.length} squadre collegate · i rilanci seguono il turno indicato.`;
  if (avatarEl) avatarEl.innerHTML = player?.photo ? `<img src="${escapeHtml(player.photo)}" alt="${escapeHtml(player.name)}">` : '<span>⚽</span>';

  if (teamsEl) {
    teamsEl.innerHTML = teams.map(t => `<div class="team-line ${auction?.bestTeamId && sameId(auction.bestTeamId,t.id) ? 'is-leading' : ''}">
      <div class="team-mark">${escapeHtml(t.abbr || String(t.name || '').slice(0, 3).toUpperCase())}</div>
      <div><strong>${escapeHtml(t.name)}</strong><span>${Number(t.credits || 0)} CR disponibili</span></div>
      <em>${auction?.bestTeamId && sameId(auction.bestTeamId,t.id) ? 'IN TESTA' : auction?.turnTeamId && sameId(auction.turnTeamId,t.id) ? 'TURNO' : ''}</em>
    </div>`).join('') || '<div class="empty">Nessuna squadra.</div>';
  }

  if (historyEl) {
    historyEl.innerHTML = (auction?.history || []).slice(-8).reverse().map(h => {
      const t = teams.find(x => sameId(x.id, h.teamId));
      return `<div class="history-row"><span>${escapeHtml(t?.name || 'Squadra')}</span><b>${Number(h.amount || 0)} CR</b><small>+${Number(h.increment || 0)} · ${formatTime(h.at)}</small></div>`;
    }).join('') || '<div class="empty">I rilanci compariranno qui.</div>';
  }

  const running = auction?.status === 'running';
  const canAct = teams.length <= 1 || !auction?.turnTeamId || sameId(auction.turnTeamId, team?.id);
  document.querySelectorAll('[data-bid]').forEach(button => {
    const increment = Number(button.dataset.bid);
    const nextPrice = Number(auction?.currentPrice || 0) + increment;
    button.disabled = !running || !team || !canAct || nextPrice > Number(team.credits || 0);
  });

  const startButton = document.querySelector('[data-start]');
  if (startButton) {
    startButton.disabled = Boolean(auction) || !selectedPlayer || catalogLoading;
    const label=startButton.querySelector('[data-start-label]');
    if(!auction && !startButton.classList.contains('is-starting')){
      startButton.classList.remove('is-started');
      if(label) label.textContent='INIZIA ASTA';
    }
  }
  const search = document.querySelector('[data-player-search]');
  if (search) search.disabled = Boolean(auction) || catalogLoading;
  const searchTrigger = document.querySelector('[data-smart-search-trigger]');
  if (searchTrigger) searchTrigger.disabled = Boolean(auction) || catalogLoading;
  const refresh = document.querySelector('[data-refresh-players]');
  if (refresh) refresh.disabled = Boolean(auction) || catalogLoading;
  const pause = document.querySelector('[data-pause]');
  const resume = document.querySelector('[data-resume]');
  const pass = document.querySelector('[data-pass]');
  const confirm = document.querySelector('[data-confirm]');
  const cancel = document.querySelector('[data-cancel]');
  if (pause) pause.disabled = !auction || auction.status !== 'running';
  if (resume) resume.disabled = !auction || auction.status !== 'paused';
  if (pass) pass.disabled = !running || teams.length <= 1;
  if (confirm) confirm.disabled = !auction || !auction.bestTeamId;
  if (cancel) cancel.disabled = !auction;

  return auction;
}

function leaguePlayerViews(){
  const ctx=getAuctionContext();
  if(!ctx?.league) return [];
  const data=loadData();
  return playersForLeague(auctionPlayerCache.length?auctionPlayerCache:data.players,ctx.league.id,data);
}

function closePlayerResults(){
  const results=document.querySelector('[data-player-results]');
  const search=document.querySelector('[data-player-search]');
  if(results) results.hidden=true;
  if(search) search.setAttribute('aria-expanded','false');
  auctionSearchCursor=-1;
}

function openPlayerResults(){
  const results=document.querySelector('[data-player-results]');
  const search=document.querySelector('[data-player-search]');
  if(results) results.hidden=false;
  if(search) search.setAttribute('aria-expanded','true');
}

function searchAuctionPlayers(query=''){
  const q=normalizeText(query);
  return leaguePlayerViews().filter(p=>p.available).filter(p=>{
    if(!q) return true;
    return `${normalizeText(p.name)} ${normalizeText(p.team)} ${normalizeText(p.role)} ${normalizeText(p.position)}`.includes(q);
  }).slice(0,12);
}

function renderPlayerSearchResults(query){
  const results=document.querySelector('[data-player-results]');
  if(!results) return [];
  const matches=searchAuctionPlayers(query);
  results.innerHTML=matches.map((p,index)=>`<button type="button" class="player-search-option${index===auctionSearchCursor?' is-active':''}" role="option" data-select-player="${escapeHtml(p.id)}" aria-selected="${index===auctionSearchCursor?'true':'false'}"><span class="search-player-icon">⚽</span><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.team)} · ${escapeHtml(p.position||p.role)}</small></span><b>${escapeHtml(p.role)}</b></button>`).join('')||'<div class="player-search-empty">Nessun giocatore disponibile trovato.</div>';
  if(document.activeElement===document.querySelector('[data-player-search]')) openPlayerResults();
  return matches;
}

function setSelectedAuctionPlayer(playerId,{writeInput=true}={}){
  const ctx=getAuctionContext();
  if(!ctx?.league) return;
  const data=loadData();
  const player=data.players.find(p=>sameId(p.id,playerId));
  if(!player) throw new Error('Giocatore non trovato.');
  if(!isPlayerAvailableInLeague(data,player.id,ctx.league.id)) throw new Error('Giocatore già acquistato in questa lega.');
  selectedAuctionPlayerId=String(player.id);
  const hidden=document.querySelector('[data-player-selected]');
  const input=document.querySelector('[data-player-search]');
  if(hidden) hidden.value=selectedAuctionPlayerId;
  if(input&&writeInput) input.value=player.name;
  closePlayerResults();
  showAuctionMessage(`${player.name} selezionato. Premi “Inizia asta”.`,'success');
  renderAuction();
}

function clearSelectedAuctionPlayer({clearInput=true}={}){
  selectedAuctionPlayerId='';
  const hidden=document.querySelector('[data-player-selected]');
  const input=document.querySelector('[data-player-search]');
  if(hidden) hidden.value='';
  if(input&&clearInput) input.value='';
  closePlayerResults();
  renderAuction();
}

async function preparePlayerCatalog(forceRefresh=false){
  const applyCatalog=(players)=>{
    auctionPlayerCache=Array.isArray(players)?players:[];
    const data=loadData();
    const selected=data.players.find(p=>sameId(p.id,selectedAuctionPlayerId));
    const ctx=getAuctionContext();
    if(selected&&ctx?.league&&!isPlayerAvailableInLeague(data,selected.id,ctx.league.id)) clearSelectedAuctionPlayer();
    const input=document.querySelector('[data-player-search]');
    if(input&&document.activeElement===input) renderPlayerSearchResults(input.value);
    renderAuction();
  };
  const describeCatalog=(players,kind)=>{
    const meta=loadData().playerCatalogMeta||{};
    const date=meta.updatedAt?new Date(meta.updatedAt).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'cache locale';
    const failed=(meta.failedTeams||[]);
    setCatalogStatus(`${players.length} giocatori · Serie A ${meta.season||PLAYER_CATALOG_SEASON} · ${kind||'aggiornato'} ${date}${failed.length?` · verifica: ${failed.join(', ')}`:''}`, failed.length?'warn':'ok');
  };

  if(!forceRefresh){
    // Il catalogo locale deve essere immediatamente utilizzabile: l'asta non viene
    // bloccata mentre viene tentato l'aggiornamento remoto delle rose.
    try{
      const cached=await loadPlayers({forceRefresh:false,refreshIfStale:false});
      applyCatalog(cached);
      describeCatalog(cached,'cache');
    }catch(_){
      applyCatalog(loadData().players||[]);
    }

    const data=loadData(), meta=data.playerCatalogMeta||{};
    const updatedAt=Number(meta.updatedAt)||Date.parse(meta.updatedAt||'')||0;
    const stale=Number(meta.version)!==3||!updatedAt||(Date.now()-updatedAt)>PLAYER_CATALOG_MAX_AGE||auctionPlayerCache.length<100;
    if(!stale) return auctionPlayerCache;

    setCatalogStatus(`${auctionPlayerCache.length} giocatori in cache · aggiornamento rose in background…`,'warn');
    loadPlayers({
      forceRefresh:true,
      refreshIfStale:true,
      onProgress:({completed,total,count,failures})=>setCatalogStatus(`Aggiornamento rose ${completed}/${total} · ${count} giocatori${failures?` · ${failures} squadre da verificare`:''}`)
    }).then(players=>{
      applyCatalog(players);
      describeCatalog(players,'aggiornato');
    }).catch(()=>{
      setCatalogStatus(`${auctionPlayerCache.length} giocatori in cache · aggiornamento online non riuscito`,'warn');
    });
    return auctionPlayerCache;
  }

  catalogLoading=true;
  renderAuction();
  setCatalogStatus('Aggiornamento database in corso…');
  try{
    const players=await loadPlayers({
      forceRefresh:true,
      refreshIfStale:true,
      onProgress:({completed,total,count,failures})=>setCatalogStatus(`Aggiornamento rose ${completed}/${total} · ${count} giocatori${failures?` · ${failures} squadre da verificare`:''}`)
    });
    applyCatalog(players);
    describeCatalog(players,'aggiornato');
    return players;
  }catch(error){
    applyCatalog(loadData().players||[]);
    setCatalogStatus(`${auctionPlayerCache.length} giocatori in cache · aggiornamento online non riuscito`,'error');
    showAuctionMessage(error.message||'Impossibile aggiornare il database. Uso la copia locale.','error');
    return auctionPlayerCache;
  }finally{
    catalogLoading=false;
    renderAuction();
  }
}

function bindAuctionUi(){
  const search=document.querySelector('[data-player-search]');
  const searchBox=document.querySelector('[data-smart-search]');
  const searchTrigger=document.querySelector('[data-smart-search-trigger]');
  const clear=document.querySelector('[data-search-clear]');
  const results=document.querySelector('[data-player-results]');
  const startButton=document.querySelector('[data-start]');
  const refreshButton=document.querySelector('[data-refresh-players]');

  if(searchTrigger&&!searchTrigger.dataset.bound){
    searchTrigger.dataset.bound='1';
    searchTrigger.addEventListener('click',()=>{
      if(searchTrigger.disabled) return;
      searchBox?.classList.add('is-open');
      requestAnimationFrame(()=>search?.focus());
    });
  }

  if(search&&!search.dataset.bound){
    search.dataset.bound='1';
    search.addEventListener('focus',()=>{searchBox?.classList.add('is-open');auctionSearchCursor=-1;renderPlayerSearchResults(search.value);});
    search.addEventListener('input',()=>{
      selectedAuctionPlayerId='';
      const hidden=document.querySelector('[data-player-selected]'); if(hidden) hidden.value='';
      auctionSearchCursor=-1;
      renderPlayerSearchResults(search.value);
      renderAuction();
    });
    search.addEventListener('keydown',event=>{
      const matches=searchAuctionPlayers(search.value);
      if(event.key==='ArrowDown'){
        event.preventDefault(); auctionSearchCursor=Math.min(matches.length-1,auctionSearchCursor+1); renderPlayerSearchResults(search.value);
      }else if(event.key==='ArrowUp'){
        event.preventDefault(); auctionSearchCursor=Math.max(0,auctionSearchCursor-1); renderPlayerSearchResults(search.value);
      }else if(event.key==='Enter'&&matches.length){
        event.preventDefault(); const target=matches[Math.max(0,auctionSearchCursor)]; if(target) setSelectedAuctionPlayer(target.id);
      }else if(event.key==='Escape') closePlayerResults();
    });
  }

  if(clear&&!clear.dataset.bound){
    clear.dataset.bound='1';
    clear.addEventListener('click',()=>{
      clearSelectedAuctionPlayer();
      if(search) search.value='';
      closePlayerResults();
      searchBox?.classList.remove('is-open');
      searchTrigger?.focus();
    });
  }
  if(results&&!results.dataset.bound){
    results.dataset.bound='1';
    results.addEventListener('mousedown',event=>event.preventDefault());
    results.addEventListener('click',event=>{
      const option=event.target.closest('[data-select-player]');
      if(!option) return;
      try{setSelectedAuctionPlayer(option.dataset.selectPlayer);}
      catch(error){showAuctionMessage(error.message,'error');}
    });
  }

  if(startButton&&!startButton.dataset.bound){
    startButton.dataset.bound='1';
    startButton.addEventListener('click',()=>{
      const liveCtx=getAuctionContext();
      try{
        if(!liveCtx?.league||!liveCtx.team) throw new Error('Lega o squadra non disponibile.');
        if(!selectedAuctionPlayerId) throw new Error('Cerca e seleziona un giocatore prima di iniziare.');
        startButton.classList.remove('is-started');
        startButton.classList.add('is-starting');
        const label=startButton.querySelector('[data-start-label]'); if(label) label.textContent='AVVIO ASTA…';
        startAuction(liveCtx.league.id,selectedAuctionPlayerId,liveCtx.team.id);
        showAuctionMessage('ASTA AVVIATA. Il timer è partito e i rilanci sono attivi.','success');
        closePlayerResults();
        searchBox?.classList.remove('is-open');
        renderAuction();
        setTimeout(()=>{
          startButton.classList.remove('is-starting');
          startButton.classList.add('is-started');
          if(label) label.textContent='ASTA AVVIATA';
        },780);
      }catch(error){
        startButton.classList.remove('is-starting','is-started');
        const label=startButton.querySelector('[data-start-label]'); if(label) label.textContent='INIZIA ASTA';
        showAuctionMessage(error.message||'Impossibile avviare l’asta.','error');
        console.error('L-STORE startAuction:',error);
      }
    });
  }

  if(refreshButton&&!refreshButton.dataset.bound){
    refreshButton.dataset.bound='1';
    refreshButton.addEventListener('click',()=>preparePlayerCatalog(true));
  }

  document.querySelectorAll('[data-bid]').forEach(button=>{
    if(button.dataset.bound) return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>{
      try{
        const liveCtx=getAuctionContext();
        if(!liveCtx?.league||!liveCtx.team) throw new Error('Squadra non disponibile.');
        placeBid(liveCtx.league.id,liveCtx.team.id,Number(button.dataset.bid));
        showAuctionMessage(`Rilancio +${button.dataset.bid} registrato.`,'success');
        renderAuction();
      }catch(error){showAuctionMessage(error.message||'Impossibile effettuare il rilancio.','error');}
    });
  });

  const bindAction=(selector,handler)=>{
    const button=document.querySelector(selector);
    if(!button||button.dataset.bound) return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>{
      try{handler();renderAuction();}
      catch(error){showAuctionMessage(error.message||'Operazione non riuscita.','error');}
    });
  };
  bindAction('[data-pause]',()=>pauseAuction(getAuctionContext().league.id));
  bindAction('[data-resume]',()=>resumeAuction(getAuctionContext().league.id));
  bindAction('[data-pass]',()=>passTurn(getAuctionContext().league.id));
  bindAction('[data-cancel]',()=>{
    const leagueId=getAuctionContext().league.id;
    cancelAuction(leagueId); clearSelectedAuctionPlayer(); showAuctionMessage('Asta annullata. Il giocatore resta disponibile.','success');
  });
  bindAction('[data-confirm]',()=>{
    const leagueId=getAuctionContext().league.id;
    settleAuction(leagueId); clearSelectedAuctionPlayer(); showAuctionMessage('Acquisto confermato. Il giocatore è stato aggiunto alla rosa.','success');
  });

  if(!auctionListenersBound){
    const refresh=()=>{
      auctionPlayerCache=loadData().players||[];
      const input=document.querySelector('[data-player-search]');
      if(input&&document.activeElement===input) renderPlayerSearchResults(input.value);
      renderAuction();
    };
    window.addEventListener('storage',refresh);
    window.addEventListener('app:update',refresh);
    document.addEventListener('click',event=>{
      if(!event.target.closest('[data-search-box]')&&!event.target.closest('[data-player-results]')){
        closePlayerResults();
        const input=document.querySelector('[data-player-search]');
        const box=document.querySelector('[data-smart-search]');
        if(input && !input.value.trim() && !selectedAuctionPlayerId) box?.classList.remove('is-open');
      }
    });
    auctionListenersBound=true;
  }
}

async function initAuctionPage() {
  if(!document.querySelector('.auction-page')) return;
  const ctx = getAuctionContext();
  if (!ctx) return;
  if (!ctx.league) { location.href = 'scelta-lega.html'; return; }
  if (!ctx.team) { location.href = 'crea-squadra.html'; return; }

  auctionPlayerCache=ctx.data.players||[];
  bindAuctionUi();
  renderAuction();
  await preparePlayerCatalog(false);

  if (auctionInterval) clearInterval(auctionInterval);
  auctionInterval = setInterval(() => {
    try {
      const liveCtx=getAuctionContext();
      if(!liveCtx?.league) return;
      const active=getActiveAuctionFromData(liveCtx.data,liveCtx.league.id);
      if (active && active.status === 'running' && Date.now() >= Number(active.endsAt)) {
        try {
          const hadBid=Boolean(active.bestTeamId&&Number(active.currentPrice)>0);
          settleAuction(liveCtx.league.id);
          clearSelectedAuctionPlayer();
          showAuctionMessage(hadBid?'Tempo scaduto: asta conclusa e acquisto assegnato.':'Tempo scaduto senza offerte: giocatore ancora disponibile.','success');
        } catch (error) {
          showAuctionMessage(error.message || 'Impossibile chiudere l’asta.', 'error');
        }
      }
      renderAuction();
    } catch (error) {
      console.warn('L-STORE auction loop:', error);
    }
  }, 500);
}

window.addEventListener('beforeunload', () => {
  if (auctionInterval) clearInterval(auctionInterval);
});

document.addEventListener('DOMContentLoaded', initAuctionPage);
