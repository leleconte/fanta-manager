function createLeague(userId,{name,logo,maxParticipants,credits,timer,rules}){
  const cleanName = String(name ?? '').trim();
  const max = Number.parseInt(maxParticipants,10);
  const startingCredits = Number.parseInt(credits,10);
  const auctionTimer = Number.parseInt(timer,10);
  if(!userId) throw new Error('Sessione non valida. Effettua nuovamente il login.');
  if(!cleanName) throw new Error('Inserisci il nome della lega.');
  if(!Number.isInteger(max) || max < 2 || max > 32) throw new Error('I partecipanti devono essere tra 2 e 32.');
  if(!Number.isInteger(startingCredits) || startingCredits < 50) throw new Error('I crediti iniziali devono essere almeno 50.');
  if(![10,20,30,45,60].includes(auctionTimer)) throw new Error('Durata timer non valida.');
  const d = loadData();
  if(!d.users.some(u=>sameId(u.id,userId))) throw new Error('Utente non trovato nel browser. Effettua nuovamente il login.');
  const league={
    id:uid('lg'), name:cleanName, logo:logo||'', code:code(), maxParticipants:max,
    initialCredits:startingCredits, timer:auctionTimer, rules:String(rules||'').trim(),
    ownerId:userId, members:[userId], createdAt:Date.now()
  };
  d.leagues.push(league);
  saveData(d);
  setCurrentLeagueId(league.id);
  return league;
}
function joinLeague(userId,joinCode){
  const d=loadData(); const normalized=String(joinCode||'').trim().toUpperCase();
  if(!normalized) throw new Error('Inserisci il codice della lega.');
  const l=d.leagues.find(x=>String(x.code).toUpperCase()===normalized);
  if(!l) throw new Error('Codice lega non trovato in questo archivio.');
  l.members=Array.isArray(l.members)?l.members:[];
  if(l.members.some(id=>sameId(id,userId))){setCurrentLeagueId(l.id);return l;}
  if(l.members.length>=Number(l.maxParticipants||0)) throw new Error('La lega è piena.');
  l.members.push(userId); saveData(d); setCurrentLeagueId(l.id); return l;
}
function updateLeague(leagueId,patch){updateData(d=>{const l=d.leagues.find(x=>sameId(x.id,leagueId));if(l)Object.assign(l,patch);});}
