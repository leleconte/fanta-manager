const LS_KEY = 'lstoreFantaManager';
const SESSION_KEY = 'lstoreFantaSession';
const defaultData = { users: [], leagues: [], teams: [], players: [], auctions: [], bids: [], rosters: [], settings: { theme: 'dark', tvMode: false } };
function loadData(){ try { const raw=localStorage.getItem(LS_KEY); return raw? {...structuredClone(defaultData),...JSON.parse(raw)}:structuredClone(defaultData);} catch(e){ return structuredClone(defaultData);} }
function saveData(data){ localStorage.setItem(LS_KEY, JSON.stringify(data)); }
function updateData(mutator){ const d=loadData(); mutator(d); saveData(d); window.dispatchEvent(new StorageEvent('storage',{key:LS_KEY,newValue:JSON.stringify(d)})); return d; }
function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null;} }
function setSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession(){localStorage.removeItem(SESSION_KEY);}
function uid(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function code(prefix='FANTA'){return prefix+'-'+Math.random().toString(36).slice(2,7).toUpperCase()}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

const LSTORE_CHANNEL = ('BroadcastChannel' in window) ? new BroadcastChannel('lstore-fanta-manager') : null;
if(LSTORE_CHANNEL){ LSTORE_CHANNEL.onmessage = ()=>window.dispatchEvent(new Event('app:update')); }
window.addEventListener('storage', e=>{ if(e.key===LS_KEY) window.dispatchEvent(new Event('app:update')); });
function broadcastUpdate(){ try{LSTORE_CHANNEL?.postMessage({type:'data:update'});}catch(e){} }
const _saveData = saveData; saveData = function(data){ _saveData(data); broadcastUpdate(); };
