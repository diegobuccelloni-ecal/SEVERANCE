import LensEffect from "./LensEffect.js";

class MDRTerminal {
  constructor() {
    // Grille infinie de chiffres, indexée par "row,col"
    this.cells = new Map();

    // Caméra (pan + zoom) dans l'espace monde de la grille
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 0.4;
    this.minScale = 0.4;
    this.maxScale = 1;

    // Paramètres (avant zoom)
    this.baseStartX = 30;
    this.baseStartY = 80;
    this.baseCellW = 90;
    this.baseCellH = 90;
    this.baseFontSize = 50;

    // État de la souris et de la sélection circulaire
    this.mouseX = 0;
    this.mouseY = 0;
    this.isSelecting = false;
    this.selectedCells = new Set();
    this.hoverCells = new Set();
    this.hoverRadius = 200;
    this.selectionRadius = 120;

    // Lens effect
    this.lens = new LensEffect({
      range: 220,
      zoom: -0.1,
      element: document,
    });

    // Curseur .png
    this.cursorImg = new Image();
    this.cursorLoaded = false;
    this.cursorSize = 50;
    this.cursorOffsetX = -50;
    this.cursorOffsetY = -50;
    this.cursorImg.onload = () => {
      this.cursorLoaded = true;
    };
    this.cursorImg.src = "../public/cursor.png";

    this.init();
  }

  getEffectiveRadius(baseAtMaxScale) {
    return baseAtMaxScale * (this.scale / this.maxScale);
  }

  init() {
    this.seedArea(); // pré-remplit la grille
    this.setupCanvas(); // crée un canvas plein écran
    this.bindInput(); // installe les contrôles (souris, clavier, gestures)
  }

  setupCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
  }

  seedArea() {
    const seedSize = 30;
    for (let i = -seedSize; i <= seedSize; i++) {
      for (let j = -seedSize; j <= seedSize; j++) {
        this.setNumber(i, j, Math.floor(Math.random() * 10));
      }
    }
  }

  getNumber(row, col) {
    // Génération lazy
    const key = `${row},${col}`;
    if (!this.cells.has(key)) {
      this.cells.set(key, Math.floor(Math.random() * 10));
    }
    return this.cells.get(key);
  }

  setNumber(row, col, value) {
    this.cells.set(`${row},${col}`, value);
  }

  getDistanceToMouse(x, y) {
    const dx = this.mouseX - x;
    const dy = this.mouseY - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Retourne une intensité pour l’effet de survol
  getHoverIntensity(distance) {
    const effectiveHoverRadius = this.getEffectiveRadius(this.hoverRadius);
    if (distance > effectiveHoverRadius) return 0;
    const normalized = 1 - distance / effectiveHoverRadius;
    return Math.pow(normalized, 2);
  }

  updateHoverCells() {
    this.hoverCells.clear();
    if (!this.isSelecting) return;

    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;
    const startX = this.offsetX + this.scale * this.baseStartX;
    const startY = this.offsetY + this.scale * this.baseStartY;

    const colsVisible = Math.ceil(this.canvas.width / cellWidth) + 2;
    const rowsVisible = Math.ceil(this.canvas.height / cellHeight) + 2;

    // Inversion de la transformation écran du monde pour trouver les indices visibles
    const firstCol = Math.floor(
      (-this.offsetX / this.scale - this.baseStartX) / this.baseCellW
    );
    const firstRow = Math.floor(
      (-this.offsetY / this.scale - this.baseStartY) / this.baseCellH
    );
    const lastCol = firstCol + colsVisible;
    const lastRow = firstRow + rowsVisible;

    for (let i = firstRow; i < lastRow; i++) {
      for (let j = firstCol; j < lastCol; j++) {
        const x = startX + j * cellWidth;
        const y = startY + i * cellHeight;
        const distance = this.getDistanceToMouse(x, y);

        // Pendant le drag, toutes les cellules dans ce disque sont marquées en hover
        const effectiveSelectionRadius = this.getEffectiveRadius(
          this.selectionRadius
        );
        if (distance < effectiveSelectionRadius) {
          this.hoverCells.add(`${i},${j}`);
        }
      }
    }
  }

  bindInput() {
    // Scroll (pinch)
    window.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();

        if (e.ctrlKey) {
          const prevScale = this.scale;
          const zoomFactor = Math.exp(-e.deltaY * 0.001);
          this.scale = Math.min(
            this.maxScale,
            Math.max(this.minScale, this.scale * zoomFactor)
          );
          return;
        }

        this.offsetX -= e.deltaX * 0.5;
        this.offsetY -= e.deltaY * 0.5;
      },
      { passive: false }
    );

    // Pinch Safari desktop
    let safariGestureStartScale = 1;
    const onSafariGestureStart = (e) => {
      e.preventDefault();
      safariGestureStartScale = this.scale;
    };
    const onSafariGestureChange = (e) => {
      e.preventDefault();
      const prevScale = this.scale;
      this.scale = Math.min(
        this.maxScale,
        Math.max(this.minScale, safariGestureStartScale * e.scale)
      );
      const ratio = this.scale / prevScale;
      const mx = this.mouseX;
      const my = this.mouseY;
      this.offsetX = this.offsetX + (1 - ratio) * (mx - this.offsetX);
      this.offsetY = this.offsetY + (1 - ratio) * (my - this.offsetY);
    };
    const onSafariGestureEnd = (e) => {
      e.preventDefault();
    };
    window.addEventListener("gesturestart", onSafariGestureStart, {
      passive: false,
    });
    window.addEventListener("gesturechange", onSafariGestureChange, {
      passive: false,
    });
    window.addEventListener("gestureend", onSafariGestureEnd, {
      passive: false,
    });

    // Suivi du curseur
    document.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    // Début / fin de la sélection circulaire (toggle des cellules survolées)
    document.addEventListener("mousedown", () => {
      this.isSelecting = true;
    });

    document.addEventListener("mouseup", () => {
      if (this.isSelecting && this.hoverCells.size > 0) {
        this.hoverCells.forEach((cell) => {
          if (this.selectedCells.has(cell)) {
            this.selectedCells.delete(cell);
          } else {
            this.selectedCells.add(cell);
          }
        });
      }
      this.isSelecting = false;
      this.hoverCells.clear();
    });

    document.addEventListener("mouseleave", () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });
  }

  draw() {
    this.updateHoverCells();
    this.clearCanvas();
    this.drawGrid();
    this.drawCursor();
  }

  clearCanvas() {
    this.ctx.fillStyle = "#0C0B16";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid() {
    const cellWidth = this.baseCellW * this.scale;
    const cellHeight = this.baseCellH * this.scale;
    const startX = this.offsetX + this.scale * this.baseStartX;
    const startY = this.offsetY + this.scale * this.baseStartY;

    this.ctx.font = `${Math.round(
      this.baseFontSize * this.scale
    )}px 'Arrival-Regular', sans-serif`;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "center";

    const colsVisible = Math.ceil(this.canvas.width / cellWidth) + 2;
    const rowsVisible = Math.ceil(this.canvas.height / cellHeight) + 2;

    const firstCol = Math.floor(
      (-this.offsetX / this.scale - this.baseStartX) / this.baseCellW
    );
    const firstRow = Math.floor(
      (-this.offsetY / this.scale - this.baseStartY) / this.baseCellH
    );
    const lastCol = firstCol + colsVisible;
    const lastRow = firstRow + rowsVisible;

    const time = Date.now() / 1000;

    for (let i = firstRow; i < lastRow; i++) {
      for (let j = firstCol; j < lastCol; j++) {
        const x = startX + j * cellWidth;
        const y = startY + i * cellHeight;
        const key = `${i},${j}`;

        // Animation des chiffres
        const phase = i * 0.2 + j * 0.3;
        const baseFloat = Math.sin(time * 0.8 + phase) * 4;
        const jiggle = Math.sin(time * 3 + phase * 2) * 1.5;

        const animatedX = x + 40 * this.scale + jiggle;
        const animatedY = y + baseFloat + 40 * this.scale;

        const distortedPosition = this.lens.apply({
          position: { x: animatedX, y: animatedY },
        });

        const distance = this.getDistanceToMouse(
          distortedPosition.x,
          distortedPosition.y
        );
        const hoverIntensity = this.getHoverIntensity(distance);

        const isSelected = this.selectedCells.has(key);
        const isInHover = this.hoverCells.has(key);

        let baseAlpha = 0.5;
        let scale = 1;
        let glowIntensity = 0;

        if (isInHover) {
          baseAlpha = 1;
          scale = 1.8;
          glowIntensity = 1.2;
        } else if (hoverIntensity > 0.1) {
          baseAlpha = 0.5 + hoverIntensity * 0.4;
          scale = 1 + hoverIntensity * 0.4;
          glowIntensity = hoverIntensity * 0.6;
        }

        if (isSelected) {
          baseAlpha = Math.max(baseAlpha, 0.8);
          glowIntensity = Math.max(glowIntensity, 0.5);
        }

        this.ctx.save();
        this.ctx.translate(distortedPosition.x, distortedPosition.y);
        this.ctx.scale(scale, scale);

        if (glowIntensity > 0.001) {
          this.ctx.shadowColor = "#00ffffff";
          this.ctx.shadowBlur = 100 * glowIntensity;
        }

        const color = isSelected
          ? "0, 255, 255"
          : isInHover
          ? "255, 255, 0"
          : "0, 255, 255";
        this.ctx.fillStyle = `rgba(${color}, ${baseAlpha})`;
        this.ctx.fillText(this.getNumber(i, j), 0, 0);

        this.ctx.restore();
      }
    }
  }

  drawCursor() {
    if (!this.cursorLoaded) return;
    const x = this.mouseX + this.cursorOffsetX;
    const y = this.mouseY + this.cursorOffsetY;
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.cursorImg, x, y, this.cursorSize, this.cursorSize);
    this.ctx.restore();
  }
}

window.addEventListener("load", () => {
  const terminal = new MDRTerminal();

  function resizeCanvas() {
    if (terminal.canvas) {
      terminal.canvas.width = window.innerWidth;
      terminal.canvas.height = window.innerHeight;
    }
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function loop() {
    terminal.draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
