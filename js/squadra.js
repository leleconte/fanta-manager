function createTeam(userId,leagueId,{name,abbr,logo}){
  const cleanName=String(name||'').trim();
  const cleanAbbr=String(abbr||'').trim().toUpperCase().slice(0,4);
  if(!cleanName) throw new Error('Inserisci il nome della squadra.');
  if(cleanAbbr.length<2) throw new Error('Inserisci un’abbreviazione di almeno 2 caratteri.');
  const d=loadData();
  const l=d.leagues.find(x=>sameId(x.id,leagueId));
  if(!l) throw new Error('Lega non trovata.');
  if(!Array.isArray(l.members)||!l.members.some(id=>sameId(id,userId))) throw new Error('Non sei membro di questa lega.');
  const duplicate=d.teams.find(x=>sameId(x.leagueId,leagueId)&&!sameId(x.ownerId,userId)&&normalizeText(x.name)===normalizeText(cleanName));
  if(duplicate) throw new Error('Esiste già una squadra con questo nome nella lega.');
  let t=d.teams.find(x=>sameId(x.ownerId,userId)&&sameId(x.leagueId,leagueId));
  if(t){Object.assign(t,{name:cleanName,abbr:cleanAbbr,logo:logo||t.logo||''});}
  else{t={id:uid('tm'),leagueId:l.id,ownerId:userId,name:cleanName,abbr:cleanAbbr,logo:logo||'',credits:Number(l.initialCredits||0),spent:0,players:[],createdAt:Date.now()};d.teams.push(t);}
  saveData(d);return t;
}
function teamFor(userId,leagueId){return currentTeam(userId,leagueId)}
