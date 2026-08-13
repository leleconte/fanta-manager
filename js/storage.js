const LS_KEY = 'lstoreFantaManager';
const SESSION_KEY = 'lstoreFantaSession';
const defaultData = {
  users: [], leagues: [], teams: [], players: [], auctions: [], bids: [], rosters: [],
  settings: { theme: 'dark', tvMode: false }
};

function cloneDefaults(){
  return JSON.parse(JSON.stringify(defaultData));
}
function loadData(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaults(),
      ...parsed,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      leagues: Array.isArray(parsed.leagues) ? parsed.leagues : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      auctions: Array.isArray(parsed.auctions) ? parsed.auctions : [],
      bids: Array.isArray(parsed.bids) ? parsed.bids : [],
      rosters: Array.isArray(parsed.rosters) ? parsed.rosters : [],
      settings: { ...cloneDefaults().settings, ...(parsed.settings || {}) }
    };
  }catch(error){
    console.warn('L-STORE: impossibile leggere i dati locali, ripristino archivio.', error);
    return cloneDefaults();
  }
}
function saveData(data){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    broadcastUpdate();
    return true;
  }catch(error){
    console.error(error);
    throw new Error('Impossibile salvare i dati nel browser. Controlla lo spazio disponibile o le impostazioni di privacy.');
  }
}
function updateData(mutator){ const d=loadData(); mutator(d); saveData(d); return d; }
function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null;} }
function setSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
function uid(prefix='id'){ return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function code(prefix='FANTA'){ return prefix+'-'+Math.random().toString(36).slice(2,7).toUpperCase(); }
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

let LSTORE_CHANNEL = null;
try{
  if(typeof BroadcastChannel !== 'undefined'){
    LSTORE_CHANNEL = new BroadcastChannel('lstore-fanta-manager');
    LSTORE_CHANNEL.onmessage = ()=>window.dispatchEvent(new Event('app:update'));
  }
}catch(error){ LSTORE_CHANNEL = null; }
window.addEventListener('storage', e=>{ if(e.key===LS_KEY) window.dispatchEvent(new Event('app:update')); });
function broadcastUpdate(){ try{ if(LSTORE_CHANNEL) LSTORE_CHANNEL.postMessage({type:'data:update'}); }catch(e){} }
