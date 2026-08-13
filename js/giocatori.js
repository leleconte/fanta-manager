async function loadPlayers(){
  const d=loadData();
  if(d.players.length){
    let changed=false;
    d.players=d.players.map(p=>{
      const next={...p,available:p.available!==false};
      if(next.available!==p.available) changed=true;
      return next;
    });
    if(changed) saveData(d);
    return d.players;
  }
  try{
    const r=await fetch('data/giocatori.json', {cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const players=await r.json();
    d.players=Array.isArray(players)?players.map(p=>({...p,available:true})):[];
    saveData(d);
    return d.players;
  }catch(e){
    console.warn('L-STORE: impossibile caricare i giocatori.',e);
    return [];
  }
}
function filterPlayers(players,filters){return players.filter(p=>(!filters.q||p.name.toLowerCase().includes(filters.q.toLowerCase())||p.team.toLowerCase().includes(filters.q.toLowerCase()))&&(!filters.role||p.role===filters.role)&&(!filters.club||p.team===filters.club)&&(!filters.status||filters.status==='all'||(filters.status==='available'?p.available:!p.available)));}
