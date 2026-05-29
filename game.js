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
    seq: testOrders ? [0,0,1,1,0,0,1,1,2,2,2,2] : [0,0,1,1,2,2,3,3,4,4,5,5,6,7,8], seqIndex:0,
    orders: testOrders ? [{lvl:1, reward:120, done:false}, {lvl:2, reward:180, done:false}] : [{lvl:6, reward:500, done:false}, {lvl:8, reward:600, done:false}],
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
    table.top = h*0.292;
    table.bottom = h*0.865;
    table.launchY = h*0.775;
    table.leftBottom = w*.025; table.rightBottom = w*.975;
    table.leftTop = w*.145; table.rightTop = w*.855;
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

  function spawnCurrent(){
    const lvl = state.seq[state.seqIndex++ % state.seq.length];
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
    it.vx = -it.norm * 135;     // 更少横向乱飘，主要沿桌面纵深前冲
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
    state.items = state.items.filter(i=>!i.dead);
    limitDeskItems();
    for(const p of state.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=280*dt; p.life-=dt; p.a=Math.max(0,p.life/p.max); }
    state.particles=state.particles.filter(p=>p.life>0);
    for(const f of state.floating){ f.y-=35*dt; f.life-=dt; f.a=Math.max(0,f.life/f.max); }
    state.floating=state.floating.filter(f=>f.life>0);
  }

  function limitDeskItems(){
    const desk = state.items.filter(i=>!i.aim && !i.dead);
    if(desk.length<=6) return;
    desk.sort((a,b)=>a.born-b.born || a.lvl-b.lvl);
    for(const it of desk.slice(0, desk.length-6)){
      it.dead=true;
      if(Math.random()<.7) addFloat(it.x,it.y,'清理');
    }
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
          target.vx += (Math.random()-.5)*34 + shooter.vx*.18;
          shooter.vy *= .72;
          shooter.vx = shooter.vx*.72 + (Math.random()-.5)*24;
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
    state.items.push(n);
    const targetOrder=state.orders[state.orderIndex];
    if(targetOrder && lvl>=targetOrder.lvl) completeOrder(n);
    if(lvl>=9){ state.ended=true; addFloat(state.w/2,state.h*.45,'完成！点击重玩'); }
  }
  function completeOrder(item){
    const o=state.orders[state.orderIndex]; if(!o||o.done) return;
    o.done=true; addCoins(o.reward,item.x,item.y); addFloat(item.x,item.y,'订单完成 +' + o.reward);
    item.dead=true; burst(item.x,item.y,'#ffe66d'); state.orderIndex++;
  }
  function addCoins(n,x,y){ state.coins+=n; for(let k=0;k<Math.min(8,n/100);k++) state.particles.push({x,y,vx:(Math.random()-.5)*220,vy:-160-Math.random()*120,life:.8+Math.random()*.4,max:1.1,a:1,type:'coin'}); }
  function addFloat(x,y,text){ state.floating.push({x,y,text,life:1.1,max:1.1,a:1}); }
  function burst(x,y,color){ for(let k=0;k<22;k++) state.particles.push({x,y,vx:(Math.random()-.5)*360,vy:(Math.random()-.8)*360,life:.55+Math.random()*.45,max:1,a:1,color,type:'spark'}); }

  function draw(){
    const w=state.w,h=state.h; ctx.clearRect(0,0,w,h);
    drawBeach(); drawTable(); drawBenches(); drawHUD(); drawQueue();
    const items=[...state.items].sort((a,b)=>a.y-b.y);
    for(const it of items) drawItem(it);
    drawParticles(); drawFloating(); drawHand();
    if(state.ended) drawEnd();
  }
  function drawBeach(){
    const w=state.w,h=state.h;
    const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,'#74d9ff'); sky.addColorStop(.26,'#bdf5ff'); sky.addColorStop(.265,'#21b8da'); sky.addColorStop(.43,'#62d4e6'); sky.addColorStop(.435,'#ffe8b1'); sky.addColorStop(1,'#ffd999'); ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
    // sea foam and sand details
    ctx.fillStyle='rgba(255,255,255,.72)'; for(let i=0;i<7;i++){ ctx.beginPath(); ctx.ellipse(w*(-.05+i*.19), h*.40+Math.sin(i*1.7)*9, 74, 8, 0,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='rgba(177,122,74,.18)'; for(let i=0;i<12;i++){ ctx.beginPath(); ctx.ellipse((i*97)%w, h*(.63+(i%5)*.07), 13, 8, .5, 0, Math.PI*2); ctx.fill(); }
    drawPalm(w*.12,h*.29,.72,-1); drawPalm(w*.88,h*.29,.70,1); drawCanopy();
  }
  function drawPalm(x,y,s,flip){ ctx.save(); ctx.translate(x,y); ctx.scale(s*flip,s); ctx.fillStyle='#96633d'; ctx.rotate(-.12); roundRect(-9,-8,18,170,8,true); ctx.rotate(.12); ctx.fillStyle='#49aa52'; for(let i=-3;i<=3;i++){ ctx.save(); ctx.rotate(i*.34); ctx.beginPath(); ctx.ellipse(40,-10,64,17,0,0,Math.PI*2); ctx.fill(); ctx.restore(); } ctx.fillStyle='#3c9349'; ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  function drawCanopy(){ const w=state.w,h=state.h; ctx.save(); ctx.fillStyle='#8c5a32'; ctx.fillRect(0,h*.05,w,h*.04); ctx.fillStyle='#84a83a'; for(let x=-30;x<w+40;x+=48){ ctx.beginPath(); ctx.moveTo(x,h*.04); ctx.quadraticCurveTo(x+24,h*.16,x+52,h*.04); ctx.closePath(); ctx.fill(); } ctx.fillStyle='#6d8b30'; for(let x=-20;x<w+40;x+=64){ ctx.beginPath(); ctx.ellipse(x,h*.065,58,18,.15,0,Math.PI*2); ctx.fill(); } ctx.restore(); }
  function drawPosts(){ const w=state.w,h=state.h; ctx.fillStyle='#7a4d2c'; [w*.13,w*.87].forEach(x=>{ roundRect(x-10,h*.08,20,h*.60,8,true); ctx.fillStyle='#9f6738'; roundRect(x-5,h*.08,7,h*.60,4,true); ctx.fillStyle='#7a4d2c'; }); }
  function drawBenches(){
    const w=state.w,h=state.h;
    // Small rear-side stools like environment props; keep them behind the main tray.
    const y=h*.475, bh=h*.125;
    ctx.save();
    function rearBench(left){
      const x = left ? -w*.035 : w*.875;
      const bw = w*.135;
      const g=ctx.createLinearGradient(0,y,0,y+bh);
      g.addColorStop(0,'#dfb77b'); g.addColorStop(.62,'#c58f50'); g.addColorStop(1,'#9c6638');
      ctx.fillStyle=g; ctx.strokeStyle='rgba(128,82,39,.75)'; ctx.lineWidth=2.5;
      roundRect(x,y,bw,bh,8,true); ctx.stroke();
      ctx.fillStyle='rgba(255,230,176,.28)'; roundRect(x+bw*.16,y+8,bw*.60,bh-16,5,true);
      ctx.strokeStyle='rgba(99,63,31,.28)'; ctx.lineWidth=1.5;
      for(let i=1;i<=2;i++){ const px=x+bw*(.25+i*.20); ctx.beginPath(); ctx.moveTo(px,y+8); ctx.lineTo(px,y+bh-8); ctx.stroke(); }
      ctx.fillStyle='rgba(116,70,32,.75)';
      roundRect(x+bw*.24,y+bh-2,9,h*.046,4,true);
      roundRect(x+bw*.67,y+bh-5,9,h*.042,4,true);
    }
    rearBench(true); rearBench(false);
    ctx.restore();
  }
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
    // Chunky legs tucked under the near rail, partially hidden by the table edge.
    ctx.save();
    ctx.fillStyle='#a66a36';
    roundRect(botL+70,table.bottom+20,30,h*.105,9,true);
    roundRect(botR-100,table.bottom+20,30,h*.105,9,true);
    ctx.fillStyle='rgba(255,226,159,.28)';
    roundRect(botL+79,table.bottom+28,7,h*.075,4,true);
    roundRect(botR-91,table.bottom+28,7,h*.075,4,true);
    ctx.restore();

    // Outer heavy wood slab with bevel/cut corners.
    ctx.beginPath();
    ctx.moveTo(topL-54,table.top-32); ctx.lineTo(topR+54,table.top-32);
    ctx.lineTo(botR+72,table.bottom+42); ctx.lineTo(botR+34,table.bottom+66);
    ctx.lineTo(botL-34,table.bottom+66); ctx.lineTo(botL-72,table.bottom+42);
    ctx.closePath();
    const outer=ctx.createLinearGradient(0,table.top-42,0,table.bottom+76);
    outer.addColorStop(0,'#f4d39a'); outer.addColorStop(.42,'#e5b977'); outer.addColorStop(.78,'#c98d4b'); outer.addColorStop(1,'#a86a35');
    ctx.fillStyle=outer; ctx.fill(); ctx.strokeStyle='#79502a'; ctx.lineWidth=7; ctx.stroke();
    ctx.save(); ctx.clip();
    // Natural wood grain: subtle curved strokes and fine highlights, not flat SVG color.
    for(let i=0;i<34;i++){
      const y=lerp(table.top-22,table.bottom+52,(i*29%100)/100);
      const b=xBoundsAt(clamp(y,table.top,table.bottom));
      ctx.globalAlpha=.20+(i%4)*.035; ctx.strokeStyle=i%2?'#875323':'#ffe0a1'; ctx.lineWidth=1.3+(i%3);
      ctx.beginPath(); ctx.moveTo(b.l-58,y); ctx.bezierCurveTo((b.l+b.r)/2-40,y+Math.sin(i)*10,(b.l+b.r)/2+50,y-Math.cos(i)*8,b.r+58,y+Math.sin(i*.7)*7); ctx.stroke();
    }
    for(let k=0;k<7;k++){ const y=lerp(table.top,table.bottom+40,(k*23%100)/100), b=xBoundsAt(clamp(y,table.top,table.bottom)); const x=lerp(b.l-40,b.r+40,(k*41%100)/100); ctx.globalAlpha=.16; ctx.strokeStyle='#7a461f'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x,y,10+(k%3)*4,4+(k%2)*2,.4,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
    ctx.globalAlpha=1;
    // Darker side faces make the wooden frame read as a 3D object.
    ctx.save();
    ctx.fillStyle='rgba(119,68,31,.34)';
    ctx.beginPath(); ctx.moveTo(topL-44,table.top-24); ctx.lineTo(topL-18,table.top-2); ctx.lineTo(botL-22,table.bottom+32); ctx.lineTo(botL-54,table.bottom+32); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(topR+44,table.top-24); ctx.lineTo(topR+18,table.top-2); ctx.lineTo(botR+22,table.bottom+32); ctx.lineTo(botR+54,table.bottom+32); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Visible lower leg sections below the chunky near rail.
    ctx.save();
    ctx.fillStyle='rgba(95,54,26,.22)';
    roundRect(botL+96,table.bottom+42,34,h*.040,9,true);
    roundRect(botR-130,table.bottom+42,34,h*.040,9,true);
    ctx.restore();

    // Inner lighter bevel, separated from the glass inset.
    ctx.beginPath();
    ctx.moveTo(topL-32,table.top-12); ctx.lineTo(topR+32,table.top-12);
    ctx.lineTo(botR+50,table.bottom+24); ctx.lineTo(botL-50,table.bottom+24); ctx.closePath();
    const bevel=ctx.createLinearGradient(0,table.top,0,table.bottom+18);
    bevel.addColorStop(0,'#ffe7b5'); bevel.addColorStop(.52,'#efc27d'); bevel.addColorStop(1,'#d69a55');
    ctx.fillStyle=bevel; ctx.fill(); ctx.strokeStyle='rgba(122,78,37,.55)'; ctx.lineWidth=4; ctx.stroke();
    ctx.save(); ctx.globalAlpha=.32; ctx.strokeStyle='rgba(255,224,158,.78)'; ctx.lineWidth=5;
    for(let k=0;k<4;k++){ ctx.beginPath(); ctx.moveTo(lerp(topL,topR,k/3)-28,table.top-14); ctx.lineTo(lerp(botL,botR,k/3)-48+k*22,table.bottom+42); ctx.stroke(); }
    ctx.restore();

    // Inset glass/sand tabletop with visible margin from the wooden frame.
    const iTopL=topL+30, iTopR=topR-30, iBotL=botL+48, iBotR=botR-48, iTop=table.top+34, iBot=table.bottom-56;
    const sand=ctx.createLinearGradient(0,iTop,0,iBot);
    sand.addColorStop(0,'rgba(198,241,232,.55)'); sand.addColorStop(.35,'rgba(252,241,190,.78)'); sand.addColorStop(1,'rgba(244,217,151,.82)');
    ctx.beginPath(); ctx.moveTo(iTopL,iTop); ctx.lineTo(iTopR,iTop); ctx.lineTo(iBotR,iBot); ctx.lineTo(iBotL,iBot); ctx.closePath();
    ctx.fillStyle=sand; ctx.fill();
    ctx.save(); ctx.clip();
    const aoTop=ctx.createLinearGradient(0,iTop,0,iTop+45); aoTop.addColorStop(0,'rgba(87,61,32,.20)'); aoTop.addColorStop(1,'rgba(87,61,32,0)'); ctx.fillStyle=aoTop; ctx.fillRect(0,iTop,state.w,50);
    const aoBot=ctx.createLinearGradient(0,iBot-60,0,iBot); aoBot.addColorStop(0,'rgba(87,61,32,0)'); aoBot.addColorStop(1,'rgba(87,61,32,.18)'); ctx.fillStyle=aoBot; ctx.fillRect(0,iBot-60,state.w,70);
    ctx.restore();
    ctx.save(); ctx.shadowColor='rgba(80,52,25,.55)'; ctx.shadowBlur=14; ctx.shadowOffsetY=4; ctx.strokeStyle='rgba(92,59,29,.38)'; ctx.lineWidth=12; ctx.stroke(); ctx.restore();
    ctx.strokeStyle='rgba(38,196,200,.98)'; ctx.lineWidth=7; ctx.stroke();
    ctx.save(); ctx.clip();
    // Cloudy sand and small grain noise.
    for(let i=0;i<70;i++){ const y=lerp(iTop+8,iBot-8,(i*37%100)/100), b={l:lerp(iTopL,iBotL,(y-iTop)/(iBot-iTop)), r:lerp(iTopR,iBotR,(y-iTop)/(iBot-iTop))}; const x=lerp(b.l+8,b.r-8,(i*53%100)/100); ctx.fillStyle=i%3?'rgba(190,139,72,.13)':'rgba(255,248,201,.22)'; ctx.beginPath(); ctx.arc(x,y,1+(i%4)*.45,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=.18; ctx.fillStyle='#fff2bf'; for(let i=0;i<7;i++){ const y=lerp(iTop+28,iBot-28,i/6), b=xBoundsAt(y); ctx.beginPath(); ctx.ellipse((b.l+b.r)/2,y,(b.r-b.l)*.34,15,.08,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1;
    // Keep the sliding lane clean; tiny beach details stay near the rim only.
    ctx.globalAlpha=.45;
    drawShell(lerp(iBotL,iBotR,.12),lerp(iTop,iBot,.72),.38,.7);
    drawPebble(lerp(iTopL,iTopR,.86),lerp(iTop,iBot,.30),.34,'rgba(96,91,86,.26)');
    ctx.globalAlpha=1;
    // Broad diagonal glass highlights, not grid lines.
    ctx.globalAlpha=.28; ctx.strokeStyle='rgba(255,255,255,.86)'; ctx.lineWidth=14; ctx.lineCap='round';
    [[.18,.02,.45,.98],[.47,.00,.70,.92],[.70,.10,.92,.86]].forEach(([a,b,c,d])=>{ ctx.beginPath(); ctx.moveTo(lerp(iTopL,iTopR,a),lerp(iTop,iBot,b)); ctx.lineTo(lerp(iBotL,iBotR,c),lerp(iTop,iBot,d)); ctx.stroke(); });
    // Original-style aiming guides: one center line and one dashed horizontal threshold.
    ctx.globalAlpha=.82; ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.lineWidth=4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo((iTopL+iTopR)/2,iTop+8); ctx.lineTo((iBotL+iBotR)/2,iBot-24); ctx.stroke();
    const dashY=lerp(iTop,iBot,.74), db={l:lerp(iTopL,iBotL,.74), r:lerp(iTopR,iBotR,.74)};
    ctx.setLineDash([12,12]); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(db.l+8,dashY); ctx.lineTo(db.r-8,dashY); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // Glass thickness rim / clear collision boundary.
    ctx.beginPath(); ctx.moveTo(iTopL+3,iTop+3); ctx.lineTo(iTopR-3,iTop+3); ctx.lineTo(iBotR-5,iBot-5); ctx.lineTo(iBotL+5,iBot-5); ctx.closePath();
    ctx.strokeStyle='rgba(31,128,124,.62)'; ctx.lineWidth=11; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(iTopL,iTop); ctx.lineTo(iTopR,iTop); ctx.lineTo(iBotR,iBot); ctx.lineTo(iBotL,iBot); ctx.closePath();
    ctx.strokeStyle='rgba(197,255,250,.65)'; ctx.lineWidth=2; ctx.stroke();
  }
  function drawHUD(){
    const w=state.w, h=state.h;
    const coinX=w*.18, coinY=h*.055;
    roundRect(coinX-62,coinY-17,124,34,17,true,'rgba(255,255,255,.94)','#8a572b',2); drawCoin(coinX-42,coinY,12); text(Math.round(state.displayCoins),coinX-20,coinY+4,19,'#7a3b18','left','bold');
    const nx=w*.82, ny=h*.055;
    roundRect(nx-35,ny-8,70,82,14,true,'rgba(255,248,219,.9)','#8a572b',2); drawDrinkIcon(state.seq[state.seqIndex%state.seq.length],nx,ny+22,.48); text('下一個',nx,ny+61,15,'#7a3b18','center','bold');
    const ox=w*.38, oy=h*.17;
    drawOrder(ox,oy,state.orders[0],0); drawOrder(ox+92,oy+3,state.orders[1],1);
  }
  function drawOrder(x,y,o,i){
    const active=i>=state.orderIndex && !o.done, a=o.done?.5:(active?1:.72); ctx.save(); ctx.globalAlpha=a; ctx.translate(x,y); ctx.rotate((i?1:-1)*.035);
    roundRect(-46,-36,92,106,10,true,'#fff7dd','#9d5527',3);
    ctx.fillStyle='rgba(140,80,35,.12)'; ctx.fillRect(-36,-13,72,2); ctx.fillRect(-34,48,68,2);
    text('外帶訂單',0,-20,13,'#7b351b','center','bold');
    text('Food  Travel',0,-5,8,'#b06b3a','center','');
    drawDrinkIcon(o.lvl,0,25,.52);
    drawCoin(-18,57,9); text(o.reward,0,61,17,'#713719','left','bold');
    if(o.done){ ctx.globalAlpha=.9; text('✓',0,27,48,'#37b45d','center','bold','#fff'); }
    ctx.restore();
  }
  function drawQueue(){
    const w=state.w,h=state.h,y=h*.925;
    roundRect(w*.08,y-22,w*.58,44,22,true,'rgba(255,255,255,.92)','#7b4a27',3);
    for(let i=0;i<6;i++){
      const x=w*.145+i*w*.085;
      drawDrinkIcon(Math.min(i,8),x,y,.27+i*.02);
      if(i<5){ ctx.strokeStyle='rgba(108,70,38,.38)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+17,y); ctx.lineTo(x+w*.085-17,y); ctx.stroke(); }
    }
    roundRect(w*.73,y-28,w*.22,56,15,true,'#42c955','#1b7d2b',3); text('下载',w*.84,y+2,20,'#fff','center','bold','#126320');
    text('Tasty Travels',w*.17,h*.975,16,'#fff','center','bold','#185c5f');
  }
  function drawItem(it){
    if(it.aim){ ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(it.norm*.30); ctx.strokeStyle='rgba(255,255,255,.98)'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,-it.radius*.95); ctx.lineTo(0,-Math.max(150,state.h*.25)); ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.globalAlpha=.38; ctx.fillStyle='rgba(49,35,20,.68)'; ctx.beginPath(); ctx.ellipse(it.x+3,it.y+it.radius*.60,it.radius*.62,it.radius*.20,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    drawDrinkIcon(it.lvl,it.x,it.y,(it.radius/42)*(1+it.pop*.18),0);
  }
  function drawDrinkIcon(lvl,x,y,s=1,rot=0){
    const d=drinks[lvl]; ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(s,s);
    ctx.fillStyle='rgba(55,32,18,.24)'; ctx.beginPath(); ctx.ellipse(5,29,31,10,0,0,Math.PI*2); ctx.fill();
    // varied glass silhouette
    const wide = 44 + (lvl%3)*6, top = 50 + (lvl%4)*3, bottom = 32 + (lvl%2)*7;
    const body=ctx.createLinearGradient(0,-36,0,30); body.addColorStop(0,'rgba(255,255,255,.96)'); body.addColorStop(.55,d.glass); body.addColorStop(1,'rgba(215,245,255,.95)');
    ctx.beginPath(); ctx.moveTo(-wide/2,-30); ctx.quadraticCurveTo(-bottom/2,-12,-bottom/2,26); ctx.quadraticCurveTo(0,35,bottom/2,26); ctx.quadraticCurveTo(bottom/2,-12,wide/2,-30); ctx.closePath(); ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=4; ctx.stroke();
    const liquid=ctx.createLinearGradient(0,-8,0,27); liquid.addColorStop(0,d.rim); liquid.addColorStop(.35,d.color); liquid.addColorStop(1,'#7a2d32'); ctx.fillStyle=liquid; roundRect(-bottom/2+3,-8,bottom-6,32,8,true);
    ctx.fillStyle=d.rim; ctx.beginPath(); ctx.ellipse(0,-10,wide*.43,9,0,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(7,-30); ctx.lineTo(23,-53); ctx.stroke();
    const fruit=['#e94152','#75d74d','#ffb23d','#58d3ff','#b86cff','#fff0ad'][lvl%6]; ctx.fillStyle=fruit; ctx.beginPath(); ctx.arc(-15,-29,8,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    if(lvl>2){ ctx.fillStyle='rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(11,-25,7,0,Math.PI*2); ctx.fill(); }
    if(lvl>5){ ctx.fillStyle='#ffef75'; ctx.beginPath(); ctx.moveTo(-3,-55); ctx.lineTo(10,-36); ctx.lineTo(-12,-38); ctx.closePath(); ctx.fill(); }
    if(lvl>7){ ctx.fillStyle='#40d6b6'; ctx.beginPath(); ctx.ellipse(16,-37,12,5,-.5,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
  function drawParticles(){ for(const p of state.particles){ ctx.globalAlpha=p.a; if(p.type==='coin') drawCoin(p.x,p.y,9); else { ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; } }
  function drawFloating(){ for(const f of state.floating){ ctx.globalAlpha=f.a; text(f.text,f.x,f.y,22,'#fff','center','bold','#7b2d16'); ctx.globalAlpha=1; } }
  function drawHand(){ if(state.dragging||state.ended) return; const x=(state.current?state.current.x:state.w*.55)+Math.sin(state.handT*4)*18, y=table.launchY+55; ctx.save(); ctx.translate(x,y); ctx.rotate(-.35); ctx.globalAlpha=.9; ctx.fillStyle='#ffe3c7'; roundRect(-8,-12,24,58,12,true,'#ffe3c7','#9a5b35',2); ctx.beginPath(); ctx.arc(2,-16,12,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  function drawEnd(){ ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(0,0,state.w,state.h); text('试玩完成',state.w/2,state.h*.42,42,'#fff','center','bold'); text('点击任意位置重新开始',state.w/2,state.h*.50,22,'#fff','center','bold'); }
  function drawCoin(x,y,r){ ctx.fillStyle='#ffc83d'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#b56a00'; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle='#fff2a5'; ctx.beginPath(); ctx.arc(x-r*.25,y-r*.3,r*.25,0,Math.PI*2); ctx.fill(); }
  function roundRect(x,y,w,h,r,fill=true,fs,ss,lw){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fs) ctx.fillStyle=fs; if(fill) ctx.fill(); if(ss){ ctx.strokeStyle=ss; ctx.lineWidth=lw||1; ctx.stroke(); } }
  function text(str,x,y,size,color,align='left',weight='',stroke){ ctx.save(); ctx.font=`${weight} ${size}px Arial`; ctx.textAlign=align; ctx.textBaseline='middle'; if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=5; for(const [k,line] of String(str).split('\n').entries()) ctx.strokeText(line,x,y+k*size*1.05); } ctx.fillStyle=color; for(const [k,line] of String(str).split('\n').entries()) ctx.fillText(line,x,y+k*size*1.05); ctx.restore(); }

  function reset(){ state.items=[]; state.particles=[]; state.floating=[]; state.coins=0; state.displayCoins=0; state.seqIndex=0; state.orderIndex=0; state.ended=false; state.orders.forEach(o=>o.done=false); spawnCurrent(); }
  let last=performance.now(); function loop(now){ const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); draw(); requestAnimationFrame(loop); }
  resize(); reset(); requestAnimationFrame(loop);
})();
