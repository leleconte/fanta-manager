const PLAYER_CATALOG_SEASON = '2026/27';
const PLAYER_CATALOG_MAX_AGE = 3 * 60 * 60 * 1000;
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

const SERIE_A_2026_27 = [
  ['Atalanta','2026–27 Atalanta BC season'],
  ['Bologna','2026–27 Bologna FC 1909 season'],
  ['Cagliari','2026–27 Cagliari Calcio season'],
  ['Como','2026–27 Como 1907 season'],
  ['Fiorentina','2026–27 ACF Fiorentina season'],
  ['Frosinone','2026–27 Frosinone Calcio season'],
  ['Genoa','2026–27 Genoa CFC season'],
  ['Inter','2026–27 Inter Milan season'],
  ['Juventus','2026–27 Juventus FC season'],
  ['Lazio','2026–27 SS Lazio season'],
  ['Lecce','2026–27 US Lecce season'],
  ['Milan','2026–27 AC Milan season'],
  ['Monza','2026–27 AC Monza season'],
  ['Napoli','2026–27 SSC Napoli season'],
  ['Parma','2026–27 Parma Calcio 1913 season'],
  ['Roma','2026–27 AS Roma season'],
  ['Sassuolo','2026–27 US Sassuolo Calcio season'],
  ['Torino','2026–27 Torino FC season'],
  ['Udinese','2026–27 Udinese Calcio season'],
  ['Venezia','2026–27 Venezia FC season']
];

function playerRoleFromPosition(position=''){
  const value=String(position).toUpperCase().replace(/\s+/g,' ');
  if(/\bGK\b|GOALKEEP/.test(value)) return 'POR';
  if(/\b(CB|LB|RB|LWB|RWB|DF)\b|DEFEN/.test(value)) return 'DIF';
  if(/\b(ST|CF|FW|LW|RW|SS)\b|FORWARD|STRIKER|WINGER/.test(value)) return 'ATT';
  return 'CEN';
}

function stablePlayerId(name=''){
  const slug=normalizeText(name).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);
  return `pl_${slug || Math.random().toString(36).slice(2,10)}`;
}

function normalizePlayerRecord(player, fallbackTeam=''){
  const name=String(player?.name||'').replace(/\[[^\]]+\]/g,'').trim();
  const team=String(player?.team||fallbackTeam||'').trim();
  const role=['POR','DIF','CEN','ATT'].includes(player?.role) ? player.role : playerRoleFromPosition(player?.position||'');
  if(!name || !team) return null;
  return {
    id: String(player.id || stablePlayerId(name)),
    name,
    team,
    role,
    position: String(player.position||role).trim(),
    photo: String(player.photo||''),
    source: String(player.source||'local'),
    sourcePage: String(player.sourcePage||'')
  };
}

function dedupePlayers(players){
  const byKey=new Map();
  players.forEach(raw=>{
    const player=normalizePlayerRecord(raw);
    if(!player) return;
    const key=normalizeText(player.name);
    const previous=byKey.get(key);
    // Preferisce il record remoto più recente ma conserva campi utili già presenti.
    if(!previous){ byKey.set(key,player); return; }
    const incomingRemote=player.source==='wikipedia';
    const currentRemote=previous.source==='wikipedia';
    if(incomingRemote || !currentRemote){
      byKey.set(key,{...previous,...player,id:previous.id||player.id,photo:player.photo||previous.photo||''});
    }
  });
  return [...byKey.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
}

function preserveExistingPlayerIds(existing, incoming){
  const idByName=new Map(existing.map(p=>[normalizeText(p.name),String(p.id)]));
  return incoming.map(p=>({...p,id:idByName.get(normalizeText(p.name))||p.id||stablePlayerId(p.name)}));
}

function mergePlayerCatalog(existing, incoming){
  const old=Array.isArray(existing)?existing:[];
  const next=preserveExistingPlayerIds(old,dedupePlayers(incoming));
  const nextNames=new Set(next.map(p=>normalizeText(p.name)));
  // Conserva eventuali giocatori legacy acquistati che non risultano più nella fonte remota.
  old.forEach(p=>{
    const used=normalizeText(p.name);
    if(!used || nextNames.has(used)) return;
    next.push({...p,source:p.source||'legacy'});
  });
  return dedupePlayers(next);
}

async function fetchWithTimeout(url,timeout=9000){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeout):null;
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller?.signal});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }finally{
    if(timer) clearTimeout(timer);
  }
}

async function resolveWikipediaPage(team,pageTitle){
  const directUrl=`${WIKIPEDIA_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&origin=*`;
  try{
    const response=await fetchWithTimeout(directUrl);
    const json=await response.json();
    if(json?.parse?.text?.['*']) return {title:json.parse.title||pageTitle,html:json.parse.text['*']};
  }catch(error){ /* fallback ricerca */ }

  const query=`intitle:"2026–27" ${team} season`;
  const searchUrl=`${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
  const searchResponse=await fetchWithTimeout(searchUrl);
  const searchJson=await searchResponse.json();
  const hit=(searchJson?.query?.search||[]).find(x=>/2026.?27/i.test(x.title)&&/season/i.test(x.title));
  if(!hit) throw new Error(`Pagina squadra non trovata: ${team}`);
  const parsedUrl=`${WIKIPEDIA_API}?action=parse&page=${encodeURIComponent(hit.title)}&prop=text&format=json&origin=*`;
  const parsedResponse=await fetchWithTimeout(parsedUrl);
  const parsedJson=await parsedResponse.json();
  if(!parsedJson?.parse?.text?.['*']) throw new Error(`Rosa non disponibile: ${team}`);
  return {title:parsedJson.parse.title||hit.title,html:parsedJson.parse.text['*']};
}

function parseWikipediaSquad(team,pageTitle,html){
  if(typeof DOMParser==='undefined') return [];
  const doc=new DOMParser().parseFromString(html,'text/html');
  const tables=[...doc.querySelectorAll('table.wikitable')];
  const out=[];
  tables.forEach(table=>{
    const rows=[...table.querySelectorAll('tr')];
    let headerIndex=-1, playerIndex=-1, positionIndex=-1;
    for(let i=0;i<rows.length;i++){
      const cells=[...rows[i].querySelectorAll(':scope > th, :scope > td')];
      const labels=cells.map(c=>normalizeText(c.textContent));
      const pIdx=labels.findIndex(v=>v==='player'||v.includes('player'));
      const posIdx=labels.findIndex(v=>v.startsWith('position')||v==='pos.');
      if(pIdx>=0&&posIdx>=0){headerIndex=i;playerIndex=pIdx;positionIndex=posIdx;break;}
    }
    if(headerIndex<0) return;
    rows.slice(headerIndex+1).forEach(row=>{
      const cells=[...row.querySelectorAll(':scope > th, :scope > td')];
      if(cells.length<=Math.max(playerIndex,positionIndex)) return;
      const playerCell=cells[playerIndex];
      const positionCell=cells[positionIndex];
      let name=String(playerCell?.textContent||'').replace(/\[[^\]]+\]/g,'').trim();
      const position=String(positionCell?.textContent||'').replace(/\[[^\]]+\]/g,'').trim();
      if(!name||name.length<2||!position) return;
      // Esclude righe intestazione o note ripetute.
      if(/player|squad information|on loan/i.test(name)) return;
      const anchor=[...playerCell.querySelectorAll('a[href*="/wiki/"]')].find(a=>String(a.textContent||'').trim().length>1);
      if(anchor) name=String(anchor.textContent||name).trim();
      out.push({
        id:stablePlayerId(name),name,team,role:playerRoleFromPosition(position),position,
        photo:'',source:'wikipedia',sourcePage:pageTitle
      });
    });
  });
  return dedupePlayers(out);
}

async function fetchTeamSquad(team,pageTitle){
  const page=await resolveWikipediaPage(team,pageTitle);
  const players=parseWikipediaSquad(team,page.title,page.html);
  if(!players.length) throw new Error(`Nessun giocatore letto per ${team}`);
  return players;
}

async function syncPlayerCatalog({onProgress}={}){
  const all=[];
  const failures=[];
  const queue=[...SERIE_A_2026_27];
  let completed=0;
  const worker=async()=>{
    while(queue.length){
      const [team,pageTitle]=queue.shift();
      try{ all.push(...await fetchTeamSquad(team,pageTitle)); }
      catch(error){ failures.push({team,error:error?.message||String(error)}); }
      completed++;
      if(typeof onProgress==='function') onProgress({completed,total:SERIE_A_2026_27.length,team,count:all.length,failures:failures.length});
    }
  };
  await Promise.all(Array.from({length:Math.min(5,SERIE_A_2026_27.length)},()=>worker()));
  const players=dedupePlayers(all);
  if(players.length<80) throw new Error(`Aggiornamento incompleto: trovati solo ${players.length} giocatori.`);
  return {players,failures};
}

async function loadBundledPlayers(){
  try{
    const response=await fetch('data/giocatori.json',{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const json=await response.json();
    const list=Array.isArray(json)?json:(Array.isArray(json?.players)?json.players:[]);
    return dedupePlayers(list.map(p=>({...p,source:p.source||'bundled'})));
  }catch(error){
    console.warn('L-STORE: impossibile caricare il catalogo locale.',error);
    return [];
  }
}

async function loadPlayers(options={}){
  const {forceRefresh=false,refreshIfStale=true,onProgress} = options;
  let data=loadData();
  if(!data.players.length){
    const bundled=await loadBundledPlayers();
    if(bundled.length){
      data.players=mergePlayerCatalog(data.players,bundled);
      data.playerCatalogMeta={version:3,season:PLAYER_CATALOG_SEASON,source:'bundled',updatedAt:0,count:data.players.length};
      saveData(data);
    }
  }

  const meta=data.playerCatalogMeta||{};
  const stale=Number(meta.version)!==3||!Number(meta.updatedAt)||Date.now()-Number(meta.updatedAt)>PLAYER_CATALOG_MAX_AGE||meta.season!==PLAYER_CATALOG_SEASON||data.players.length<100;
  if(forceRefresh || (refreshIfStale&&stale)){
    try{
      const remote=await syncPlayerCatalog({onProgress});
      data=loadData();
      const currentNames=new Set(remote.players.map(p=>normalizeText(p.name)));
      const acquiredIds=new Set([
        ...(data.rosters||[]).map(r=>String(r.playerId)),
        ...(data.teams||[]).flatMap(t=>(t.players||[]).map(id=>String(id)))
      ]);
      data.players=mergePlayerCatalog(data.players,remote.players).filter(p=>currentNames.has(normalizeText(p.name))||acquiredIds.has(String(p.id)));
      data.playerCatalogMeta={
        version:3,season:PLAYER_CATALOG_SEASON,source:'Wikipedia live squad pages · clubs Lega Serie A 2026/27',updatedAt:Date.now(),count:data.players.length,
        failedTeams:remote.failures.map(x=>x.team)
      };
      saveData(data);
    }catch(error){
      console.warn('L-STORE: aggiornamento remoto giocatori non riuscito, uso cache locale.',error);
      if(forceRefresh) throw error;
    }
  }
  return loadData().players;
}

function playerViewForLeague(player,data,leagueId){
  const acquisition=playerAcquisitionInLeague(data,player.id,leagueId);
  return {
    ...player,
    available:!acquisition,
    price:acquisition?.price ?? null,
    acquiredBy:acquisition?.team?.name || ''
  };
}

function playersForLeague(players,leagueId,data=loadData()){
  return (players||[]).map(p=>playerViewForLeague(p,data,leagueId));
}

function filterPlayers(players,filters){
  const q=normalizeText(filters?.q||'');
  return (players||[]).filter(p=>{
    const haystack=`${normalizeText(p.name)} ${normalizeText(p.team)} ${normalizeText(p.role)} ${normalizeText(p.position)}`;
    return (!q||haystack.includes(q))&&(!filters?.role||p.role===filters.role)&&(!filters?.club||p.team===filters.club)&&(!filters?.status||filters.status==='all'||(filters.status==='available'?p.available:!p.available));
  });
}
