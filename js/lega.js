function createLeague(userId,{name,logo,maxParticipants,credits,timer,rules}){
  const cleanName=String(name||'').trim();
  const max=Number(maxParticipants); const startingCredits=Number(credits); const auctionTimer=Number(timer);
  if(!cleanName) throw new Error('Inserisci il nome della lega.');
  if(!Number.isInteger(max)||max<2||max>32) throw new Error('I partecipanti devono essere tra 2 e 32.');
  if(!Number.isInteger(startingCredits)||startingCredits<50) throw new Error('I crediti iniziali devono essere almeno 50.');
  if(![10,20,30,45,60].includes(auctionTimer)) throw new Error('Durata timer non valida.');
  const d=loadData();
  const league={id:uid('lg'),name:cleanName,logo:logo||'',code:code(),maxParticipants:max,initialCredits:startingCredits,timer:auctionTimer,rules:String(rules||'').trim(),ownerId:userId,members:[userId],createdAt:Date.now()};
  d.leagues.push(league); saveData(d); return league;
}
function joinLeague(userId,joinCode){const d=loadData();const normalized=String(joinCode||'').trim().toUpperCase();const l=d.leagues.find(x=>String(x.code).toUpperCase()===normalized);if(!l)throw new Error('Codice lega non trovato.');if(l.members.includes(userId))throw new Error('Sei già membro di questa lega.');if(l.members.length>=l.maxParticipants)throw new Error('La lega è piena.');l.members.push(userId);saveData(d);return l;}
function updateLeague(leagueId,patch){updateData(d=>{const l=d.leagues.find(x=>x.id===leagueId);if(l)Object.assign(l,patch);});}
