async function hashPassword(password){
  if(window.crypto?.subtle){ const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password)); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  return btoa(unescape(encodeURIComponent(password)));
}
async function registerUser(name,email,password,confirm){
  if(password!==confirm) throw new Error('Le password non coincidono.');
  if(password.length<6) throw new Error('La password deve avere almeno 6 caratteri.');
  const d=loadData(); if(d.users.some(u=>u.email.toLowerCase()===email.toLowerCase())) throw new Error('Email già registrata.');
  const user={id:uid('usr'),name,email:email.toLowerCase(),passwordHash:await hashPassword(password),avatar:''}; d.users.push(user); saveData(d); setSession({userId:user.id}); return user;
}
async function loginUser(email,password){ const d=loadData(); const u=d.users.find(x=>x.email.toLowerCase()===email.toLowerCase()); if(!u) throw new Error('Credenziali non valide.'); const ok=(await hashPassword(password))===u.passwordHash; if(!ok) throw new Error('Credenziali non valide.'); setSession({userId:u.id}); return u; }
function logout(){clearSession(); location.href='iniziale.html';}
function requireAuth(){ const s=getSession(); if(!s){location.href='login.html'; return null;} const d=loadData(); const u=d.users.find(x=>x.id===s.userId); if(!u){clearSession(); location.href='login.html'; return null;} return u; }
function currentLeague(userId){ const d=loadData(); return d.leagues.find(l=>l.members.includes(userId)) || null; }
function currentTeam(userId,leagueId){const d=loadData(); return d.teams.find(t=>t.ownerId===userId && t.leagueId===leagueId)||null;}
