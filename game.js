(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const lobby = $("lobby");
  const nameInput = $("name");
  const codeInput = $("code");
  const coatSelect = $("coat");
  const accentSelect = $("accent");
  const hatSelect = $("hat");
  const weaponSelect = $("weapon");
  const createBtn = $("create");
  const joinBtn = $("join");
  const soloBtn = $("solo");
  const lobbyMsg = $("lobby-msg");
  const hud = $("hud");
  const controls = $("controls");
  const roomCodeEl = $("room-code");
  const peerStateEl = $("peer-state");
  const moneyEl = $("money");
  const contractEl = $("contract");
  const objectiveEl = $("objective");
  const hpBarEl = $("hp-bar");
  const weaponNameEl = $("weapon-name");
  const ammoEl = $("ammo");
  const copyBtn = $("copy-code");
  const toastEl = $("toast");
  const netDot = $("net-dot");
  const netStatus = $("net-status");
  const fatal = $("fatal");
  const fatalText = $("fatal-text");
  const reloadBtn = $("reload");
  const previewWeapon = $("preview-weapon");
  const previewStats = $("preview-stats");
  const previewHunter = $("preview-hunter");

  const WORLD = { width: 1800, height: 1050 };
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const WEAPONS = {
    revolver: {
      id: "revolver", name: "REVÓLVER", damage: 18, range: 460, cooldown: 280,
      mag: 6, reload: 900, pellets: 1, spread: 0.018, tracer: 0xffe0d7,
      info: "equilibrado · 6 tiros · recarga rápida"
    },
    shotgun: {
      id: "shotgun", name: "ESCOPETA", damage: 8, range: 300, cooldown: 720,
      mag: 4, reload: 1250, pellets: 6, spread: 0.18, tracer: 0xffd0a8,
      info: "curto alcance · 6 projéteis · impacto alto"
    },
    rifle: {
      id: "rifle", name: "RIFLE", damage: 11, range: 650, cooldown: 145,
      mag: 18, reload: 1150, pellets: 1, spread: 0.03, tracer: 0xd9edff,
      info: "longo alcance · automático · pente grande"
    },
    handcannon: {
      id: "handcannon", name: "CANHÃO DE MÃO", damage: 34, range: 500, cooldown: 650,
      mag: 4, reload: 1400, pellets: 1, spread: 0.012, tracer: 0xffc0c0,
      info: "dano enorme · 4 tiros · recarga lenta"
    }
  };

  const WEAPON_ORDER = ["revolver", "shotgun", "rifle", "handcannon"];
  const COAT_PALETTE = ["7f121a", "20242d", "4b4d52", "314537", "67513f"];
  const ACCENT_PALETTE = ["e61b26", "2fa8d2", "d59b2b", "8f57c7", "5fc777"];

  let latestState = null;
  let localPlayerId = null;
  let gameScene = null;
  let roomCode = null;
  let toastTimer = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function hexNum(v, fallback = 0xffffff) {
    const n = Number.parseInt(String(v || "").replace("#", ""), 16);
    return Number.isFinite(n) ? n : fallback;
  }
  function randomCode() {
    let out = "";
    for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
  }
  function safeName() {
    return (nameInput.value || "Caçador").trim().slice(0, 18) || "Caçador";
  }
  function currentAppearance() {
    return {
      coat: coatSelect.value,
      accent: accentSelect.value,
      hat: hatSelect.value
    };
  }
  function selectedWeapon() {
    return WEAPONS[weaponSelect.value] ? weaponSelect.value : "revolver";
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

  function updatePreview() {
    const coat = "#" + coatSelect.value;
    const accent = "#" + accentSelect.value;
    const body = previewHunter.querySelector(".preview-body");
    const band = previewHunter.querySelector(".preview-band");
    const brim = previewHunter.querySelector(".preview-hat.brim");
    const crown = previewHunter.querySelector(".preview-hat.crown");
    if (body) { body.style.background = coat; body.style.borderColor = accent; }
    if (band) band.style.background = accent;

    const hat = hatSelect.value;
    if (brim && crown) {
      brim.style.display = hat === "none" ? "none" : "block";
      crown.style.display = hat === "none" ? "none" : "block";
      if (hat === "hood") {
        brim.style.width = "34px"; brim.style.left = "30px"; brim.style.borderRadius = "18px 18px 4px 4px";
        crown.style.width = "30px"; crown.style.left = "32px"; crown.style.borderRadius = "16px 16px 4px 4px";
      } else if (hat === "cap") {
        brim.style.width = "29px"; brim.style.left = "43px"; brim.style.transform = "rotate(-5deg)";
        crown.style.width = "31px"; crown.style.left = "31px"; crown.style.borderRadius = "12px 12px 3px 3px";
      } else {
        brim.style.width = "45px"; brim.style.left = "25px"; brim.style.transform = "";
        crown.style.width = "29px"; crown.style.left = "33px"; crown.style.borderRadius = "";
      }
    }

    const w = WEAPONS[selectedWeapon()];
    previewWeapon.textContent = w.name;
    previewStats.textContent = w.info;
  }

  [coatSelect, accentSelect, hatSelect, weaponSelect].forEach(el => el.addEventListener("change", updatePreview));
  updatePreview();

  if (!window.Phaser) {
    fatalError("O Phaser não carregou. Verifique sua internet e recarregue a página.");
    return;
  }
  if (window.Peer) setNetworkStatus("Multiplayer P2P pronto.", "ok");
  else setNetworkStatus("PeerJS não carregou. O modo solo ainda funciona.", "bad");

  class NetworkManager {
    constructor() {
      this.role = "none";
      this.peer = null;
      this.conn = null;
      this.guestConn = null;
      this.state = null;
      this.hostTimer = 0;
      this.lastHostTick = performance.now();
      this.broadcastAccumulator = 0;
      this.connected = false;
    }

    makePlayer(id, name, slot, appearance, weaponId) {
      const spawn = slot === 0 ? { x: 430, y: 555 } : { x: 515, y: 555 };
      const weapon = WEAPONS[weaponId] || WEAPONS.revolver;
      return {
        id, name, slot, x: spawn.x, y: spawn.y, angle: 0,
        hp: 100, maxHp: 100, money: 250, downed: false,
        attacking: false, shooting: false, dash: false,
        lastDamageAt: 0, lastShotAt: 0,
        weaponId: weapon.id, ammo: weapon.mag, reloadingUntil: 0,
        damageLevel: 0, hpLevel: 0, speedLevel: 0,
        appearance: {
          coat: appearance && appearance.coat || (slot === 0 ? "20242d" : "314537"),
          accent: appearance && appearance.accent || (slot === 0 ? "e61b26" : "2fa8d2"),
          hat: appearance && appearance.hat || "wide"
        }
      };
    }

    makeFreshBounty(level = 1) {
      const templates = [
        { name: "RUST JACK", hp: 250, reward: 320, speed: 88, accent: "b3252d" },
        { name: "VEX MARROW", hp: 310, reward: 430, speed: 116, accent: "8547c7" },
        { name: "THE RED WARDEN", hp: 430, reward: 560, speed: 76, accent: "e01923" },
        { name: "HOLLOW EYE", hp: 370, reward: 620, speed: 102, accent: "d59b2b" }
      ];
      const t = templates[(level - 1) % templates.length];
      const scale = 1 + Math.floor((level - 1) / templates.length) * 0.22;
      const maxHp = Math.round(t.hp * scale);
      return {
        id: "bounty", x: 1320, y: 515, vx: 0, vy: 0,
        hp: maxHp, maxHp, level, active: false, captured: false,
        attackCooldown: 0, flash: 0, name: t.name,
        reward: Math.round(t.reward * scale), speed: t.speed * Math.min(1.35, scale),
        accent: t.accent
      };
    }

    makeHenchmen(level) {
      const count = Math.min(6, 2 + Math.floor(level / 2));
      const spots = [
        [1170, 430], [1435, 610], [1250, 690], [1510, 430], [1090, 640], [1400, 350]
      ];
      const arr = [];
      for (let i = 0; i < count; i++) {
        const maxHp = 60 + level * 12;
        arr.push({
          id: "hench-" + i, x: spots[i][0], y: spots[i][1],
          hp: maxHp, maxHp, active: true, attackCooldown: 0, flash: 0,
          type: i % 3 === 0 ? "brute" : "gunner"
        });
      }
      return arr;
    }

    makeRoom(code, hostName, appearance, weaponId) {
      return {
        code, contractLevel: 1, contractActive: false,
        message: "Encontre o quadro de recompensas e pressione E.",
        bounty: this.makeFreshBounty(1), enemies: [],
        players: [this.makePlayer("host", hostName, 0, appearance, weaponId)]
      };
    }

    async createRoom(name, appearance, weaponId) {
      if (!window.Peer) throw new Error("O sistema multiplayer não carregou.");
      setBusy(true, "Criando sala...");
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        try {
          await this.openHostPeer(code, name, appearance, weaponId);
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

    openHostPeer(code, name, appearance, weaponId) {
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
          this.state = this.makeRoom(code, name, appearance, weaponId);
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
        const p = this.makePlayer(
          "guest", String(msg.name || "Caçador 2").slice(0, 18), 1,
          msg.appearance || {}, WEAPONS[msg.weaponId] ? msg.weaponId : "revolver"
        );
        this.state.players.push(p);
        conn.send({ type: "welcome", playerId: "guest", state: this.state });
        this.hostToast(p.name + " entrou na sala.");
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
      if (guest) this.hostToast(guest.name + " saiu da sala.");
      peerStateEl.textContent = "aguardando parceiro";
      this.broadcastState();
    }

    async joinRoom(code, name, appearance, weaponId) {
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

          conn.on("open", () => conn.send({ type: "join", name, appearance, weaponId }));

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

    startSolo(name, appearance, weaponId) {
      this.destroyPeer();
      this.role = "solo";
      this.connected = true;
      roomCode = "SOLO";
      localPlayerId = "host";
      this.state = this.makeRoom("SOLO", name, appearance, weaponId);
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
      if (Number.isFinite(x)) p.x = clamp(x, 30, WORLD.width - 30);
      if (Number.isFinite(y)) p.y = clamp(y, 30, WORLD.height - 30);
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

    getTargetById(id) {
      if (!this.state) return null;
      if (id === "bounty") return this.state.bounty;
      return this.state.enemies.find(e => e.id === id) || null;
    }

    applyDamage(target, amount, player) {
      if (!target || !target.active) return;
      if (target.id === "bounty") {
        target.hp = Math.max(1, target.hp - amount);
      } else {
        target.hp = Math.max(0, target.hp - amount);
        if (target.hp <= 0) {
          target.active = false;
          player.money += 30;
          this.hostToast(player.name + " derrubou um capanga · +$30");
        }
      }
      target.flash = .11;
    }

    processShot(player, angle) {
      const w = WEAPONS[player.weaponId] || WEAPONS.revolver;
      const damageScale = 1 + player.damageLevel * .16;
      const targets = [];
      if (this.state.contractActive && this.state.bounty.active && !this.state.bounty.captured) {
        targets.push(this.state.bounty);
      }
      for (const e of this.state.enemies) if (e.active) targets.push(e);

      for (let pellet = 0; pellet < w.pellets; pellet++) {
        const spread = w.pellets === 1 ? 0 : ((pellet / Math.max(1, w.pellets - 1)) - .5) * 2 * w.spread;
        const pelletAngle = angle + spread;
        let best = null;
        let bestDist = Infinity;

        for (const t of targets) {
          const d = Math.hypot(t.x - player.x, t.y - player.y);
          if (d > w.range || d >= bestDist) continue;
          const targetAngle = Math.atan2(t.y - player.y, t.x - player.x);
          const diff = Math.abs(Phaser.Math.Angle.Wrap(targetAngle - pelletAngle));
          const tolerance = t.id === "bounty" ? .105 : .13;
          if (diff <= tolerance) {
            best = t;
            bestDist = d;
          }
        }
        if (best) this.applyDamage(best, Math.round(w.damage * damageScale), player);
      }

      const b = this.state.bounty;
      if (this.state.contractActive && b.active && b.hp <= b.maxHp * .18) {
        this.state.message = b.name + " está vulnerável. Aproxime-se e pressione E.";
      }
    }

    handleAction(playerId, action, payload) {
      if (!this.state) return false;
      const p = this.state.players.find(x => x.id === playerId);
      if (!p) return false;
      const now = Date.now();

      if (action === "startContract") {
        if (this.state.contractActive) return false;
        this.state.contractActive = true;
        this.state.bounty = this.makeFreshBounty(this.state.contractLevel);
        this.state.bounty.active = true;
        this.state.enemies = this.makeHenchmen(this.state.contractLevel);
        this.state.message = "CONTRATO ATIVO: capture " + this.state.bounty.name + " e neutralize os capangas.";
        this.hostToast("Contrato iniciado: " + this.state.bounty.name);
        this.broadcastState();
        return true;
      }

      if (action === "shoot") {
        if (p.downed) return false;
        const w = WEAPONS[p.weaponId] || WEAPONS.revolver;
        if (p.reloadingUntil > now) return false;
        if (now - p.lastShotAt < w.cooldown * .86) return false;
        if (p.ammo <= 0) {
          this.hostToast("Sem munição. Pressione R.");
          return false;
        }
        const angle = Number(payload && payload.angle);
        if (!Number.isFinite(angle)) return false;
        p.lastShotAt = now;
        p.ammo -= 1;
        p.shooting = true;
        this.processShot(p, angle);
        return true;
      }

      if (action === "reload") {
        const w = WEAPONS[p.weaponId] || WEAPONS.revolver;
        if (p.downed || p.ammo >= w.mag || p.reloadingUntil > now) return false;
        p.reloadingUntil = now + w.reload;
        this.hostToast(p.name + " está recarregando.");
        return true;
      }

      if (action === "switchWeapon") {
        const id = payload && payload.weaponId;
        if (!WEAPONS[id] || p.reloadingUntil > now) return false;
        p.weaponId = id;
        p.ammo = WEAPONS[id].mag;
        p.lastShotAt = 0;
        this.broadcastState();
        return true;
      }

      if (action === "melee") {
        if (p.downed) return false;
        const targets = [this.state.bounty, ...this.state.enemies];
        for (const t of targets) {
          if (!t || !t.active || t.captured) continue;
          if (Math.hypot(p.x - t.x, p.y - t.y) < 92) {
            this.applyDamage(t, Math.round(25 * (1 + p.damageLevel * .16)), p);
          }
        }
        return true;
      }

      if (action === "capture") {
        const b = this.state.bounty;
        if (!this.state.contractActive || b.captured) return false;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d > 105) { this.hostToast("Chegue mais perto."); return false; }
        if (b.hp > b.maxHp * .18) { this.hostToast("Enfraqueça o alvo primeiro."); return false; }

        b.captured = true;
        b.active = false;
        this.state.contractActive = false;
        this.state.enemies.forEach(e => e.active = false);

        const rewardEach = Math.floor(b.reward / Math.max(1, this.state.players.length));
        this.state.players.forEach(pl => pl.money += rewardEach);
        this.state.message = "ALVO CAPTURADO · +$" + rewardEach + " para cada caçador.";
        this.state.contractLevel += 1;
        this.hostToast("ALVO CAPTURADO · +$" + rewardEach);
        if (gameScene) gameScene.captureFlash();
        this.broadcastState();

        setTimeout(() => {
          if (!this.state) return;
          this.state.bounty = this.makeFreshBounty(this.state.contractLevel);
          this.state.enemies = [];
          this.state.message = "Novo contrato disponível no quadro.";
          this.broadcastState();
        }, 2600);
        return true;
      }

      if (action === "revive") {
        const target = this.state.players.find(x => x.id === (payload && payload.targetId));
        if (!target || !target.downed || p.downed) return false;
        if (Math.hypot(p.x - target.x, p.y - target.y) > 95) return false;
        target.downed = false;
        target.hp = Math.round(target.maxHp * .45);
        this.hostToast(p.name + " reviveu " + target.name + ".");
        return true;
      }

      if (action === "buyDamage") {
        const cost = 150 + p.damageLevel * 90;
        if (Math.hypot(p.x - 235, p.y - 780) > 120) return false;
        if (p.money < cost) { this.hostToast("Dinheiro insuficiente."); return false; }
        if (p.damageLevel >= 4) { this.hostToast("Armas já estão no máximo."); return false; }
        p.money -= cost;
        p.damageLevel += 1;
        this.hostToast("Upgrade de dano nível " + p.damageLevel + ".");
        return true;
      }

      if (action === "buyHealth") {
        const cost = 120 + p.hpLevel * 80;
        if (Math.hypot(p.x - 640, p.y - 290) > 120) return false;
        if (p.money < cost) { this.hostToast("Dinheiro insuficiente."); return false; }
        if (p.hpLevel >= 4) { this.hostToast("Vida já está no máximo."); return false; }
        p.money -= cost;
        p.hpLevel += 1;
        p.maxHp += 20;
        p.hp = p.maxHp;
        this.hostToast("Vida máxima aumentada para " + p.maxHp + ".");
        return true;
      }

      if (action === "cycleStyle") {
        if (Math.hypot(p.x - 1210, p.y - 720) > 120) return false;
        const coatIndex = COAT_PALETTE.indexOf(p.appearance.coat);
        const accentIndex = ACCENT_PALETTE.indexOf(p.appearance.accent);
        p.appearance.coat = COAT_PALETTE[(coatIndex + 1 + COAT_PALETTE.length) % COAT_PALETTE.length];
        p.appearance.accent = ACCENT_PALETTE[(accentIndex + 1 + ACCENT_PALETTE.length) % ACCENT_PALETTE.length];
        const hats = ["wide", "hood", "cap", "none"];
        p.appearance.hat = hats[(hats.indexOf(p.appearance.hat) + 1 + hats.length) % hats.length];
        this.hostToast(p.name + " mudou o visual.");
        this.broadcastState();
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

    damagePlayer(target, amount) {
      if (!target || target.downed) return;
      target.hp = Math.max(0, target.hp - amount);
      target.lastDamageAt = Date.now();
      if (target.hp <= 0) {
        target.downed = true;
        this.state.message = target.name + " caiu! O parceiro pode reviver com E.";
        this.hostToast(target.name + " caiu!");
      }
    }

    moveEnemyToward(enemy, target, dt, speed, stopDist, damage, cooldown) {
      if (!enemy.active || !target || target.downed) return;
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      if (len > stopDist) {
        enemy.x = clamp(enemy.x + (dx / len) * speed * dt, 35, WORLD.width - 35);
        enemy.y = clamp(enemy.y + (dy / len) * speed * dt, 35, WORLD.height - 35);
      } else if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = cooldown;
        this.damagePlayer(target, damage);
      }
    }

    hostTick() {
      if (!this.state || (this.role !== "host" && this.role !== "solo")) return;
      const nowPerf = performance.now();
      const dt = Math.min(.05, Math.max(.001, (nowPerf - this.lastHostTick) / 1000));
      this.lastHostTick = nowPerf;
      const wallNow = Date.now();

      for (const p of this.state.players) {
        if (p.reloadingUntil > 0 && wallNow >= p.reloadingUntil) {
          p.reloadingUntil = 0;
          const w = WEAPONS[p.weaponId] || WEAPONS.revolver;
          p.ammo = w.mag;
        }
        p.shooting = wallNow - p.lastShotAt < 100;

        if (!p.downed && wallNow - p.lastDamageAt > 4300 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 5.5 * dt);
        }
      }

      const b = this.state.bounty;
      if (b && b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b && b.attackCooldown > 0) b.attackCooldown -= dt;

      for (const e of this.state.enemies) {
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
        if (e.attackCooldown > 0) e.attackCooldown -= dt;
      }

      if (this.state.contractActive && b.active && !b.captured) {
        const alive = this.state.players.filter(p => !p.downed);
        if (alive.length) {
          let target = alive[0];
          let best = Infinity;
          for (const p of alive) {
            const d = Math.hypot(p.x - b.x, p.y - b.y);
            if (d < best) { best = d; target = p; }
          }
          this.moveEnemyToward(b, target, dt, b.speed, 88, 13 + this.state.contractLevel * 2, Math.max(.52, 1.1 - this.state.contractLevel * .04));

          for (const e of this.state.enemies) {
            if (!e.active) continue;
            let t = alive[0];
            let td = Infinity;
            for (const p of alive) {
              const d = Math.hypot(p.x - e.x, p.y - e.y);
              if (d < td) { td = d; t = p; }
            }
            const speed = e.type === "brute" ? 78 : 98;
            const dmg = e.type === "brute" ? 13 : 8;
            this.moveEnemyToward(e, t, dt, speed, 72, dmg + Math.floor(this.state.contractLevel / 2), e.type === "brute" ? 1.2 : .85);
          }
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
      const w = WEAPONS[me.weaponId] || WEAPONS.revolver;
      weaponNameEl.textContent = w.name + (me.damageLevel ? " +" + me.damageLevel : "");
      ammoEl.textContent = me.reloadingUntil > Date.now() ? "RECARREGANDO" : (me.ammo + " / " + w.mag);
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
      const code = await network.createRoom(safeName(), currentAppearance(), selectedWeapon());
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
      await network.joinRoom(code, safeName(), currentAppearance(), selectedWeapon());
      roomCode = code;
      enterGame();
      toast("Você entrou na sala " + code + ".");
    } catch (err) {
      lobbyMsg.textContent = err.message || "Não foi possível entrar.";
    }
  });

  soloBtn.addEventListener("click", () => {
    network.startSolo(safeName(), currentAppearance(), selectedWeapon());
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
    constructor(scene, x, y, playerData, isLocal = false) {
      super(scene, x, y);
      scene.add.existing(this);

      this.playerId = playerData.id;
      this.slot = playerData.slot || 0;
      this.isLocal = isLocal;
      this.walkPhase = 0;
      this.targetX = x;
      this.targetY = y;
      this.targetAngle = 0;
      this.downed = false;
      this.weaponId = playerData.weaponId || "revolver";
      this.appearance = Object.assign({ coat: "20242d", accent: "e61b26", hat: "wide" }, playerData.appearance || {});

      this.shadow = scene.add.ellipse(0, 27, 54, 18, 0x000000, .5);
      this.legL = scene.add.rectangle(-9, 16, 10, 29, 0x17191e).setOrigin(.5, .15);
      this.legR = scene.add.rectangle(9, 16, 10, 29, 0x17191e).setOrigin(.5, .15);
      this.coatBack = scene.add.triangle(0, 20, -21, 0, 21, 0, 0, 34, 0x101216, .96);
      this.coat = scene.add.rectangle(0, 0, 36, 47, 0x20242d).setStrokeStyle(2, 0xe61b26, .95);
      this.belt = scene.add.rectangle(0, 11, 35, 5, 0x07080a);
      this.buckle = scene.add.rectangle(0, 11, 6, 5, 0xb19b63);
      this.armL = scene.add.rectangle(-22, 1, 8, 30, 0x282b31).setOrigin(.5, .16);
      this.armR = scene.add.rectangle(22, 1, 8, 30, 0x282b31).setOrigin(.5, .16);
      this.gloveL = scene.add.circle(-23, 24, 5, 0x111318);
      this.gloveR = scene.add.circle(23, 24, 5, 0x111318);
      this.head = scene.add.circle(0, -31, 13, 0xc99b79).setStrokeStyle(2, 0x090909);
      this.hair = scene.add.arc(0, -35, 12, 180, 360, false, 0x251a16);
      this.faceBand = scene.add.rectangle(0, -27, 24, 6, 0xe61b26, .9);
      this.eyeL = scene.add.circle(-5, -32, 1.5, 0xf5f5f5);
      this.eyeR = scene.add.circle(5, -32, 1.5, 0xf5f5f5);
      this.hatBrim = scene.add.rectangle(0, -42, 38, 7, 0x111318);
      this.hatTop = scene.add.rectangle(0, -48, 24, 13, 0x17191e);
      this.gun = scene.add.rectangle(26, 0, 28, 6, 0xd7d8da).setOrigin(.05, .5);
      this.gunDetail = scene.add.rectangle(33, 0, 8, 3, 0x777a80).setOrigin(.05, .5);
      this.muzzle = scene.add.circle(52, 0, 5, 0xffd7a0, 0);
      this.nameTag = scene.add.text(0, -68, playerData.name || "Caçador", {
        fontFamily: "Arial", fontSize: "10px", color: "#d9dbe0",
        backgroundColor: "#07080aaa", padding: { x: 4, y: 2 }
      }).setOrigin(.5);

      this.add([
        this.shadow, this.legL, this.legR, this.coatBack, this.coat, this.belt, this.buckle,
        this.armL, this.armR, this.gloveL, this.gloveR, this.head, this.hair,
        this.faceBand, this.eyeL, this.eyeR, this.hatBrim, this.hatTop,
        this.gun, this.gunDetail, this.muzzle, this.nameTag
      ]);

      this.applyAppearance(this.appearance);
      this.setWeaponVisual(this.weaponId);
      this.setDepth(15);
    }

    applyAppearance(appearance) {
      if (!appearance) return;
      this.appearance = Object.assign({}, this.appearance, appearance);
      const coat = hexNum(this.appearance.coat, 0x20242d);
      const accent = hexNum(this.appearance.accent, 0xe61b26);
      this.coat.setFillStyle(coat).setStrokeStyle(2, accent, .95);
      this.coatBack.setFillStyle(Phaser.Display.Color.IntegerToColor(coat).darken(22).color, .96);
      this.faceBand.setFillStyle(accent, .9);

      const hat = this.appearance.hat || "wide";
      this.hatBrim.setVisible(hat !== "none");
      this.hatTop.setVisible(hat !== "none");

      if (hat === "hood") {
        this.hatBrim.setSize(30, 10).setPosition(0, -40);
        this.hatTop.setSize(32, 19).setPosition(0, -46);
        this.hatTop.setFillStyle(Phaser.Display.Color.IntegerToColor(coat).darken(15).color);
      } else if (hat === "cap") {
        this.hatBrim.setSize(27, 6).setPosition(10, -41);
        this.hatTop.setSize(29, 12).setPosition(-1, -46);
        this.hatTop.setFillStyle(0x181a1f);
      } else {
        this.hatBrim.setSize(38, 7).setPosition(0, -42);
        this.hatTop.setSize(24, 13).setPosition(0, -48);
        this.hatTop.setFillStyle(0x17191e);
      }
    }

    setWeaponVisual(id) {
      this.weaponId = WEAPONS[id] ? id : "revolver";
      const w = this.weaponId;
      if (w === "shotgun") {
        this.gun.setSize(43, 7).setFillStyle(0x8b6a45);
        this.gunDetail.setSize(23, 3).setFillStyle(0xbcc0c6);
      } else if (w === "rifle") {
        this.gun.setSize(48, 6).setFillStyle(0xbfc5ce);
        this.gunDetail.setSize(18, 4).setFillStyle(0x343941);
      } else if (w === "handcannon") {
        this.gun.setSize(35, 9).setFillStyle(0xdddddf);
        this.gunDetail.setSize(12, 5).setFillStyle(0x8c1219);
      } else {
        this.gun.setSize(28, 6).setFillStyle(0xd7d8da);
        this.gunDetail.setSize(8, 3).setFillStyle(0x777a80);
      }
    }

    applyState(p) {
      if (!p) return;
      this.downed = !!p.downed;
      if (p.appearance) this.applyAppearance(p.appearance);
      if (p.weaponId && p.weaponId !== this.weaponId) this.setWeaponVisual(p.weaponId);
      if (p.name && this.nameTag.text !== p.name) this.nameTag.setText(p.name);
    }

    animate(delta, moving, angle, dash, attacking, shooting) {
      this.walkPhase += delta * (moving ? .013 : .004);
      const sway = moving ? Math.sin(this.walkPhase * 9) : 0;
      this.legL.rotation = sway * .42;
      this.legR.rotation = -sway * .42;
      this.armL.rotation = -sway * .22;
      this.armR.rotation = angle - Math.PI / 2;
      this.coat.y = moving ? Math.abs(Math.sin(this.walkPhase * 9)) * -2 : 0;
      this.coatBack.rotation = -sway * .05;
      this.gun.rotation = angle;
      this.gunDetail.rotation = angle;
      this.faceBand.alpha = this.downed ? .25 : .9;
      this.alpha = this.downed ? .43 : 1;
      this.setScale(dash ? 1.08 : 1);
      if (attacking) this.armL.rotation = Math.sin(this.walkPhase * 35) * .95;

      const barrel = this.weaponId === "rifle" ? 57 : this.weaponId === "shotgun" ? 53 : this.weaponId === "handcannon" ? 49 : 46;
      this.gun.x = shooting ? 21 : 26;
      this.gunDetail.x = shooting ? 28 : 33;
      this.muzzle.alpha = shooting ? .9 : 0;
      this.muzzle.x = barrel * Math.cos(angle);
      this.muzzle.y = barrel * Math.sin(angle);
    }
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super("main");
      this.networkReady = false;
      this.remotePlayers = new Map();
      this.enemyVisuals = new Map();
      this.lastSend = 0;
      this.lastShotVisual = 0;
      this.lastMelee = 0;
      this.dashUntil = 0;
      this.dashReadyAt = 0;
      this.local = null;
      this.bountyVisual = null;
      this.bountyHpBg = null;
      this.bountyHpFill = null;
      this.boardGlow = null;
      this.interactText = null;
      this.localAim = 0;
      this.shootingUntil = 0;
      this.lastStateAppearanceKey = "";
    }

    create() {
      gameScene = this;
      this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
      this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
      this.cameras.main.setBackgroundColor("#090a0d");
      this.drawCity();

      const placeholder = {
        id: "host", slot: 0, name: safeName(),
        appearance: currentAppearance(), weaponId: selectedWeapon()
      };
      this.local = new HunterAvatar(this, 430, 555, placeholder, true);
      this.cameras.main.startFollow(this.local, true, .075, .075);
      this.cameras.main.setZoom(1.03);

      this.keys = this.input.keyboard.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D,
        SHIFT: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
        E: Phaser.Input.Keyboard.KeyCodes.E,
        R: Phaser.Input.Keyboard.KeyCodes.R,
        ONE: Phaser.Input.Keyboard.KeyCodes.ONE,
        TWO: Phaser.Input.Keyboard.KeyCodes.TWO,
        THREE: Phaser.Input.Keyboard.KeyCodes.THREE,
        FOUR: Phaser.Input.Keyboard.KeyCodes.FOUR
      });

      this.input.on("pointerdown", pointer => {
        if (pointer.leftButtonDown()) this.tryShoot(pointer);
      });

      this.interactText = this.add.text(0, 0, "", {
        fontFamily: "Arial", fontSize: "14px", color: "#ffffff",
        backgroundColor: "#111318e8", padding: { x: 8, y: 5 }
      }).setDepth(90).setVisible(false);

      if (latestState) this.applyNetworkState(latestState);
    }

    drawCity() {
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(0x090a0d, 1).fillRect(0, 0, WORLD.width, WORLD.height);

      // Sidewalk / road network
      g.fillStyle(0x12151a, 1).fillRect(0, 350, WORLD.width, 320);
      g.fillStyle(0x12151a, 1).fillRect(690, 0, 360, WORLD.height);
      g.fillStyle(0x181b21, 1).fillRect(0, 362, WORLD.width, 12);
      g.fillStyle(0x181b21, 1).fillRect(0, 646, WORLD.width, 12);
      g.fillStyle(0x181b21, 1).fillRect(701, 0, 12, WORLD.height);
      g.fillStyle(0x181b21, 1).fillRect(1027, 0, 12, WORLD.height);

      g.lineStyle(3, 0x3c4049, .72);
      g.lineBetween(0, 512, WORLD.width, 512);
      g.lineBetween(870, 0, 870, WORLD.height);

      g.lineStyle(2, 0x861119, .58);
      for (let x = 10; x < WORLD.width; x += 110) g.lineBetween(x, 508, x + 58, 508);
      for (let y = 15; y < WORLD.height; y += 110) g.lineBetween(866, y, 866, y + 58);

      const buildings = [
        [45, 45, 360, 250, "BLACK LANTERN BAR"],
        [445, 60, 205, 220, "CLINIC"],
        [1110, 45, 610, 255, "RED EYE OFFICE"],
        [55, 730, 515, 245, "GUNSMITH"],
        [1095, 730, 605, 250, "TAILOR & SUPPLY"],
        [1210, 365, 380, 195, "BLACK IRON HOLD"]
      ];

      buildings.forEach(([x, y, w, h, label], i) => {
        g.fillStyle(i % 2 ? 0x16191f : 0x13151a, 1).fillRoundedRect(x, y, w, h, 8);
        g.lineStyle(2, 0x393d46, .9).strokeRoundedRect(x, y, w, h, 8);
        g.fillStyle(0x6b0b12, .5).fillRect(x + 18, y + 20, Math.min(130, w - 36), 8);

        for (let wx = x + 30; wx < x + w - 24; wx += 56) {
          for (let wy = y + 62; wy < y + h - 24; wy += 50) {
            g.fillStyle(0x652a2f, .28).fillRect(wx, wy, 24, 15);
          }
        }

        this.add.text(x + 18, y + h - 28, label, {
          fontFamily: "Arial", fontSize: "11px", color: "#7f838d", fontStyle: "bold"
        }).setDepth(3);
      });

      // Alley details / crates
      for (const [x, y] of [[585, 420], [607, 438], [1590, 610], [1548, 629], [102, 630], [125, 612]]) {
        this.add.rectangle(x, y, 30, 30, 0x3d2b20).setStrokeStyle(2, 0x745038).setDepth(3);
        this.add.line(0, 0, x - 12, y - 12, x + 12, y + 12, 0x8e694b, .55).setOrigin(0, 0).setDepth(4);
      }

      // Parked vehicles
      const cars = [[760, 420, 0x242932], [950, 605, 0x4d1016], [1520, 440, 0x22252b]];
      cars.forEach(([x, y, c], i) => {
        this.add.rectangle(x, y, 82, 42, c).setStrokeStyle(2, 0x555a64).setDepth(4).setAngle(i === 1 ? 90 : 0);
        this.add.rectangle(x, y - 2, 38, 30, 0x15181d).setDepth(5).setAngle(i === 1 ? 90 : 0);
      });

      // Lamps
      for (const [x, y] of [[660, 330], [1080, 330], [660, 690], [1080, 690], [1470, 340], [350, 685]]) {
        this.add.circle(x, y, 68, 0xb4141d, .045).setDepth(1);
        this.add.rectangle(x, y, 5, 42, 0x3a3d44).setDepth(2);
        this.add.circle(x, y - 24, 8, 0xca2028, .82).setDepth(3);
      }

      // Contract board
      const board = this.add.container(285, 430).setDepth(8);
      this.boardGlow = this.add.rectangle(0, 0, 116, 148, 0x890b12, .13).setStrokeStyle(2, 0xca1823, .78);
      const wood = this.add.rectangle(0, 0, 88, 125, 0x33251f).setStrokeStyle(3, 0x8e5d43);
      const paper = this.add.rectangle(0, -6, 62, 80, 0xd4c3a0);
      const eye = this.add.text(0, -13, "◉", { fontSize: "37px", color: "#8f0710", fontStyle: "bold" }).setOrigin(.5);
      const label = this.add.text(0, 43, "CONTRATOS", { fontSize: "10px", color: "#ffffff", fontStyle: "bold" }).setOrigin(.5);
      board.add([this.boardGlow, wood, paper, eye, label]);
      this.board = board;

      // Prison bars
      this.add.rectangle(1470, 520, 150, 145, 0x34070a, .24).setStrokeStyle(3, 0xbd101b, .7).setDepth(4);
      for (let i = -52; i <= 52; i += 23) this.add.rectangle(1470 + i, 520, 5, 128, 0x41464f).setDepth(5);
      this.add.text(1470, 603, "PRISÃO", { fontSize: "16px", color: "#c4c6cb", fontStyle: "bold" }).setOrigin(.5).setDepth(5);

      // NPCs and upgrade stations
      this.gunsmithNpc = this.drawNpc(235, 780, "MARA · ARMEIRA", 0xd59b2b);
      this.medicNpc = this.drawNpc(640, 290, "DOC VANE · CLÍNICA", 0x5fc777);
      this.tailorNpc = this.drawNpc(1210, 720, "NOX · ALFAIATE", 0x8f57c7);
      this.informantNpc = this.drawNpc(450, 345, "IVO · INFORMANTE", 0x2fa8d2);

      this.add.text(1210, 93, "RED EYE DISTRICT", {
        fontSize: "24px", color: "#ba151e", fontStyle: "bold", letterSpacing: 2
      }).setDepth(5);

      // District graffiti / sigils
      for (const [x, y, s] of [[760, 785, 32], [1040, 210, 26], [520, 615, 20]]) {
        this.add.text(x, y, "◉", { fontSize: s + "px", color: "#6d0c12" }).setAlpha(.65).setDepth(2);
      }
    }

    drawNpc(x, y, label, accent) {
      const c = this.add.container(x, y).setDepth(12);
      const shadow = this.add.ellipse(0, 22, 44, 15, 0x000000, .45);
      const legs = this.add.rectangle(0, 14, 24, 28, 0x181a1f);
      const body = this.add.rectangle(0, -2, 30, 39, 0x2a2d33).setStrokeStyle(2, accent, .85);
      const head = this.add.circle(0, -30, 11, 0xb98467);
      const band = this.add.rectangle(0, -27, 20, 4, accent);
      const tag = this.add.text(0, -56, label, {
        fontFamily: "Arial", fontSize: "9px", color: "#c7c9ce",
        backgroundColor: "#07080aaa", padding: { x: 4, y: 2 }
      }).setOrigin(.5);
      c.add([shadow, legs, body, head, band, tag]);
      return c;
    }

    ensureRemote(p) {
      let avatar = this.remotePlayers.get(p.id);
      if (!avatar) {
        avatar = new HunterAvatar(this, p.x, p.y, p, false);
        this.remotePlayers.set(p.id, avatar);
      }
      avatar.targetX = p.x;
      avatar.targetY = p.y;
      avatar.targetAngle = p.angle;
      avatar.netAttacking = p.attacking;
      avatar.netShooting = p.shooting;
      avatar.netDash = p.dash;
      avatar.applyState(p);
      return avatar;
    }

    ensureEnemy(e) {
      let v = this.enemyVisuals.get(e.id);
      if (!v) {
        const accent = e.type === "brute" ? 0xb44a2a : 0x8b1118;
        const c = this.add.container(e.x, e.y).setDepth(13);
        const shadow = this.add.ellipse(0, 22, 46, 16, 0x000000, .5);
        const legs = this.add.rectangle(0, 15, 25, 28, 0x17191e);
        const body = this.add.rectangle(0, -3, e.type === "brute" ? 40 : 31, e.type === "brute" ? 48 : 41, 0x292c31).setStrokeStyle(2, accent);
        const head = this.add.circle(0, -31, 11, 0x8e6f61).setStrokeStyle(2, 0x0a0a0b);
        const band = this.add.rectangle(0, -28, 20, 5, accent);
        const weapon = this.add.rectangle(24, 0, e.type === "brute" ? 30 : 22, e.type === "brute" ? 8 : 5, e.type === "brute" ? 0x7b5b3c : 0xb7bac0).setOrigin(.05, .5);
        c.add([shadow, legs, body, head, band, weapon]);
        v = { c, body, hpBg: null, hpFill: null };
        v.hpBg = this.add.rectangle(e.x, e.y - 54, 58, 6, 0x151515).setDepth(18);
        v.hpFill = this.add.rectangle(e.x - 29, e.y - 54, 58, 6, 0xaa151d).setOrigin(0, .5).setDepth(19);
        this.enemyVisuals.set(e.id, v);
      }
      return v;
    }

    applyNetworkState(state) {
      if (!this.local || !localPlayerId) return;
      const ids = new Set();

      for (const p of state.players) {
        ids.add(p.id);
        if (p.id === localPlayerId) {
          this.local.applyState(p);
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
      this.updateEnemies(state.enemies || []);
    }

    updateBounty(b, active) {
      if (!b) return;
      if (!this.bountyVisual) {
        const c = this.add.container(b.x, b.y).setDepth(14);
        const shadow = this.add.ellipse(0, 31, 78, 27, 0x000000, .56);
        const legs = this.add.rectangle(0, 19, 38, 37, 0x191b1f);
        const cape = this.add.triangle(0, 24, -30, 0, 30, 0, 0, 50, 0x17191f);
        const body = this.add.rectangle(0, -5, 62, 68, 0x2b2e35).setStrokeStyle(3, 0x9f0f17);
        const shoulderL = this.add.circle(-35, -7, 15, 0x3a3d43);
        const shoulderR = this.add.circle(35, -7, 15, 0x3a3d43);
        const head = this.add.circle(0, -54, 19, 0x17191d).setStrokeStyle(3, 0x9f0f17);
        const eye = this.add.rectangle(0, -54, 27, 5, 0xff1828);
        const hornL = this.add.triangle(-14, -72, -8, 0, 6, 0, 0, -18, 0x4a0b10);
        const hornR = this.add.triangle(14, -72, -8, 0, 6, 0, 0, -18, 0x4a0b10);
        c.add([shadow, cape, legs, body, shoulderL, shoulderR, head, hornL, hornR, eye]);
        this.bountyVisual = c;
        this.bountyBody = body;
        this.bountyEye = eye;

        this.bountyHpBg = this.add.rectangle(0, -94, 106, 9, 0x151515).setOrigin(.5).setDepth(20);
        this.bountyHpFill = this.add.rectangle(-53, -94, 106, 9, 0xd0111b).setOrigin(0, .5).setDepth(21);
      }

      const visible = active && !b.captured;
      this.bountyVisual.setVisible(visible);
      this.bountyHpBg.setVisible(visible);
      this.bountyHpFill.setVisible(visible);

      if (visible) {
        const accent = hexNum(b.accent, 0xd0111b);
        this.bountyBody.setStrokeStyle(3, accent);
        this.bountyEye.setFillStyle(accent);
        this.bountyVisual.x = Phaser.Math.Linear(this.bountyVisual.x, b.x, .21);
        this.bountyVisual.y = Phaser.Math.Linear(this.bountyVisual.y, b.y, .21);
        this.bountyHpBg.setPosition(this.bountyVisual.x, this.bountyVisual.y - 94);
        this.bountyHpFill.setPosition(this.bountyVisual.x - 53, this.bountyVisual.y - 94);
        this.bountyHpFill.width = 106 * Phaser.Math.Clamp(b.hp / Math.max(1, b.maxHp), 0, 1);
        this.bountyVisual.setAlpha(b.flash > 0 ? .38 : 1);
      }
    }

    updateEnemies(enemies) {
      const activeIds = new Set();

      for (const e of enemies) {
        activeIds.add(e.id);
        const v = this.ensureEnemy(e);
        v.c.setVisible(!!e.active);
        v.hpBg.setVisible(!!e.active);
        v.hpFill.setVisible(!!e.active);
        if (!e.active) continue;

        v.c.x = Phaser.Math.Linear(v.c.x, e.x, .24);
        v.c.y = Phaser.Math.Linear(v.c.y, e.y, .24);
        v.hpBg.setPosition(v.c.x, v.c.y - 54);
        v.hpFill.setPosition(v.c.x - 29, v.c.y - 54);
        v.hpFill.width = 58 * Phaser.Math.Clamp(e.hp / Math.max(1, e.maxHp), 0, 1);
        v.c.setAlpha(e.flash > 0 ? .35 : 1);
      }

      for (const [id, v] of this.enemyVisuals) {
        if (!activeIds.has(id)) {
          v.c.destroy(true);
          v.hpBg.destroy();
          v.hpFill.destroy();
          this.enemyVisuals.delete(id);
        }
      }
    }

    switchWeapon(id) {
      if (!WEAPONS[id] || !this.networkReady) return;
      network.action("switchWeapon", { weaponId: id });
      toast("Arma: " + WEAPONS[id].name);
    }

    reloadWeapon() {
      if (!this.networkReady) return;
      network.action("reload");
    }

    tryShoot(pointer) {
      if (!this.networkReady || !this.local || this.local.downed || !latestState) return;
      const me = latestState.players.find(p => p.id === localPlayerId);
      if (!me) return;

      const w = WEAPONS[me.weaponId] || WEAPONS.revolver;
      const now = this.time.now;
      if (now - this.lastShotVisual < w.cooldown * .82) return;
      if (me.reloadingUntil > Date.now()) return;
      if (me.ammo <= 0) {
        network.action("reload");
        toast("Recarregando...");
        return;
      }

      const world = pointer.positionToCamera(this.cameras.main);
      const angle = Phaser.Math.Angle.Between(this.local.x, this.local.y, world.x, world.y);

      this.lastShotVisual = now;
      this.shootingUntil = now + 95;
      this.fireWeaponVisual(angle, w);
      network.action("shoot", { angle });
    }

    fireWeaponVisual(angle, w) {
      const baseX = this.local.x + Math.cos(angle) * 31;
      const baseY = this.local.y + Math.sin(angle) * 31;
      const pellets = w.pellets;

      for (let i = 0; i < pellets; i++) {
        const spread = pellets === 1 ? 0 : ((i / Math.max(1, pellets - 1)) - .5) * 2 * w.spread;
        const a = angle + spread;
        const len = w.range * (pellets > 1 ? .82 + (i % 2) * .06 : 1);
        const x2 = baseX + Math.cos(a) * len;
        const y2 = baseY + Math.sin(a) * len;
        const tracer = this.add.line(0, 0, baseX, baseY, x2, y2, w.tracer, pellets > 1 ? .45 : .8)
          .setOrigin(0, 0).setDepth(26);
        this.tweens.add({
          targets: tracer, alpha: 0, duration: pellets > 1 ? 110 : 75,
          onComplete: () => tracer.destroy()
        });
      }

      const flash = this.add.circle(baseX, baseY, w.id === "handcannon" ? 12 : 8, 0xffd0b0, .9).setDepth(27);
      this.tweens.add({ targets: flash, alpha: 0, scale: 1.7, duration: 90, onComplete: () => flash.destroy() });
      this.cameras.main.shake(w.id === "handcannon" ? 85 : 45, w.id === "handcannon" ? .0022 : .0012);
    }

    tryMelee() {
      if (!latestState || this.local.downed) return;
      const now = this.time.now;
      if (now - this.lastMelee < 470) return;
      this.lastMelee = now;
      network.action("melee");

      const arc = this.add.arc(this.local.x, this.local.y, 62, -62, 62, false, 0xe81c27, .23).setDepth(25);
      arc.rotation = this.localAim;
      this.tweens.add({
        targets: arc, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 165,
        onComplete: () => arc.destroy()
      });
    }

    tryInteract() {
      if (!latestState || this.local.downed) return;

      const boardDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, this.board.x, this.board.y);
      if (boardDist < 105 && !latestState.contractActive) {
        network.action("startContract");
        return;
      }

      if (latestState.contractActive) {
        const b = latestState.bounty;
        const bd = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
        if (bd < 105 && b.hp <= b.maxHp * .18) {
          network.action("capture");
          return;
        }
      }

      const downed = latestState.players.find(
        p => p.id !== localPlayerId && p.downed &&
        Phaser.Math.Distance.Between(this.local.x, this.local.y, p.x, p.y) < 95
      );
      if (downed) {
        network.action("revive", { targetId: downed.id });
        return;
      }

      if (Phaser.Math.Distance.Between(this.local.x, this.local.y, 235, 780) < 120) {
        network.action("buyDamage");
        return;
      }
      if (Phaser.Math.Distance.Between(this.local.x, this.local.y, 640, 290) < 120) {
        network.action("buyHealth");
        return;
      }
      if (Phaser.Math.Distance.Between(this.local.x, this.local.y, 1210, 720) < 120) {
        network.action("cycleStyle");
        return;
      }
      if (Phaser.Math.Distance.Between(this.local.x, this.local.y, 450, 345) < 115) {
        const level = latestState.contractLevel || 1;
        const hints = [
          "Rust Jack gosta de lutar perto. Use a escopeta.",
          "Vex Marrow é rápido. Rifle ajuda a manter distância.",
          "O Red Warden aguenta muito dano. Faça upgrades na armaria.",
          "Hollow Eye bate forte. Não esqueça a clínica."
        ];
        toast(hints[(level - 1) % hints.length]);
      }
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
        dx /= len;
        dy /= len;
      }

      const now = this.time.now;
      const me = latestState && latestState.players.find(p => p.id === localPlayerId);
      const speedLevel = me ? me.speedLevel || 0 : 0;

      if (Phaser.Input.Keyboard.JustDown(this.keys.SHIFT) && now > this.dashReadyAt && !this.local.downed) {
        this.dashUntil = now + 180;
        this.dashReadyAt = now + 900;
        this.cameras.main.shake(80, .002);
      }

      const dashing = now < this.dashUntil;
      const speed = this.local.downed ? 0 : (dashing ? 535 : 230 + speedLevel * 14);

      if (moving) {
        this.local.x += dx * speed * delta / 1000;
        this.local.y += dy * speed * delta / 1000;
      }

      this.local.x = Phaser.Math.Clamp(this.local.x, 30, WORLD.width - 30);
      this.local.y = Phaser.Math.Clamp(this.local.y, 30, WORLD.height - 30);

      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryMelee();
      if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.tryInteract();
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reloadWeapon();
      if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this.switchWeapon("revolver");
      if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this.switchWeapon("shotgun");
      if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this.switchWeapon("rifle");
      if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) this.switchWeapon("handcannon");

      if (pointer.isDown && pointer.leftButtonDown()) this.tryShoot(pointer);

      const attacking = now - this.lastMelee < 170;
      const shooting = now < this.shootingUntil;
      this.local.animate(delta, moving, this.localAim, dashing, attacking, shooting);

      for (const avatar of this.remotePlayers.values()) {
        const ox = avatar.x, oy = avatar.y;
        avatar.x = Phaser.Math.Linear(avatar.x, avatar.targetX, .2);
        avatar.y = Phaser.Math.Linear(avatar.y, avatar.targetY, .2);
        const rmoving = Phaser.Math.Distance.Between(ox, oy, avatar.x, avatar.y) > .2;
        avatar.animate(delta, rmoving, avatar.targetAngle, avatar.netDash, avatar.netAttacking, avatar.netShooting);
      }

      if (this.boardGlow) this.boardGlow.alpha = .11 + Math.sin(now * .004) * .05;
      this.updateInteractionHint();

      if (this.networkReady && now - this.lastSend > 55) {
        this.lastSend = now;
        network.sendPlayerState({
          x: this.local.x, y: this.local.y, angle: this.localAim,
          attacking, shooting, dash: dashing
        });
      }
    }

    updateInteractionHint() {
      if (!latestState || !this.interactText) return;

      let text = "";
      let tx = this.local.x, ty = this.local.y - 76;
      const me = latestState.players.find(p => p.id === localPlayerId);

      const boardDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, this.board.x, this.board.y);
      if (boardDist < 105 && !latestState.contractActive) {
        text = "[E] PEGAR CONTRATO";
        tx = this.board.x; ty = this.board.y - 96;
      }

      if (latestState.contractActive) {
        const b = latestState.bounty;
        const bd = Phaser.Math.Distance.Between(this.local.x, this.local.y, b.x, b.y);
        if (bd < 110 && b.hp <= b.maxHp * .18) {
          text = "[E] CAPTURAR " + b.name;
          tx = b.x; ty = b.y - 120;
        }
      }

      const downed = latestState.players.find(
        p => p.id !== localPlayerId && p.downed &&
        Phaser.Math.Distance.Between(this.local.x, this.local.y, p.x, p.y) < 95
      );
      if (downed) {
        text = "[E] REVIVER " + downed.name.toUpperCase();
        tx = downed.x; ty = downed.y - 76;
      }

      const gunDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, 235, 780);
      if (gunDist < 120 && me) {
        const cost = 150 + (me.damageLevel || 0) * 90;
        text = me.damageLevel >= 4 ? "ARMAS NO MÁXIMO" : "[E] DANO +" + (me.damageLevel + 1) + " · $" + cost;
        tx = 235; ty = 710;
      }

      const medDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, 640, 290);
      if (medDist < 120 && me) {
        const cost = 120 + (me.hpLevel || 0) * 80;
        text = me.hpLevel >= 4 ? "VIDA NO MÁXIMO" : "[E] VIDA +" + (me.hpLevel + 1) + " · $" + cost;
        tx = 640; ty = 220;
      }

      const tailorDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, 1210, 720);
      if (tailorDist < 120) {
        text = "[E] TROCAR VISUAL";
        tx = 1210; ty = 650;
      }

      const infoDist = Phaser.Math.Distance.Between(this.local.x, this.local.y, 450, 345);
      if (infoDist < 115) {
        text = "[E] PEDIR DICA";
        tx = 450; ty = 280;
      }

      this.interactText.setVisible(!!text).setText(text).setPosition(tx, ty).setOrigin(.5);
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    backgroundColor: "#090a0d",
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [MainScene]
  });
})();
