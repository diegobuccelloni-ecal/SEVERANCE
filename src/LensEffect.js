export default class LensEffect {
  constructor({ range = 200, zoom = 0.2, element = window } = {}) {
    this.range = range;
    this.zoom = zoom;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.pressed = false;

    element.addEventListener("pointermove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    element.addEventListener("pointerdown", () => {
      this.pressed = true;
    });
    element.addEventListener("pointerup", () => {
      this.pressed = false;
    });
  }

  dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  mapRange(value, low1, high1, low2, high2) {
    return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
  }

  apply(particle) {
    const position = {
      x: particle.position?.x ?? particle.x,
      y: particle.position?.y ?? particle.y,
    };

    let differenceX = this.mouseX - position.x;
    let differenceY = this.mouseY - position.y;
    const length = this.dist(this.mouseX, this.mouseY, position.x, position.y);

    if (length < this.range && !this.pressed) {
      const l = this.mapRange(length, 0, this.range * 2, 0, Math.PI * 2);
      const angle = Math.cos(l);
      const amt = this.mapRange(angle, -1, 1, 0, this.zoom);
      differenceX *= amt;
      differenceY *= amt;
      position.x -= differenceX;
      position.y -= differenceY;
    }

    return position;
  }
}
