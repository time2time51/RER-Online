// Brawler minimaliste (Phaser 3) — mobile + desktop
const W = 960, H = 540, GROUND_Y = H - 80;

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#162035',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { preload, create, update }
};
const game = new Phaser.Game(config);

let cursors, keyA, keyB;
const touchState = { left:false, right:false, up:false, down:false, attack:false, jump:false };

let player, enemies, scoreText, hpText, spawnTimer = 0, score = 0, hp = 100;
let attackLock = false, attackUntil = 0;

function preload(){
  // Génère des textures simples (pas d'assets externes)
  const g = this.add.graphics();
  g.fillStyle(0x37a0ff,1).fillRect(0,0,36,52); g.generateTexture('player',36,52); g.clear();
  g.fillStyle(0xff5a5a,1).fillRect(0,0,34,46); g.generateTexture('enemy',34,46); g.clear();
  g.fillStyle(0xffe066,1).fillRect(0,0,28,12); g.generateTexture('slash',28,12); g.clear();
  g.fillStyle(0x3a3f5c,1).fillRect(0,0,W,60); g.generateTexture('ground',W,60); g.clear();
}

function create(){
  // Décor
  this.add.text(16,16,'RER Online — Prototype Brawler',{fontFamily:'monospace',fontSize:'16px',color:'#b7c6ff'}).setScrollFactor(0);
  this.add.rectangle(W/2,H/2,W,H,0x0e1426).setDepth(-10);
  this.add.rectangle(W/2,GROUND_Y+30,W,2,0x283350);
  this.add.image(W/2,GROUND_Y+30,'ground').setDepth(-5);

  // Joueur
  player = this.physics.add.sprite(140, GROUND_Y-26, 'player');
  player.setCollideWorldBounds(true);
  player.body.setSize(24,48).setOffset(6,2);
  player.speed = 220;
  player.jumpPower = 320;
  player.isOnGround = true;
  player.setDepth(player.y);

  // Groupes
  enemies = this.physics.add.group();

  // UI
  scoreText = this.add.text(W-16,16,'Score: 0',{fontFamily:'monospace',fontSize:'16px',color:'#b7c6ff'})
               .setOrigin(1,0).setScrollFactor(0);
  hpText = this.add.text(W-16,38,`Vie: ${hp}`,{fontFamily:'monospace',fontSize:'16px',color:'#b7c6ff'})
            .setOrigin(1,0).setScrollFactor(0);

  // Inputs clavier (desktop)
  cursors = this.input.keyboard.createCursorKeys();
  keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A); // attaque
  keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S); // saut

  // Overlaps
  this.physics.add.overlap(player, enemies, (pl, en) => {
    if (Date.now() < attackUntil && Phaser.Math.Distance.Between(pl.x, pl.y, en.x, en.y) < 64){
      hitEnemy(this, en);
    } else {
      damagePlayer(8);
    }
  });

  // Boutons tactiles
  setupTouchButtons();
}

function update(time, delta){
  // Mouvement
  const left = cursors.left.isDown || touchState.left;
  const right = cursors.right.isDown || touchState.right;
  const up = cursors.up.isDown || touchState.up;
  const down = cursors.down.isDown || touchState.down;

  let vx = 0, vy = 0;
  if (left) vx -= player.speed;
  if (right) vx += player.speed;
  if (up) vy -= player.speed * 0.7; // déplacement vertical "sur la rue"
  if (down) vy += player.speed * 0.7;

  // Contraintes de "lane" (sol)
  player.y = Phaser.Math.Clamp(player.y + (vy * (delta/1000)), GROUND_Y-120, GROUND_Y-10);
  player.setVelocityX(vx);
  player.setDepth(player.y);

  // Saut (optionnel, juste un dash vertical)
  const wantJump = keyB.isDown || touchState.jump;
  if (wantJump) player.y = Math.max(player.y - 140 * (delta/1000), GROUND_Y-140);

  // Attaque
  const wantAttack = keyA.isDown || touchState.attack;
  if (wantAttack && !attackLock){
    attackLock = true;
    attackUntil = Date.now()+180; // fenêtre d'impact
    // petit slash visuel
    const slash = this.add.image(player.x + (player.flipX?-18:18), player.y-10, 'slash').setAlpha(0.9);
    slash.flipX = player.flipX;
    this.tweens.add({ targets: slash, alpha:0, x: slash.x + (player.flipX?-14:14), duration:180, onComplete:()=>slash.destroy() });
    this.time.delayedCall(240, ()=> attackLock = false);
  }

  // Flip sprite selon direction
  if (vx < -5) player.setFlipX(true);
  else if (vx > 5) player.setFlipX(false);

  // Spawn ennemis
  spawnTimer += delta;
  if (spawnTimer > 1400){
    spawnTimer = 0;
    spawnEnemy(this);
  }

  // Mouvements ennemis + nettoyage
  enemies.children.iterate(en => {
    if (!en) return;
    // IA simple: se rapproche du joueur
    const dx = player.x - en.x;
    const dy = player.y - en.y;
    const len = Math.hypot(dx,dy) || 1;
    const speed = en.baseSpeed;
    en.setVelocity((dx/len)*speed, (dy/len)*speed*0.7);
    en.setDepth(en.y);
    if (en.hp <= 0){ en.destroy(); score += 50; scoreText.setText('Score: '+score); }
    if (en.x < -60 || en.x > W+60) en.destroy();
  });

  // Game over?
  if (hp <= 0){
    this.scene.pause();
    const t = this.add.text(W/2,H/2,'Game Over\nTouchez pour rejouer',{fontFamily:'monospace',fontSize:'32px',align:'center'}).setOrigin(0.5);
    this.input.once('pointerdown', ()=>{ window.location.reload(); });
  }
}

function spawnEnemy(scene){
  const side = Math.random()<0.6 ? 'right' : 'left';
  const x = side==='right' ? W+40 : -40;
  const y = Phaser.Math.Between(GROUND_Y-110, GROUND_Y-14);
  const en = scene.physics.add.sprite(x,y,'enemy');
  en.hp = 30;
  en.baseSpeed = Phaser.Math.Between(60, 110);
  enemies.add(en);
}

function hitEnemy(scene, en){
  en.hp -= 20;
  // petit feedback
  const flash = scene.add.rectangle(en.x,en.y, en.width+10, en.height+10, 0xffffff, .7);
  scene.tweens.add({targets:flash, alpha:0, duration:120, onComplete:()=>flash.destroy()});
}

function damagePlayer(amount){
  hp = Math.max(0, hp - amount);
  hpText.setText('Vie: '+hp);
}

function setupTouchButtons(){
  // Gestion boutons tactiles (pointerdown / pointerup)
  document.querySelectorAll('.btn').forEach(btn=>{
    const dir = btn.dataset.dir;
    const act = btn.dataset.act;
    const down = ()=>{ if (dir) touchState[dir]=true; if (act) touchState[act]=true; };
    const up = ()=>{ if (dir) touchState[dir]=false; if (act) touchState[act]=false; };
    btn.addEventListener('touchstart', e=>{ e.preventDefault(); down(); }, {passive:false});
    btn.addEventListener('touchend',   e=>{ e.preventDefault(); up(); }, {passive:false});
    btn.addEventListener('mousedown',  e=>{ e.preventDefault(); down(); });
    btn.addEventListener('mouseup',    e=>{ e.preventDefault(); up(); });
    btn.addEventListener('mouseleave', e=>{ up(); });
  });
}
