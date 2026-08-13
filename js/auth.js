async function hashPassword(password){
  const value=String(password??'');
  if(globalThis.crypto && crypto.subtle && typeof TextEncoder!=='undefined'){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}
function normalizeEmail(email){return String(email??'').trim().toLowerCase();}
async function registerUser(name,email,password,confirm){
  const cleanName=String(name??'').trim(), cleanEmail=normalizeEmail(email);
  const firstPassword=String(password??''), secondPassword=String(confirm??'');
  if(!cleanName) throw new Error('Inserisci il tuo nome.');
  if(!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Inserisci un indirizzo email valido.');
  if(firstPassword.length<6) throw new Error('La password deve avere almeno 6 caratteri.');
  if(firstPassword!==secondPassword) throw new Error('Le password non coincidono.');
  const d=loadData();
  if(d.users.some(u=>normalizeEmail(u.email)===cleanEmail)) throw new Error('Email già registrata.');
  const user={id:uid('usr'),name:cleanName,email:cleanEmail,passwordHash:await hashPassword(firstPassword),avatar:''};
  d.users.push(user); saveData(d); setSession({userId:user.id}); return user;
}
async function loginUser(email,password){
  const cleanEmail=normalizeEmail(email), enteredPassword=String(password??''), d=loadData();
  const u=d.users.find(x=>normalizeEmail(x.email)===cleanEmail);
  if(!u) throw new Error('Credenziali non valide.');
  if((await hashPassword(enteredPassword))!==u.passwordHash) throw new Error('Credenziali non valide.');
  setSession({userId:u.id}); return u;
}
function logout(){clearSession();location.href='iniziale.html';}
function requireAuth(){
  const s=getSession(); if(!s){location.href='login.html';return null;}
  const u=loadData().users.find(x=>x.id===s.userId);
  if(!u){clearSession();location.href='login.html';return null;} return u;
}
function currentLeague(userId){return loadData().leagues.find(l=>l.members.includes(userId))||null;}
function currentTeam(userId,leagueId){return loadData().teams.find(t=>t.ownerId===userId&&t.leagueId===leagueId)||null;}
