(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, Math.min(2, devicePixelRatio || 1));

  const drinks = [
    {name:'Berry',   color:'#b51f44', rim:'#ff8aa5', glass:'#ffdae5'},
    {name:'Lime',    color:'#68c94b', rim:'#caff8c', glass:'#e3ffd2'},
    {name:'Orange',  color:'#ff9e25', rim:'#ffd66f', glass:'#fff1c7'},
    {name:'Blue',    color:'#39a8ff', rim:'#9decff', glass:'#d9f7ff'},
    {name:'Grape',   color:'#9a43d7', rim:'#e0a5ff', glass:'#f3dcff'},
    {name:'Float',   color:'#ff6f35', rim:'#fff2b2', glass:'#fff0df'},
    {name:'Parfait', color:'#ffcc3d', rim:'#ff6a7d', glass:'#fff6d5'},
    {name:'Tropical',color:'#ff7bbd', rim:'#ffe27a', glass:'#ffe2ef'},
    {name:'Tower',   color:'#27d2b5', rim:'#fff',    glass:'#dffff8'},
    {name:'Royal',   color:'#ffd84d', rim:'#fff',    glass:'#fff9c8'}
  ];

  const testOrders = new URLSearchParams(location.search).get('test') === 'orders';

  const state = {
    w: 0, h: 0, portrait: true, coins: 0, displayCoins: 0,
    items: [], particles: [], floating: [], current: null,
    seq: testOrders ? [0,0,1,1,0,0,1,1,2,2,2,2] : [], seqIndex:0, nextLvl:0, highestUnlocked:0,
    orders: testOrders ? [{lvl:1, reward:120, done:false}, {lvl:2, reward:180, done:false}] : [{lvl:5, reward:420, done:false}, {lvl:7, reward:620, done:false}],
    orderIndex:0, dragging:false, pointerX:0, handT:0, ended:false
  };

  const table = { leftBottom:0, rightBottom:0, leftTop:0, rightTop:0, bottom:0, top:0, launchY:0 };

  function resize(){
    const r = canvas.getBoundingClientRect();
    state.w = Math.max(1, r.width); state.h = Math.max(1, r.height); state.portrait = true;
    canvas.width = Math.floor(state.w * DPR); canvas.height = Math.floor(state.h * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    layoutTable();
    if(state.current) placeCurrent(state.current, false);
  }
  addEventListener('resize', resize);

  function layoutTable(){
    const w=state.w,h=state.h, p=state.portrait;
    // Locked to the original playable's vertical phone composition.
    table.top = h*0.305;
    table.bottom = h*0.865;
    table.launchY = h*0.775;
    table.leftBottom = w*.085; table.rightBottom = w*.915;
    table.leftTop = w*.265; table.rightTop = w*.735;
  }

  function xBoundsAt(y){
    const t = clamp((y-table.top)/(table.bottom-table.top),0,1);
    return {
      l: lerp(table.leftTop, table.leftBottom, t),
      r: lerp(table.rightTop, table.rightBottom, t)
    };
  }
  function scaleAt(y){ return lerp(0.56, 1.12, clamp((y-table.top)/(table.bottom-table.top),0,1)); }
  function toLaneX(norm,y){ const b=xBoundsAt(y); return lerp(b.l,b.r,(norm+1)/2); }
  function normFromX(x,y){ const b=xBoundsAt(y); return clamp(((x-b.l)/(b.r-b.l))*2-1,-1,1); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function lerp(a,b,t){ return a+(b-a)*t; }

  function rollSpawnLevel(){
    if(testOrders) return state.seq[state.seqIndex++ % state.seq.length];
    // Strict merge-game spawn pool:
    // - Never direct-spawn level 3+ drinks.
    // - Level 2 only appears after enough progress, and stays rare.
    // - Any spawned level must be <= highest unlocked level - 2.
    const maxByProgress = clamp(state.highestUnlocked - 2, 0, 1);
    if(maxByProgress < 1) return 0;       // early game: only level 1
    return Math.random() < .90 ? 0 : 1;   // progressed pool: 90% level 1, 10% level 2
  }
  function spawnCurrent(){
    const lvl = state.nextLvl ?? rollSpawnLevel();
    state.nextLvl = rollSpawnLevel();
    const it = makeItem(lvl, 0, table.launchY, true);
    placeCurrent(it, true);
    state.items.push(it); state.current = it;
  }
  function placeCurrent(it, pop){
    it.x = toLaneX(0, table.launchY); it.y = table.launchY; it.vx=0; it.vy=0; it.active=false; it.aim=true; it.norm=0;
    it.radius = 25 * scaleAt(it.y) * (1 + it.lvl*0.035); if(pop) it.pop=1;
  }
  function makeItem(lvl,x,y,isCurrent=false){
    return { id:Math.random(), born:performance.now(), lvl, x, y, lockedX:x, lockedY:y, vx:0, vy:0, radius:30, active:!isCurrent, aim:isCurrent, norm:0, dead:false, frozen:false, mergeLock:0, spin:0, angle:0, pop:0 };
  }

  function pointerPos(e){
    const t=e.touches&&e.touches[0];
    const r=canvas.getBoundingClientRect();
    return {x:(t?t.clientX:e.clientX)-r.left, y:(t?t.clientY:e.clientY)-r.top};
  }
  function onDown(e){
    if(state.ended){ reset(); return; }
    const p=pointerPos(e); state.dragging=true; state.pointerX=p.x;
    if(state.current){ moveCurrent(p.x); state.current.pop=.25; }
    e.preventDefault();
  }
  function onMove(e){
    if(!state.dragging || !state.current) return; const p=pointerPos(e); moveCurrent(p.x); e.preventDefault();
  }
  function onUp(e){
    if(!state.dragging || !state.current) return; state.dragging=false;
    const it=state.current; it.aim=false; it.active=true;
    const impulse = 770 * scaleAt(it.y);
    it.vx = -it.norm * 210 + (Math.random()-.5)*34; // 更明显横向角度，减少中线堆叠
    it.vy = -impulse;           // 松手固定向前冲，不做蓄力重设计
    it.mergeLock = .18;
    state.current = null;
    setTimeout(() => { if(!state.current && !state.ended) spawnCurrent(); }, 420);
    e.preventDefault();
  }
  function moveCurrent(x){
    const it=state.current; it.norm = normFromX(x, table.launchY); it.x = toLaneX(it.norm, table.launchY);
  }
  canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove); addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, {passive:false}); canvas.addEventListener('touchmove', onMove,{passive:false}); addEventListener('touchend', onUp,{passive:false});

  function update(dt){
    state.handT += dt;
    state.displayCoins += (state.coins-state.displayCoins) * Math.min(1, dt*5);
    for(const it of state.items){
      if(it.dead) continue;
      it.mergeLock=Math.max(0,it.mergeLock-dt); it.pop=Math.max(0,it.pop-dt*4); it.angle = 0; it.spin = 0;
      if(it.frozen){
        if(it.mergeLock>0){
          // Newly merged cups are briefly pinned so they do not inherit merge momentum.
          it.x=it.lockedX; it.y=it.lockedY; it.vx=0; it.vy=0;
        } else {
          // After the lock window they become normal upright physical pieces again,
          // so later shots can push the whole cup cluster forward.
          it.frozen=false; it.active=true; it.vx=0; it.vy=0;
        }
      }
      if(it.active && !it.frozen){
        it.x += it.vx*dt; it.y += it.vy*dt;
        it.vx *= Math.pow(.10, dt); it.vy *= Math.pow(.18, dt);
        const b=xBoundsAt(it.y), r=it.radius*.72;
        if(it.x < b.l+r){ it.x=b.l+r; it.vx=Math.abs(it.vx)*.34; }
        if(it.x > b.r-r){ it.x=b.r-r; it.vx=-Math.abs(it.vx)*.34; }
        if(it.y < table.top+30){ it.y=table.top+30; it.vy=Math.abs(it.vy)*.26; }
        if(it.y > table.bottom-30){ it.y=table.bottom-30; it.vy=-Math.abs(it.vy)*.16; }
        if(Math.hypot(it.vx,it.vy)<8){ it.vx=0; it.vy=0; }
      }
      it.radius = 34 * scaleAt(it.y) * (1 + it.lvl*0.045);
    }
    collideAndMerge();
    // Keep all valid desk drinks. Items are removed only by merge/order completion
    // or by explicit safety cleanup if they become unrecoverably invalid.
    state.items = state.items.filter(i=>!i.dead && isItemRecoverable(i));
    for(const p of state.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=280*dt; p.life-=dt; p.a=Math.max(0,p.life/p.max); }
    state.particles=state.particles.filter(p=>p.life>0);
    for(const f of state.floating){ f.y-=35*dt; f.life-=dt; f.a=Math.max(0,f.life/f.max); }
    state.floating=state.floating.filter(f=>f.life>0);
  }

  function isItemRecoverable(it){
    if(!Number.isFinite(it.x)||!Number.isFinite(it.y)||!Number.isFinite(it.lvl)) return false;
    const margin=Math.max(state.w,state.h)*1.5;
    return it.x>-margin && it.x<state.w+margin && it.y>-margin && it.y<state.h+margin;
  }

  function collideAndMerge(){
    for(let i=0;i<state.items.length;i++) for(let j=i+1;j<state.items.length;j++){
      const a=state.items[i], b=state.items[j]; if(a.dead||b.dead||a.aim||b.aim) continue;
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy), touch=(a.radius+b.radius)*.82, mergeR=(a.radius+b.radius)*1.02;
      if(d>0 && a.lvl===b.lvl && a.lvl<9 && !a.mergeLock && !b.mergeLock && d<mergeR){
        const slow=Math.hypot(a.vx-b.vx,a.vy-b.vy)<520;
        if(slow || d<touch){
          merge(a,b); return;
        }
      }
      if(d>0 && d<touch){
        const nx=dx/d, ny=dy/d, push=(touch-d)*.42;
        if(a.frozen || b.frozen){
          // During the short post-merge lock, the merged cup stays pinned, but the
          // incoming cup keeps a damped shove instead of dying instantly.
          if(a.frozen && b.frozen) continue;
          const mover = a.frozen ? b : a;
          const dir = a.frozen ? 1 : -1;
          mover.x += nx*push*dir; mover.y += ny*push*dir;
          const vn = mover.vx*nx + mover.vy*ny;
          if(vn*dir < 0){
            mover.vx -= nx*vn*1.15;
            mover.vy -= ny*vn*1.15;
          }
          mover.vx *= .82; mover.vy *= .82;
        } else {
          a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
          const speedA=Math.hypot(a.vx,a.vy), speedB=Math.hypot(b.vx,b.vy);
          const shooter=speedA>=speedB?a:b, target=shooter===a?b:a;
          const transfer=clamp(Math.hypot(shooter.vx,shooter.vy)*.32,28,260);
          const forward=-1; // table far end is upward / smaller y
          target.vy += forward*transfer;
          target.vx += (Math.random()-.5)*58 + shooter.vx*.24;
          shooter.vy *= .72;
          shooter.vx = shooter.vx*.70 + (Math.random()-.5)*42;
          // Low-elasticity normal impulse keeps cups from penetrating while preserving shove chains.
          const rvx=target.vx-shooter.vx, rvy=target.vy-shooter.vy, rel=rvx*nx+rvy*ny;
          if(rel<0){
            const impulse=-(.62)*rel*.5;
            shooter.vx-=impulse*nx; shooter.vy-=impulse*ny;
            target.vx+=impulse*nx; target.vy+=impulse*ny;
          }
          shooter.vx*=.98; shooter.vy*=.98; target.vx*=.98; target.vy*=.98;
        }
      }
    }
  }
  function merge(a,b){
    const x=(a.x+b.x)/2, y=(a.y+b.y)/2, old=a.lvl, lvl=old+1;
    a.dead=b.dead=true; burst(x,y,drinks[lvl].color); addFloat(x,y,'合成升级');
    if(old===5) addCoins(300,x,y); if(old===6||old===7||old===8) addCoins(500,x,y);
    const n=makeItem(lvl,x,y);
    // Merge result must be born exactly at the contact midpoint and stay stable.
    // Do not inherit velocity, add bounce, or slide forward after merging.
    n.lockedX=x; n.lockedY=y;
    n.vx=0; n.vy=0; n.spin=0; n.angle=0; n.active=false; n.frozen=true; n.mergeLock=.22; n.pop=1;
    state.highestUnlocked = Math.max(state.highestUnlocked, lvl);
    state.items.push(n);
    const targetOrder=state.orders[state.orderIndex];
    if(targetOrder && lvl>=targetOrder.lvl) completeOrder(n);
    if(lvl>=9){ state.ended=true; addFloat(state.w/2,state.h*.45,'完成！点击重玩'); }
  }
  function completeOrder(item){
    const o=state.orders[state.orderIndex]; if(!o||o.done) return;
    o.done=true; addCoins(o.reward,item.x,item.y); addFloat(item.x,item.y,'订单完成 +' + o.reward);
    // Completing an order must not remove the drink from the table. Drinks only
    // disappear when they merge into a higher tier or become unrecoverably invalid.
    burst(item.x,item.y,'#ffe66d'); state.orderIndex++;
  }
  function addCoins(n,x,y){ state.coins+=n; for(let k=0;k<Math.min(8,n/100);k++) state.particles.push({x,y,vx:(Math.random()-.5)*220,vy:-160-Math.random()*120,life:.8+Math.random()*.4,max:1.1,a:1,type:'coin'}); }
  function addFloat(x,y,text){ state.floating.push({x,y,text,life:1.1,max:1.1,a:1}); }
  function burst(x,y,color){ for(let k=0;k<22;k++) state.particles.push({x,y,vx:(Math.random()-.5)*360,vy:(Math.random()-.8)*360,life:.55+Math.random()*.45,max:1,a:1,color,type:'spark'}); }

  function draw(){
    const w=state.w,h=state.h; ctx.clearRect(0,0,w,h);
    drawBeach(); drawTable(); drawHUD(); drawQueue();
    const items=[...state.items].sort((a,b)=>a.y-b.y);
    for(const it of items) drawItem(it);
    drawParticles(); drawFloating();
    if(state.ended) drawEnd();
  }
  function drawBeach(){
    const w=state.w,h=state.h;
    const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,'#74d9ff'); sky.addColorStop(.26,'#bdf5ff'); sky.addColorStop(.265,'#21b8da'); sky.addColorStop(.43,'#62d4e6'); sky.addColorStop(.435,'#ffe8b1'); sky.addColorStop(1,'#ffd999'); ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
    // distant islands, layered waves and sand shadows add scene depth.
    ctx.fillStyle='rgba(90,168,154,.20)';
    ctx.beginPath(); ctx.moveTo(0,h*.365); ctx.quadraticCurveTo(w*.18,h*.305,w*.38,h*.365); ctx.quadraticCurveTo(w*.55,h*.325,w*.72,h*.368); ctx.quadraticCurveTo(w*.86,h*.335,w,h*.366); ctx.lineTo(w,h*.405); ctx.lineTo(0,h*.405); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.72)'; for(let i=0;i<8;i++){ ctx.beginPath(); ctx.ellipse(w*(-.08+i*.17), h*.405+Math.sin(i*1.7)*8, 76, 7, 0,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='rgba(119,202,214,.17)'; for(let i=0;i<5;i++){ ctx.beginPath(); ctx.ellipse(w*(.08+i*.22), h*.455+Math.sin(i)*6, 92, 9, 0,0,Math.PI*2); ctx.fill(); }
    ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=2; ctx.lineCap='round'; for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(w*(.03+i*.24),h*(.485+i*.012)); ctx.bezierCurveTo(w*(.12+i*.24),h*(.468+i*.012),w*(.20+i*.24),h*(.498+i*.012),w*(.30+i*.24),h*(.482+i*.012)); ctx.stroke(); }
    ctx.fillStyle='rgba(177,122,74,.20)'; for(let i=0;i<18;i++){ ctx.beginPath(); ctx.ellipse((i*97)%w, h*(.60+(i%5)*.07), 13+(i%3)*5, 7+(i%2)*3, .5, 0, Math.PI*2); ctx.fill(); }
    drawIslandPalm(w*.035,h*.610,.70,-1);
    drawIslandPalm(w*.965,h*.610,.68,1);
    drawCanopy();
  }
  function drawIslandPalm(x,y,s,flip){
    ctx.save(); ctx.translate(x,y); ctx.scale(s*flip,s);
    // Background decoration: low saturation, partly outside frame, rooted in sand.
    ctx.save(); ctx.fillStyle='rgba(78,54,28,.20)'; ctx.beginPath(); ctx.ellipse(0,4,42,10,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(-.13);
    const trunk=ctx.createLinearGradient(-12,0,14,-220);
    trunk.addColorStop(0,'#704526'); trunk.addColorStop(.32,'#8f5d35'); trunk.addColorStop(.70,'#b17945'); trunk.addColorStop(1,'#c8945f');
    ctx.fillStyle=trunk;
    ctx.beginPath();
    ctx.moveTo(-12,0); ctx.bezierCurveTo(-8,-70,-6,-145,-8,-220);
    ctx.bezierCurveTo(-2,-231,12,-231,17,-220);
    ctx.bezierCurveTo(10,-146,14,-70,12,0);
    ctx.quadraticCurveTo(0,8,-12,0); ctx.fill();
    ctx.strokeStyle='rgba(62,38,21,.36)'; ctx.lineWidth=2;
    for(let i=0;i<12;i++){ const yy=-14-i*17; ctx.beginPath(); ctx.moveTo(-10+Math.sin(i)*2,yy+5); ctx.quadraticCurveTo(0,yy-2,12,yy+3); ctx.stroke(); }
    ctx.strokeStyle='rgba(255,216,156,.20)'; ctx.lineWidth=3.2; ctx.beginPath(); ctx.moveTo(6,-8); ctx.bezierCurveTo(8,-78,8,-150,5,-214); ctx.stroke();
    ctx.restore();

    ctx.save(); ctx.translate(2,-224);
    function palmLeaf(rot,len,color,alpha=1,bend=0){
      ctx.save(); ctx.rotate(rot); ctx.globalAlpha=alpha;
      const leaf=ctx.createLinearGradient(0,-20,len,8);
      leaf.addColorStop(0,color); leaf.addColorStop(.62,color); leaf.addColorStop(1,'rgba(45,101,60,.70)');
      ctx.fillStyle=leaf;
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(len*.18,-24+bend,len*.58,-34+bend*.2,len,-5);
      ctx.bezierCurveTo(len*.70,18+bend*.15,len*.24,18,0,0);
      ctx.fill();
      ctx.strokeStyle='rgba(31,91,49,.30)'; ctx.lineWidth=1.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(5,0); ctx.bezierCurveTo(len*.35,-13+bend*.25,len*.70,-13,len*.96,-4); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,210,.10)'; ctx.lineWidth=1;
      for(let k=3;k<8;k++){ const t=k/9, px=len*t, py=-Math.sin(t*Math.PI)*12; ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+10,py+8); ctx.stroke(); }
      ctx.restore();
    }
    const leaves=[[-2.25,70,'rgba(45,113,70,.68)',.38,-8],[-1.86,88,'rgba(55,131,75,.74)',.48,5],[-1.48,104,'rgba(68,145,82,.80)',.58,-4],[-1.10,116,'rgba(83,158,88,.84)',.68,6],[-.72,118,'rgba(78,150,84,.82)',.72,-5],[-.34,106,'rgba(68,137,78,.72)',.62,4],[.05,86,'rgba(54,118,70,.62)',.48,-2]];
    for(const l of leaves) palmLeaf(...l);
    ctx.globalAlpha=1;
    const crown=ctx.createRadialGradient(-4,-4,2,0,0,16); crown.addColorStop(0,'#6fb263'); crown.addColorStop(1,'#2e7542');
    ctx.fillStyle=crown; ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(105,65,35,.62)'; for(const [cx,cy,r] of [[-7,8,5],[2,11,5],[9,7,4]]){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
    // A thin sand lip hides the root so it feels planted instead of pasted.
    ctx.fillStyle='rgba(235,188,105,.35)'; ctx.beginPath(); ctx.ellipse(0,1,22,5,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawCanopy(){
    const w=state.w,h=state.h; ctx.save();
    const y=h*.024;
    // Solid wooden support reads as a real drink-stand beam, not a flat strip.
    const backBeam=ctx.createLinearGradient(0,y+h*.010,0,y+h*.064);
    backBeam.addColorStop(0,'#c48743'); backBeam.addColorStop(.45,'#8e5528'); backBeam.addColorStop(1,'#603516');
    ctx.fillStyle=backBeam; ctx.fillRect(-8,y+h*.030,w+16,h*.040);
    ctx.fillStyle='rgba(70,38,15,.28)'; ctx.fillRect(-8,y+h*.066,w+16,h*.014);
    ctx.strokeStyle='rgba(255,207,121,.28)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,y+h*.037); ctx.lineTo(w,y+h*.037); ctx.stroke();
    // short lashings / knots break the repeated texture feeling.
    ctx.strokeStyle='rgba(72,42,18,.26)'; ctx.lineWidth=2;
    for(let x=-10;x<w+20;x+=58){ ctx.beginPath(); ctx.moveTo(x,y+h*.031); ctx.quadraticCurveTo(x+15,y+h*.060,x+35,y+h*.034); ctx.stroke(); }

    function strawPatch(x0,row,wid,drop,tilt,alpha){
      const top=y+h*(.012+row*.025);
      const grad=ctx.createLinearGradient(0,top,0,top+drop);
      grad.addColorStop(0,'rgba(245,221,128,'+alpha+')');
      grad.addColorStop(.42,'rgba(198,165,72,'+(alpha*.96)+')');
      grad.addColorStop(1,'rgba(119,91,40,'+(alpha*.72)+')');
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.moveTo(x0,top);
      ctx.bezierCurveTo(x0+wid*.25+tilt,top+drop*.32,x0+wid*.42-tilt,top+drop*.76,x0+wid*.52,top+drop);
      ctx.bezierCurveTo(x0+wid*.70,top+drop*.70,x0+wid*.90,top+drop*.32,x0+wid,top+2);
      ctx.quadraticCurveTo(x0+wid*.48,top+drop*.12,x0,top); ctx.fill();
      // fine straw fibers inside each clump: natural, curved, irregular.
      ctx.strokeStyle='rgba(92,70,28,'+(alpha*.34)+')'; ctx.lineWidth=1;
      const fibers=3+(row%2);
      for(let k=1;k<=fibers;k++){
        const xx=x0+wid*(k/(fibers+1));
        ctx.beginPath(); ctx.moveTo(xx,top+2);
        ctx.bezierCurveTo(xx+tilt*.15,top+drop*.35,xx-tilt*.10,top+drop*.62,xx+Math.sin(k+x0)*4,top+drop*(.82+.04*(k%2)));
        ctx.stroke();
      }
    }
    // Back layer: broad soft thatch mass.
    ctx.globalAlpha=.72;
    for(let i=0;i<12;i++) strawPatch(-24+i*38,0,42+(i%3)*8,h*(.072+(i%4)*.010),Math.sin(i)*6,.58);
    // Middle and front layers: longer, denser, non-repeating clumps.
    ctx.globalAlpha=.88;
    for(let i=0;i<15;i++) strawPatch(-32+i*31,1,34+(i%5)*7,h*(.088+((i*7)%5)*.012),Math.cos(i*.8)*8,.70);
    ctx.globalAlpha=.68;
    for(let i=0;i<10;i++) strawPatch(-18+i*48,2,44+(i%4)*10,h*(.060+((i*5)%4)*.016),Math.sin(i*1.4)*10,.52);
    ctx.globalAlpha=1;
    // Underside occlusion gives thickness, while the top remains bright and summery.
    const shade=ctx.createLinearGradient(0,y+h*.084,0,y+h*.142);
    shade.addColorStop(0,'rgba(91,58,22,.14)'); shade.addColorStop(1,'rgba(55,34,14,0)');
    ctx.fillStyle=shade; ctx.fillRect(0,y+h*.080,w,h*.070);
    ctx.fillStyle='rgba(255,238,164,.16)'; ctx.fillRect(0,y+h*.020,w,h*.012);
    ctx.restore();
  }
  function drawPosts(){ const w=state.w,h=state.h; ctx.fillStyle='#7a4d2c'; [w*.13,w*.87].forEach(x=>{ roundRect(x-10,h*.08,20,h*.60,8,true); ctx.fillStyle='#9f6738'; roundRect(x-5,h*.08,7,h*.60,4,true); ctx.fillStyle='#7a4d2c'; }); }
  function drawBenches(){}
    function drawShell(x,y,s=1,rot=0){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(s,s);
    ctx.fillStyle='rgba(255,238,197,.9)'; ctx.strokeStyle='rgba(142,100,58,.55)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(-13,9); ctx.quadraticCurveTo(0,-18,15,9); ctx.quadraticCurveTo(0,15,-13,9); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(142,100,58,.35)'; for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(i*5,8); ctx.stroke(); }
    ctx.restore();
  }
  function drawStarfish(x,y,s=1,rot=0){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(s,s); ctx.fillStyle='rgba(239,118,70,.88)'; ctx.strokeStyle='rgba(151,75,43,.45)'; ctx.lineWidth=1.5;
    ctx.beginPath(); for(let i=0;i<10;i++){ const r=i%2?6:15, a=-Math.PI/2+i*Math.PI/5; ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='rgba(255,218,126,.8)'; ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  function drawPebble(x,y,s=1,c='rgba(125,103,78,.45)'){
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.fillStyle=c; ctx.beginPath(); ctx.ellipse(0,0,8,5,.35,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  function drawTable(){
    const topL=table.leftTop, topR=table.rightTop, botL=table.leftBottom, botR=table.rightBottom;
    const h=state.h;
    // Soft contact shadow anchors the tray into the beach instead of floating like a UI panel.
    ctx.save();
    ctx.fillStyle='rgba(83,50,23,.22)';
    ctx.beginPath(); ctx.ellipse((botL+botR)/2,table.bottom+48,(botR-botL)*.70,72,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(112,75,38,.075)'; ctx.beginPath(); ctx.ellipse((botL+botR)/2,table.top+312,(botR-botL)*.64,270,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // Chunky legs tucked under the near rail, partially hidden by the table edge.
    ctx.save();
    ctx.fillStyle='#b5753b';
    roundRect(botL+70,table.bottom+20,30,h*.105,9,true);
    roundRect(botR-100,table.bottom+20,30,h*.105,9,true);
    ctx.fillStyle='rgba(255,226,159,.28)';
    roundRect(botL+79,table.bottom+28,7,h*.075,4,true);
    roundRect(botR-91,table.bottom+28,7,h*.075,4,true);
    ctx.fillStyle='rgba(73,42,20,.22)'; ctx.beginPath(); ctx.ellipse(botL+85,table.bottom+h*.122,34,8,0,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(botR-86,table.bottom+h*.122,34,8,0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // Outer heavy wood slab with bevel/cut corners.
    ctx.beginPath();
    ctx.moveTo(topL-46,table.top-30); ctx.lineTo(topR+46,table.top-30);
    ctx.lineTo(botR+48,table.bottom+42); ctx.lineTo(botR+22,table.bottom+70);
    ctx.lineTo(botL-22,table.bottom+70); ctx.lineTo(botL-48,table.bottom+42);
    ctx.closePath();
    const outer=ctx.createLinearGradient(0,table.top-42,0,table.bottom+76);
    outer.addColorStop(0,'#ffecbf'); outer.addColorStop(.34,'#f1cc88'); outer.addColorStop(.72,'#d09a59'); outer.addColorStop(1,'#925a2d');
    ctx.save(); ctx.shadowColor='rgba(96,61,29,.22)'; ctx.shadowBlur=18; ctx.shadowOffsetY=8; ctx.fillStyle=outer; ctx.fill(); ctx.restore(); ctx.strokeStyle='rgba(111,72,36,.22)'; ctx.lineWidth=2.8; ctx.stroke();
    ctx.save(); ctx.clip();
    // Natural wood grain: subtle curved strokes and fine highlights, not flat SVG color.
    for(let i=0;i<76;i++){
      const y=lerp(table.top-22,table.bottom+52,(i*29%100)/100);
      const b=xBoundsAt(clamp(y,table.top,table.bottom));
      ctx.globalAlpha=.13+(i%6)*.030; ctx.strokeStyle=i%3?'#875b2f':'#fff0bd'; ctx.lineWidth=.9+(i%4)*.65;
      ctx.beginPath(); ctx.moveTo(b.l-58,y+Math.sin(i*.7)*3); ctx.bezierCurveTo((b.l+b.r)/2-58,y+Math.sin(i*1.3)*14,(b.l+b.r)/2+42,y-Math.cos(i*.9)*12,b.r+58,y+Math.sin(i*.7)*8); ctx.stroke(); if(i%5===0){ ctx.beginPath(); ctx.moveTo(b.l+20+(i*37%(b.r-b.l)),y-2); ctx.quadraticCurveTo(b.l+42+(i*37%(b.r-b.l)),y+5,b.l+72+(i*37%(b.r-b.l)),y-1); ctx.stroke(); }
    }
    for(let k=0;k<14;k++){ const y=lerp(table.top,table.bottom+40,(k*23%100)/100), b=xBoundsAt(clamp(y,table.top,table.bottom)); const x=lerp(b.l-40,b.r+40,(k*41%100)/100); ctx.globalAlpha=.16; ctx.strokeStyle='#7a461f'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x,y,10+(k%3)*4,4+(k%2)*2,.4,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
    ctx.globalAlpha=1;
    // Darker side faces make the wooden frame read as a 3D object.
    ctx.save();
    ctx.fillStyle='rgba(111,69,33,.30)';
    ctx.beginPath(); ctx.moveTo(topL-44,table.top-24); ctx.lineTo(topL-18,table.top-2); ctx.lineTo(botL-22,table.bottom+32); ctx.lineTo(botL-54,table.bottom+32); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(topR+44,table.top-24); ctx.lineTo(topR+18,table.top-2); ctx.lineTo(botR+22,table.bottom+32); ctx.lineTo(botR+54,table.bottom+32); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Visible lower leg sections below the chunky near rail.
    ctx.save();
    ctx.fillStyle='rgba(95,54,26,.22)';
    roundRect(botL+96,table.bottom+42,34,h*.040,9,true);
    roundRect(botR-130,table.bottom+42,34,h*.040,9,true);
    ctx.restore();

    // Side cast shadows help benches read as below the tabletop, not pasted on top.
    ctx.save();
    ctx.fillStyle='rgba(65,39,19,.30)';
    ctx.beginPath(); ctx.moveTo(topL-42,table.top-8); ctx.lineTo(topL-8,table.top+4); ctx.lineTo(botL-18,table.bottom+24); ctx.lineTo(botL-48,table.bottom+30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(topR+42,table.top-8); ctx.lineTo(topR+8,table.top+4); ctx.lineTo(botR+18,table.bottom+24); ctx.lineTo(botR+48,table.bottom+30); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Inner lighter bevel, separated from the glass inset.
    ctx.beginPath();
    ctx.moveTo(topL-28,table.top-10); ctx.lineTo(topR+28,table.top-10);
    ctx.lineTo(botR+46,table.bottom+25); ctx.lineTo(botL-46,table.bottom+25); ctx.closePath();
    const bevel=ctx.createLinearGradient(0,table.top,0,table.bottom+18);
    bevel.addColorStop(0,'#fff0c6'); bevel.addColorStop(.52,'#ecc68d'); bevel.addColorStop(1,'#c99661');
    ctx.fillStyle=bevel; ctx.fill(); ctx.strokeStyle='rgba(122,78,37,.18)'; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); ctx.globalAlpha=.14; ctx.strokeStyle='rgba(255,235,190,.70)'; ctx.lineWidth=11;
    for(let k=0;k<4;k++){ ctx.beginPath(); ctx.moveTo(lerp(topL,topR,k/3)-28,table.top-14); ctx.lineTo(lerp(botL,botR,k/3)-48+k*22,table.bottom+42); ctx.stroke(); }
    ctx.restore();

    // Inset glass/sand tabletop with visible margin from the wooden frame.
    const iTopL=topL+9, iTopR=topR-9, iBotL=botL+16, iBotR=botR-16, iTop=table.top+23, iBot=table.bottom-30;
    const sand=ctx.createLinearGradient(0,iTop,0,iBot);
    sand.addColorStop(0,'rgba(230,241,217,.44)'); sand.addColorStop(.32,'rgba(255,241,192,.84)'); sand.addColorStop(.72,'rgba(246,222,158,.86)'); sand.addColorStop(1,'rgba(233,199,128,.82)');
    ctx.beginPath(); ctx.moveTo(iTopL+14,iTop); ctx.lineTo(iTopR-14,iTop); ctx.quadraticCurveTo(iTopR,iTop,iTopR+2,iTop+14); ctx.lineTo(iBotR-2,iBot-16); ctx.quadraticCurveTo(iBotR,iBot,iBotR-16,iBot); ctx.lineTo(iBotL+16,iBot); ctx.quadraticCurveTo(iBotL,iBot,iBotL+2,iBot-16); ctx.lineTo(iTopL-2,iTop+14); ctx.quadraticCurveTo(iTopL,iTop,iTopL+14,iTop); ctx.closePath();
    ctx.fillStyle=sand; ctx.fill();
    ctx.save(); ctx.clip();
    const aoTop=ctx.createLinearGradient(0,iTop,0,iTop+72); aoTop.addColorStop(0,'rgba(58,37,18,.48)'); aoTop.addColorStop(1,'rgba(87,61,32,0)'); ctx.fillStyle=aoTop; ctx.fillRect(0,iTop,state.w,66);
    const aoBot=ctx.createLinearGradient(0,iBot-72,0,iBot); aoBot.addColorStop(0,'rgba(87,61,32,0)'); aoBot.addColorStop(1,'rgba(65,42,20,.34)'); ctx.fillStyle=aoBot; ctx.fillRect(0,iBot-78,state.w,88);
    ctx.restore();
    ctx.save(); ctx.shadowColor='rgba(91,62,32,.66)'; ctx.shadowBlur=22; ctx.shadowOffsetY=6; ctx.strokeStyle='rgba(70,44,22,.42)'; ctx.lineWidth=21; ctx.stroke(); ctx.restore();
    ctx.strokeStyle='rgba(91,134,128,.10)'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.save(); ctx.clip();
    // Cloudy sand and small grain noise.
    for(let i=0;i<260;i++){ const y=lerp(iTop+8,iBot-8,(i*37%100)/100), b={l:lerp(iTopL,iBotL,(y-iTop)/(iBot-iTop)), r:lerp(iTopR,iBotR,(y-iTop)/(iBot-iTop))}; const x=lerp(b.l+8,b.r-8,(i*53%100)/100); ctx.fillStyle=i%3?'rgba(190,139,72,.13)':'rgba(255,248,201,.22)'; ctx.beginPath(); ctx.arc(x,y,1+(i%4)*.45,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=.26; ctx.fillStyle='#fff0b8'; for(let i=0;i<16;i++){ const y=lerp(iTop+24,iBot-26,i/8), t=(y-iTop)/(iBot-iTop), l=lerp(iTopL,iBotL,t), r=lerp(iTopR,iBotR,t); ctx.beginPath(); ctx.ellipse((l+r)/2+Math.sin(i*1.7)*18,y,(r-l)*(.26+.04*Math.sin(i)),16,.08,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
    // Beach details stay decorative, not blocking the main sliding lane.
    ctx.globalAlpha=.76;
    drawShell(lerp(iTopL,iTopR,.18),lerp(iTop,iBot,.30),.50,-.45);
    drawShell(lerp(iTopL,iTopR,.78),lerp(iTop,iBot,.46),.46,.55);
    drawShell(lerp(iBotL,iBotR,.16),lerp(iTop,iBot,.78),.50,.7);
    drawStarfish(lerp(iBotL,iBotR,.58),lerp(iTop,iBot,.67),.54,.25);
    drawStarfish(lerp(iTopL,iTopR,.83),lerp(iTop,iBot,.22),.40,.35);
    drawPebble(lerp(iTopL,iTopR,.68),lerp(iTop,iBot,.34),.30,'rgba(96,91,86,.22)');
    drawPebble(lerp(iBotL,iBotR,.35),lerp(iTop,iBot,.55),.26,'rgba(116,92,70,.18)');
    drawPebble(lerp(iBotL,iBotR,.74),lerp(iTop,iBot,.74),.28,'rgba(132,103,72,.18)');
    drawPebble(lerp(iTopL,iTopR,.38),lerp(iTop,iBot,.18),.22,'rgba(132,103,72,.16)');
    drawShell(lerp(iBotL,iBotR,.84),lerp(iTop,iBot,.82),.40,-.2);
    drawStarfish(lerp(iBotL,iBotR,.28),lerp(iTop,iBot,.70),.34,-.4);
    drawPebble(lerp(iTopL,iTopR,.54),lerp(iTop,iBot,.28),.24,'rgba(102,88,71,.18)');
    drawPebble(lerp(iBotL,iBotR,.50),lerp(iTop,iBot,.86),.28,'rgba(132,103,72,.17)');
    ctx.globalAlpha=1;
    // Broad diagonal glass highlights, not grid lines.
    ctx.globalAlpha=.13; ctx.strokeStyle='rgba(255,255,255,.66)'; ctx.lineWidth=26; ctx.lineCap='round';
    [[.12,.04,.38,.68],[.44,.00,.64,.55],[.62,.24,.86,.92],[.22,.64,.42,.96]].forEach(([a,b,c,d],idx)=>{ ctx.beginPath(); ctx.moveTo(lerp(iTopL,iTopR,a),lerp(iTop,iBot,b)); ctx.bezierCurveTo(lerp(iTopL,iTopR,(a+c)/2),lerp(iTop,iBot,b+.16),lerp(iBotL,iBotR,(a+c)/2+.06),lerp(iTop,iBot,d-.14),lerp(iBotL,iBotR,c),lerp(iTop,iBot,d)); ctx.stroke(); });
    // Original-style aiming guides: one center line and one dashed horizontal threshold.
    ctx.globalAlpha=.82; ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.lineWidth=4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo((iTopL+iTopR)/2,iTop+8); ctx.lineTo((iBotL+iBotR)/2,iBot-24); ctx.stroke();
    const dashY=lerp(iTop,iBot,.74), db={l:lerp(iTopL,iBotL,.74), r:lerp(iTopR,iBotR,.74)};
    ctx.setLineDash([12,12]); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(db.l+8,dashY); ctx.lineTo(db.r-8,dashY); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // Glass thickness rim / clear collision boundary.
    ctx.beginPath(); ctx.moveTo(iTopL+3,iTop+3); ctx.lineTo(iTopR-3,iTop+3); ctx.lineTo(iBotR-5,iBot-5); ctx.lineTo(iBotL+5,iBot-5); ctx.closePath();
    ctx.strokeStyle='rgba(72,118,112,.10)'; ctx.lineWidth=8; ctx.stroke();
    ctx.strokeStyle='rgba(224,255,246,.13)'; ctx.lineWidth=3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(iTopL,iTop); ctx.lineTo(iTopR,iTop); ctx.lineTo(iBotR,iBot); ctx.lineTo(iBotL,iBot); ctx.closePath();
    ctx.strokeStyle='rgba(230,255,247,.11)'; ctx.lineWidth=.9; ctx.stroke();

    // Thick near front rail overlaps the tray lip, giving the table real weight.
    ctx.save();
    const rail=ctx.createLinearGradient(0,table.bottom-10,0,table.bottom+54);
    rail.addColorStop(0,'rgba(255,224,171,.94)'); rail.addColorStop(.50,'rgba(216,154,88,.90)'); rail.addColorStop(1,'rgba(135,84,40,.88)');
    ctx.fillStyle=rail; ctx.strokeStyle='rgba(104,67,34,.34)'; ctx.lineWidth=2.4;
    ctx.beginPath();
    ctx.moveTo(botL-16,table.bottom-8); ctx.lineTo(botR+16,table.bottom-8);
    ctx.lineTo(botR+42,table.bottom+52); ctx.lineTo(botL-42,table.bottom+52); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha=.24; ctx.strokeStyle='#ffe7b0'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(botL-4,table.bottom+4); ctx.lineTo(botR+4,table.bottom+4); ctx.stroke();
    ctx.restore();
  }
  function drawHUD(){
    const w=state.w, h=state.h;
    const coinX=w*.18, coinY=h*.055;
    roundRect(coinX-62,coinY-17,124,34,17,true,'rgba(255,255,255,.94)','#8a572b',2); drawCoin(coinX-42,coinY,12); text(Math.round(state.displayCoins),coinX-20,coinY+4,19,'#7a3b18','left','bold');
    const nx=w*.82, ny=h*.055;
    roundRect(nx-35,ny-8,70,82,14,true,'rgba(255,248,219,.9)','#8a572b',2); drawDrinkIcon(state.nextLvl,nx,ny+25,.74); text('下一個',nx,ny+61,15,'#7a3b18','center','bold');
    const ox=w*.38, oy=h*.17;
    drawOrder(ox,oy,state.orders[0],0); drawOrder(ox+92,oy+3,state.orders[1],1);
  }
  function drawOrder(x,y,o,i){
    const active=i>=state.orderIndex && !o.done, a=o.done?.5:(active?1:.72); ctx.save(); ctx.globalAlpha=a; ctx.translate(x,y); ctx.rotate((i?1:-1)*.035);
    ctx.save(); ctx.shadowColor='rgba(92,51,22,.26)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
    roundRect(-48,-38,96,110,12,true,'#fff4d2','#9d5527',1.8);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(-48,-38,96,110,12); ctx.clip();
    const paper=ctx.createLinearGradient(0,-38,0,72); paper.addColorStop(0,'#fff9de'); paper.addColorStop(.55,'#ffe9bb'); paper.addColorStop(1,'#f8d79c'); ctx.fillStyle=paper; ctx.fillRect(-48,-38,96,110);
    ctx.globalAlpha=.22; ctx.fillStyle='#b97936'; for(let k=0;k<30;k++){ ctx.beginPath(); ctx.arc(-40+(k*31%82),-28+(k*47%92),.7+(k%3)*.35,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1; ctx.fillStyle='rgba(132,78,32,.12)'; ctx.fillRect(-38,-14,76,2); ctx.fillRect(-36,48,72,2);
    ctx.restore();
    roundRect(-34,-30,68,18,8,true,'rgba(255,235,174,.55)','rgba(151,85,37,.20)',1);
    text('外帶訂單',0,-21,13,'#753518','center','bold');
    text('Food  Travel',0,-6,7,'rgba(141,82,38,.38)','center','');
    drawDrinkIcon(o.lvl,0,29,.73);
    roundRect(-29,49,58,21,10,true,'rgba(255,238,176,.92)','#c3832b',1.4);
    drawCoin(-18,59,8); text(o.reward,-2,61,16,'#6d3215','left','bold');
    if(o.done){ ctx.globalAlpha=.9; text('✓',0,27,48,'#37b45d','center','bold','#fff'); }
    ctx.restore();
  }
  function drawQueue(){
    const w=state.w,h=state.h,y=h*.925;
    roundRect(w*.08,y-22,w*.58,44,22,true,'rgba(255,255,255,.92)','#7b4a27',3);
    for(let i=0;i<6;i++){
      const x=w*.135+i*w*.092;
      drawDrinkIcon(Math.min(i,8),x,y,.31+i*.022);
      if(i<5){ ctx.strokeStyle='rgba(108,70,38,.38)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+17,y); ctx.lineTo(x+w*.092-17,y); ctx.stroke(); }
    }
    roundRect(w*.73,y-28,w*.22,56,15,true,'#42c955','#1b7d2b',3); text('下载',w*.84,y+2,20,'#fff','center','bold','#126320');
    text('Tasty Travels',w*.17,h*.975,16,'#fff','center','bold','#185c5f');
  }
  function drawItem(it){
    if(it.aim){ ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(it.norm*.30); ctx.strokeStyle='rgba(255,255,255,.98)'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,-it.radius*.95); ctx.lineTo(0,-Math.max(150,state.h*.25)); ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.globalAlpha=.38; ctx.fillStyle='rgba(49,35,20,.68)'; ctx.beginPath(); ctx.ellipse(it.x+3,it.y+it.radius*.60,it.radius*.62,it.radius*.20,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    drawDrinkIcon(it.lvl,it.x,it.y,(it.radius/24.7)*(1+it.pop*.10),0);
  }
  function drawDrinkIcon(lvl,x,y,s=1,rot=0){
    const d=drinks[lvl] || drinks[drinks.length-1];
    const tier=Math.min(lvl,8);
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(s,s);

    const specs=[
      {label:'小果汁杯',     top:30, mid:26, bot:18, h:42, liq:'#f02d5e', rim:'#ff9aae', glass:'#ffe4ea', garnish:'#ffdf55', fruit:'cherry', straw:false, ice:1, foot:false},
      {label:'柠檬饮料',     top:42, mid:35, bot:24, h:63, liq:'#f2c51e', rim:'#fff0a0', glass:'#fff7d6', garnish:'#ffe45e', fruit:'lemon',  straw:true,  ice:2, foot:false},
      {label:'椰子饮料',     top:56, mid:54, bot:42, h:60, liq:'#efe0bb', rim:'#fff8e4', glass:'#fff1d2', garnish:'#5ac06a', fruit:'coco',   straw:true,  ice:1, foot:false},
      {label:'莓果冰沙',     top:50, mid:45, bot:30, h:66, liq:'#b9279a', rim:'#f3a8ff', glass:'#f7ddff', garnish:'#ff7398', fruit:'berry',  straw:true,  ice:4, foot:true},
      {label:'热带鸡尾酒',   top:64, mid:50, bot:22, h:76, liq:'#ff7a1e', rim:'#ffd36a', glass:'#fff0c8', garnish:'#ffcc42', fruit:'orange', straw:true,  ice:4, foot:true},
      {label:'蓝色泻湖',     top:58, mid:50, bot:24, h:80, liq:'#0f9ff2', rim:'#91ecff', glass:'#dff8ff', garnish:'#7fffd0', fruit:'lime',   straw:true,  ice:5, foot:true},
      {label:'豪华热带鸡尾酒',top:72, mid:60, bot:28, h:90, liq:'#ff4f9a', rim:'#ffe06b', glass:'#fff0d8', garnish:'#ffe36d', fruit:'tropic', straw:true,  ice:6, foot:true},
      {label:'双层彩虹杯',   top:72, mid:62, bot:34, h:88, liq:'#20d5b9', rim:'#fff08a', glass:'#e7fff8', garnish:'#ff7cc4', fruit:'rainbow', straw:true,  ice:5, foot:true},
      {label:'皇家水果塔',   top:78, mid:66, bot:36, h:92, liq:'#ffd84d', rim:'#ffffff', glass:'#fff8d4', garnish:'#ff5b74', fruit:'royal', straw:true,  ice:4, foot:true}
    ];
    const sp=specs[Math.min(lvl,specs.length-1)];
    const h=sp.h, top=sp.top, mid=sp.mid, bot=sp.bot;

    // Contact shadow and glass foot make the drink sit on the table instead of reading as a flat icon.
    ctx.fillStyle='rgba(45,28,18,.24)';
    ctx.beginPath(); ctx.ellipse(5, h*.47, mid*.62, 8, 0,0,Math.PI*2); ctx.fill();
    if(sp.foot){
      const stem=ctx.createLinearGradient(0,h*.12,0,h*.48); stem.addColorStop(0,'rgba(255,255,255,.50)'); stem.addColorStop(1,'rgba(132,177,181,.30)');
      ctx.fillStyle=stem; roundRect(-4,h*.13,8,18,4,true);
      ctx.beginPath(); ctx.ellipse(0,h*.42,bot*.58,6,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=2; ctx.stroke();
    }

    // Coconut tier gets a visible shell silhouette before the glass so it does not read as a normal cup.
    if(tier===2){ ctx.fillStyle='rgba(118,72,38,.96)'; ctx.beginPath(); ctx.ellipse(0,-h*.08,top*.48,h*.38,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(78,46,25,.45)'; ctx.lineWidth=2; ctx.stroke(); }

    // Thick transparent glass body.
    const body=ctx.createLinearGradient(0,-h*.52,0,h*.35);
    body.addColorStop(0,'rgba(255,255,255,.20)'); body.addColorStop(.20,sp.glass); body.addColorStop(.68,'rgba(220,238,235,.28)'); body.addColorStop(1,'rgba(128,164,166,.26)');
    ctx.beginPath();
    ctx.moveTo(-top/2,-h*.48);
    ctx.bezierCurveTo(-mid/2,-h*.22,-bot/2,h*.08,-bot/2,h*.30);
    ctx.quadraticCurveTo(0,h*.42,bot/2,h*.30);
    ctx.bezierCurveTo(bot/2,h*.08,mid/2,-h*.22,top/2,-h*.48);
    ctx.closePath();
    ctx.fillStyle=body; ctx.fill();
    ctx.strokeStyle='rgba(218,247,242,.18)'; ctx.lineWidth=1.25; ctx.stroke();
    ctx.strokeStyle='rgba(86,126,132,.18)'; ctx.lineWidth=1.1; ctx.stroke();

    // Coarse silhouette cues keep key tiers readable at small playable sizes.
    if(tier===2){
      ctx.save(); ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='rgba(118,72,38,.92)'; ctx.beginPath(); ctx.ellipse(0,-h*.02,top*.55,h*.43,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    if(tier===4){
      ctx.save(); ctx.strokeStyle='rgba(165,93,34,.50)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-top*.36,-h*.34); ctx.lineTo(top*.36,-h*.34); ctx.lineTo(top*.10,h*.34); ctx.lineTo(-top*.10,h*.34); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    if(tier===5){
      ctx.save(); ctx.fillStyle='rgba(15,128,210,.34)'; ctx.beginPath(); ctx.roundRect(-top*.38,-h*.48,top*.76,h*.86,10); ctx.fill(); ctx.restore();
    }
    if(tier>=6){
      ctx.save(); ctx.strokeStyle='rgba(255,215,105,.42)'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(0,-h*.48,top*.58,12,0,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }

    // Layered liquid with transparency and tropical gradients.
    const liquid=ctx.createLinearGradient(0,-h*.22,0,h*.31);
    liquid.addColorStop(0,sp.rim);
    liquid.addColorStop(.38,sp.liq);
    liquid.addColorStop(1, tier===5?'#126bb4':(tier===3?'#742979':'#b84a2e'));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-top*.44,-h*.62);
    ctx.bezierCurveTo(-mid*.44,-h*.18,-bot*.40,h*.08,-bot*.37,h*.31);
    ctx.quadraticCurveTo(0,h*.35,bot*.34,h*.28);
    ctx.bezierCurveTo(bot*.40,h*.08,mid*.44,-h*.18,top*.43,-h*.59);
    ctx.closePath(); ctx.clip();
    ctx.globalAlpha=1; ctx.fillStyle=liquid; ctx.fillRect(-top/2,-h*.64,top,h*1.09);
    const layerTop=['#ffd6d8','#fff18b','#fff8dd','#eaa4ff','#ffe084','#6fe9ff','#ffe36d','#8ff5e7','#fff7a0'][tier] || '#fff1a0';
    const layerBot=['#ef4669','#f2bf39','#d9b878','#7b2b88','#ff7b2f','#1474c7','#ff4f9a','#19bfa9','#f3b923'][tier] || '#ff7b4b';
    ctx.globalAlpha=.90; ctx.fillStyle=layerTop; ctx.fillRect(-top/2,-h*.47,top,h*.22);
    ctx.globalAlpha=.86; ctx.fillStyle=layerBot; ctx.fillRect(-top/2,h*.02,top,h*.26);
    ctx.globalAlpha=.18; ctx.fillStyle='#fff';
    for(let i=0;i<3;i++){ ctx.beginPath(); ctx.ellipse(Math.sin(i*2.1)*top*.12,-h*.05+i*h*.12,top*.25,h*.035,.12,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=.55; ctx.strokeStyle='rgba(255,255,255,.90)'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(0,-h*.16,top*.34,5,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=.24; ctx.fillStyle='rgba(255,255,255,.95)'; ctx.beginPath(); ctx.ellipse(-top*.05,h*.08,top*.22,5,.1,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=.62; ctx.fillStyle='rgba(48,22,14,.64)'; ctx.fillRect(-top/2,h*.14,top,h*.23);
    ctx.globalAlpha=.30; ctx.fillStyle='rgba(255,255,255,.9)'; for(let b=0;b<3+(tier>3?2:0);b++){ ctx.beginPath(); ctx.arc(-top*.20+b*top*.12,-h*.02+(b%2)*h*.09,1.8+(b%2),0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
    ctx.restore();

    // Foam/rim ellipse.
    const rim=ctx.createRadialGradient(0,-h*.48,4,0,-h*.48,top*.54);
    rim.addColorStop(0,'rgba(255,255,255,.80)'); rim.addColorStop(.55,sp.rim); rim.addColorStop(1,'rgba(255,255,255,.18)');
    ctx.fillStyle=rim; ctx.beginPath(); ctx.ellipse(0,-h*.48,top*.50,10,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.46)'; ctx.lineWidth=1.2; ctx.stroke();

    // Ice cubes: small rotated translucent blocks inside the liquid.
    const visibleIce = s<.36 ? Math.min(sp.ice, tier<4?0:1) : Math.min(sp.ice, tier<3?1:3);
    for(let i=0;i<visibleIce;i++){
      const ix=(-.22+i*.14+Math.sin(i+lvl)*.035)*top, iy=-h*.07+(i%3)*h*.11;
      ctx.save(); ctx.translate(ix,iy); ctx.rotate((i*.55+.25));
      ctx.fillStyle='rgba(255,255,255,.30)'; ctx.strokeStyle='rgba(221,239,238,.30)'; ctx.lineWidth=1;
      roundRect(-5,-5,10,10,3,true); ctx.stroke();
      ctx.restore();
    }

    // Straw, with slight depth behind/over the rim.
    if(sp.straw && s>.30){
      ctx.strokeStyle='rgba(255,255,255,.78)'; ctx.lineWidth=4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(top*.08,-h*.40); ctx.lineTo(top*.23,-h*.64); ctx.lineTo(top*.36,-h*.76); ctx.stroke();
      ctx.strokeStyle=tier===5?'#228ec4':'#d96b84'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(top*.08,-h*.40); ctx.lineTo(top*.23,-h*.64); ctx.lineTo(top*.36,-h*.76); ctx.stroke();
    }

    // Fruit / tropical garnish differs strongly by level.
    function citrus(cx,cy,r,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff9d8'; ctx.lineWidth=2; ctx.stroke(); ctx.strokeStyle='rgba(150,95,24,.35)'; ctx.lineWidth=1; for(let a=0;a<Math.PI*2;a+=Math.PI/3){ ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.stroke(); } }
    function leaf(cx,cy,rot=0){ ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot); ctx.fillStyle='#34b765'; ctx.beginPath(); ctx.ellipse(0,0,11,5,-.35,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    if(sp.fruit==='cherry'){ ctx.fillStyle='#ef3357'; ctx.beginPath(); ctx.arc(-top*.28,-h*.49,7,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); }
    if(sp.fruit==='lemon') citrus(-top*.32,-h*.48,9,'#ffe15a');
    if(sp.fruit==='coco'){ ctx.fillStyle='#8b5a32'; ctx.beginPath(); ctx.arc(-top*.31,-h*.48,12,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#5d381f'; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle='#fff4d6'; ctx.beginPath(); ctx.arc(-top*.32,-h*.48,8,0,Math.PI*2); ctx.fill(); leaf(top*.25,-h*.54,-.3); leaf(top*.34,-h*.50,.35); }
    if(sp.fruit==='berry'){ ctx.fillStyle='#ef3d79'; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(-top*.30+i*6,-h*.50+(i%2)*4,5,0,Math.PI*2); ctx.fill(); } leaf(top*.28,-h*.54,.3); }
    if(sp.fruit==='orange') citrus(-top*.34,-h*.47,10,'#ff9f2f');
    if(sp.fruit==='lime') citrus(-top*.34,-h*.47,10,'#8ee85b');
    if(sp.fruit==='tropic' && s>.30){ citrus(-top*.38,-h*.47,12,'#ffb13d'); leaf(top*.24,-h*.55,-.55); leaf(top*.35,-h*.52,.25); ctx.fillStyle='#ff4b72'; ctx.beginPath(); ctx.arc(top*.10,-h*.55,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#ffe36d'; ctx.beginPath(); ctx.moveTo(top*.18,-h*.78); ctx.lineTo(top*.42,-h*.63); ctx.lineTo(top*.02,-h*.63); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#c9792d'; ctx.lineWidth=1.5; ctx.stroke(); }
    if(sp.fruit==='rainbow' && s>.30){ citrus(-top*.38,-h*.48,11,'#56e7d0'); citrus(top*.04,-h*.55,8,'#ff7cc4'); leaf(top*.30,-h*.55,.2); ctx.fillStyle='#a45cff'; ctx.beginPath(); ctx.arc(top*.20,-h*.42,5,0,Math.PI*2); ctx.fill(); }
    if(sp.fruit==='royal' && s>.30){ citrus(-top*.40,-h*.48,12,'#ffd84d'); leaf(top*.20,-h*.57,-.55); leaf(top*.34,-h*.54,.35); ctx.fillStyle='#ff5b74'; ctx.beginPath(); ctx.arc(top*.05,-h*.56,7,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#ffe36d'; ctx.beginPath(); ctx.moveTo(top*.20,-h*.84); ctx.lineTo(top*.50,-h*.62); ctx.lineTo(-top*.02,-h*.62); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#b66b22'; ctx.lineWidth=2; ctx.stroke(); }

    // Cup rim and base ellipses add thickness.
    ctx.globalAlpha=.28; ctx.strokeStyle='rgba(255,244,220,.42)'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.ellipse(0,-h*.56,top*.43,7,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=.42; ctx.strokeStyle='rgba(70,63,51,.48)'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.ellipse(0,h*.39,top*.38,7,0,0,Math.PI*2); ctx.stroke();

    // Glass highlights and refraction lines.
    ctx.globalAlpha=.18; ctx.strokeStyle='rgba(255,255,255,.48)'; ctx.lineWidth=1.8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-top*.25,-h*.38); ctx.bezierCurveTo(-top*.38,-h*.10,-top*.26,h*.13,-top*.12,h*.28); ctx.stroke();
    ctx.globalAlpha=.18; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(-top*.22,-h*.12,top*.08,h*.28,-.10,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=.22; ctx.strokeStyle='rgba(255,255,255,.58)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(top*.20,-h*.30); ctx.lineTo(top*.10,h*.18); ctx.stroke();
    ctx.globalAlpha=1;

    // Upgrade aura for high tiers.
    if(tier>=5 && s>.42){ ctx.globalAlpha=.22; ctx.fillStyle=sp.garnish; ctx.beginPath(); ctx.arc(top*.30,-h*.60,4,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(-top*.42,-h*.35,3,0,Math.PI*2); ctx.fill(); if(tier>=8){ ctx.fillStyle='#ffd84d'; ctx.beginPath(); for(let i=0;i<10;i++){ const r=i%2?4:9,a=-Math.PI/2+i*Math.PI/5; ctx.lineTo(top*.43+Math.cos(a)*r,-h*.40+Math.sin(a)*r); } ctx.closePath(); ctx.fill(); } ctx.globalAlpha=1; }
    ctx.restore();
  }

  function drawParticles(){ for(const p of state.particles){ ctx.globalAlpha=p.a; if(p.type==='coin') drawCoin(p.x,p.y,9); else { ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; } }
  function drawFloating(){ for(const f of state.floating){ ctx.globalAlpha=f.a; text(f.text,f.x,f.y,22,'#fff','center','bold','#7b2d16'); ctx.globalAlpha=1; } }
  function drawEnd(){ ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(0,0,state.w,state.h); text('试玩完成',state.w/2,state.h*.42,42,'#fff','center','bold'); text('点击任意位置重新开始',state.w/2,state.h*.50,22,'#fff','center','bold'); }
  function drawCoin(x,y,r){ ctx.fillStyle='#ffc83d'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#b56a00'; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle='#fff2a5'; ctx.beginPath(); ctx.arc(x-r*.25,y-r*.3,r*.25,0,Math.PI*2); ctx.fill(); }
  function roundRect(x,y,w,h,r,fill=true,fs,ss,lw){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fs) ctx.fillStyle=fs; if(fill) ctx.fill(); if(ss){ ctx.strokeStyle=ss; ctx.lineWidth=lw||1; ctx.stroke(); } }
  function text(str,x,y,size,color,align='left',weight='',stroke){ ctx.save(); ctx.font=`${weight} ${size}px Arial`; ctx.textAlign=align; ctx.textBaseline='middle'; if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=5; for(const [k,line] of String(str).split('\n').entries()) ctx.strokeText(line,x,y+k*size*1.05); } ctx.fillStyle=color; for(const [k,line] of String(str).split('\n').entries()) ctx.fillText(line,x,y+k*size*1.05); ctx.restore(); }

  function reset(){ state.items=[]; state.particles=[]; state.floating=[]; state.coins=0; state.displayCoins=0; state.seqIndex=0; state.highestUnlocked=0; state.nextLvl=rollSpawnLevel(); state.orderIndex=0; state.ended=false; state.orders.forEach(o=>o.done=false); spawnCurrent(); }
  let last=performance.now(); function loop(now){ const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); draw(); requestAnimationFrame(loop); }
  resize(); reset(); requestAnimationFrame(loop);
})();
