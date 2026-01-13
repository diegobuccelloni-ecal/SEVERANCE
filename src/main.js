import LensEffect from "./LensEffect.js";

class MDRTerminal {
  constructor() {
    // ÉTAT & BOOT
    // ═══════════════════════════════════════════════════════════════

    this.isActive = false;
    this.bootPhase = 0; // 0: attente | 1: ligne | 2: ouverture | 3: actif
    this.bootStartTime = 0;

    // TEMPS & FRAME
    // ═══════════════════════════════════════════════════════════════

    this.lastTs = 0;
    this.dt = 16.67;
    this.dtSec = 1 / 30;
    this.frame = 1;

    // GRILLE & NAVIGATION
    // ═══════════════════════════════════════════════════════════════

    this.cells = new Map();
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.minScale = 1;
    this.maxScale = 3;

    // Configuration de la grille de base
    this.baseStartX = -200;
    this.baseStartY = -100;
    this.baseCellW = 50;
    this.baseCellH = 50;
    this.baseFontSize = 24;

    // INTERACTION SOURIS
    // ═══════════════════════════════════════════════════════════════

    this.mouseX = -1000;
    this.mouseY = -1000;
    this.isSelecting = false;
    this.selectedCells = new Set();
    this.hoverCells = new Set();
    this.hoverRadius = 300;
    this.selectionRadius = 200;
    this.hoverDirty = true; // Flag pour recalculer les cellules survolées

    // VAGUE ANIMÉE (style Severance)
    // ═══════════════════════════════════════════════════════════════

    this.wave = {
      freqX: 0.16,
      freqY: 0.14,
      speedX: 0.55,
      speedY: 0.42,
      amp: 2.1,
      driftFreqX: 0.05,
      driftFreqY: 0.06,
      driftSpeed: 0.11,
      driftAmp: 0.85,
      mixXY: 0.22, // Influence croisée entre axes
    };

    // HUMEURS (4 catégories équilibrées à 25% chacune)
    // ═══════════════════════════════════════════════════════════════

    this.humorKeys = ["WO", "FC", "DR", "MA"];
    this.humorConfig = {
      WO: { label: "WO", color: "#76ff03" },
      FC: { label: "FC", color: "#ffeb3b" },
      DR: { label: "DR", color: "#e0e0e0" },
      MA: { label: "MA", color: "#2979ff" },
    };

    // BINS (5 tiroirs de collection)
    // ═══════════════════════════════════════════════════════════════

    this.activeBin = null;
    this.bins = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      label: String(i + 1).padStart(2, "0"),
      totalCount: 0,
      displayedCount: 0,
      targetDisplayedCount: 0,
      target: 100,
      humorCounts: { WO: 0, FC: 0, DR: 0, MA: 0 },
      humorDisplayed: { WO: 0, FC: 0, DR: 0, MA: 0 },
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      glowIntensity: 0,
    }));

    this.flyingNumbers = []; // Nombres en vol vers les bins

    // ANIMATIONS DES PANNEAUX
    // ═══════════════════════════════════════════════════════════════

    this.panelOpenProgress = 0;
    this.panelTargetProgress = 0;
    this.panelCloseTimer = null;

    this.giftBarsOpenProgress = 0;
    this.giftBarsTargetProgress = 0;

    this.labelLiftProgress = 0;
    this.labelLiftTargetProgress = 0;
    this.labelLiftAmount = 15;

    this.animationPhase = 0; // 0: idle | 1: collecte | 3: panel ouvert | 4: fermeture
    this.isAnimating = false; // Flag pour éviter les conflits d'animation

    // LensEffect
    // ═══════════════════════════════════════════════════════════════

    this.lensRange = 185;
    this.lensRangeSq = this.lensRange * this.lensRange;
    this.lens = new LensEffect({
      range: this.lensRange,
      zoom: -0.25,
      element: document,
    });

    // NETTOYAGE PÉRIODIQUE (évite Map infinie)
    // ═══════════════════════════════════════════════════════════════

    this.pruneAccMs = 0;
    this.pruneEveryMs = 2000;

    this.init();
  }

  // INITIALISATION
  // ═══════════════════════════════════════════════════════════════

  init() {
    this.seedArea();
    this.setupCanvas();
    this.bindInput();
    this.setupBootSequence();
    this.updateTotalProgress();
  }

  // BOOT SEQUENCE - Attente du clic/touche utilisateur
  setupBootSequence() {
    const bootScreen = document.getElementById("boot-screen");
    if (!bootScreen) {
      this.bootPhase = 3;
      this.isActive = true;
      return;
    }

    const startHandler = () => {
      bootScreen.style.display = "none";
      this.bootPhase = 1;
      this.bootStartTime = Date.now();
      window.removeEventListener("keydown", startHandler);
      window.removeEventListener("click", startHandler);
    };

    window.addEventListener("keydown", startHandler);
    window.addEventListener("click", startHandler);
  }

  // APPARITION INITIALE - Remplit la zone visible avec des nombres
  seedArea() {
    for (let i = -50; i <= 50; i++) {
      for (let j = -50; j <= 50; j++) {
        this.setNumber(i, j, {
          val: Math.floor(Math.random() * 10),
          alpha: 0,
          spawnDelay: Math.random() * 200,
          isRespawning: true,
          isFlying: false,
          weirdness: Math.random(),
          isCorrect: false,
        });
      }
    }
  }

  // GESTION DES CELLULES
  // ═══════════════════════════════════════════════════════════════

  getNumber(row, col) {
    const key = `${row},${col}`;
    if (!this.cells.has(key)) {
      // Créer une cellule avec un objet complet pour éviter les incohérences
      const newCell = {
        val: Math.floor(Math.random() * 10),
        alpha: 1,
        spawnDelay: 0,
        isRespawning: false,
        isFlying: false,
        weirdness: Math.random(),
        isCorrect: false,
      };
      this.cells.set(key, newCell);
      return newCell;
    }
    return this.cells.get(key);
  }

  setNumber(row, col, value) {
    this.cells.set(`${row},${col}`, value);
  }

  // LOGIQUE D'ÉQUILIBRAGE DES HUMEURS
  // ═══════════════════════════════════════════════════════════════

  // Choisit une humeur de manière organique
  pickHumorForBin(bin) {
    const perHumorLimit = bin.target / this.humorKeys.length;

    const available = this.humorKeys.filter(
      (k) => bin.humorCounts[k] < perHumorLimit
    );

    if (available.length === 0) {
      return this.humorKeys[Math.floor(Math.random() * this.humorKeys.length)];
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  // Trouve le bin le moins rempli
  pickTargetBin() {
    const candidates = this.bins.filter((b) => b.totalCount < b.target);
    if (!candidates.length) return null;
    return candidates.reduce((prev, curr) =>
      prev.totalCount < curr.totalCount ? prev : curr
    );
  }

  isAllBinsFull() {
    return this.bins.every((bin) => bin.totalCount >= bin.target);
  }

  // COLLECTE DES NOMBRES SÉLECTIONNÉS
  // ═══════════════════════════════════════════════════════════════

  collectSelectedNumbers() {
    if (!this.selectedCells.size || this.isAnimating) return;

    const targetBin = this.pickTargetBin();
    if (!targetBin) {
      this.selectedCells.clear();
      return;
    }

    const remaining = targetBin.target - targetBin.totalCount;
    if (remaining <= 0) {
      this.selectedCells.clear();
      return;
    }

    const selectedKeys = Array.from(this.selectedCells);
    const addCount = Math.min(selectedKeys.length, remaining);

    // Active les animations du bin
    this.isAnimating = true;
    this.activeBin = targetBin;
    targetBin.glowIntensity = 1;
    this.animationPhase = 1;
    this.labelLiftTargetProgress = 1;
    this.giftBarsTargetProgress = 1;

    // Nettoyer tout timer existant
    if (this.panelCloseTimer) {
      clearTimeout(this.panelCloseTimer);
      this.panelCloseTimer = null;
    }

    // Crée les nombres volants
    for (let idx = 0; idx < addCount; idx++) {
      const key = selectedKeys[idx];
      const [row, col] = key.split(",").map(Number);
      const rawVal = this.getNumber(row, col);

      const cellObj =
        typeof rawVal === "object"
          ? rawVal
          : { val: rawVal, weirdness: 0, isCorrect: false };

      const weirdness = cellObj.weirdness ?? 0;
      const successChance = weirdness > 0.6 ? 0.66 : 0.34;
      cellObj.isCorrect = Math.random() < successChance;

      const val = cellObj.val;
      const pos = this.worldToScreen(row, col);
      const humor = this.pickHumorForBin(targetBin);

      targetBin.humorCounts[humor] += 1;

      this.flyingNumbers.push({
        x: pos.x,
        y: pos.y,
        value: val,
        humor,
        color: "#7df6ff",
        targetX: targetBin.x + targetBin.w / 2,
        targetY: targetBin.y + targetBin.h / 2,
        controlX: null,
        controlY: null,
        progress: 0,
        speed: 0.38 + Math.random() * 0.14,
        cellKey: key,
        startScale: 2,
        endScale: 0.3,
      });

      // Réinitialise la cellule
      this.setNumber(row, col, {
        val,
        alpha: 0,
        spawnDelay: Math.random() * 120,
        isRespawning: true,
        isFlying: false,
        weirdness: Math.random(),
        isCorrect: false,
      });
    }

    targetBin.totalCount += addCount;
    targetBin.targetDisplayedCount = targetBin.totalCount;

    this.updateTotalProgress();
    this.selectedCells.clear();
  }

  // Met à jour le pourcentage global de progression
  updateTotalProgress() {
    const currentTotal = this.bins.reduce((acc, b) => acc + b.totalCount, 0);
    const maxTotal = this.bins.reduce((acc, b) => acc + b.target, 0);
    const percent =
      maxTotal > 0
        ? Math.min(100, Math.floor((currentTotal / maxTotal) * 100))
        : 0;

    const el = document.getElementById("total-progress");
    if (el) el.innerText = percent + "%";
  }

  // CANVAS & POSITIONNEMENT
  // ═══════════════════════════════════════════════════════════════

  setupCanvas() {
    const canvas = document.getElementById("mdr-canvas");
    if (!canvas) return;

    // Éviter les redimensionnements inutiles
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
    }

    // Réutiliser le contexte existant si possible
    if (!this.ctx) {
      this.ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });
    }

    this.canvas = canvas;
    this.calculateBinPositions();
    this.hoverDirty = true;

    // Mettre à jour les cibles des nombres volants après redimensionnement
    for (const p of this.flyingNumbers) {
      if (this.activeBin) {
        p.targetX = this.activeBin.x + this.activeBin.w / 2;
        p.targetY = this.activeBin.y + this.activeBin.h / 2;
      }
    }
  }

  // Calcule les positions des 5 bins en bas de l'écran
  calculateBinPositions() {
    const binW = window.innerWidth / 5 - 60;
    const binH = 130;
    const gap = 50;
    const totalW = binW * 5 + gap * 4;
    const startX = (this.canvas.width - totalW) / 2;
    const yPos = this.canvas.height - binH - 60;

    this.bins.forEach((bin, index) => {
      bin.w = binW;
      bin.h = binH;
      bin.x = startX + index * (binW + gap);
      bin.y = yPos;
    });
  }

  //Convertit coordonnées grille (row, col) → écran (x, y)
  worldToScreen(row, col) {
    const startX = this.offsetX + this.scale * this.baseStartX;
    const startY = this.offsetY + this.scale * this.baseStartY;
    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;
    return { x: startX + col * cellWidth, y: startY + row * cellHeight };
  }

  //Ajuste le rayon effectif selon le zoom
  getEffectiveRadius(baseAtMaxScale) {
    return baseAtMaxScale * (this.scale / this.maxScale);
  }

  getDistanceToMouse(x, y) {
    return Math.sqrt((this.mouseX - x) ** 2 + (this.mouseY - y) ** 2);
  }

  // Calcule l'intensité du survol (0 à 1)
  getHoverIntensity(distance) {
    const r = this.getEffectiveRadius(this.hoverRadius);
    if (distance > r) return 0;
    return Math.pow(1 - distance / r, 2);
  }

  // Met à jour les cellules survolées (optimisé - zone visible uniquement)
  updateHoverCells() {
    this.hoverCells.clear();

    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;

    const colsVisible = Math.ceil(this.canvas.width / cellWidth) + 4;
    const rowsVisible = Math.ceil(this.canvas.height / cellHeight) + 4;

    const firstCol = Math.floor(
      (-this.offsetX / this.scale - this.baseStartX) / this.baseCellW
    );
    const firstRow = Math.floor(
      (-this.offsetY / this.scale - this.baseStartY) / this.baseCellH
    );

    const startX = this.offsetX + this.scale * this.baseStartX;
    const startY = this.offsetY + this.scale * this.baseStartY;
    const r = this.getEffectiveRadius(this.selectionRadius);

    for (let i = firstRow; i < firstRow + rowsVisible; i++) {
      for (let j = firstCol; j < firstCol + colsVisible; j++) {
        const x = startX + j * cellWidth;
        const y = startY + i * cellHeight;
        if (this.getDistanceToMouse(x, y) < r) {
          this.hoverCells.add(`${i},${j}`);
        }
      }
    }
  }

  // GESTION DES ENTRÉES
  // ═══════════════════════════════════════════════════════════════

  bindInput() {
    // Debounce pour le redimensionnement
    let resizeTimeout = null;
    this._resizeHandler = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.setupCanvas();
        resizeTimeout = null;
      }, 100);
    };
    window.addEventListener("resize", this._resizeHandler);

    // Zoom (Ctrl+molette) et navigation (molette)
    this._wheelHandler = (e) => {
      if (!this.isActive) return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centré sur la souris
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const oldScale = this.scale;

        this.scale = Math.min(
          this.maxScale,
          Math.max(this.minScale, this.scale * zoomFactor)
        );

        const scaleChange = this.scale - oldScale;
        this.offsetX -= (this.mouseX - this.offsetX) * (scaleChange / oldScale);
        this.offsetY -= (this.mouseY - this.offsetY) * (scaleChange / oldScale);
      } else {
        // Navigation
        this.offsetX -= e.deltaX * 0.5;
        this.offsetY -= e.deltaY * 0.5;
      }

      this.hoverDirty = true;
    };
    window.addEventListener("wheel", this._wheelHandler, { passive: false });

    // Suivi de la souris
    this._mousemoveHandler = (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.hoverDirty = true;

      // Sélection en glissant - seulement si pas en animation
      if (this.isActive && this.animationPhase === 0 && this.isSelecting) {
        if (this.hoverDirty) {
          this.updateHoverCells();
          this.hoverDirty = false;
        }
        if (this.hoverCells.size > 0) {
          this.hoverCells.forEach((c) => this.selectedCells.add(c));
        }
      }
    };
    document.addEventListener("mousemove", this._mousemoveHandler);

    this._mousedownHandler = (e) => {
      if (!this.isActive || this.animationPhase !== 0 || this.isAnimating)
        return;
      e.preventDefault();
      this.isSelecting = true;
      // Mise à jour immédiate des cellules survolées
      this.updateHoverCells();
      this.hoverDirty = false;
    };
    document.addEventListener("mousedown", this._mousedownHandler);

    this._mouseupHandler = () => {
      if (!this.isActive) return;

      // Si on était en train de sélectionner
      if (this.isSelecting) {
        // Ajouter les cellules survolées à la sélection
        if (this.hoverCells.size > 0) {
          this.hoverCells.forEach((c) => this.selectedCells.add(c));
        }

        // Collecter seulement si pas déjà en animation
        if (this.animationPhase === 0 && !this.isAnimating) {
          this.collectSelectedNumbers();
        }

        this.isSelecting = false;
        this.hoverCells.clear();
        this.hoverDirty = true;
      }
    };
    document.addEventListener("mouseup", this._mouseupHandler);

    // Gestion de la perte de focus (évite les états bloqués)
    this._blurHandler = () => {
      this.isSelecting = false;
      this.hoverCells.clear();
      this.selectedCells.clear();
    };
    window.addEventListener("blur", this._blurHandler);
  }

  // BOUCLE DE MISE À JOUR
  // ═══════════════════════════════════════════════════════════════
  tick(ts) {
    // Protection contre les timestamps invalides
    if (!ts || !isFinite(ts)) {
      ts = performance.now();
    }

    if (!this.lastTs) this.lastTs = ts;
    const rawDt = ts - this.lastTs;
    this.lastTs = ts;

    // Delta time normalisé avec protection contre les valeurs extrêmes
    this.dt = Math.min(33.33, Math.max(1, rawDt || 16.67));
    this.dtSec = this.dt / 1000;
    this.frame = this.dt / 16.6667; // Facteur pour animation framerate-independent

    // Recalcul des cellules survolées uniquement si nécessaire
    if (this.isActive && this.animationPhase === 0) {
      if (this.hoverDirty) {
        this.updateHoverCells();
        this.hoverDirty = false;
      }
    } else {
      if (this.hoverCells.size) this.hoverCells.clear();
      this.hoverDirty = false;
    }

    this.updateFlyingNumbers(this.dtSec);
    this.updateBinAnim(this.dtSec);

    // Nettoyage périodique des cellules hors écran
    this.pruneAccMs += this.dt;
    if (this.pruneAccMs >= this.pruneEveryMs) {
      this.pruneAccMs = 0;
      this.pruneCells();
    }
  }

  // RENDU PRINCIPAL
  // ═══════════════════════════════════════════════════════════════

  draw(ts) {
    this.tick(ts);

    const ctx = this.ctx;
    ctx.globalAlpha = 1;

    // Fond
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let clipping = false;

    // Animation de boot
    if (this.bootPhase === 1 || this.bootPhase === 2) {
      const elapsed = Date.now() - this.bootStartTime;
      ctx.save();

      if (this.bootPhase === 1) {
        // Phase 1: Ligne horizontale
        const p = Math.min(1, elapsed / 200);
        const w = this.canvas.width * p;
        ctx.fillStyle = "#7df6ff";
        ctx.shadowColor = "#7df6ff";
        ctx.shadowBlur = 20;
        ctx.fillRect(
          (this.canvas.width - w) / 2,
          this.canvas.height / 2 - 2,
          w,
          4
        );
        if (p >= 1) {
          this.bootPhase = 2;
          this.bootStartTime = Date.now();
        }
        ctx.restore();
        return;
      }

      if (this.bootPhase === 2) {
        // Phase 2: Ouverture verticale
        const p = Math.min(1, elapsed / 500);
        const ease = 1 - Math.pow(1 - p, 3);
        const h = this.canvas.height * ease;
        ctx.beginPath();
        ctx.rect(0, (this.canvas.height - h) / 2, this.canvas.width, h);
        ctx.clip();
        clipping = true;

        if (p >= 0.99) {
          this.bootPhase = 3;
          this.isActive = true;
        }
      }
    }

    this.drawGrid(ts);
    this.drawBins();

    if (clipping) ctx.restore();

    this.drawCursor();

    if (this.isAllBinsFull()) this.drawFullOverlay();
  }

  // Overlay de fin (100%)
  drawFullOverlay() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const boxW = Math.min(w * 0.5, 500);
    const boxH = Math.min(h * 0.22, 160);
    const boxX = (w - boxW) / 2;
    const boxY = (h - boxH) / 2;

    ctx.save();
    ctx.globalAlpha = 1;

    // Cadre
    ctx.shadowColor = "#7df6ff";
    ctx.shadowBlur = 3;
    ctx.strokeStyle = "#7df6ff";
    ctx.fillStyle = "rgb(10, 14, 20)";
    ctx.lineWidth = 5;

    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = "#7df6ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);

    // Texte 100%
    ctx.font = `bold ${Math.floor(
      boxH * 0.55
    )}px 'Gotham', 'Arial', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#7df6ff";
    ctx.shadowColor = "#7df6ff";
    ctx.shadowBlur = 3;
    ctx.fillText("100%", w / 2, h / 2);

    ctx.restore();
  }

  // RENDU DE LA GRILLE ANIMÉE
  // ═══════════════════════════════════════════════════════════════

  // OPTIMISATION: Pré-calcul des vagues par ligne/colonne
  drawGrid(ts) {
    const ctx = this.ctx;

    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;
    const startX = this.offsetX + this.scale * this.baseStartX;
    const startY = this.offsetY + this.scale * this.baseStartY;

    ctx.font = `${Math.round(
      this.baseFontSize * this.scale
    )}px 'Gotham', sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const colsVisible = Math.ceil(this.canvas.width / cellWidth) + 4;
    const rowsVisible = Math.ceil(this.canvas.height / cellHeight) + 4;

    const firstCol = Math.floor(
      (-this.offsetX / this.scale - this.baseStartX) / this.baseCellW
    );
    const firstRow = Math.floor(
      (-this.offsetY / this.scale - this.baseStartY) / this.baseCellH
    );

    const t = (ts || performance.now()) * 0.001;

    const amp = this.wave.amp * this.scale;
    const driftAmp = this.wave.driftAmp * this.scale;

    // Tables de précalcul pour les vagues (optimisation majeure)
    const colWave = new Float32Array(colsVisible);
    const rowWave = new Float32Array(rowsVisible);

    // Une seule fois par colonne
    for (let cj = 0; cj < colsVisible; cj++) {
      const j = firstCol + cj;
      colWave[cj] =
        Math.sin(j * this.wave.freqX + t * this.wave.speedX) * amp +
        Math.sin(j * this.wave.driftFreqX + t * this.wave.driftSpeed) *
          driftAmp;
    }

    // Une seule fois par ligne
    for (let ri = 0; ri < rowsVisible; ri++) {
      const i = firstRow + ri;
      rowWave[ri] =
        Math.cos(i * this.wave.freqY + t * this.wave.speedY) * amp +
        Math.cos(i * this.wave.driftFreqY + t * this.wave.driftSpeed) *
          driftAmp;
    }

    // Rendu des cellules visibles
    for (let ri = 0, i = firstRow; ri < rowsVisible; ri++, i++) {
      for (let cj = 0, j = firstCol; cj < colsVisible; cj++, j++) {
        const cellData = this.getNumber(i, j);

        // Gestion des différents types de données de cellule
        let val,
          alphaMod = 1,
          weirdness = 0;

        if (typeof cellData === "object" && cellData !== null) {
          val = cellData.val;
          weirdness = cellData.weirdness ?? 0;

          // Animation de respawn
          if (cellData.isRespawning) {
            if (cellData.spawnDelay > 0) {
              cellData.spawnDelay -= this.frame;
              continue;
            }

            cellData.alpha += 0.02 * this.frame;
            alphaMod = Math.min(1, cellData.alpha);

            ctx.shadowColor = "rgba(125, 246, 255, 0.8)";
            ctx.shadowBlur = 8;

            if (cellData.alpha >= 1) {
              cellData.isRespawning = false;
              cellData.alpha = 1;
              ctx.shadowBlur = 0;
            }
          } else {
            ctx.shadowBlur = 0;
          }
        } else {
          // Fallback pour les anciennes données (simple nombre)
          val = cellData;
          ctx.shadowBlur = 0;
        }

        if (val === null || val === undefined) continue;

        const x = startX + j * cellWidth;
        const y = startY + i * cellHeight;

        // Vague, combine les oscillations pré-calculées
        const wx = colWave[cj] + rowWave[ri] * this.wave.mixXY;
        const wy = rowWave[ri] + colWave[cj] * (this.wave.mixXY * 0.6);

        let animatedX = x + cellWidth / 2 + wx;
        let animatedY = y + cellHeight / 2 + wy;

        // Effet lentille (seulement si proche de la souris)
        const dx0 = this.mouseX - animatedX;
        const dy0 = this.mouseY - animatedY;
        const d2 = dx0 * dx0 + dy0 * dy0;
        if (d2 < this.lensRangeSq) {
          const distorted = this.lens.apply({
            position: { x: animatedX, y: animatedY },
          });
          animatedX = distorted.x;
          animatedY = distorted.y;
        }

        const d = Math.sqrt(d2);
        const hInt = this.getHoverIntensity(d);

        const key = `${i},${j}`;
        const isSel = this.selectedCells.has(key);
        const isHov = this.hoverCells.has(key);

        // Opacité de base
        const baseAlpha = 0.42;
        let alpha = baseAlpha;
        let scale = 1;
        const color = "125, 246, 255";

        // Effets "weird" (scale pulse, jitter)
        if (weirdness > 0.6) {
          scale += Math.sin(t * 6 + i * 10) * 0.06;
        }
        if (weirdness > 0.75) {
          animatedX += Math.sin(t * 10 + j) * 0.45;
          animatedY += Math.cos(t * 8 + i) * 0.45;
        }

        // États de sélection/survol
        if (isSel || isHov) {
          alpha = 1;
          scale = 2;
        } else if (hInt > 0) {
          scale += hInt * 0.25;
        }

        alpha *= alphaMod;
        if (alpha <= 0.05) continue;

        // Rendu final
        ctx.save();
        ctx.translate(animatedX, animatedY);
        ctx.scale(scale, scale);

        ctx.shadowColor = `rgba(${color}, 1)`;
        ctx.shadowBlur = isSel || isHov ? 5 : 1;
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fillText(val, 0, 0);

        ctx.restore();
      }
    }
  }

  // NOMBRES VOLANTS
  // ═══════════════════════════════════════════════════════════════

  updateFlyingNumbers(dtSec) {
    if (this.flyingNumbers.length === 0) return;

    for (let i = this.flyingNumbers.length - 1; i >= 0; i--) {
      const p = this.flyingNumbers[i];
      p.progress += p.speed * dtSec;
      if (p.progress >= 1) {
        this.flyingNumbers.splice(i, 1);
      }
    }
  }

  drawFlyingNumbers() {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const p of this.flyingNumbers) {
      const t = Math.min(1, 1 - Math.pow(1 - p.progress, 3));

      // Courbe de Bézier quadratique (parabole)
      if (!p.controlX) {
        const midX = (p.x + p.targetX) / 2;
        const curveHeight = 520 + Math.random() * 80;
        p.controlX = midX;
        p.controlY = p.targetY - curveHeight;
      }

      const oneMinusT = 1 - t;
      const cx =
        oneMinusT * oneMinusT * p.x +
        2 * oneMinusT * t * p.controlX +
        t * t * p.targetX;
      const cy =
        oneMinusT * oneMinusT * p.y +
        2 * oneMinusT * t * p.controlY +
        t * t * p.targetY;

      const currentScale = p.startScale + (p.endScale - p.startScale) * t;
      const fontSize = 20 * currentScale;

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.font = `${fontSize}px "Gotham", sans-serif`;
      ctx.shadowColor = p.color || "#7df6ff";
      ctx.shadowBlur = 2;
      ctx.fillStyle = p.color || "#7df6ff";
      ctx.fillText(p.value, cx, cy);
      ctx.restore();
    }
  }

  // INTERPOLATION & ANIMATIONS
  // ═══════════════════════════════════════════════════════════════

  // Interpolation exponentielle (smooth)
  smoothTo(current, target, lambda, dtSec) {
    const a = 1 - Math.exp(-lambda * dtSec);
    return current + (target - current) * a;
  }

  // Déplacement linéaire avec vitesse
  moveTowards(current, target, speed, dtSec) {
    if (current === target) return current;
    const dir = Math.sign(target - current);
    const next = current + dir * speed * dtSec;
    if ((dir > 0 && next > target) || (dir < 0 && next < target)) return target;
    return next;
  }

  // Met à jour les animations des bins
  updateBinAnim(dtSec) {
    // Compteurs et humeurs (interpolation smooth)
    for (const bin of this.bins) {
      bin.displayedCount = this.smoothTo(
        bin.displayedCount,
        bin.targetDisplayedCount,
        10,
        dtSec
      );
      if (Math.abs(bin.targetDisplayedCount - bin.displayedCount) < 0.05) {
        bin.displayedCount = bin.targetDisplayedCount;
      }

      for (const k of this.humorKeys) {
        bin.humorDisplayed[k] = this.smoothTo(
          bin.humorDisplayed[k],
          bin.humorCounts[k],
          10,
          dtSec
        );
        if (Math.abs(bin.humorCounts[k] - bin.humorDisplayed[k]) < 0.05) {
          bin.humorDisplayed[k] = bin.humorCounts[k];
        }
      }

      bin.glowIntensity = Math.max(0, bin.glowIntensity - 1.2 * dtSec);
    }

    // Les conditions pour l'animation du pannel d'humeurs
    if (
      this.animationPhase === 1 &&
      this.flyingNumbers.length === 0 &&
      this.labelLiftProgress >= 0.9
    ) {
      this.animationPhase = 3;
      this.panelTargetProgress = 1;

      // Nettoyer l'ancien timer avant d'en créer un nouveau
      if (this.panelCloseTimer) {
        clearTimeout(this.panelCloseTimer);
        this.panelCloseTimer = null;
      }

      this.panelCloseTimer = setTimeout(() => {
        // Vérifier qu'on est toujours dans le bon état
        if (this.animationPhase === 3) {
          this.animationPhase = 4;
          this.panelTargetProgress = 0;
        }
        this.panelCloseTimer = null;
      }, 2000);
    }

    if (this.animationPhase === 4 && this.panelOpenProgress <= 0.01) {
      this.giftBarsTargetProgress = 0;
      this.labelLiftTargetProgress = 0;
    }

    if (
      this.animationPhase === 4 &&
      this.giftBarsOpenProgress <= 0.01 &&
      this.labelLiftProgress <= 0.01
    ) {
      this.animationPhase = 0;
      this.activeBin = null;
      this.isAnimating = false;
    }

    // Progression des animations (mouvement linéaire)
    this.labelLiftProgress = this.moveTowards(
      this.labelLiftProgress,
      this.labelLiftTargetProgress,
      3.8,
      dtSec
    );
    this.panelOpenProgress = this.moveTowards(
      this.panelOpenProgress,
      this.panelTargetProgress,
      4.2,
      dtSec
    );
    this.giftBarsOpenProgress = this.moveTowards(
      this.giftBarsOpenProgress,
      this.giftBarsTargetProgress,
      4.2,
      dtSec
    );
  }

  // RENDU DES BINS ET PANNEAUX
  // ═══════════════════════════════════════════════════════════════

  drawBins() {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;

    // Barre de fond
    const bgHeight = this.canvas.height * 0.22;
    const bgY = this.canvas.height - bgHeight;

    ctx.fillStyle = "rgb(4, 12, 20)";
    ctx.fillRect(0, bgY, this.canvas.width, bgHeight);

    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7df6ff";

    ctx.beginPath();
    ctx.moveTo(0, bgY);
    ctx.lineTo(this.canvas.width, bgY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, bgY + 6);
    ctx.lineTo(this.canvas.width, bgY + 6);
    ctx.stroke();

    // En-tête du bin actif (si animation en cours)
    if (
      this.activeBin &&
      (this.labelLiftProgress > 0.01 || this.panelOpenProgress > 0.01)
    ) {
      const bin = this.activeBin;
      const headerW = bin.w - 10;
      const headerH = 50;
      const headerX = bin.x + 5;

      const baseY = bin.y + 5;

      const liftEase = 1 - Math.pow(1 - this.labelLiftProgress, 3);
      const liftOffset = liftEase * this.labelLiftAmount;

      const panelEase = 1 - Math.pow(1 - this.panelOpenProgress, 3);
      const humorsPanelH = 220;
      const panelOffset = panelEase * (humorsPanelH - headerH);

      const headerY = baseY - liftOffset - panelOffset;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.canvas.width, baseY);
      ctx.clip();

      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.fillRect(headerX, headerY, headerW, headerH);

      ctx.strokeStyle = `rgb(125, 246, 255)`;
      ctx.shadowBlur = 2;
      ctx.lineWidth = 5;
      ctx.strokeRect(headerX, headerY, headerW, headerH);

      ctx.restore();
      this.drawFlyingNumbers();
    } else {
      this.drawFlyingNumbers();
    }

    // Panneau d'humeurs (s'ouvre au-dessus du bin actif)
    if (this.activeBin && this.panelOpenProgress > 0.01) {
      const bin = this.activeBin;
      const humorsPanelW = bin.w - 10;
      const humorsPanelH = 250;

      const panelX = bin.x + 5;
      const labelBoxTop = bin.y + 5;

      const panelEase = 1 - Math.pow(1 - this.panelOpenProgress, 3);
      const currentPanelHeight = humorsPanelH * panelEase;
      const panelY = labelBoxTop - currentPanelHeight;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.canvas.width, labelBoxTop);
      ctx.clip();

      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.fillRect(panelX, panelY, humorsPanelW, currentPanelHeight);

      ctx.shadowBlur = 2;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgb(125, 246, 255)";
      ctx.strokeRect(panelX, panelY, humorsPanelW, currentPanelHeight);

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(panelX + 1, panelY + 1);
      ctx.lineTo(panelX + humorsPanelW - 1, panelY + 1);
      ctx.lineTo(panelX + humorsPanelW - 1, panelY + currentPanelHeight - 1);
      ctx.lineTo(panelX + 1, panelY + currentPanelHeight - 1);
      ctx.closePath();
      ctx.stroke();

      // Contenu du panneau (avec fade-in)
      if (this.panelOpenProgress > 0.3) {
        const contentAlpha = Math.min(1, (this.panelOpenProgress - 0.3) / 0.7);
        ctx.globalAlpha = contentAlpha;

        const headerW = humorsPanelW * 0.9;
        const headerH = 35;
        const headerX = panelX + (humorsPanelW - headerW) / 2;
        const headerY = panelY + 15;

        ctx.strokeStyle = `rgb(125, 246, 255)`;
        ctx.lineWidth = 5;
        ctx.strokeRect(headerX, headerY, headerW, headerH);

        ctx.shadowBlur = 2;
        ctx.fillStyle = "#7df6ff";
        ctx.font = "25px 'Gotham', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bin.label, headerX + headerW / 2, headerY + headerH / 2);

        // Barres de progression par humeur
        const targetPerHumor = bin.target / 4;
        const startY = panelY + 70;
        const rowH = 42;

        ctx.textAlign = "left";
        ctx.font = "25px 'Gotham', sans-serif";

        const labelWidth = humorsPanelW / 3;
        const barWidth = (humorsPanelW * 2) / 3 - 20;

        this.humorKeys.forEach((key, i) => {
          const cfg = this.humorConfig[key];
          const y = startY + i * rowH;

          ctx.shadowBlur = 3;
          ctx.shadowColor = cfg.color;
          ctx.fillStyle = cfg.color;
          ctx.fillText(cfg.label, panelX + 20, y + 14);

          const barX = panelX + labelWidth;

          ctx.shadowBlur = 3;
          ctx.strokeStyle = cfg.color;
          ctx.lineWidth = 5;
          ctx.strokeRect(barX, y, barWidth, 28);

          ctx.fillStyle = "rgba(4, 12, 20, 1)";
          ctx.fillRect(barX, y, barWidth, 28);

          const v = Math.min(1, bin.humorDisplayed[key] / targetPerHumor);

          ctx.shadowColor = cfg.color;
          ctx.shadowBlur = 2;
          ctx.fillStyle = cfg.color;
          ctx.fillRect(barX + 1, y + 1, (barWidth - 2) * v, 26);
        });

        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    // Rendu des 5 bins
    this.bins.forEach((bin) => {
      const isFull = bin.totalCount >= bin.target;
      const binPct = isFull ? 1 : Math.min(1, bin.displayedCount / bin.target);
      const binPercentText = isFull
        ? 100
        : Math.min(99, Math.floor((bin.displayedCount / bin.target) * 100));

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.fillRect(bin.x, bin.y, bin.w, bin.h);

      const labelH = 50;
      const labelY = bin.y;

      // Label du bin
      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.fillRect(bin.x + 5, labelY, bin.w - 10, labelH);

      ctx.strokeStyle = `rgb(125, 246, 255)`;
      ctx.shadowColor = `rgb(125, 246, 255)`;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 5;
      ctx.strokeRect(bin.x + 5, labelY, bin.w - 10, labelH);

      ctx.shadowColor = "#7df6ff";
      ctx.fillStyle = "#7df6ff";
      ctx.font = "28px 'Gotham', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bin.label, bin.x + bin.w / 2, labelY + labelH / 2);

      // Barre de progression du bin
      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.fillRect(bin.x + 5, bin.y + 70, bin.w - 10, 50);

      ctx.strokeStyle = `rgb(125, 246, 255)`;
      ctx.shadowColor = `rgb(125, 246, 255)`;
      ctx.shadowBlur = 2;
      ctx.lineWidth = 5;
      ctx.strokeRect(bin.x + 5, bin.y + 70, bin.w - 10, 50);

      const fillWidth = (bin.w - 14) * binPct;
      ctx.shadowColor = "#7df6ff";
      ctx.fillStyle = "#7df6ff";
      ctx.fillRect(bin.x + 7, bin.y + 72, fillWidth, 46);

      // Pourcentage (double couche pour contraste)
      ctx.font = "20px 'Gotham', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const textX = bin.x + 25;
      const textY = bin.y + 96;

      ctx.shadowColor = "#7df6ff";
      ctx.fillStyle = "#7df6ff";
      ctx.fillText(`${binPercentText}%`, textX, textY);

      if (fillWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bin.x + 7, bin.y + 72, fillWidth, 46);
        ctx.clip();
        ctx.shadowColor = "#0a0e14";
        ctx.fillStyle = "#0a0e14";
        ctx.fillText(`${binPercentText}%`, textX, textY);
        ctx.restore();
      }
    });

    // Barres "gift" ouvrantes du bin actif
    if (this.activeBin && this.giftBarsOpenProgress > 0.001) {
      const bin = this.activeBin;
      const barLength = (bin.w - 10) / 2;
      const barHeight = 15;

      const labelBoxTop = bin.y + 15;
      const liftEase = 1 - Math.pow(1 - this.labelLiftProgress, 3);
      const liftOffset = liftEase * this.labelLiftAmount;

      const pivotYBottom = labelBoxTop - liftOffset;

      const maxAngle = (Math.PI * 3) / 4;
      const ease = 1 - Math.pow(1 - this.giftBarsOpenProgress, 3);
      const currentAngle = maxAngle * ease;

      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgb(125, 246, 255)";
      ctx.shadowColor = "rgb(125, 246, 255)";
      ctx.shadowBlur = 2;
      ctx.fillStyle = "rgb(4, 12, 20)";
      ctx.lineCap = "square";

      // Fonction pour dessiner une des barres
      const drawBottomHingedArm = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - barHeight);
        ctx.lineTo(x1, y1 - barHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };

      // Barre gauche
      const leftPivotX = bin.x + 5;
      const leftEndX = leftPivotX + barLength * Math.cos(-currentAngle);
      const leftEndY = pivotYBottom + barLength * Math.sin(-currentAngle);
      drawBottomHingedArm(leftPivotX, pivotYBottom, leftEndX, leftEndY);

      // Barre droite (symétrique)
      const rightPivotX = bin.x + bin.w - 5;
      const dx = leftEndX - leftPivotX;
      const dy = leftEndY - pivotYBottom;
      const rightEndX = rightPivotX - dx;
      const rightEndY = pivotYBottom + dy;
      drawBottomHingedArm(rightPivotX, pivotYBottom, rightEndX, rightEndY);

      ctx.restore();
    }
  }

  // Curseur
  drawCursor() {
    if (!this.isActive) return;

    const x = this.mouseX;
    const y = this.mouseY;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.75, 0.75);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 35);
    ctx.lineTo(13, 23);
    ctx.lineTo(25, 22);
    ctx.closePath();

    ctx.shadowColor = "#0a0e1a";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0e1a";
    ctx.fill();

    ctx.shadowColor = "#7df6ff";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#7df6ff";
    ctx.stroke();

    ctx.restore();
  }

  // NETTOYAGE MÉMOIRE
  // ═══════════════════════════════════════════════════════════════

  // Supprime les cellules hors de la zone visible (évite Map infinie)
  pruneCells() {
    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;

    const colsVisible = Math.ceil(this.canvas.width / cellWidth) + 4;
    const rowsVisible = Math.ceil(this.canvas.height / cellHeight) + 4;

    const firstCol = Math.floor(
      (-this.offsetX / this.scale - this.baseStartX) / this.baseCellW
    );
    const firstRow = Math.floor(
      (-this.offsetY / this.scale - this.baseStartY) / this.baseCellH
    );

    const margin = 60;
    const minRow = firstRow - margin;
    const maxRow = firstRow + rowsVisible + margin;
    const minCol = firstCol - margin;
    const maxCol = firstCol + colsVisible + margin;

    for (const key of this.cells.keys()) {
      const [rStr, cStr] = key.split(",");
      const r = Number(rStr);
      const c = Number(cStr);
      if (r < minRow || r > maxRow || c < minCol || c > maxCol) {
        this.cells.delete(key);
      }
    }
  }
}

// DÉMARRAGE
// ═══════════════════════════════════════════════════════════════

let terminalInstance = null;

export function startMDR() {
  // Évite la double initialisation
  if (terminalInstance) return;

  terminalInstance = new MDRTerminal();
  function loop(ts) {
    terminalInstance.draw(ts);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
