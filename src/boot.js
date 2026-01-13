const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBoot() {
  const overlay = document.getElementById("boot-overlay");
  const logo = document.querySelector("#boot-overlay .boot-logo");

  if (!overlay || !logo) {
    const mod = await import("./main.js");
    mod.startMDR?.();
    document.body.classList.add("boot-done");
    return;
  }

  overlay.classList.add("boot-start");

  await sleep(3000);
  await sleep(3000);

  const mod = await import("./main.js");
  mod.startMDR?.();

  document.body.classList.add("boot-done");

  await sleep(1200);
  overlay.remove();
}

window.addEventListener("DOMContentLoaded", runBoot);
