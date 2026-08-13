(function(){
 const page=location.pathname.split('/').pop()||'iniziale.html';
 document.title='L-STORE FANTA MANAGER';
 const nav=['dashboard','asta','modalita-tv','mia-rosa','tutte-rose','giocatori','storico','lega','impostazioni'];
 document.addEventListener('DOMContentLoaded',()=>{
   document.body.insertAdjacentHTML('afterbegin',`<div class="topline"></div>`);
   const session=getSession();
   const protectedPages=nav.some(n=>page===n+'.html');
   if(protectedPages && !session){location.href='login.html'; return;}
   const header=document.querySelector('[data-shell]'); if(!header) return;
   const d=loadData(), u=session?d.users.find(x=>x.id===session.userId):null, league=u?currentLeague(u.id):null, team=u&&league?currentTeam(u.id,league.id):null;
   const navHtml=`<header class="site-header"><a class="brand" href="dashboard.html"><img src="assets/logo/lstore-logo.png" alt="L-Store"><span>L-STORE FANTA MANAGER</span></a><nav class="desktop-nav">${nav.map(n=>`<a class="${page===n+'.html'?'active':''}" href="${n}.html">${n.replace('modalita-tv','TV Mode').replace('mia-rosa','Mia Rosa').replace('tutte-rose','Tutte Rose').replace('giocatori','Giocatori').replace('storico','Storico').replace('lega','Lega').replace('impostazioni','Impostazioni').replace('asta','Asta').replace('dashboard','Dashboard')}</a>`).join('')}<a href="#" data-logout>Logout</a></nav><div class="header-meta">${team?`<span class="credit-pill">${team.credits} CR</span>`:''}<button class="icon-btn" data-menu>☰</button></div></header>`;
   header.innerHTML=navHtml+header.innerHTML;
   document.querySelector('[data-logout]')?.addEventListener('click',e=>{e.preventDefault();logout()});
   document.querySelector('[data-menu]')?.addEventListener('click',()=>document.querySelector('.desktop-nav')?.classList.toggle('open'));
 });
 window.formatTime=(ts)=>new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
 window.formatDate=(ts)=>new Date(ts).toLocaleDateString('it-IT');
 window.updateFromStorage=()=>window.dispatchEvent(new Event('app:update'));
})();
