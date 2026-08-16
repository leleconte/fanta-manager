const LS_KEY = 'lstoreFantaManager';
const SESSION_KEY = 'lstoreFantaSession';
const CURRENT_LEAGUE_KEY = 'lstore_current_league';
const DATA_SCHEMA_VERSION = 3;

const defaultData = {
  schemaVersion: DATA_SCHEMA_VERSION,
  users: [], leagues: [], teams: [], players: [], auctions: [], bids: [], rosters: [],
  playerCatalogMeta: { version: 3, season: '2026/27', source: 'bundled', updatedAt: 0, count: 0 },
  settings: { theme: 'dark', tvMode: false }
};

function cloneDefaults(){
  return JSON.parse(JSON.stringify(defaultData));
}

function normalizeStoredData(parsed){
  const base = cloneDefaults();
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const normalized = {
    ...base,
    ...source,
    schemaVersion: DATA_SCHEMA_VERSION,
    users: Array.isArray(source.users) ? source.users : [],
    leagues: Array.isArray(source.leagues) ? source.leagues.map(l => ({ ...l, members: Array.isArray(l.members) ? l.members : [] })) : [],
    teams: Array.isArray(source.teams) ? source.teams.map(t => ({
      ...t,
      credits: Number.isFinite(Number(t.credits)) ? Number(t.credits) : 0,
      spent: Number.isFinite(Number(t.spent)) ? Number(t.spent) : 0,
      players: Array.isArray(t.players) ? t.players : []
    })) : [],
    players: Array.isArray(source.players) ? source.players.map(p => ({ ...p })) : [],
    auctions: Array.isArray(source.auctions) ? source.auctions : [],
    bids: Array.isArray(source.bids) ? source.bids : [],
    rosters: Array.isArray(source.rosters) ? source.rosters : [],
    playerCatalogMeta: { ...base.playerCatalogMeta, ...(source.playerCatalogMeta || {}) },
    settings: { ...base.settings, ...(source.settings || {}) }
  };

  // Migrazione legacy: ricostruisce i record roster dalle rose già salvate.
  const rosterKeys = new Set(normalized.rosters.map(r => `${r.teamId}:${r.playerId}`));
  normalized.teams.forEach(team => {
    team.players.forEach(playerId => {
      const key = `${team.id}:${playerId}`;
      if (rosterKeys.has(key)) return;
      const player = normalized.players.find(p => String(p.id) === String(playerId));
      normalized.rosters.push({
        teamId: team.id,
        playerId,
        price: Number(player?.price || 0),
        at: Number(player?.acquiredAt || 0) || Date.now()
      });
      rosterKeys.add(key);
    });
  });

  normalized.playerCatalogMeta.count = normalized.players.length;
  return normalized;
}

function loadData(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return cloneDefaults();
    return normalizeStoredData(JSON.parse(raw));
  }catch(error){
    console.warn('L-STORE: impossibile leggere i dati locali, ripristino archivio.', error);
    return cloneDefaults();
  }
}

function saveData(data){
  try{
    const normalized = normalizeStoredData(data);
    localStorage.setItem(LS_KEY, JSON.stringify(normalized));
    broadcastUpdate();
    return true;
  }catch(error){
    console.error('L-STORE saveData:', error);
    throw new Error('Impossibile salvare i dati nel browser. Controlla lo spazio disponibile o le impostazioni di privacy.');
  }
}

function updateData(mutator){
  const d=loadData();
  mutator(d);
  saveData(d);
  return d;
}

function getSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null;}
}
function setSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
function getCurrentLeagueId(){ return localStorage.getItem(CURRENT_LEAGUE_KEY) || ''; }
function setCurrentLeagueId(leagueId){
  if(leagueId) localStorage.setItem(CURRENT_LEAGUE_KEY, String(leagueId));
  else localStorage.removeItem(CURRENT_LEAGUE_KEY);
}

function uid(prefix='id'){ return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function code(prefix='FANTA'){ return prefix+'-'+Math.random().toString(36).slice(2,7).toUpperCase(); }
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function normalizeText(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function sameId(a,b){ return String(a ?? '') === String(b ?? ''); }

function getLeagueTeamIds(data, leagueId){
  return new Set((data.teams || []).filter(t => sameId(t.leagueId, leagueId)).map(t => String(t.id)));
}
function isPlayerAcquiredInLeague(data, playerId, leagueId){
  const teamIds = getLeagueTeamIds(data, leagueId);
  if ((data.rosters || []).some(r => teamIds.has(String(r.teamId)) && sameId(r.playerId, playerId))) return true;
  return (data.teams || []).some(t => sameId(t.leagueId, leagueId) && (t.players || []).some(id => sameId(id, playerId)));
}
function isPlayerAvailableInLeague(data, playerId, leagueId){
  return !isPlayerAcquiredInLeague(data, playerId, leagueId);
}
function playerAcquisitionInLeague(data, playerId, leagueId){
  const teamIds = getLeagueTeamIds(data, leagueId);
  const roster = [...(data.rosters || [])].reverse().find(r => teamIds.has(String(r.teamId)) && sameId(r.playerId, playerId));
  if (!roster) return null;
  return { ...roster, team: (data.teams || []).find(t => sameId(t.id, roster.teamId)) || null };
}

let LSTORE_CHANNEL = null;
try{
  if(typeof BroadcastChannel !== 'undefined'){
    LSTORE_CHANNEL = new BroadcastChannel('lstore-fanta-manager');
    LSTORE_CHANNEL.onmessage = ()=>window.dispatchEvent(new Event('app:update'));
  }
}catch(error){ LSTORE_CHANNEL = null; }
window.addEventListener('storage', e=>{
  if(e.key===LS_KEY || e.key===CURRENT_LEAGUE_KEY) window.dispatchEvent(new Event('app:update'));
});
function broadcastUpdate(){ try{ if(LSTORE_CHANNEL) LSTORE_CHANNEL.postMessage({type:'data:update',at:Date.now()}); }catch(e){} }
