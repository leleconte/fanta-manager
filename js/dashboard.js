function renderDashboard(){
  const user=requireAuth(); if(!user)return;
  const data=loadData(); const league=currentLeague(user.id);
  if(!league){location.href='scelta-lega.html';return;}
  const team=currentTeam(user.id,league.id);
  if(!team){location.href='crea-squadra.html';return;}
  const set=(selector,value)=>{const el=document.querySelector(selector);if(el)el.textContent=value;};
  set('[data-team-name]',team.name);set('[data-credits]',Number(team.credits||0));set('[data-spent]',Number(team.spent||0));set('[data-count]',(team.players||[]).length);set('[data-league]',league.name);set('[data-code]',league.code);
  const active=(data.auctions||[]).find(a=>sameId(a.leagueId,league.id)&&(a.status==='running'||a.status==='paused'));
  set('[data-auction-status]',active?(active.status==='paused'?'IN PAUSA':'IN CORSO'):'PRONTA');
  set('[data-auction-status-sub]',active?'APRI LA REGIA':'ENTRA QUANDO VUOI');
  const players=(data.players||[]).filter(p=>(team.players||[]).some(id=>sameId(id,p.id)));
  const roles={POR:'PORTIERI',DIF:'DIFENSORI',CEN:'CENTROCAMPISTI',ATT:'ATTACCANTI'};
  const container=document.querySelector('[data-roster]'); if(!container)return;
  container.innerHTML=Object.entries(roles).map(([r,label])=>`<section class="roster-group"><h3>${label}</h3><div class="player-grid">${players.filter(p=>p.role===r).map(p=>{const acquisition=playerAcquisitionInLeague(data,p.id,league.id);return `<article class="player-card"><div class="avatar">${p.photo?`<img src="${escapeHtml(p.photo)}" alt="">`:'⚽'}</div><div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.team)} · ${r}</span></div><b>${Number(acquisition?.price||0)} CR</b></article>`}).join('')||'<div class="empty">Nessun giocatore</div>'}</div></section>`).join('');
}
document.addEventListener('DOMContentLoaded',renderDashboard);
window.addEventListener('app:update',()=>{if(document.querySelector('.dashboard-page'))renderDashboard();});
