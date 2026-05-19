const imageFiles = Array.from({ length: 8 }, (_, index) => `img${index + 1}.jpg`);
const saveKey = "paolo-clicker-state-v1";

const elements = {
  score: document.querySelector("#score"),
  perClick: document.querySelector("#perClick"),
  perSecond: document.querySelector("#perSecond"),
  comboLabel: document.querySelector("#comboLabel"),
  comboFill: document.querySelector("#comboFill"),
  comboCameo: document.querySelector("#comboCameo"),
  comboCameoImage: document.querySelector("#comboCameo img"),
  paoloButton: document.querySelector("#paoloButton"),
  paoloImage: document.querySelector("#paoloImage"),
  upgradeList: document.querySelector("#upgradeList"),
  upgradeTemplate: document.querySelector("#upgradeTemplate"),
  skinStrip: document.querySelector("#skinStrip"),
  resetButton: document.querySelector("#resetButton"),
  levelLabel: document.querySelector("#levelLabel"),
  milestoneCopy: document.querySelector("#milestoneCopy"),
};

const upgrades = [
  {
    id: "tap",
    name: "Ribbon Tap",
    detail: "Adds soft sparkle to every Paolo click.",
    baseCost: 18,
    growth: 1.34,
  },
  {
    id: "studio",
    name: "Cat Cafe Crew",
    detail: "Keeps gentle Paolo glow flowing.",
    baseCost: 72,
    growth: 1.38,
  },
  {
    id: "aura",
    name: "Anime Aura",
    detail: "Makes combos warmer and brighter.",
    baseCost: 190,
    growth: 1.46,
  },
  {
    id: "bloom",
    name: "Moon Bloom",
    detail: "Lets combo magic linger longer.",
    baseCost: 520,
    growth: 1.5,
  },
];

const defaultState = {
  paolos: 0,
  totalClicks: 0,
  skinIndex: 0,
  combo: 1,
  comboEndsAt: 0,
  upgrades: {
    tap: 0,
    studio: 0,
    aura: 0,
    bloom: 0,
  },
};

let state = loadState();
let lastTick = performance.now();
let lastSave = 0;
let lastStatsRender = 0;
let availableImages = new Set();
let upgradeRenderSignature = "";
let pointerTarget = { x: 0, y: 0 };
let pointerCurrent = { x: 0, y: 0 };
let lastCameoAt = -Infinity;
let floatingGains = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey));
    return {
      ...defaultState,
      ...saved,
      upgrades: {
        ...defaultState.upgrades,
        ...(saved?.upgrades || {}),
      },
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(saveKey, JSON.stringify(state));
  } catch {
    // Saving can be blocked in some private browsing modes; the game still runs.
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function formatNumber(value) {
  if (value < 1000) {
    return value.toFixed(value % 1 === 0 ? 0 : 1);
  }

  const units = ["K", "M", "B", "T", "Qa", "Qi"];
  let unitIndex = -1;
  let scaled = value;

  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  return `${scaled.toFixed(scaled >= 100 ? 0 : 1)}${units[unitIndex]}`;
}

function getUpgradeCost(upgrade) {
  return Math.floor(upgrade.baseCost * upgrade.growth ** state.upgrades[upgrade.id]);
}

function getClickValue() {
  const tapPower = 1 + state.upgrades.tap * 1.3;
  const auraPower = 1 + state.upgrades.aura * 0.12;
  return tapPower * auraPower * state.combo;
}

function getPassiveValue() {
  return state.upgrades.studio * 0.85 + state.upgrades.bloom * 3.4;
}

function getLevel() {
  return Math.max(1, Math.floor(Math.log10(Math.max(1, state.paolos)) + 1));
}

function getMilestoneCopy(level) {
  if (level >= 12) return "Celestial glow unlocked";
  if (level >= 9) return "Dream idol energy";
  if (level >= 6) return "Main character sparkle";
  if (level >= 4) return "Cat-ear aura rising";
  if (level >= 2) return "Blush combo unlocked";
  return "First warm glow";
}

function setSkin(index) {
  state.skinIndex = ((index % imageFiles.length) + imageFiles.length) % imageFiles.length;
  elements.paoloImage.src = imageFiles[state.skinIndex];
  updateImageFallback();
  renderSkinStrip();
}

function updateImageFallback() {
  const src = imageFiles[state.skinIndex];
  const hasLoaded = availableImages.has(src);
  const isKnownMissing = elements.paoloImage.complete && elements.paoloImage.naturalWidth === 0;
  elements.paoloButton.classList.toggle("is-missing", !hasLoaded && isKnownMissing);
}

function preloadImages() {
  imageFiles.forEach((file) => {
    const image = new Image();
    image.onload = () => {
      availableImages.add(file);
      updateImageFallback();
      renderSkinStrip();
    };
    image.onerror = () => {
      updateImageFallback();
      renderSkinStrip();
    };
    image.src = file;
  });
}

function renderSkinStrip() {
  elements.skinStrip.innerHTML = "";

  imageFiles.forEach((file, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "skin-button";
    button.classList.toggle("is-active", index === state.skinIndex);
    button.classList.toggle("is-missing", !availableImages.has(file));
    button.setAttribute("aria-label", `Use ${file}`);
    image.src = file;
    image.alt = "";
    image.decoding = "async";
    image.addEventListener("error", () => button.classList.add("is-missing"));
    label.textContent = index + 1;

    button.append(image, label);
    button.addEventListener("click", () => {
      setSkin(index);
      pulseButton(0.92);
      saveState();
    });

    elements.skinStrip.append(button);
  });
}

function renderUpgrades() {
  elements.upgradeList.innerHTML = "";
  upgradeRenderSignature = getUpgradeRenderSignature();

  upgrades.forEach((upgrade) => {
    const fragment = elements.upgradeTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".upgrade-card");
    const title = fragment.querySelector("h3");
    const detail = fragment.querySelector("p");
    const button = fragment.querySelector("button");
    const cost = fragment.querySelector(".cost");
    const owned = fragment.querySelector(".owned");
    const price = getUpgradeCost(upgrade);

    title.textContent = upgrade.name;
    detail.textContent = upgrade.detail;
    cost.textContent = formatNumber(price);
    owned.textContent = `${state.upgrades[upgrade.id]} owned`;
    button.disabled = state.paolos < price;
    button.setAttribute("aria-label", `Buy ${upgrade.name} for ${formatNumber(price)} Paolo Power`);
    button.addEventListener("click", () => buyUpgrade(upgrade, card));

    elements.upgradeList.append(fragment);
  });
}

function getUpgradeRenderSignature() {
  return upgrades
    .map((upgrade) => `${upgrade.id}:${state.upgrades[upgrade.id]}:${state.paolos >= getUpgradeCost(upgrade)}`)
    .join("|");
}

function renderUpgradesIfNeeded() {
  const signature = getUpgradeRenderSignature();
  if (signature !== upgradeRenderSignature) {
    renderUpgrades();
  }
}

function renderStats() {
  const level = getLevel();
  const comboProgress = Math.max(0, Math.min(1, (state.comboEndsAt - performance.now()) / getComboDuration()));

  elements.score.textContent = formatNumber(state.paolos);
  elements.perClick.textContent = `+${formatNumber(getClickValue())} per click`;
  elements.perSecond.textContent = `${formatNumber(getPassiveValue())}/sec`;
  elements.comboLabel.textContent = `x${state.combo.toFixed(2)} combo`;
  elements.comboFill.style.width = `${comboProgress * 100}%`;
  elements.levelLabel.textContent = `Level ${level}`;
  elements.milestoneCopy.textContent = getMilestoneCopy(level);
}

function render() {
  renderStats();
  renderUpgrades();
}

function buyUpgrade(upgrade, card) {
  const price = getUpgradeCost(upgrade);

  if (state.paolos < price) return;

  state.paolos -= price;
  state.upgrades[upgrade.id] += 1;
  card?.animate(
    [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(-10px) scale(1.025)" },
      { transform: "translateY(0) scale(1)" },
    ],
    { duration: 720, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  saveState();
  render();
}

function getComboDuration() {
  return 1200 + state.upgrades.bloom * 95;
}

function handlePaoloClick(event) {
  const now = performance.now();
  const duration = getComboDuration();

  if (now <= state.comboEndsAt) {
    state.combo = Math.min(4.6 + state.upgrades.aura * 0.22, state.combo + 0.08 + state.upgrades.aura * 0.012);
  } else {
    state.combo = 1.08;
  }

  state.comboEndsAt = now + duration;

  const gain = getClickValue();
  state.paolos += gain;
  state.totalClicks += 1;

  if (state.totalClicks % 9 === 0) {
    setSkin(state.skinIndex + 1);
  }

  const point = getEventPoint(event);
  createButtonRipple(point.x, point.y);
  createFloatingGain(point.x, point.y, gain);
  maybeShowComboCameo(now);
  pulseButton();
  renderStats();
}

function getEventPoint(event) {
  if (event.clientX && event.clientY) {
    return { x: event.clientX, y: event.clientY };
  }

  const rect = elements.paoloButton.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function createFloatingGain(x, y, gain) {
  const item = document.createElement("span");
  item.className = "float-gain";
  item.textContent = `+${formatNumber(gain)}`;
  item.style.left = `${x}px`;
  item.style.top = `${y - 18}px`;
  document.body.append(item);
  floatingGains.push(item);

  while (floatingGains.length > 12) {
    floatingGains.shift()?.remove();
  }

  item.addEventListener(
    "animationend",
    () => {
      item.remove();
      floatingGains = floatingGains.filter((gainItem) => gainItem !== item);
    },
    { once: true },
  );
}

function createButtonRipple(x, y) {
  const rect = elements.paoloButton.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "button-ripple";
  ripple.style.left = `${x - rect.left}px`;
  ripple.style.top = `${y - rect.top}px`;
  elements.paoloButton.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

function maybeShowComboCameo(now) {
  const hasCombo = state.combo >= 2;
  const isReady = now - lastCameoAt > 7200;
  const chance = Math.min(0.34, 0.12 + (state.combo - 2) * 0.055);

  if (!hasCombo || !isReady || Math.random() > chance) return;

  lastCameoAt = now;
  showComboCameo();
}

function showComboCameo() {
  if (!elements.comboCameo) return;

  if (elements.comboCameoImage?.dataset.src && !elements.comboCameoImage.getAttribute("src")) {
    elements.comboCameoImage.src = elements.comboCameoImage.dataset.src;
  }

  elements.comboCameo.classList.remove("is-visible");
  void elements.comboCameo.offsetWidth;
  elements.comboCameo.classList.add("is-visible");
}

function pulseButton(scale = 0.96) {
  elements.paoloButton.animate(
    [
      { transform: "rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) scale(1)" },
      { transform: `rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) scale(${scale})` },
      { transform: "rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) scale(1.025)" },
      { transform: "rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) scale(1)" },
    ],
    { duration: 720, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

function tick(now) {
  const delta = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;

  state.paolos += getPassiveValue() * delta;

  if (now > state.comboEndsAt) {
    state.combo += (1 - state.combo) * Math.min(1, delta * 4);
  }

  updatePointerMotion(now);

  if (now - lastStatsRender > 90) {
    renderStats();
    renderUpgradesIfNeeded();
    lastStatsRender = now;
  }

  if (now - lastSave > 1600) {
    saveState();
    lastSave = now;
  }

  requestAnimationFrame(tick);
}

function resetGame() {
  const confirmed = window.confirm("Reset Paolo Clicker progress?");
  if (!confirmed) return;

  state = cloneDefaultState();
  setSkin(0);
  saveState();
  render();
}

function bindPointerParallax() {
  window.addEventListener("pointermove", (event) => {
    pointerTarget = {
      x: event.clientX / window.innerWidth - 0.5,
      y: event.clientY / window.innerHeight - 0.5,
    };
  });

  window.addEventListener("pointerleave", () => {
    pointerTarget = { x: 0, y: 0 };
  });
}

function updatePointerMotion(now) {
  const idleX = Math.sin(now / 4200) * 0.05;
  const idleY = Math.cos(now / 5100) * 0.04;

  pointerCurrent.x += (pointerTarget.x + idleX - pointerCurrent.x) * 0.034;
  pointerCurrent.y += (pointerTarget.y + idleY - pointerCurrent.y) * 0.034;
  document.documentElement.style.setProperty("--pointer-x", pointerCurrent.x.toFixed(3));
  document.documentElement.style.setProperty("--pointer-y", pointerCurrent.y.toFixed(3));
}

function init() {
  preloadImages();
  renderSkinStrip();
  setSkin(state.skinIndex || 0);
  render();

  elements.paoloImage.addEventListener("load", () => {
    availableImages.add(imageFiles[state.skinIndex]);
    updateImageFallback();
  });
  elements.paoloImage.addEventListener("error", updateImageFallback);
  elements.paoloButton.addEventListener("click", handlePaoloClick);
  elements.resetButton.addEventListener("click", resetGame);
  elements.comboCameo?.addEventListener("animationend", (event) => {
    if (event.target === elements.comboCameo) {
      elements.comboCameo.classList.remove("is-visible");
    }
  });
  bindPointerParallax();
  requestAnimationFrame(tick);
}

init();
