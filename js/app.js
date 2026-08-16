(function(){
  const page=location.pathname.split('/').pop()||'iniziale.html';
  const nav=['dashboard','asta','modalita-tv','mia-rosa','tutte-rose','giocatori','storico','lega','impostazioni'];

  function navLabel(name){
    return name.replace('modalita-tv','TV Mode').replace('mia-rosa','Mia Rosa').replace('tutte-rose','Tutte Rose').replace('giocatori','Giocatori').replace('storico','Storico').replace('lega','Lega').replace('impostazioni','Impostazioni').replace('asta','Asta').replace('dashboard','Dashboard');
  }

  function currentHeaderContext(){
    const session=getSession();
    const data=loadData();
    const user=session?data.users.find(x=>sameId(x.id,session.userId)):null;
    const league=user?currentLeague(user.id):null;
    const team=user&&league?currentTeam(user.id,league.id):null;
    return {session,data,user,league,team};
  }

  function renderHeader(){
    const shell=document.querySelector('[data-shell]');
    if(!shell) return;
    const {data,user,league,team}=currentHeaderContext();
    document.body.classList.toggle('theme-light', data.settings?.theme==='light');
    let header=shell.querySelector(':scope > .site-header');
    if(!header){
      const navHtml=`<header class="site-header"><a class="brand" href="dashboard.html"><img src="assets/logo/lstore-logo.png" alt="L-Store"><span>L-STORE FANTA MANAGER</span></a><nav class="desktop-nav">${nav.map(n=>`<a class="${page===n+'.html'?'active':''}" href="${n}.html">${navLabel(n)}</a>`).join('')}<a href="#" data-logout>Logout</a></nav><div class="header-meta"><a class="league-pill" href="scelta-lega.html" data-header-league></a><span class="credit-pill" data-header-credits></span><button class="icon-btn" type="button" data-menu aria-label="Apri menu" aria-expanded="false">☰</button></div></header>`;
      shell.insertAdjacentHTML('afterbegin',navHtml);
      header=shell.querySelector(':scope > .site-header');
      header?.querySelector('[data-logout]')?.addEventListener('click',e=>{e.preventDefault();logout();});
      header?.querySelector('[data-menu]')?.addEventListener('click',event=>{
        const menu=header.querySelector('.desktop-nav');
        const open=menu?.classList.toggle('open');
        event.currentTarget.setAttribute('aria-expanded',open?'true':'false');
      });
    }
    const leagueEl=header?.querySelector('[data-header-league]');
    const creditsEl=header?.querySelector('[data-header-credits]');
    if(leagueEl){leagueEl.textContent=league?.name||'';leagueEl.hidden=!league;}
    if(creditsEl){creditsEl.textContent=team?`${Number(team.credits||0)} CR`:'';creditsEl.hidden=!team;}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.title='L-STORE FANTA MANAGER';
    if(!document.querySelector('.topline')) document.body.insertAdjacentHTML('afterbegin','<div class="topline"></div>');
    const session=getSession();
    const protectedPages=nav.some(n=>page===n+'.html');
    if(protectedPages && !session){location.href='login.html';return;}
    renderHeader();
  });

  window.addEventListener('app:update',renderHeader);
  window.formatTime=(ts)=>new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  window.formatDate=(ts)=>new Date(ts).toLocaleDateString('it-IT');
  window.updateFromStorage=()=>window.dispatchEvent(new Event('app:update'));
})();
