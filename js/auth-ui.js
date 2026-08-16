(function(){
  const ICONS={
    0:`<svg viewBox="0 0 96 72" aria-hidden="true"><path d="M22 61V18c0-4 3-7 7-7h31c4 0 7 3 7 7v43"/><path d="M31 61V22h27v39"/><circle cx="51" cy="42" r="2"/></svg>`,
    1:`<svg viewBox="0 0 96 72" aria-hidden="true"><path d="M55 18c9 0 15 6 15 14v20c0 10-7 17-17 17S36 62 36 52V27c0-7 5-12 12-12s12 5 12 12v23c0 4-3 7-7 7s-7-3-7-7V30"/></svg>`,
    2:`<svg viewBox="0 0 96 72" aria-hidden="true"><rect x="28" y="31" width="40" height="31" rx="6"/><path d="M36 31V23c0-8 5-14 12-14s12 6 12 14v8"/><circle cx="48" cy="46" r="3"/><path d="M48 49v7"/></svg>`,
    3:`<svg viewBox="0 0 96 72" aria-hidden="true"><circle cx="48" cy="37" r="26"/><circle cx="48" cy="37" r="18"/><circle cx="48" cy="37" r="7"/><path d="M48 11v8M48 55v8M22 37h8M66 37h8"/></svg>`,
    4:`<svg viewBox="0 0 96 72" aria-hidden="true"><circle cx="48" cy="37" r="28"/><circle cx="48" cy="37" r="20"/><circle cx="48" cy="37" r="7"/><path d="M48 9v10M48 55v10M20 37h10M66 37h10M28 17l7 7M61 50l7 7M68 17l-7 7M35 50l-7 7"/><path d="M48 30v14M41 37h14"/></svg>`
  };
  const LEVELS=[
    ['Nessun lucchetto','La porta è completamente aperta.'],
    ['Una graffetta piegata','Password molto facile da indovinare.'],
    ['Un lucchetto','Protezione di base: puoi renderla più forte.'],
    ['Un catenaccio','Buona combinazione di lunghezza e caratteri.'],
    ['Una cassaforte','Password molto resistente.']
  ];

  function scorePassword(value){
    const p=String(value||'');
    if(!p) return 0;
    let score=0;
    if(p.length>=6) score++;
    if(p.length>=10) score++;
    if(/[a-z]/.test(p)&&/[A-Z]/.test(p)&&/\d/.test(p)) score++;
    if(p.length>=14 || /[^A-Za-z0-9]/.test(p)) score++;
    return Math.min(4,Math.max(1,score));
  }

  function updateStrength(input,card){
    if(!input||!card) return;
    const score=scorePassword(input.value);
    card.dataset.strength=String(score);
    const visual=card.querySelector('[data-strength-visual]');
    const title=card.querySelector('[data-strength-title]');
    const copy=card.querySelector('[data-strength-copy]');
    if(visual) visual.innerHTML=ICONS[score];
    if(title) title.textContent=LEVELS[score][0];
    if(copy) copy.textContent=LEVELS[score][1];
  }

  function init(){
    const switcher=document.querySelector('[data-auth-switcher]');
    if(!switcher) return;
    const initial=(document.body.dataset.authMode||'login')==='register'?'register':'login';
    const setMode=(mode,{focus=true}={})=>{
      const register=mode==='register';
      switcher.classList.toggle('is-register',register);
      switcher.classList.toggle('is-login',!register);
      document.body.dataset.authMode=register?'register':'login';
      if(focus){
        const target=document.querySelector(register?'#reg-name':'#login-email');
        setTimeout(()=>target?.focus(),360);
      }
    };
    setMode(initial,{focus:false});
    document.querySelectorAll('[data-show-register]').forEach(btn=>btn.addEventListener('click',()=>setMode('register')));
    document.querySelectorAll('[data-show-login]').forEach(btn=>btn.addEventListener('click',()=>setMode('login')));

    const loginForm=document.getElementById('loginForm');
    loginForm?.addEventListener('submit',async event=>{
      event.preventDefault();
      const error=document.getElementById('login-error'); error.textContent='';
      try{
        await loginUser(document.getElementById('login-email').value,document.getElementById('login-password').value);
        location.href='scelta-lega.html';
      }catch(err){error.textContent=err.message||'Accesso non riuscito.';}
    });

    document.querySelector('[data-forgot]')?.addEventListener('click',()=>{
      const error=document.getElementById('login-error');
      if(error) error.textContent='Il recupero via email richiede un backend. In questa versione i profili sono salvati solo nel browser.';
    });

    const regForm=document.getElementById('regForm');
    const pass=document.getElementById('reg-password');
    const confirm=document.getElementById('reg-confirm');
    const strength=document.querySelector('[data-strength-card]');
    const match=document.getElementById('matchHint');
    const updateMatch=()=>{
      updateStrength(pass,strength);
      if(!confirm?.value){match.textContent='Ripeti la password per confermarla.';match.className='password-match';return;}
      if(pass.value===confirm.value){match.textContent='✓ Le password coincidono';match.className='password-match ok';}
      else{match.textContent='Le password devono essere identiche.';match.className='password-match bad';}
    };
    pass?.addEventListener('input',updateMatch);
    confirm?.addEventListener('input',updateMatch);
    updateMatch();

    regForm?.addEventListener('submit',async event=>{
      event.preventDefault();
      const error=document.getElementById('reg-error'); error.textContent='';
      if(pass.value!==confirm.value){updateMatch();confirm.focus();error.textContent='Le password inserite sono diverse.';return;}
      try{
        await registerUser(document.getElementById('reg-name').value,document.getElementById('reg-email').value,pass.value,confirm.value);
        location.href='scelta-lega.html';
      }catch(err){error.textContent=err.message||'Registrazione non riuscita.';}
    });
  }
  document.addEventListener('DOMContentLoaded',init);
})();
