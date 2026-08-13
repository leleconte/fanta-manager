async function hashPassword(password){
  const value = String(password ?? '');
  if(window.crypto?.subtle){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}

function normalizeEmail(email){
  return String(email ?? '').trim().toLowerCase();
}

async function registerUser(name,email,password,confirm){
  const cleanName = String(name ?? '').trim();
  const cleanEmail = normalizeEmail(email);
  const firstPassword = String(password ?? '');
  const secondPassword = String(confirm ?? '');

  if(!cleanName) throw new Error('Inserisci il tuo nome.');
  if(!cleanEmail) throw new Error('Inserisci un indirizzo email.');
  if(firstPassword !== secondPassword) throw new Error('Le password non coincidono.');
  if(firstPassword.length < 6) throw new Error('La password deve avere almeno 6 caratteri.');

  const d = loadData();
  if(d.users.some(u => normalizeEmail(u.email) === cleanEmail)) throw new Error('Email già registrata.');

  const user = {
    id: uid('usr'),
    name: cleanName,
    email: cleanEmail,
    passwordHash: await hashPassword(firstPassword),
    avatar: ''
  };

  d.users.push(user);
  saveData(d);
  setSession({userId:user.id});
  return user;
}

async function loginUser(email,password){
  const cleanEmail = normalizeEmail(email);
  const enteredPassword = String(password ?? '');
  const d = loadData();
  const u = d.users.find(x => normalizeEmail(x.email) === cleanEmail);
  if(!u) throw new Error('Credenziali non valide.');
  const ok = (await hashPassword(enteredPassword)) === u.passwordHash;
  if(!ok) throw new Error('Credenziali non valide.');
  setSession({userId:u.id});
  return u;
}

function logout(){clearSession(); location.href='iniziale.html';}
function requireAuth(){
  const s = getSession();
  if(!s){ location.href='login.html'; return null; }
  const d = loadData();
  const u = d.users.find(x=>x.id===s.userId);
  if(!u){ clearSession(); location.href='login.html'; return null; }
  return u;
}
function currentLeague(userId){ const d=loadData(); return d.leagues.find(l=>l.members.includes(userId)) || null; }
function currentTeam(userId,leagueId){ const d=loadData(); return d.teams.find(t=>t.ownerId===userId && t.leagueId===leagueId)||null; }
