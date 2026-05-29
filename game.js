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

  const state = {
    w: 0, h: 0, portrait: true, coins: 0, displayCoins: 0,
    items: [], particles: [], floating: [], current: null,
    seq: [0,0,1,1,2,2,3,3,4,4,5,5,6,7,8], seqIndex:0,
    orders: [{lvl:6, reward:500, done:false}, {lvl:8, reward:600, done:false}],
    orderIndex:0, dragging:false, pointerX:0, handT:0, ended:false
  };

  const table = { leftBottom:0, rightBottom:0, leftTop:0, rightTop:0, bottom:0, top:0, launchY:0 };

  function resize(){
    state.w = innerWidth; state.h = innerHeight; state.portrait = state.h >= state.w;
    canvas.width = Math.floor(state.w * DPR); canvas.height = Math.floor(state.h * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    layoutTable();
    if(state.current) placeCurrent(state.current, false);
  }
  addEventListener('resize', resize);

  function layoutTable(){
    const w=state.w,h=state.h, p=state.portrait;
    // Reference playable uses a broad glass tabletop with strong vertical perspective.
    table.top = p ? h*0.29 : h*0.28;
    table.bottom = p ? h*1.02 : h*1.05;
    table.launchY = p ? h*0.82 : h*0.79;
    table.leftBottom = w*(p?.15:.18); table.rightBottom = w*(p?.85:.82);
    table.leftTop = w*(p?.37:.39); table.rightTop = w*(p?.63:.61);
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
    return { id:Math.random(), lvl, x, y, vx:0, vy:0, radius:26, active:!isCurrent, aim:isCurrent, norm:0, dead:false, mergeLock:0, spin:(Math.random()-.5)*0.03, angle:0, pop:0 };
  }

  function pointerPos(e){
    const t=e.touches&&e.touches[0]; return {x:t?t.clientX:e.clientX, y:t?t.clientY:e.clientY};
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
    const impulse = 720 * scaleAt(it.y);
    it.vx = -it.norm * 250;     // 原版：x/256 决定横向反冲
    it.vy = -impulse;           // 原版松手固定向前冲，不需要拉蓄力
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
      it.mergeLock=Math.max(0,it.mergeLock-dt); it.pop=Math.max(0,it.pop-dt*4); it.angle += it.spin;
      if(it.active){
        it.x += it.vx*dt; it.y += it.vy*dt;
        it.vx *= Math.pow(.22, dt); it.vy *= Math.pow(.10, dt);
        const b=xBoundsAt(it.y), r=it.radius*.72;
        if(it.x < b.l+r){ it.x=b.l+r; it.vx=Math.abs(it.vx)*.45; }
        if(it.x > b.r-r){ it.x=b.r-r; it.vx=-Math.abs(it.vx)*.45; }
        if(it.y < table.top+30){ it.y=table.top+30; it.vy=Math.abs(it.vy)*.25; }
        if(it.y > table.bottom-30){ it.y=table.bottom-30; it.vy=-Math.abs(it.vy)*.15; }
        if(Math.hypot(it.vx,it.vy)<8){ it.vx=0; it.vy=0; }
      }
      it.radius = 25 * scaleAt(it.y) * (1 + it.lvl*0.035);
    }
    collideAndMerge();
    state.items = state.items.filter(i=>!i.dead);
    for(const p of state.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=280*dt; p.life-=dt; p.a=Math.max(0,p.life/p.max); }
    state.particles=state.particles.filter(p=>p.life>0);
    for(const f of state.floating){ f.y-=35*dt; f.life-=dt; f.a=Math.max(0,f.life/f.max); }
    state.floating=state.floating.filter(f=>f.life>0);
  }

  function collideAndMerge(){
    for(let i=0;i<state.items.length;i++) for(let j=i+1;j<state.items.length;j++){
      const a=state.items[i], b=state.items[j]; if(a.dead||b.dead||a.aim||b.aim) continue;
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy), min=(a.radius+b.radius)*.72;
      if(d>0 && d<min){
        const nx=dx/d, ny=dy/d, push=(min-d)*.5;
        a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
        const tx=a.vx, ty=a.vy; a.vx=b.vx*.55; a.vy=b.vy*.55; b.vx=tx*.55; b.vy=ty*.55;
        if(a.lvl===b.lvl && a.lvl<9 && !a.mergeLock && !b.mergeLock){ merge(a,b); return; }
      }
    }
  }
  function merge(a,b){
    const x=(a.x+b.x)/2, y=(a.y+b.y)/2, old=a.lvl, lvl=old+1;
    a.dead=b.dead=true; burst(x,y,drinks[lvl].color); addFloat(x,y,'合成升级');
    if(old===5) addCoins(300,x,y); if(old===6||old===7||old===8) addCoins(500,x,y);
    const n=makeItem(lvl,x,y); n.vy=160; n.mergeLock=.25; n.pop=1; state.items.push(n);
    if((old===6 && state.orderIndex===0) || (old===8 && state.orderIndex===1)) completeOrder(n);
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
    drawBeach(); drawTable(); drawHUD(); drawQueue();
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
    drawPalm(w*.16,h*.27,.9,-1); drawPalm(w*.82,h*.27,.88,1); drawCanopy(); drawPosts(); drawBenches();
  }
  function drawPalm(x,y,s,flip){ ctx.save(); ctx.translate(x,y); ctx.scale(s*flip,s); ctx.fillStyle='#96633d'; ctx.rotate(-.12); roundRect(-9,-8,18,170,8,true); ctx.rotate(.12); ctx.fillStyle='#49aa52'; for(let i=-3;i<=3;i++){ ctx.save(); ctx.rotate(i*.34); ctx.beginPath(); ctx.ellipse(40,-10,64,17,0,0,Math.PI*2); ctx.fill(); ctx.restore(); } ctx.fillStyle='#3c9349'; ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  function drawCanopy(){ const w=state.w,h=state.h; ctx.save(); ctx.fillStyle='#8c5a32'; ctx.fillRect(0,h*.05,w,h*.04); ctx.fillStyle='#84a83a'; for(let x=-30;x<w+40;x+=48){ ctx.beginPath(); ctx.moveTo(x,h*.04); ctx.quadraticCurveTo(x+24,h*.16,x+52,h*.04); ctx.closePath(); ctx.fill(); } ctx.fillStyle='#6d8b30'; for(let x=-20;x<w+40;x+=64){ ctx.beginPath(); ctx.ellipse(x,h*.065,58,18,.15,0,Math.PI*2); ctx.fill(); } ctx.restore(); }
  function drawPosts(){ const w=state.w,h=state.h; ctx.fillStyle='#7a4d2c'; [w*.13,w*.87].forEach(x=>{ roundRect(x-10,h*.08,20,h*.60,8,true); ctx.fillStyle='#9f6738'; roundRect(x-5,h*.08,7,h*.60,4,true); ctx.fillStyle='#7a4d2c'; }); }
  function drawBenches(){ const w=state.w,h=state.h; const y=h*.57; ctx.save(); ctx.fillStyle='#ad7545'; ctx.strokeStyle='#714322'; ctx.lineWidth=4; roundRect(w*.02,y,w*.20,h*.32,10,true); ctx.stroke(); roundRect(w*.78,y,w*.20,h*.32,10,true); ctx.stroke(); ctx.fillStyle='rgba(90,48,22,.35)'; ctx.fillRect(w*.07,y+h*.30,12,h*.12); ctx.fillRect(w*.88,y+h*.30,12,h*.12); ctx.restore(); }
  function drawTable(){
    const topL=table.leftTop, topR=table.rightTop, botL=table.leftBottom, botR=table.rightBottom;
    // wooden frame
    ctx.beginPath(); ctx.moveTo(topL-26,table.top-20); ctx.lineTo(topR+26,table.top-20); ctx.lineTo(botR+34,table.bottom+12); ctx.lineTo(botL-34,table.bottom+12); ctx.closePath(); ctx.fillStyle='#b97942'; ctx.fill(); ctx.strokeStyle='#7b4a27'; ctx.lineWidth=7; ctx.stroke();
    // glass / sand play surface
    const grd=ctx.createLinearGradient(0,table.top,0,table.bottom); grd.addColorStop(0,'rgba(132,235,246,.65)'); grd.addColorStop(.45,'rgba(236,247,218,.76)'); grd.addColorStop(1,'rgba(254,229,156,.82)');
    ctx.beginPath(); ctx.moveTo(topL,table.top); ctx.lineTo(topR,table.top); ctx.lineTo(botR,table.bottom); ctx.lineTo(botL,table.bottom); ctx.closePath(); ctx.fillStyle=grd; ctx.fill(); ctx.strokeStyle='#8ed7d1'; ctx.lineWidth=4; ctx.stroke();
    // inner shine and perspective guide line
    ctx.save(); ctx.clip(); ctx.globalAlpha=.20; ctx.strokeStyle='#fff'; ctx.lineWidth=9; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(lerp(topL,topR,.32+i*.15),table.top+20); ctx.lineTo(lerp(botL,botR,.55+i*.08),table.bottom-30); ctx.stroke(); } ctx.globalAlpha=.16; ctx.lineWidth=2; for(let i=1;i<6;i++){ const t=i/6, y=lerp(table.top,table.bottom,t), b=xBoundsAt(y); ctx.beginPath(); ctx.moveTo(b.l,y); ctx.lineTo(b.r,y); ctx.stroke(); } ctx.restore();
    const y=table.launchY-45, b=xBoundsAt(y); ctx.setLineDash([12,10]); ctx.strokeStyle='rgba(255,255,255,.98)'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(b.l+12,y); ctx.lineTo(b.r-12,y); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawHUD(){
    const p=state.portrait, w=state.w, h=state.h;
    const ox=p?w*.18:w*.33, oy=p?h*.075:h*.06;
    drawOrder(ox,oy,state.orders[0],0); drawOrder(ox+(p?112:126),oy+8,state.orders[1],1);
    const cx=p?w*.76:w*.84, cy=p?h*.055:h*.05;
    ctx.fillStyle='rgba(0,0,0,.22)'; roundRect(cx-35,cy-18,88,36,18,true); drawCoin(cx-20,cy,13); text(Math.round(state.displayCoins),cx+7,cy+6,20,'#fff','left','bold');
    roundRect(cx-45,cy+38,92,90,14,true,'rgba(255,245,210,.92)','#6b3f22',3); text('下一個',cx,cy+58,16,'#7b3e22','center','bold'); drawDrinkIcon(state.seq[state.seqIndex%state.seq.length],cx,cy+96,.68);
  }
  function drawOrder(x,y,o,i){
    const active=i>=state.orderIndex && !o.done, a=o.done?.45:(active?1:.6); ctx.save(); ctx.globalAlpha=a; ctx.rotate(Math.sin(state.handT+i)*.015);
    roundRect(x-48,y-36,96,98,12,true,'#fff8df','#a85828',3); text('外帶訂單',x,y-14,13,'#8b3d23','center','bold'); drawDrinkIcon(o.lvl,x,y+18,.48); text(o.reward,x+10,y+52,18,'#6b381e','left','bold'); drawCoin(x-16,y+46,10); if(o.done){ text('✓',x,y+26,48,'#3ac56b','center','bold'); } ctx.restore();
  }
  function drawQueue(){
    const x=state.portrait?state.w*.09:state.w*.09, y0=state.h*.20, gap=state.portrait?34:30;
    ctx.save(); ctx.globalAlpha=.9; ctx.fillStyle='#68c96d'; ctx.beginPath(); ctx.moveTo(x-22,y0-25); ctx.lineTo(x+22,y0-25); ctx.lineTo(x+22,y0+gap*8); ctx.lineTo(x+40,y0+gap*8); ctx.lineTo(x,y0+gap*9); ctx.lineTo(x-40,y0+gap*8); ctx.lineTo(x-22,y0+gap*8); ctx.closePath(); ctx.fill(); ctx.restore();
    for(let i=0;i<9;i++) drawDrinkIcon(Math.min(i,8),x,y0+i*gap,.25+.025*i);
    text('Tasty\nTravels', state.w*.1, state.h*.88, state.portrait?18:22, '#fff', 'center', 'bold', '#185c5f');
  }
  function drawItem(it){
    if(it.aim){ ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(Math.PI + it.norm*.34); ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(0,-it.radius*.9); ctx.lineTo(0,-Math.max(150,state.h*.26)); ctx.stroke(); ctx.restore(); }
    drawDrinkIcon(it.lvl,it.x,it.y,(it.radius/42)*(1+it.pop*.18),it.angle);
  }
  function drawDrinkIcon(lvl,x,y,s=1,rot=0){
    const d=drinks[lvl]; ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(s,s);
    ctx.fillStyle='rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(4,24,27,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=d.glass; ctx.strokeStyle='#ffffff'; ctx.lineWidth=3; roundRect(-22,-32,44,58,10,true); ctx.stroke();
    ctx.fillStyle=d.color; roundRect(-18,-8,36,31,8,true); ctx.fillStyle=d.rim; ctx.beginPath(); ctx.ellipse(0,-10,20,9,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(6,-29); ctx.lineTo(20,-48); ctx.stroke();
    ctx.fillStyle=['#ff4d4d','#70d64c','#ffb13d','#5ad3ff'][lvl%4]; ctx.beginPath(); ctx.arc(-12,-27,7,0,Math.PI*2); ctx.fill();
    if(lvl>4){ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(10,-25,6,0,Math.PI*2); ctx.fill(); }
    if(lvl>6){ ctx.fillStyle='#ffef75'; ctx.beginPath(); ctx.moveTo(-2,-48); ctx.lineTo(8,-34); ctx.lineTo(-10,-34); ctx.closePath(); ctx.fill(); }
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
