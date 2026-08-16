function renderHistory(){
  const u=requireAuth();if(!u)return;
  const l=currentLeague(u.id);if(!l){location.href='scelta-lega.html';return;}
  const d=loadData();
  const bids=(d.bids||[]).filter(b=>sameId(b.leagueId,l.id)).sort((a,b)=>Number(b.at||0)-Number(a.at||0));
  const wrap=document.querySelector('[data-history-list]');if(!wrap)return;
  wrap.innerHTML=bids.map(b=>{
    const p=d.players.find(x=>sameId(x.id,b.playerId)),t=d.teams.find(x=>sameId(x.id,b.teamId)),a=d.auctions.find(x=>sameId(x.id,b.auctionId));
    const rel=(a?.history||[]).map(h=>{const tm=d.teams.find(x=>sameId(x.id,h.teamId));return `${tm?.name||'Squadra'}: ${Number(h.amount||0)} CR`}).join(' → ');
    return `<article class="history-card"><div><strong>${escapeHtml(p?.name||'Giocatore')}</strong><span>${escapeHtml(p?.team||'')} · ${escapeHtml(p?.role||'')}</span></div><div><b>${escapeHtml(t?.name||'Squadra')}</b><span>${Number(b.price||0)} CR</span></div><small>${formatDate(b.at)} · ${formatTime(b.at)} · ${escapeHtml(rel)}</small></article>`;
  }).join('')||'<div class="empty">Nessuna operazione ancora.</div>';
}
document.addEventListener('DOMContentLoaded',renderHistory);
window.addEventListener('app:update',()=>{if(document.querySelector('[data-history-list]'))renderHistory();});
