(() => {
  "use strict";

  const lobby = document.getElementById("lobby");
  const nameInput = document.getElementById("name");
  const codeInput = document.getElementById("code");
  const createBtn = document.getElementById("create");
  const joinBtn = document.getElementById("join");
  const soloBtn = document.getElementById("solo");
  const lobbyMsg = document.getElementById("lobby-msg");
  const hud = document.getElementById("hud");
  const controls = document.getElementById("controls");
  const roomCodeEl = document.getElementById("room-code");
  const peerStateEl = document.getElementById("peer-state");
  const moneyEl = document.getElementById("money");
  const contractEl = document.getElementById("contract");
  const objectiveEl = document.getElementById("objective");
  const hpBarEl = document.getElementById("hp-bar");
  const copyBtn = document.getElementById("copy-code");
  const toastEl = document.getElementById("toast");
  const netDot = document.getElementById("net-dot");
  const netStatus = document.getElementById("net-status");
  const fatal = document.getElementById("fatal");
  const fatalText = document.getElementById("fatal-text");
  const reloadBtn = document.getElementById("reload");

  const WORLD = { width: 1600, height: 900 };
  const MAX_PLAYERS = 2;
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let latestState = null;
  let localPlayerId = null;
  let gameScene = null;
  let roomCode = null;
  let toastTimer = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function randomCode() {
    let out = "";
    for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
  }
  function safeName() {
    return (nameInput.value || "Caçador").trim().slice(0, 18) || "Caçador";
  }
  function toast(text) {
    toastEl.textContent = String(text || "");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }
  function setBusy(busy, msg) {
    createBtn.disabled = busy;
    joinBtn.disabled = busy;
    soloBtn.disabled = busy;
    if (msg) lobbyMsg.textContent = msg;
  }
  function setNetworkStatus(text, kind = "") {
    netStatus.textContent = text;
    netDot.className = "dot" + (kind ? " " + kind : "");
  }
  function fatalError(text) {
    fatalText.textContent = text;
    fatal.classList.remove("hidden");
  }
  reloadBtn.addEventListener("click", () => location.reload());

  if (!window.Phaser) {
    fatalError("O Phaser não carregou. Verifique sua internet e recarregue a página.");
    return;
  }
  if (window.Peer) setNetworkStatus("Multiplayer P2P pronto.", "ok");
  else setNetworkStatus("PeerJS não carregou. O modo solo ainda funciona.", "bad");

  class NetworkManager {
    constructor() {
      this.role = "none"; // host | guest | solo
      this.peer = null;
      this.conn = null;
      this.guestConn = null;
      this.state = null;
      this.lastHostTick = performance.now();
      this.hostTimer = 0;
      this.broadcastAccumulator = 0;
      this.connected = false;
      this.pendingJoinName = null;
    }

    makeFreshBounty(level = 1) {
      const maxHp = 180 + level * 50;
      return {
        x: 1120, y: 460, vx: 0, vy: 0,
        hp: maxHp, maxHp, level,
        active: false, captured: false,
        attackCooldown: 0, flash: 0,
        name: level >= 5 ? "THE RED WARDEN" : level >= 3 ? "VEX MARROW" : "RUST JACK",
        reward: 160 + level * 110
      };
    }

    makePlayer(id, name, slot) {
      const spawn = slot === 0 ? { x: 370, y: 520 } : { x: 470, y: 520 };
      return {
        id, name, slot, x: spawn.x, y: spawn.y, angle: 0,
        hp: 100, maxHp: 100, money: 0, downed: false,
        attacking: false, shooting: false, dash: false, lastDamageAt: 0
      };
    }

    makeRoom(code, hostName) {
      return {
        code,
        contractLevel: 1,
        contractActive: false,
        message: "Encontre o quadro de recompensas e pressione E.",
        bounty: this.makeFreshBounty(1),
        players: [this.makePlayer("host", hostName, 0)]
      };
    }

    async createRoom(name) {
      if (!window.Peer) throw new Error("O sistema multiplayer não carregou.");
      setBusy(true, "Criando sala...");
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        try {
          await this.openHostPeer(code, name);
          setBusy(false);
          return code;
        } catch (err) {
          this.destroyPeer();
          if (!String(err && err.type || err).includes("unavailable-id")) {
            setBusy(false);
            throw err;
          }
        }
      }
      setBusy(false);
      throw new Error("Não consegui gerar uma sala livre. Tente novamente.");
    }

    openHostPeer(code, name) {
      return new Promise((resolve, reject) => {
        const peer = new Peer("bh-" + code, { debug: 0 });
        let settled = false;
        this.peer = peer;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Tempo esgotado ao criar a sala."));
          }
        }, 9000);

        peer.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.role = "host";
          this.connected = true;
          roomCode = code;
          localPlayerId = "host";
          this.state = this.makeRoom(code, name);
          this.publishState();
          this.startHostLoop();
          peer.on("connection", conn => this.acceptGuestConnection(conn));
          resolve(code);
        });

        peer.on("error", err => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          } else {
            toast("Conexão P2P: " + (err.type || "erro"));
          }
        });

        peer.on("disconnected", () => {
          if (this.role === "host") peerStateEl.textContent = "sinalização desconectada";
        });
      });
    }

    acceptGuestConnection(conn) {
      if (this.guestConn && this.guestConn.open) {
        conn.on("open", () => {
          conn.send({ type: "reject", reason: "A sala já tem 2 jogadores." });
          setTimeout(() => conn.close(), 150);
        });
        return;
      }
      this.guestConn = conn;
      conn.on("data", msg => this.handleHostMessage(conn, msg));
      conn.on("close", () => this.removeGuest());
      conn.on("error", () => this.removeGuest());
    }

    handleHostMessage(conn, msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "join") {
        if (this.state.players.some(p => p.id === "guest")) {
          conn.send({ type: "reject", reason: "A sala já tem 2 jogadores." });
          return;
        }
        const player = this.makePlayer("guest", String(msg.name || "Caçador 2").slice(0, 18), 1);
        this.state.players.push(player);
        conn.send({ type: "welcome", playerId: "guest", state: this.state });
        toast(player.name + " entrou na sala.");
        peerStateEl.textContent = "parceiro conectado";
        this.broadcastState();
        return;
      }

      if (!this.state.players.some(p => p.id === "guest")) return;

      if (msg.type === "playerState") this.applyPlayerState("guest", msg.data);
      if (msg.type === "action") this.handleAction("guest", msg.action, msg.payload);
    }

    removeGuest() {
      if (this.role !== "host" || !this.state) return;
      const guest = this.state.players.find(p => p.id === "guest");
      this.state.players = this.state.players.filter(p => p.id !== "guest");
      this.guestConn = null;
      if (guest) toast(guest.name + " saiu da sala.");
      peerStateEl.textContent = "aguardando parceiro";
      this.broadcastState();
    }

    async joinRoom(code, name) {
      if (!window.Peer) throw new Error("O sistema multiplayer não carregou.");
      setBusy(true, "Entrando...");
      this.destroyPeer();

      return new Promise((resolve, reject) => {
        const peer = new Peer(undefined, { debug: 0 });
        this.peer = peer;
        let done = false;

        const failTimer = setTimeout(() => {
          if (done) return;
          done = true;
          setBusy(false);
          this.destroyPeer();
          reject(new Error("Sala não encontrada ou conexão bloqueada."));
        }, 11000);

        peer.on("open", () => {
          const conn = peer.connect("bh-" + code, { reliable: true, serialization: "json" });
          this.conn = conn;

          conn.on("open", () => {
            conn.send({ type: "join", name });
          });

          conn.on("data", msg => {
            if (!msg || typeof msg !== "object") return;

            if (msg.type === "reject") {
              if (done) return;
              done = true;
              clearTimeout(failTimer);
              setBusy(false);
              this.destroyPeer();
              reject(new Error(msg.reason || "Não foi possível entrar."));
            }

            if (msg.type === "welcome") {
              if (done) return;
              done = true;
              clearTimeout(failTimer);
              setBusy(false);
              this.role = "guest";
              this.connected = true;
              roomCode = code;
              localPlayerId = msg.playerId;
              this.receiveState(msg.state);
              peerStateEl.textContent = "conectado ao anfitrião";
              resolve(code);
            }

            if (msg.type === "state" && this.role === "guest") this.receiveState(msg.state);
            if (msg.type === "toast" && this.role === "guest") toast(msg.text);
          });

          conn.on("close", () => {
            if (this.role === "guest") {
              peerStateEl.textContent = "anfitrião desconectou";
              toast("O anfitrião saiu da partida.");
            }
          });
        });

        peer.on("error", err => {
          if (!done) {
            done = true;
            clearTimeout(failTimer);
            setBusy(false);
            this.destroyPeer();
            reject(new Error(
              err && err.type === "peer-unavailable"
                ? "Sala não encontrada. Confira o código."
                : "Não foi possível conectar à sala."
            ));
          }
        });
      });
    }

    startSolo(name) {
      this.destroyPeer();
      this.role = "solo";
      this.connected = true;
      roomCode = "SOLO";
      localPlayerId = "host";
      this.state = this.makeRoom("SOLO", name);
      this.publishState();
      this.startHostLoop();
      peerStateEl.textContent = "modo solo";
    }

    destroyPeer() {
      clearInterval(this.hostTimer);
      this.hostTimer = 0;
      try { if (this.conn) this.conn.close(); } catch {}
      try { if (this.guestConn) this.guestConn.close(); } catch {}
      try { if (this.peer) this.peer.destroy(); } catch {}
      this.conn = null;
      this.guestConn = null;
      this.peer = null;
    }

    applyPlayerState(id, data) {
      const p = this.state && this.state.players.find(x => x.id === id);
      if (!p || !data) return;
      const x = Number(data.x), y = Number(data.y), angle = Number(data.angle);
      if (Number.isFinite(x)) p.x = clamp(x, 35, WORLD.width - 35);
      if (Number.isFinite(y)) p.y = clamp(y, 35, WORLD.height - 35);
      if (Number.isFinite(angle)) p.angle = angle;
      p.attacking = !!data.attacking;
      p.shooting = !!data.shooting;
      p.dash = !!data.dash;
    }

    sendPlayerState(data) {
      if (this.role === "host" || this.role === "solo") {
        this.applyPlayerState("host", data);
      } else if (this.role === "guest" && this.conn && this.conn.open) {
        this.conn.send({ type: "playerState", data });
      }
    }

    action(action, payload = null) {
      if (this.role === "host" || this.role === "solo") {
        return this.handleAction("host", action, payload);
      }
      if (this.role === "guest" && this.conn && this.conn.open) {
        this.conn.send({ type: "action", action, payload });
        return true;
      }
      return false;
    }

    handleAction(playerId, action, payload) {
      if (!this.state) return false;
      const p = this.state.players.find(x => x.id === playerId);
      if (!p) return false;

      if (action === "startContract") {
        if (this.state.contractActive) return false;
        this.state.contractActive = true;
        this.state.bounty = this.makeFreshBounty(this.state.contractLevel);
        this.state.bounty.active = true;
        this.state.message = "CONTRATO ATIVO: capture " + this.state.bounty.name + ".";
        this.hostToast("Contrato iniciado: " + this.state.bounty.name);
        this.broadcastState();
        return true;
      }

      if (action === "damageBounty") {
        const b = this.state.bounty;
        if (!this.state.contractActive || !b.active || b.captured || p.downed) return false;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        const amount = clamp(Number(payload && payload.amount) || 0, 0, 24);
        if (d > 370 || amount <= 0) return false;
        b.hp = Math.max(1, b.hp - amount);
        b.flash = 0.11;
        if (b.hp <= b.maxHp * 0.18) {
          this.state.message = b.name + " está vulnerável. Aproxime-se e pressione E.";
        }
        return true;
      }

      if (action === "capture") {
        const b = this.state.bounty;
        if (!this.state.contractActive || b.captured) return false;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d > 100) { this.hostToast("Chegue mais perto."); return false; }
        if (b.hp > b.maxHp * 0.18) { this.hostToast("Enfraqueça o alvo primeiro."); return false; }

        b.captured = true;
        b.active = false;
        this.state.contractActive = false;

        const rewardEach = Math.floor(b.reward / Math.max(1, this.state.players.length));
        this.state.players.forEach(pl => pl.money += rewardEach);
        this.state.message = "ALVO CAPTURADO +$" + rewardEach + " para cada caçador.";
        this.state.contractLevel += 1;
        this.hostToast("ALVO CAPTURADO · +$" + rewardEach);
        if (gameScene) gameScene.captureFlash();
        this.broadcastState();

        setTimeout(() => {
          if (!this.state) return;
          this.state.bounty = this.makeFreshBounty(this.state.contractLevel);
          this.state.message = "Novo contrato disponível no quadro.";
          this.broadcastState();
        }, 3000);
        return true;
      }

      if (action === "revive") {
        const target = this.state.players.find(x => x.id === (payload && payload.targetId));
        if (!target || !target.downed || p.downed) return false;
        if (Math.hypot(p.x - target.x, p.y - target.y) > 95) return false;
        target.downed = false;
        target.hp = 45;
        this.hostToast(p.name + " reviveu " + target.name + ".");
        return true;
      }

      return false;
    }

    hostToast(text) {
      toast(text);
      if (this.guestConn && this.guestConn.open) this.guestConn.send({ type: "toast", text });
    }

    startHostLoop() {
      clearInterval(this.hostTimer);
      this.lastHostTick = performance.now();
      this.hostTimer = setInterval(() => this.hostTick(), 50);
    }

    hostTick() {
      if (!this.state || (this.role !== "host" && this.role !== "solo")) return;
      const now = performance.now();
      const dt = Math.min(.05, Math.max(.001, (now - this.lastHostTick) / 1000));
      this.lastHostTick = now;

      const b = this.state.bounty;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b.attackCooldown > 0) b.attackCooldown -= dt;

      if (this.state.contractActive && b.active && !b.captured) {
        const alive = this.state.players.filter(p => !p.downed);
        if (alive.length) {
          let target = alive[0];
          let best = Infinity;
          for (const p of alive) {
            const d = Math.hypot(p.x - b.x, p.y - b.y);
            if (d < best) { best = d; target = p; }
          }

          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const speed = 75 + this.state.contractLevel * 7;

          if (best > 85) {
            b.vx = (dx / len) * speed;
            b.vy = (dy / len) * speed;
            b.x = clamp(b.x + b.vx * dt, 35, WORLD.width - 35);
            b.y = clamp(b.y + b.vy * dt, 35, WORLD.height - 35);
          } else {
            b.vx = 0; b.vy = 0;
            if (b.attackCooldown <= 0) {
              b.attackCooldown = Math.max(.55, 1.18 - this.state.contractLevel * .05);
              target.hp = Math.max(0, target.hp - (11 + this.state.contractLevel * 2));
              target.lastDamageAt = Date.now();
              if (target.hp <= 0) {
                target.downed = true;
                this.state.message = target.name + " caiu! O parceiro pode reviver com E.";
                this.hostToast(target.name + " caiu!");
              }
            }
          }
        }
      }

      const wallNow = Date.now();
      for (const p of this.state.players) {
        if (!p.downed && wallNow - p.lastDamageAt > 4500 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 6 * dt);
        }
      }

      this.broadcastAccumulator += dt;
      if (this.broadcastAccumulator >= .066) {
        this.broadcastAccumulator = 0;
        this.broadcastState();
      }
      this.publishState();
    }

    broadcastState() {
      if (this.role === "host" && this.guestConn && this.guestConn.open) {
        this.guestConn.send({ type: "state", state: this.state });
      }
      this.publishState();
    }

    publishState() {
      if (!this.state) return;
      latestState = JSON.parse(JSON.stringify(this.state));
      updateHud();
      if (gameScene) gameScene.applyNetworkState(latestState);
    }

    receiveState(state) {
      if (!state) return;
      latestState = state;
      updateHud();
      if (gameScene) gameScene.applyNetworkState(state);
    }
  }

  const network = new NetworkManager();

  function updateHud() {
    if (!latestState || !localPlayerId) return;
    const me = latestState.players.find(p => p.id === localPlayerId);
    if (me) {
      moneyEl.textContent = "$" + Math.floor(me.money);
      hpBarEl.style.width = clamp((me.hp / Math.max(1, me.maxHp)) * 100, 0, 100) + "%";
    }
    contractEl.textContent = latestState.contractActive
      ? latestState.bounty.name + " · NV " + latestState.contractLevel
      : "SEM CONTRATO";
    objectiveEl.textContent = latestState.message || "";
  }

  function enterGame() {
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
    controls.classList.remove("hidden");
    roomCodeEl.textContent = roomCode || "SOLO";
    copyBtn.style.display = roomCode === "SOLO" ? "none" : "";
    if (gameScene) gameScene.networkReady = true;
  }

  createBtn.addEventListener("click", async () => {
    try {
      const code = await network.createRoom(safeName());
      roomCode = code;
      enterGame();
      peerStateEl.textContent = "aguardando parceiro";
      toast("Sala " + code + " criada.");
    } catch (err) {
      setBusy(false);
      lobbyMsg.textContent = err.message || "Não foi possível criar a sala.";
    }
  });

  joinBtn.addEventListener("click", async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 5) {
      lobbyMsg.textContent = "Digite o código de 5 caracteres.";
      return;
    }
    try {
      await network.joinRoom(code, safeName());
      roomCode = code;
      enterGame();
      toast("Você entrou na sala " + code + ".");
    } catch (err) {
      lobbyMsg.textContent = err.message || "Não foi possível entrar.";
    }
  });

  soloBtn.addEventListener("click", () => {
    network.startSolo(safeName());
    enterGame();
    toast("Treino solo iniciado.");
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  });
  codeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") joinBtn.click();
  });

  copyBtn.addEventListener("click", async () => {
    if (!roomCode || roomCode === "SOLO") return;
    try {
      await navigator.clipboard.writeText(roomCode);
      toast("Código copiado.");
    } catch {
      toast("Código da sala: " + roomCode);
    }
  });

  class HunterAvatar extends Phaser.GameObjects.Container {
    constructor(scene, x, y, slot, isLocal = false) {
      super(scene, x, y);
      scene.add.existing(this);
      this.slot = slot;
      this.isLocal = isLocal;
      this.walkPhase = 0;
      this.targetX = x;
      this.targetY = y;
      this.targetAngle = 0;
      this.downed = false;

      const accent = slot === 0 ? 0xe61b26 : 0x2fa8d2;
      this.shadow = scene.add.ellipse(0, 22, 46, 18, 0x000000, .48);
      this.legL = scene.add.rectangle(-8, 15, 9, 25, 0x1b1d22).setOrigin(.5, .15);
      this.legR = scene.add.rectangle(8, 15, 9, 25, 0x1b1d22).setOrigin(.5, .15);
      this.coatBack = scene.add.triangle(0, 19, -18, 0, 18, 0, 0, 30, 0x111319, .92);
      this.coat = scene.add.rectangle(0, 1, 31, 42, 0x202329).setStrokeStyle(2, accent, .92);
      this.belt = scene.add.rectangle(0, 11, 30, 5, 0x08090b);
      this.armL = scene.add.rectangle(-20, 2, 8, 28, 0x282b31).setOrigin(.5, .15);
      this.armR = scene.add.rectangle(20, 2, 8, 28, 0x282b31).setOrigin(.5, .15);
      this.head = scene.add.circle(0, -28, 12, 0xc99b79).setStrokeStyle(2, 0x090909);
      this.hat = scene.add.rectangle(0, -39, 34, 7, 0x111318);
      this.hatTop = scene.add.rectangle(0, -45, 22, 12, 0x17191e);
      this.mask = scene.add.rectangle(0, -25, 22, 6, accent, .86);
      this.gun = scene.add.rectangle(25, 0, 24, 5, 0xd7d8da).setOrigin(.05, .5);
      this.muzzle = scene.add.circle(47, 0, 4, 0xffd7a0, 0);

      this.add([
        this.shadow, this.legL, this.legR, this.coatBack, this.coat, this.belt,
        this.armL, this.armR, this.head, this.hat, this.hatTop, this.mask, this.gun, this.muzzle
      ]);
      this.setDepth(10);
    }

    animate(delta, moving, angle, dash, attacking, shooting) {
      this.walkPhase += delta * (moving ? .013 : .004);
      const sway = moving ? Math.sin(this.walkPhase * 9) : 0;
      this.legL.rotation = sway * .42;
      this.legR.rotation = -sway * .42;
      this.armL.rotation = -sway * .22;
      this.armR.rotation = angle - Math.PI / 2;
      this.coat.y = moving ? Math.abs(Math.sin(this.walkPhase * 9)) * -2 : 1;
      this.coatBack.rotation = -sway * .05;
      this.gun.rotation = angle;
      this.mask.alpha = this.downed ? .25 : 1;
      this.alpha = this.downed ? .43 : 1;
      this.setScale(dash ? 1.08 : 1);
      if (attacking) this.armL.rotation = Math.sin(this.walkPhase * 35) * .95;
      this.gun.x = shooting ? 21 : 25;
      this.muzzle.alpha = shooting ? .85 : 0;
      this.muzzle.rotation = angle;
      this.muzzle.x = 47 * Math.cos(angle);
      this.muzzle.y = 47 * Math.sin(angle);
    }
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super("main");
      this.networkReady = false;
      this.remotePlayers = new Map();
      this.lastSend = 0;
      this.lastShot = 0;
      this.lastMelee = 0;
      this.dashUntil = 0;
      this.dashReadyAt = 0;
      this.local = null;
      this.bountyVisual = null;
      this.bountyHpBg = null;
      this.bountyHpFill = null;
      this.boardGlow = null;
      this.interactText = null;
      this.particles = [];
    }

    create() {
      gameScene = this;
      this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
      this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
      this.cameras.main.setBackgroundColor("#07080a");
      this.drawCity();

      this.local = new HunterAvatar(this, 380, 520, 0, true);
      this.cameras.main.startFollow(this.local, true, .08, .08);
      this.cameras.main.setZoom(1.04);

      this.keys = this.input.keyboard.addKeys("W,A,S,D,SHIFT,SPACE,E");
      this.input.on("pointerdown", pointer => {
        if (pointer.leftButtonDown()) this.tryShoot(pointer);
      });

      this.interactText = this.add.text(0, 0, "", {
        fontFamily: "Arial", fontSize: "14px", color: "#ffffff",
        backgroundColor: "#111318dd", padding: { x: 8, y: 5 }
      }).setDepth(60).setVisible(false);

      if (latestState) this.applyNetworkState(latestState);
    }

    drawCity() {
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(0x08090c, 1).fillRect(0, 0, WORLD.width, WORLD.height);

      // Pavement blocks
      g.fillStyle(0x101217, 1).fillRect(0, 340, 1600, 280);
      g.fillStyle(0x101217, 1).fillRect(645, 0, 330, 900);

      // Road borders
      g.fillStyle(0x1b1e24, 1).fillRect(0, 350, 1600, 12);
      g.fillStyle(0x1b1e24, 1).fillRect(0, 598, 1600, 12);
      g.fillStyle(0x1b1e24, 1).fillRect(655, 0, 12, 900);
      g.fillStyle(0x1b1e24, 1).fillRect(953, 0, 12, 900);

      g.lineStyle(3, 0x343740, .62);
      g.lineBetween(0, 480, 1600, 480);
      g.lineBetween(810, 0, 810, 900);
      g.lineStyle(2, 0x7a1117, .52);
      for (let x = 18; x < 1600; x += 94) g.lineBetween(x, 476, x + 46, 476);
      for (let y = 18; y < 900; y += 94) g.lineBetween(806, y, 806, y + 46);

      const buildings = [
        [50, 55, 330, 240], [420, 65, 180, 210], [1020, 48, 480, 250],
        [65, 655, 450, 180], [1030, 655, 500, 190], [1060, 330, 330, 170]
      ];
      buildings.forEach(([x, y, w, h], i) => {
        g.fillStyle(i % 2 ? 0x15171c : 0x111318, 1).fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, 0x353841, .82).strokeRoundedRect(x, y, w, h, 8);
        g.fillStyle(0x5d0a10, .48).fillRect(x + 16, y + 18, Math.min(110, w - 32), 8);
        for (let wx = x + 28; wx < x + w - 20; wx += 52) {
          for (let wy = y + 50; wy < y + h - 20; wy += 48) {
            g.fillStyle(0x5a2428, .24).fillRect(wx, wy, 22, 14);
          }
        }
      });

      // Lamps / atmosphere
      for (const [x, y] of [[620, 330], [1000, 330], [620, 635], [1000, 635], [1380, 315]]) {
        this.add.circle(x, y, 52, 0xb4141d, .035).setDepth(1);
        this.add.rectangle(x, y, 5, 38, 0x34373e).setDepth(2);
        this.add.circle(x, y - 22, 7, 0xca2028, .75).setDepth(3);
      }

      // Bounty board
      const board = this.add.container(245, 405).setDepth(4);
      this.boardGlow = this.add.rectangle(0, 0, 106, 136, 0x890b12, .12).setStrokeStyle(2, 0xca1823, .75);
      const wood = this.add.rectangle(0, 0, 80, 116, 0x33251f).setStrokeStyle(3, 0x8e5d43);
      const paper = this.add.rectangle(0, -6, 58, 75, 0xd4c3a0);
      const eye = this.add.text(0, -12, "◉", { fontSize:"35px", color:"#8f0710", fontStyle:"bold" }).setOrigin(.5);
      const label = this.add.text(0, 40, "CONTRATOS", { fontSize:"10px", color:"#ffffff", fontStyle:"bold" }).setOrigin(.5);
      board.add([this.boardGlow, wood, paper, eye, label]);
      this.board = board;

      // Extraction / prison
      this.add.rectangle(1420, 500, 136, 136, 0x34070a, .23).setStrokeStyle(3, 0xbd101b, .68).setDepth(2);
      for (let i = -45; i <= 45; i += 22) this.add.rectangle(1420 + i, 500, 5, 120, 0x3c4149).setDepth(3);
      this.add.text(1420, 576, "PRISÃO", { fontSize:"17px", color:"#d1d1d1", fontStyle:"bold" }).setOrigin(.5).setDepth(3);

      this.add.text(1100, 92, "RED EYE DISTRICT", { fontSize:"22px", color:"#b7131c", fontStyle:"bold" }).setDepth(3);
      this.add.text(100, 694, "GUNSMITH", { fontSize:"18px", color:"#9f9f9f", fontStyle:"bold" }).setDepth(3);
      this.add.text(1220, 704, "BLACK IRON HOLD", { fontSize:"16px", color:"#80838a", fontStyle:"bold" }).setDepth(3);
    }

    ensureRemote(p) {
      let avatar = this.remotePlayers.get(p.id);
      if (!avatar) {
        avatar = new HunterAvatar(this, p.x, p.y, p.slot, false);
        this.remotePlayers.set(p.id, avatar);
      }
      avatar.targetX = p.x;
      avatar.targetY = p.y;
      avatar.targetAngle = p.angle;
      avatar.downed = p.downed;
      avatar.netAttacking = p.attacking;
      avatar.netShooting = p.shooting;
      avatar.netDash = p.dash;
      return avatar;
    }

    applyNetworkState(state) {
      if (!this.local || !localPlayerId) return;
      const ids = new Set();

      for (const p of state.players) {
        ids.add(p.id);
        if (p.id === localPlayerId) {
          this.local.downed = p.downed;
          if (p.downed) {
            this.local.x = Phaser.Math.Linear(this.local.x, p.x, .22);
            this.local.y = Phaser.Math.Linear(this.local.y, p.y, .22);
          }
        } else {
          this.ensureRemote(p);
        }
      }

      for (const [id, avatar] of this.remotePlayers) {
        if (!ids.has(id)) {
          avatar.destroy(true);
          this.remotePlayers.delete(id);
        }
      }
      this.updateBounty(state.bounty, state.contractActive);
    }

    updateBounty(b, active) {
      if (!b) return;
      if (!this.bountyVisual) {
        const c = this.add.container(b.x, b.y).setDepth(9);
        const shadow = this.add.ellipse(0, 28, 74, 27, 0x000000, .54);
        const legs = this.add.rectangle(0, 18, 36, 35, 0x191b1f);
        const cape = this.add.triangle(0, 20, -28, 0, 28, 0, 0, 46, 0x17191f);
        const body = this.add.rectangle(0, -4, 58, 64, 0x2b2e35).setStrokeStyle(3, 0x9f0f17);
        const shoulderL = this.add.circle(-33, -7, 14, 0x3a3d43);
        const shoulderR = this.add.circle(33, -7, 14, 0x3a3d43);
        const head = this.add.circle(0, -50, 18, 0x17191d).setStrokeStyle(3, 0x9f0f17);
        const eye = this.add.rectangle(0, -50, 25, 5, 0xff1828);
        const hornL = this.add.triangle(-13, -66, -8, 0, 6, 0, 0, -18, 0x4a0b10);
        const hornR = this.add.triangle(13, -66, -8, 0, 6, 0, 0, -18, 0x4a0b10);
        c.add([shadow, cape, legs, body, shoulderL, shoulderR, head, hornL, hornR, eye]);
        this.bountyVisual = c;

        this.bountyHpBg = this.add.rectangle(0, -88, 96, 8, 0x151515).setOrigin(.5).setDepth(20);
        this.bountyHpFill = this.add.rectangle(-48, -88, 96, 8, 0xd0111b).setOrigin(0, .5).setDepth(21);
      }

      const visible = active && !b.captured;
      this.bountyVisual.setVisible(visible);
      this.bountyHpBg.setVisible(visible);
      this.bountyHpFill.setVisible(visible);

      this.bountyVisual.x = Phaser.Math.Linear(this.bountyVisual.x, b.x, .20);
      this.bountyVisual.y = Phaser.Math.Linear(this.bountyVisual.y, b.y, .20);
      this.bountyHpBg.setPosition(this.bountyVisual.x, this.bountyVisual.y - 88);
      this.bountyHpFill.setPosition(this.bountyVisual.x - 48, this.bountyVisual.y - 88);
      this.bountyHpFill.width = 96 * Phaser.Math.Clamp(b.hp / Math.max(1, b.maxHp), 0, 1);
      this.bountyVisual.setAlpha(b.flash > 0 ? .42 : 1);
    }

    tryShoot(pointer) {
      if (!this.networkReady || !this.local || this.local.downed) return;
      const now = this.time.now;
      if (now - this.lastShot < 230) return;
      this.lastShot = now;

      const world = pointer.positionToCamera(this.cameras.main);
      const angle = Phaser.Math.Angle.Between(this.local.x, this.local.y, world.x, world.y);
      this.fireTracer(angle);

      if (latestState && latestState.contractActive) {
        const b = latestState.bounty;
        const d = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
        const targetAngle = Phaser.Math.Angle.Between(this.local.x, this.local.y, b.x, b.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(targetAngle - angle));
        if (d < 370 && diff < .17) network.action("damageBounty", { amount: 15 });
      }
      this.shootingUntil = now + 90;
    }

    fireTracer(angle) {
      const x1 = this.local.x + Math.cos(angle) * 28;
      const y1 = this.local.y + Math.sin(angle) * 28;
      const x2 = x1 + Math.cos(angle) * 310;
      const y2 = y1 + Math.sin(angle) * 310;
      const tracer = this.add.line(0, 0, x1, y1, x2, y2, 0xffd9d9, .95).setOrigin(0, 0).setDepth(15).setLineWidth(2);
      const flash = this.add.circle(x1, y1, 8, 0xffc4c4, .9).setDepth(16);
      this.tweens.add({
        targets:[tracer, flash], alpha:0, duration:90,
        onComplete:() => { tracer.destroy(); flash.destroy(); }
      });
      this.cameras.main.shake(45, .0012);
    }

    tryMelee() {
      if (!latestState || !latestState.contractActive || this.local.downed) return;
      const now = this.time.now;
      if (now - this.lastMelee < 480) return;
      this.lastMelee = now;

      const b = latestState.bounty;
      const d = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
      if (d < 100) network.action("damageBounty", { amount: 23 });

      const arc = this.add.arc(this.local.x, this.local.y, 58, -65, 65, false, 0xe81c27, .20).setDepth(14);
      arc.rotation = this.localAim;
      this.tweens.add({
        targets:arc, alpha:0, scaleX:1.4, scaleY:1.4, duration:165,
        onComplete:() => arc.destroy()
      });
    }

    tryInteract() {
      if (!latestState || this.local.downed) return;

      const boardDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, this.board.x, this.board.y);
      if (boardDist < 100 && !latestState.contractActive) {
        network.action("startContract");
        return;
      }

      if (latestState.contractActive) {
        const b = latestState.bounty;
        const bd = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
        if (bd < 100) {
          network.action("capture");
          return;
        }
      }

      const downed = latestState.players.find(
        p => p.id !== localPlayerId && p.downed &&
        Phaser.Math.Distance.Between(this.local.x, this.local.y, p.x, p.y) < 95
      );
      if (downed) network.action("revive", { targetId: downed.id });
    }

    captureFlash() {
      this.cameras.main.flash(180, 145, 0, 0);
      this.cameras.main.shake(120, .0022);
    }

    update(_time, delta) {
      if (!this.local || !this.keys) return;
      const pointer = this.input.activePointer;
      const world = pointer.positionToCamera(this.cameras.main);
      this.localAim = Phaser.Math.Angle.Between(this.local.x, this.local.y, world.x, world.y);

      let dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
      let dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
      }

      const now = this.time.now;
      if (Phaser.Input.Keyboard.JustDown(this.keys.SHIFT) && now > this.dashReadyAt && !this.local.downed) {
        this.dashUntil = now + 180;
        this.dashReadyAt = now + 900;
        this.cameras.main.shake(80, .002);
      }

      const dashing = now < this.dashUntil;
      const speed = this.local.downed ? 0 : (dashing ? 520 : 225);

      if (moving) {
        this.local.x += dx * speed * delta / 1000;
        this.local.y += dy * speed * delta / 1000;
      }

      this.local.x = Phaser.Math.Clamp(this.local.x, 30, WORLD.width - 30);
      this.local.y = Phaser.Math.Clamp(this.local.y, 30, WORLD.height - 30);

      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryMelee();
      if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
      if (pointer.isDown && pointer.leftButtonDown()) this.tryShoot(pointer);

      const attacking = now - this.lastMelee < 170;
      const shooting = now < (this.shootingUntil || 0);
      this.local.animate(delta, moving, this.localAim, dashing, attacking, shooting);

      for (const avatar of this.remotePlayers.values()) {
        const ox = avatar.x, oy = avatar.y;
        avatar.x = Phaser.Math.Linear(avatar.x, avatar.targetX, .20);
        avatar.y = Phaser.Math.Linear(avatar.y, avatar.targetY, .20);
        const rmoving = Phaser.Math.Distance.Between(ox, oy, avatar.x, avatar.y) > .2;
        avatar.animate(delta, rmoving, avatar.targetAngle, avatar.netDash, avatar.netAttacking, avatar.netShooting);
      }

      if (this.boardGlow) this.boardGlow.alpha = .10 + Math.sin(now * .004) * .05;
      this.updateInteractionHint();

      if (this.networkReady && now - this.lastSend > 55) {
        this.lastSend = now;
        network.sendPlayerState({
          x: this.local.x,
          y: this.local.y,
          angle: this.localAim,
          attacking,
          shooting,
          dash: dashing
        });
      }
    }

    updateInteractionHint() {
      if (!latestState || !this.interactText) return;

      let text = "";
      let tx = this.local.x, ty = this.local.y - 70;

      const boardDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, this.board.x, this.board.y);
      if (boardDist < 100 && !latestState.contractActive) text = "[E] PEGAR CONTRATO";

      if (latestState.contractActive) {
        const b = latestState.bounty;
        const bd = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
        if (bd < 105 && b.hp <= b.maxHp * .18) {
          text = "[E] CAPTURAR ALVO";
          tx = b.x; ty = b.y - 120;
        }
      }

      const downed = latestState.players.find(
        p => p.id !== localPlayerId && p.downed &&
        Phaser.Math.Distance.Between(this.local.x, this.local.y, p.x, p.y) < 95
      );
      if (downed) {
        text = "[E] REVIVER " + downed.name.toUpperCase();
        tx = downed.x; ty = downed.y - 70;
      }

      this.interactText.setVisible(!!text).setText(text).setPosition(tx, ty).setOrigin(.5);
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    backgroundColor: "#07080a",
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [MainScene]
  });
})();
