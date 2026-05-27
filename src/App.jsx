import { Fragment, memo, useEffect, useRef, useState } from "react";
import "./App.css";

const PLAYER_WIDTH = 14;
const PLAYER_HEIGHT = 10;
const MIN_PLAYER_X = 10;
const MAX_PLAYER_X = 90;
const MIN_PLAYER_Y = 10;
const MAX_PLAYER_Y = 88;
const START_PLAYER_Y = 84;

const GATE_WIDTH = 50;
const GATE_HEIGHT = 11;
const NBI_WIDTH = 50;
const NBI_HEIGHT = 11;
const SPECIAL_WIDTH = 26;
const SPECIAL_HEIGHT = 10;
const LANE_PATTERN_HEIGHT = 46;

const SQUAD_CANVAS_SIZE = 392;
const SUPPORTER_BASE_SPRITE_SIZE = 94;

const BATO_SPRITE_PATHS = ["/bato-step-left.png", "/bato-step-right.png"];
const BATO_SPRITE_WORK_SIZE = 160;

const SUPPORTER_SPRITE_PATHS = [
  "/supporter-step-left.png",
  "/supporter-step-right.png",
];
const SUPPORTER_SPRITE_WORK_SIZE = 128;

const DDS_GATE_SPRITE_PATH = "/dds-gate-sprite.png";
const NBI_SPRITE_PATH = "/nbi-character-sprite.png";
const TRUSTED_FRIEND_SPRITE_PATH = "/trusted-friend-sprite.png";
const SENATE_IMMUNITY_SPRITE_PATH = "/senate-immunity-sprite.png";
const WELCOME_AUDIO_PATH = "/welcome.mp3";
const GAMEPLAY_MUSIC_PATH = "/gameplay-music.mp3";
const RECRUIT_AUDIO_PATH = "/recruit.mp3";
const RECRUIT_AUDIO_START_TIME = 0.2;
const POWERUP_AUDIO_PATH = "/powerup.mp3";
const NBI_ENCOUNTER_AUDIO_PATH = "/nbiencounter.mp3";
const NBI_ENCOUNTER_AUDIO_START_TIME = 0.2;
const GAMEOVER_AUDIO_PATH = "/gameover.mp3";
const POWER_SPLASH_DURATION_MS = 1000;

const EFFECT_SOUND_CONFIG = {
  recruit: {
    path: RECRUIT_AUDIO_PATH,
    startTime: RECRUIT_AUDIO_START_TIME,
    volume: 0.74,
  },
  powerup: {
    path: POWERUP_AUDIO_PATH,
    startTime: 0,
    volume: 0.8,
  },
  nbi: {
    path: NBI_ENCOUNTER_AUDIO_PATH,
    startTime: NBI_ENCOUNTER_AUDIO_START_TIME,
    volume: 0.78,
  },
  gameover: {
    path: GAMEOVER_AUDIO_PATH,
    startTime: 0,
    volume: 0.82,
  },
};

const GATE_X_POSITIONS = [25, 75];
const HALF_ROAD_SIDES = ["left", "right"];

const RECRUIT_GATES = [
  { label: "+5 DDS", kind: "add", value: 5, tone: "mint", weight: 0.34 },
  { label: "+10 DDS", kind: "add", value: 10, tone: "sky", weight: 0.3 },
  { label: "+15 DDS", kind: "add", value: 15, tone: "lime", weight: 0.22 },
  { label: "x2 DDS", kind: "multiply", value: 2, tone: "gold", weight: 0.14 },
];

const SPECIAL_GATES = [
  {
    label: "Trusted Friend",
    kind: "shield",
    value: 5,
    tone: "trustedfriend",
    weight: 0.52,
  },
  {
    label: "Senate Immunity",
    kind: "shield",
    value: 5,
    tone: "senate",
    weight: 0.48,
  },
];

const GAMEPLAY_SPAWN_PATTERN = [
  "gate",
  "special",
  "gate",
  "nbi",
  "gate",
  "special",
  "gate",
  "nbi",
];

const WELCOME_GUIDE = [
  {
    title: "Bato",
    art: "/ccc.png",
    note: "Your runner",
    description:
      "Move Bato with drag, swipe, or arrow keys and keep the crowd alive as long as possible.",
  },
  {
    title: "DDS Recruit Gate",
    art: DDS_GATE_SPRITE_PATH,
    note: "Build the squad",
    description:
      "Pick the gate that grows your DDS count before the next NBI encounter arrives.",
  },
  {
    title: "NBI",
    art: NBI_SPRITE_PATH,
    note: "Lane choice matters",
    description:
      "NBI panels stay close to your crowd count. One lane should usually survive, while the other can wipe the run.",
  },
  {
    title: "Trusted Friend",
    art: TRUSTED_FRIEND_SPRITE_PATH,
    note: "5-second shield",
    description:
      "Blocks NBI losses for 5 seconds and gives Bato a visible protection state.",
  },
  {
    title: "Senate Immunity",
    art: SENATE_IMMUNITY_SPRITE_PATH,
    note: "5-second shield",
    description:
      "Another protection pickup that can rescue shaky runs when the crowd is getting too small.",
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const pickWeighted = (items) => {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let threshold = Math.random() * totalWeight;

  for (const item of items) {
    threshold -= item.weight ?? 1;

    if (threshold <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
};

const getRect = (centerX, top, width, height) => ({
  left: centerX - width / 2,
  top,
  width,
  height,
});

const overlaps = (first, second) =>
  first.left < second.left + second.width &&
  first.left + first.width > second.left &&
  first.top < second.top + second.height &&
  first.top + first.height > second.top;

const createInitialGame = () => ({
  status: "idle",
  ddsCount: 1,
  survivalTime: 0,
  shieldTime: 0,
  activePowerLabel: "",
  activePowerTone: "",
  roadOffset: 0,
  playerX: 50,
  playerY: START_PLAYER_Y,
  objects: [],
  message: "",
  nbiEncounterCount: 0,
});

const cloneGate = (gate, x) => ({
  label: gate.label,
  kind: gate.kind,
  value: gate.value,
  tone: gate.tone,
  x,
});

const normalizeEncounterCount = (value) => {
  const rounded = Math.max(1, Math.round(value));

  if (rounded <= 12) return rounded;
  if (rounded <= 24) return Math.round(rounded / 2) * 2;
  if (rounded <= 60) return Math.round(rounded / 5) * 5;

  return Math.round(rounded / 10) * 10;
};

const getEncounterStep = (value) => {
  const rounded = Math.max(1, Math.round(value));

  if (rounded <= 12) return 1;
  if (rounded <= 24) return 2;
  if (rounded <= 60) return 5;

  return 10;
};

const normalizeSupporterGain = (value) => {
  const rounded = Math.max(2, Math.round(value));

  if (rounded <= 8) return Math.round(rounded / 2) * 2;
  if (rounded <= 25) return Math.round(rounded / 5) * 5;

  return Math.round(rounded / 10) * 10;
};

const getBalanceBudget = (survivalTime, ddsCount) =>
  clamp(8 + Math.max(0, ddsCount - 1) * 0.52 + survivalTime * 0.34, 8, 36);

const createHalfRoadPanel = (side, count) => ({
  side,
  x: side === "left" ? GATE_X_POSITIONS[0] : GATE_X_POSITIONS[1],
  width: NBI_WIDTH,
  count,
});

const applyGateEffect = (crowdCount, gate) =>
  gate.kind === "add" ? crowdCount + gate.value : crowdCount * gate.value;

const sortUniqueOutcomes = (routeOutcomes) =>
  [
    ...new Set(routeOutcomes.map((value) => Math.max(1, Math.round(value)))),
  ].sort((first, second) => first - second);

const advanceBatchRouteOutcomes = (routeOutcomes, gatePair) => {
  const nextOutcomes = [];

  for (const crowdCount of routeOutcomes) {
    nextOutcomes.push(applyGateEffect(crowdCount, gatePair.leftGate));
    nextOutcomes.push(applyGateEffect(crowdCount, gatePair.rightGate));
  }

  return sortUniqueOutcomes(nextOutcomes);
};

// Fallback only. This is used if NBI appears without a recruitment batch before it.
const buildAdaptiveNbiPanels = (crowdCount) => {
  const currentCrowd = Math.max(1, Math.round(crowdCount));

  // SAFE lane matches the current DDS count.
  let safeCount = normalizeEncounterCount(currentCrowd);

  // DANGER lane is higher than current DDS.
  let dangerCount = normalizeEncounterCount(
    currentCrowd * pickRandom([1.1, 1.2, 1.3]),
  );

  dangerCount = Math.max(
    dangerCount,
    currentCrowd + getEncounterStep(currentCrowd),
  );

  const counts =
    Math.random() < 0.5 ? [safeCount, dangerCount] : [dangerCount, safeCount];

  return [
    createHalfRoadPanel(HALF_ROAD_SIDES[0], counts[0]),
    createHalfRoadPanel(HALF_ROAD_SIDES[1], counts[1]),
  ];
};

// Main fair logic.
// NBI numbers are based on the possible DDS results from the recruitment gates before it.
// This gives one survivable lane and one dangerous lane.
const buildNbiPanelsFromRecruitmentOutcomes = (
  routeOutcomes,
  currentDdsCount,
) => {
  const outcomes = sortUniqueOutcomes(routeOutcomes);

  if (outcomes.length === 0) {
    return buildAdaptiveNbiPanels(currentDdsCount);
  }

  const currentCrowd = Math.max(1, Math.round(currentDdsCount));
  const strongestPossibleCrowd = Math.max(
    currentCrowd,
    outcomes[outcomes.length - 1],
  );

  // SAFE lane:
  // At least matches current DDS count.
  // This means the player can survive, but DDS will be heavily reduced.
  let safeCount = normalizeEncounterCount(currentCrowd);

  // Make sure safe lane is still beatable by the strongest possible crowd.
  safeCount = Math.min(safeCount, strongestPossibleCrowd);

  // DANGER lane:
  // Higher than the best possible DDS result.
  let dangerCount = normalizeEncounterCount(
    strongestPossibleCrowd * pickRandom([1.1, 1.2, 1.3]),
  );

  dangerCount = Math.max(
    dangerCount,
    strongestPossibleCrowd + getEncounterStep(strongestPossibleCrowd),
  );

  const counts =
    Math.random() < 0.5 ? [safeCount, dangerCount] : [dangerCount, safeCount];

  return [
    createHalfRoadPanel(HALF_ROAD_SIDES[0], counts[0]),
    createHalfRoadPanel(HALF_ROAD_SIDES[1], counts[1]),
  ];
};

const isBackgroundLike = (data, pixelIndex) => {
  const offset = pixelIndex * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const average = (red + green + blue) / 3;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

  return average >= 222 && spread <= 28;
};

const prepareBatoSprite = (sourcePath) =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = BATO_SPRITE_WORK_SIZE;
      canvas.height = BATO_SPRITE_WORK_SIZE;

      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        reject(new Error("Unable to create sprite canvas."));
        return;
      }

      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const pixelCount = canvas.width * canvas.height;
      const visited = new Uint8Array(pixelCount);
      const queue = [];
      let queueHead = 0;

      const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
        queue.push(y * canvas.width + x);
      };

      for (let x = 0; x < canvas.width; x += 1) {
        enqueue(x, 0);
        enqueue(x, canvas.height - 1);
      }

      for (let y = 1; y < canvas.height - 1; y += 1) {
        enqueue(0, y);
        enqueue(canvas.width - 1, y);
      }

      while (queueHead < queue.length) {
        const pixelIndex = queue[queueHead];
        queueHead += 1;

        if (visited[pixelIndex]) continue;
        visited[pixelIndex] = 1;

        if (!isBackgroundLike(data, pixelIndex)) continue;

        const offset = pixelIndex * 4;
        data[offset + 3] = 0;

        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);

        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
      }

      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () =>
      reject(new Error(`Unable to load sprite: ${sourcePath}`));
    image.src = sourcePath;
  });

const prepareSupporterSprite = (sourcePath) =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SUPPORTER_SPRITE_WORK_SIZE;
      canvas.height = SUPPORTER_SPRITE_WORK_SIZE;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Unable to create supporter sprite canvas."));
        return;
      }

      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      resolve(canvas);
    };

    image.onerror = () =>
      reject(new Error(`Unable to load supporter sprite: ${sourcePath}`));
    image.src = sourcePath;
  });

const buildPackedCrowd = (count, width, height, baseSpriteSize) => {
  const centerX = width / 2;
  const centerY = height / 2 + 26;
  const stepX = baseSpriteSize * 0.28;
  const stepY = baseSpriteSize * 0.22;
  const pocketCenterY = centerY + baseSpriteSize * 0.04;
  const pocketRadiusX = baseSpriteSize * 0.56;
  const pocketRadiusY = baseSpriteSize * 0.78;

  let radiusX = clamp(
    Math.sqrt((Math.max(count, 1) * stepX * stepY) / Math.PI) * 1.48,
    40,
    width / 2 - 10,
  );
  let radiusY = clamp(radiusX * 0.72, 26, height / 2 - 14);
  let candidates = [];

  for (let expansion = 0; expansion < 12; expansion += 1) {
    candidates = [];
    const rows = Math.ceil(radiusY / stepY);

    for (let row = -rows; row <= rows; row += 1) {
      const yOffset = row * stepY;
      const normalizedY = yOffset / radiusY;

      if (Math.abs(normalizedY) > 1) continue;

      const rowHalfWidth = Math.sqrt(1 - normalizedY ** 2) * radiusX;
      const columns = Math.ceil(rowHalfWidth / stepX) + 1;
      const rowOffset = row % 2 === 0 ? 0 : stepX / 2;

      for (let column = -columns; column <= columns; column += 1) {
        const xOffset = column * stepX + rowOffset;

        if (Math.abs(xOffset) > rowHalfWidth + stepX * 0.34) continue;

        const pocketMetric =
          (xOffset * xOffset) / (pocketRadiusX * pocketRadiusX) +
          ((yOffset - (pocketCenterY - centerY)) *
            (yOffset - (pocketCenterY - centerY))) /
            (pocketRadiusY * pocketRadiusY);

        if (pocketMetric < 1) continue;

        const distance =
          (xOffset * xOffset) / (radiusX * radiusX) +
          (yOffset * yOffset) / (radiusY * radiusY);

        candidates.push({
          x: centerX + xOffset,
          y: centerY + yOffset,
          row,
          column,
          distance,
        });
      }
    }

    if (
      candidates.length >= count ||
      (radiusX >= width / 2 - 10 && radiusY >= height / 2 - 14)
    ) {
      break;
    }

    radiusX = Math.min(radiusX * 1.08, width / 2 - 10);
    radiusY = Math.min(radiusY * 1.08, height / 2 - 14);
  }

  const positions = candidates
    .sort(
      (first, second) => first.distance - second.distance || first.y - second.y,
    )
    .slice(0, count)
    .sort((first, second) => first.y - second.y || first.x - second.x);

  return { positions, centerY, radiusY };
};

const buildRecruitGatePool = (
  survivalTime,
  ddsCount,
  balanceBudget = getBalanceBudget(survivalTime, ddsCount),
) => {
  const low = normalizeSupporterGain(
    clamp(balanceBudget * (0.42 + Math.random() * 0.08), 4, 16),
  );
  const mid = normalizeSupporterGain(
    clamp(balanceBudget * (0.62 + Math.random() * 0.1), low + 2, 22),
  );
  const high = normalizeSupporterGain(
    clamp(balanceBudget * (0.84 + Math.random() * 0.14), mid + 2, 30),
  );
  const multiplierOpen = ddsCount >= 4 || survivalTime >= 10;

  return [
    {
      label: `+${low} DDS`,
      kind: "add",
      value: low,
      tone: RECRUIT_GATES[0].tone,
      weight: 0.34,
    },
    {
      label: `+${mid} DDS`,
      kind: "add",
      value: mid,
      tone: RECRUIT_GATES[1].tone,
      weight: 0.3,
    },
    {
      label: `+${high} DDS`,
      kind: "add",
      value: high,
      tone: RECRUIT_GATES[2].tone,
      weight: 0.24,
    },
    multiplierOpen
      ? {
          label: "x2 DDS",
          kind: "multiply",
          value: 2,
          tone: RECRUIT_GATES[3].tone,
          weight: 0.12,
        }
      : {
          label: `+${normalizeSupporterGain(clamp(balanceBudget * 1.02, high + 2, 34))} DDS`,
          kind: "add",
          value: normalizeSupporterGain(
            clamp(balanceBudget * 1.02, high + 2, 34),
          ),
          tone: RECRUIT_GATES[3].tone,
          weight: 0.12,
        },
  ];
};

const getRecruitGateDisplay = (gate) =>
  gate.kind === "multiply"
    ? {
        value: "x2",
        note: "DDS DUPLICATE",
      }
    : {
        value: `+${gate.value}`,
        note: "DDS RECRUITS",
      };

const getSpecialGateDisplay = (special) => ({
  title: special.label,
  note: `${special.value}S SHIELD`,
});

const getSpecialGateLogo = (tone) => {
  if (tone === "trustedfriend") {
    return TRUSTED_FRIEND_SPRITE_PATH;
  }

  if (tone === "senate") {
    return SENATE_IMMUNITY_SPRITE_PATH;
  }

  return "";
};

const shouldOfferRescueShield = (ddsCount, shieldTime) => {
  if (shieldTime > 0) {
    return false;
  }

  if (ddsCount <= 3) {
    return Math.random() < 0.82;
  }

  if (ddsCount <= 6) {
    return Math.random() < 0.64;
  }

  if (ddsCount <= 10) {
    return Math.random() < 0.42;
  }

  if (ddsCount <= 16) {
    return Math.random() < 0.24;
  }

  return Math.random() < 0.1;
};

const createGatePair = (id, survivalTime, ddsCount, balanceBudget) => {
  const gatePool = buildRecruitGatePool(survivalTime, ddsCount, balanceBudget);
  const leftGate = cloneGate(pickWeighted(gatePool), GATE_X_POSITIONS[0]);
  let rightGate = cloneGate(pickWeighted(gatePool), GATE_X_POSITIONS[1]);

  if (leftGate.label === rightGate.label) {
    const sameGateIndex = gatePool.findIndex(
      (gate) => gate.label === rightGate.label,
    );
    const alternateGate = gatePool[(sameGateIndex + 1) % gatePool.length];
    rightGate = cloneGate(alternateGate, GATE_X_POSITIONS[1]);
  }

  return {
    id,
    type: "gatePair",
    y: -14,
    width: GATE_WIDTH,
    height: GATE_HEIGHT,
    leftGate,
    rightGate,
  };
};

const createNbiEncounter = (
  id,
  survivalTime,
  ddsCount,
  batchContext = null,
) => {
  const currentCrowd = Math.max(1, ddsCount);
  const reachableOutcomes = batchContext?.batchRouteOutcomes?.length
    ? sortUniqueOutcomes(batchContext.batchRouteOutcomes)
    : null;

  return {
    id,
    type: "nbiEncounter",
    y: -12,
    height: NBI_HEIGHT,
    panels: reachableOutcomes?.length
      ? buildNbiPanelsFromRecruitmentOutcomes(reachableOutcomes, currentCrowd)
      : buildAdaptiveNbiPanels(currentCrowd),
    locked: true,
  };
};

const createSpecialGate = (id) => {
  const special = pickWeighted(SPECIAL_GATES);

  return {
    id,
    type: "special",
    y: -12,
    x: pickRandom([24, 50, 76]),
    width: SPECIAL_WIDTH,
    height: SPECIAL_HEIGHT,
    special,
  };
};

const getGateBatchSize = (survivalTime, ddsCount) => {
  if (survivalTime < 10 || ddsCount < 10) {
    return 2;
  }

  return Math.random() < 0.35 ? 3 : 2;
};

const createNonGateSpawn = (id, survivalTime, ddsCount, preferNbi = false) => {
  const roll = Math.random();
  const nbiBias = preferNbi ? 0.86 : 0.72;

  if (survivalTime < 6) {
    return createNbiEncounter(id, survivalTime, ddsCount);
  }

  if (ddsCount <= 2) {
    return roll < 0.58
      ? createSpecialGate(id)
      : createNbiEncounter(id, survivalTime, ddsCount);
  }

  if (ddsCount <= 6) {
    return roll < Math.max(0.6, nbiBias - 0.16)
      ? createNbiEncounter(id, survivalTime, ddsCount)
      : createSpecialGate(id);
  }

  if (ddsCount <= 18) {
    return roll < Math.max(0.7, nbiBias - 0.08)
      ? createNbiEncounter(id, survivalTime, ddsCount)
      : createSpecialGate(id);
  }

  return roll < nbiBias
    ? createNbiEncounter(id, survivalTime, ddsCount)
    : createSpecialGate(id);
};

const createSpawnObject = (id, survivalTime, ddsCount, shieldTime, spawnState) => {
  const spawnType = spawnState.spawnPattern[spawnState.spawnPatternIndex];

  spawnState.spawnPatternIndex =
    (spawnState.spawnPatternIndex + 1) % spawnState.spawnPattern.length;

  if (spawnType === "gate") {
    spawnState.activeBatchBudget =
      getBalanceBudget(survivalTime, ddsCount) * (0.96 + Math.random() * 0.18);

    if (!spawnState.batchRouteOutcomes?.length) {
      spawnState.batchRouteOutcomes = [Math.max(1, ddsCount)];
    }

    const gatePair = createGatePair(
      id,
      survivalTime,
      ddsCount,
      spawnState.activeBatchBudget,
    );

    spawnState.batchRouteOutcomes = advanceBatchRouteOutcomes(
      spawnState.batchRouteOutcomes,
      gatePair,
    );

    return gatePair;
  }

  if (spawnType === "special" || shouldOfferRescueShield(ddsCount, shieldTime)) {
    spawnState.batchRouteOutcomes = [Math.max(1, ddsCount)];
    spawnState.activeBatchBudget = null;
    return createSpecialGate(id);
  }

  const nbiEncounter = createNbiEncounter(
    id,
    survivalTime,
    ddsCount,
    spawnState,
  );

  // Reset only after NBI is created.
  // This makes the next DDS gate batch start fresh.
  spawnState.batchRouteOutcomes = [Math.max(1, ddsCount)];
  spawnState.activeBatchBudget = null;

  return nbiEncounter;
};

const getNextSpawnCooldown = (spawnedObject, survivalTime) => {
  if (spawnedObject.type === "gatePair") {
    // Gates can appear a bit faster so the player can replenish.
    return Math.max(1.15, 1.65 - survivalTime * 0.004) + Math.random() * 0.2;
  }

  if (spawnedObject.type === "nbiEncounter") {
    // Bigger breathing room after NBI.
    return Math.max(2.4, 3.1 - survivalTime * 0.004) + Math.random() * 0.45;
  }

  return Math.max(1.2, 1.6 - survivalTime * 0.004) + Math.random() * 0.2;
};

const RecruitGateVisual = memo(function RecruitGateVisual({ gate }) {
  const display = getRecruitGateDisplay(gate);

  return (
    <>
      <div className="gate-hero" aria-hidden="true">
        <img
          className="gate-hero-sprite"
          src={DDS_GATE_SPRITE_PATH}
          alt=""
          draggable="false"
        />
      </div>

      <div className="gate-caption">
        <strong>{display.value}</strong>
        <span>{display.note}</span>
      </div>
    </>
  );
});

const NbiEncounterVisual = memo(function NbiEncounterVisual({ count }) {
  return (
    <>
      <div className="nbi-hero" aria-hidden="true">
        <img
          className="nbi-hero-sprite"
          src={NBI_SPRITE_PATH}
          alt=""
          draggable="false"
        />
      </div>

      <div className="nbi-count">
        <span>NBI</span>
        <strong>{count}</strong>
        <small>COUNT</small>
      </div>
    </>
  );
});

const SpecialGateVisual = memo(function SpecialGateVisual({ special }) {
  const display = getSpecialGateDisplay(special);
  const logoSource = getSpecialGateLogo(special.tone);

  return (
    <>
      {logoSource && (
        <div className="special-logo-wrap" aria-hidden="true">
          <img
            className="special-logo"
            src={logoSource}
            alt=""
            draggable="false"
          />
        </div>
      )}

      <div
        className={`special-copy ${logoSource ? "special-copy--with-logo" : ""}`}
      >
        <strong>{display.title}</strong>
        <span>{display.note}</span>
      </div>
    </>
  );
});

const PlayerSquad = memo(function PlayerSquad({ ddsCount, frameIndex }) {
  const canvasRef = useRef(null);
  const [frames, setFrames] = useState([]);

  useEffect(() => {
    let active = true;

    Promise.all(
      SUPPORTER_SPRITE_PATHS.map((path) => prepareSupporterSprite(path)),
    )
      .then((loadedFrames) => {
        if (active) setFrames(loadedFrames);
      })
      .catch(() => {
        if (active) setFrames([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const context = canvas.getContext("2d");

    if (!context) return;

    const width = SQUAD_CANVAS_SIZE;
    const height = SQUAD_CANVAS_SIZE;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    if (ddsCount <= 0) return;

    const frame = frames[frameIndex] ?? frames[0];

    if (!frame) return;

    const baseSpriteSize = SUPPORTER_BASE_SPRITE_SIZE;
    const { positions, centerY, radiusY } = buildPackedCrowd(
      ddsCount,
      width,
      height,
      baseSpriteSize,
    );

    for (const position of positions) {
      const depth = clamp(
        (position.y - (centerY - radiusY)) / (radiusY * 2),
        0,
        1,
      );
      const spriteSize = baseSpriteSize;
      const bobDirection =
        (position.row + position.column + frameIndex) % 2 === 0 ? -1 : 1;
      const bobOffset =
        bobDirection * (0.45 + depth * 0.7) * (frameIndex === 0 ? 0.82 : -0.82);

      context.drawImage(
        frame,
        position.x - spriteSize / 2,
        position.y - spriteSize / 2 + bobOffset,
        spriteSize,
        spriteSize,
      );
    }
  }, [ddsCount, frameIndex, frames]);

  return (
    <div className="player-squad" aria-hidden="true">
      <canvas className="player-squad-canvas" ref={canvasRef} />
    </div>
  );
});

const BatoSprite = memo(function BatoSprite({
  frameIndex,
  shielded,
  powerTone,
}) {
  const [frames, setFrames] = useState([]);

  useEffect(() => {
    let active = true;

    Promise.all(BATO_SPRITE_PATHS.map((path) => prepareBatoSprite(path)))
      .then((loadedFrames) => {
        if (active) setFrames(loadedFrames);
      })
      .catch(() => {
        if (active) setFrames(BATO_SPRITE_PATHS);
      });

    return () => {
      active = false;
    };
  }, []);

  const frameSource = frames[frameIndex] ?? BATO_SPRITE_PATHS[frameIndex];

  return (
    <div
      className={[
        "player-core",
        shielded ? "player-core--shielded" : "",
        shielded && powerTone ? `player-core--${powerTone}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <img
        className="player-sprite"
        src={frameSource}
        alt="Bato"
        draggable="false"
      />
    </div>
  );
});

function App() {
  const [game, setGame] = useState(createInitialGame);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(true);
  const [powerSplash, setPowerSplash] = useState(null);
  const playfieldRef = useRef(null);
  const animationFrameRef = useRef(0);
  const lastFrameRef = useRef(0);
  const spawnCooldownRef = useRef(0.9);
  const spawnStateRef = useRef({
    spawnPattern: GAMEPLAY_SPAWN_PATTERN,
    spawnPatternIndex: 0,
    batchRouteOutcomes: [1],
    activeBatchBudget: null,
  });
  const nextIdRef = useRef(1);
  const dragRef = useRef({ active: false, pointerId: null });
  const keysRef = useRef({ left: false, right: false, up: false, down: false });
  const welcomeAudioRef = useRef(null);
  const gameplayMusicRef = useRef(null);
  const effectsAudioContextRef = useRef(null);
  const effectBuffersRef = useRef({});
  const effectLoadsRef = useRef({});
  const previousDdsCountRef = useRef(1);
  const previousShieldTimeRef = useRef(0);
  const previousNbiEncounterCountRef = useRef(0);
  const previousStatusRef = useRef("idle");
  const previousGameoverStatusRef = useRef("idle");
  const powerSplashTimeoutRef = useRef(0);

  useEffect(() => {
    const audio = new Audio(WELCOME_AUDIO_PATH);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.42;
    welcomeAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      welcomeAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(GAMEPLAY_MUSIC_PATH);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.34;
    gameplayMusicRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      gameplayMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      const audioContext = effectsAudioContextRef.current;

      if (audioContext?.state !== "closed") {
        audioContext?.close().catch(() => {});
      }

      effectsAudioContextRef.current = null;
      effectBuffersRef.current = {};
      effectLoadsRef.current = {};
    };
  }, []);

  const getEffectsAudioContext = () => {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!effectsAudioContextRef.current) {
      effectsAudioContextRef.current = new AudioContextClass();
    }

    return effectsAudioContextRef.current;
  };

  const resumeEffectsAudio = async () => {
    const audioContext = getEffectsAudioContext();

    if (!audioContext) return null;

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        return null;
      }
    }

    return audioContext;
  };

  const loadEffectBuffer = async (effectKey) => {
    if (effectBuffersRef.current[effectKey]) {
      return effectBuffersRef.current[effectKey];
    }

    if (effectLoadsRef.current[effectKey]) {
      return effectLoadsRef.current[effectKey];
    }

    const audioContext = getEffectsAudioContext();

    if (!audioContext) return null;

    const config = EFFECT_SOUND_CONFIG[effectKey];

    const loadPromise = fetch(config.path)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer.slice(0)))
      .then((buffer) => {
        effectBuffersRef.current[effectKey] = buffer;
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        delete effectLoadsRef.current[effectKey];
      });

    effectLoadsRef.current[effectKey] = loadPromise;
    return loadPromise;
  };

  const primeEffectSounds = async () => {
    const audioContext = getEffectsAudioContext();

    if (!audioContext) return;

    await Promise.all(
      Object.keys(EFFECT_SOUND_CONFIG).map((effectKey) =>
        loadEffectBuffer(effectKey),
      ),
    );
  };

  const playEffectSound = async (effectKey) => {
    if (!soundEnabled) return;

    const audioContext = await resumeEffectsAudio();

    if (!audioContext) return;

    const buffer = await loadEffectBuffer(effectKey);

    if (!buffer) return;

    const { startTime = 0, volume = 1 } = EFFECT_SOUND_CONFIG[effectKey];
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    gainNode.gain.value = volume;
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0, startTime);
  };

  useEffect(() => {
    void primeEffectSounds();
  }, []);

  const resetToWelcome = () => {
    nextIdRef.current = 1;
    lastFrameRef.current = 0;
    spawnCooldownRef.current = 0.9;
    spawnStateRef.current = {
      spawnPattern: GAMEPLAY_SPAWN_PATTERN,
      spawnPatternIndex: 0,
      batchRouteOutcomes: [1],
      activeBatchBudget: null,
    };
    dragRef.current = { active: false, pointerId: null };
    keysRef.current = { left: false, right: false, up: false, down: false };
    setGame(createInitialGame());
  };

  const startGame = () => {
    nextIdRef.current = 1;
    lastFrameRef.current = 0;
    spawnCooldownRef.current = 1.42;
    spawnStateRef.current = {
      spawnPattern: GAMEPLAY_SPAWN_PATTERN,
      spawnPatternIndex: 0,
      batchRouteOutcomes: [1],
      activeBatchBudget: getBalanceBudget(0, 1),
    };
    dragRef.current = { active: false, pointerId: null };
    keysRef.current = { left: false, right: false, up: false, down: false };

    const openingObject = createGatePair(
      nextIdRef.current,
      0,
      1,
      spawnStateRef.current.activeBatchBudget,
    );

    spawnStateRef.current.batchRouteOutcomes = advanceBatchRouteOutcomes(
      spawnStateRef.current.batchRouteOutcomes,
      openingObject,
    );

    nextIdRef.current += 1;

    if (soundEnabled) {
      void primeEffectSounds();
      void resumeEffectsAudio();
    }

    setGame({
      ...createInitialGame(),
      status: "running",
      objects: [openingObject],
    });
  };

  const restartGame = () => {
    startGame();
  };

  const movePlayerToPointer = (clientX, clientY) => {
    const bounds = playfieldRef.current?.getBoundingClientRect();

    if (!bounds) return;

    const relativeX = ((clientX - bounds.left) / bounds.width) * 100;
    const relativeY = ((clientY - bounds.top) / bounds.height) * 100;
    const playerX = clamp(relativeX, MIN_PLAYER_X, MAX_PLAYER_X);
    const playerY = clamp(relativeY, MIN_PLAYER_Y, MAX_PLAYER_Y);

    setGame((currentGame) =>
      currentGame.status === "running"
        ? {
            ...currentGame,
            playerX,
            playerY,
          }
        : currentGame,
    );
  };

  const handlePointerDown = (event) => {
    if (game.status !== "running") return;

    dragRef.current = { active: true, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (soundEnabled) {
      void resumeEffectsAudio();
    }
  };

  const handlePointerMove = (event) => {
    if (
      !dragRef.current.active ||
      dragRef.current.pointerId !== event.pointerId
    )
      return;

    movePlayerToPointer(event.clientX, event.clientY);
  };

  const handlePointerEnd = (event) => {
    if (dragRef.current.pointerId !== event.pointerId) return;

    dragRef.current = { active: false, pointerId: null };
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        keysRef.current.left = true;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        keysRef.current.right = true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        keysRef.current.up = true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        keysRef.current.down = true;
      }
    };

    const handleKeyUp = (event) => {
      if (event.key === "ArrowLeft") keysRef.current.left = false;
      if (event.key === "ArrowRight") keysRef.current.right = false;
      if (event.key === "ArrowUp") keysRef.current.up = false;
      if (event.key === "ArrowDown") keysRef.current.down = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (game.status !== "running") {
      return undefined;
    }

    const step = (timestamp) => {
      if (!lastFrameRef.current) {
        lastFrameRef.current = timestamp;
      }

      const delta = Math.min((timestamp - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = timestamp;

      setGame((currentGame) => {
        if (currentGame.status !== "running") {
          return currentGame;
        }

        const nextSurvivalTime = currentGame.survivalTime + delta;
        const nextShieldTime = Math.max(0, currentGame.shieldTime - delta);
        const worldSpeed = 24 + nextSurvivalTime * 1.35;
        const roadPhaseAmplitude = Math.min(
          0.26,
          0.16 + nextSurvivalTime * 0.002,
        );
        const roadPhaseMultiplier =
          1 + Math.sin(nextSurvivalTime * 2.3) * roadPhaseAmplitude;
        const nextRoadOffset =
          (currentGame.roadOffset +
            worldSpeed * roadPhaseMultiplier * delta * 2.2) %
          LANE_PATTERN_HEIGHT;
        const keyboardSpeed = 58;

        let playerX = currentGame.playerX;
        let playerY = currentGame.playerY;

        if (keysRef.current.left) playerX -= keyboardSpeed * delta;
        if (keysRef.current.right) playerX += keyboardSpeed * delta;
        if (keysRef.current.up) playerY -= keyboardSpeed * delta;
        if (keysRef.current.down) playerY += keyboardSpeed * delta;

        playerX = clamp(playerX, MIN_PLAYER_X, MAX_PLAYER_X);
        playerY = clamp(playerY, MIN_PLAYER_Y, MAX_PLAYER_Y);

        let objects = currentGame.objects
          .map((object) => ({
            ...object,
            y: object.y + worldSpeed * delta,
          }))
          .filter((object) => object.y < 118);

        spawnCooldownRef.current -= delta;

        if (spawnCooldownRef.current <= 0) {
          const spawnedObject = createSpawnObject(
            nextIdRef.current,
            nextSurvivalTime,
            currentGame.ddsCount,
            currentGame.shieldTime,
            spawnStateRef.current,
          );

          objects.push(spawnedObject);
          nextIdRef.current += 1;
          spawnCooldownRef.current = getNextSpawnCooldown(
            spawnedObject,
            nextSurvivalTime,
            spawnStateRef.current,
          );
        }

        const playerRect = getRect(
          playerX,
          playerY,
          PLAYER_WIDTH,
          PLAYER_HEIGHT,
        );

        let ddsCount = currentGame.ddsCount;
        let shieldTime = nextShieldTime;
        let activePowerLabel =
          nextShieldTime > 0 ? currentGame.activePowerLabel : "";
        let activePowerTone =
          nextShieldTime > 0 ? currentGame.activePowerTone : "";
        let status = currentGame.status;
        let message = currentGame.message;
        let nbiEncounterCount = currentGame.nbiEncounterCount;

        const survivingObjects = [];

        for (const object of objects) {
          if (status !== "running") break;

          let consumed = false;

          if (object.type === "gatePair") {
            const hitGates = [
              {
                gate: object.leftGate,
                rect: getRect(
                  object.leftGate.x,
                  object.y,
                  object.width,
                  object.height,
                ),
              },
              {
                gate: object.rightGate,
                rect: getRect(
                  object.rightGate.x,
                  object.y,
                  object.width,
                  object.height,
                ),
              },
            ].filter((candidate) => overlaps(playerRect, candidate.rect));

            if (hitGates.length > 0) {
              const selectedGate = hitGates.sort(
                (first, second) =>
                  Math.abs(first.gate.x - playerX) -
                  Math.abs(second.gate.x - playerX),
              )[0].gate;

              if (selectedGate.kind === "add") {
                ddsCount += selectedGate.value;
              } else {
                ddsCount *= selectedGate.value;
              }

              consumed = true;
            }
          }

          if (object.type === "nbiEncounter") {
            const hitPanels = object.panels
              .map((panel) => ({
                panel,
                rect: getRect(panel.x, object.y, panel.width, object.height),
              }))
              .filter((candidate) => overlaps(playerRect, candidate.rect));

            if (hitPanels.length > 0) {
              consumed = true;
              nbiEncounterCount += 1;

              if (shieldTime <= 0) {
                const selectedPanel = hitPanels.sort(
                  (first, second) =>
                    Math.abs(first.panel.x - playerX) -
                    Math.abs(second.panel.x - playerX),
                )[0].panel;

                if (ddsCount >= selectedPanel.count) {
                  ddsCount = Math.max(0, ddsCount - selectedPanel.count);
                } else {
                  status = "gameover";
                  message = "NA-SERVE ANG WARRANT.";
                }
              }
            }
          }

          if (object.type === "special") {
            const specialRect = getRect(
              object.x,
              object.y,
              object.width,
              object.height,
            );

            if (overlaps(playerRect, specialRect)) {
              consumed = true;

              if (object.special.kind === "shield") {
                shieldTime += object.special.value;
                activePowerLabel = object.special.label;
                activePowerTone = object.special.tone;
              }
            }
          }

          if (!consumed) {
            survivingObjects.push(object);
          }
        }

        return {
          ...currentGame,
          status,
          message,
          ddsCount,
          shieldTime,
          activePowerLabel,
          activePowerTone,
          roadOffset: nextRoadOffset,
          playerX,
          playerY,
          survivalTime: nextSurvivalTime,
          nbiEncounterCount,
          objects: status === "running" ? survivingObjects : [],
        };
      });

      animationFrameRef.current = window.requestAnimationFrame(step);
    };

    animationFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      lastFrameRef.current = 0;
    };
  }, [game.status]);

  useEffect(() => {
    if (game.status === "running") return;

    keysRef.current = { left: false, right: false, up: false, down: false };
    dragRef.current = { active: false, pointerId: null };
  }, [game.status]);

  useEffect(() => {
    if (game.status === "running") return undefined;

    window.clearTimeout(powerSplashTimeoutRef.current);
    powerSplashTimeoutRef.current = 0;
    setPowerSplash(null);
    previousShieldTimeRef.current = game.shieldTime;

    return undefined;
  }, [game.shieldTime, game.status]);

  useEffect(() => {
    const previousDdsCount = previousDdsCountRef.current;
    const previousStatus = previousStatusRef.current;

    if (
      soundEnabled &&
      game.status === "running" &&
      previousStatus === "running" &&
      game.ddsCount > previousDdsCount
    ) {
      void playEffectSound("recruit");
    }

    previousDdsCountRef.current = game.ddsCount;
    previousStatusRef.current = game.status;
  }, [game.ddsCount, game.status, soundEnabled]);

  useEffect(() => {
    const previousNbiEncounterCount = previousNbiEncounterCountRef.current;

    if (
      soundEnabled &&
      game.status === "running" &&
      game.nbiEncounterCount > previousNbiEncounterCount
    ) {
      void playEffectSound("nbi");
    }

    previousNbiEncounterCountRef.current = game.nbiEncounterCount;
  }, [game.nbiEncounterCount, game.status, soundEnabled]);

  useEffect(() => {
    const previousStatus = previousGameoverStatusRef.current;

    if (
      soundEnabled &&
      game.status === "gameover" &&
      previousStatus !== "gameover"
    ) {
      const gameplayAudio = gameplayMusicRef.current;

      if (gameplayAudio) {
        gameplayAudio.pause();
        gameplayAudio.currentTime = 0;
      }

      void playEffectSound("gameover");
    }

    previousGameoverStatusRef.current = game.status;
  }, [game.status, soundEnabled]);

  useEffect(() => {
    const previousShieldTime = previousShieldTimeRef.current;
    const previousStatus = previousStatusRef.current;

    if (
      game.status === "running" &&
      previousStatus === "running" &&
      game.activePowerTone &&
      game.shieldTime > previousShieldTime + 1
    ) {
      const splash = {
        tone: game.activePowerTone,
        title: game.activePowerLabel || "Shield Active",
        note: "5S SHIELD",
        art: getSpecialGateLogo(game.activePowerTone),
      };

      setPowerSplash(splash);
      window.clearTimeout(powerSplashTimeoutRef.current);
      powerSplashTimeoutRef.current = window.setTimeout(() => {
        setPowerSplash(null);
        powerSplashTimeoutRef.current = 0;
      }, POWER_SPLASH_DURATION_MS);

      void playEffectSound("powerup");
    }

    previousShieldTimeRef.current = game.shieldTime;

    return () => {};
  }, [
    game.activePowerLabel,
    game.activePowerTone,
    game.shieldTime,
    game.status,
    soundEnabled,
  ]);

  useEffect(() => {
    const audio = welcomeAudioRef.current;

    if (!audio) return undefined;

    if (soundEnabled && game.status === "idle") {
      const playPromise = audio.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
    }

    return undefined;
  }, [game.status, soundEnabled]);

  useEffect(() => {
    const audio = gameplayMusicRef.current;

    if (!audio) return undefined;

    if (soundEnabled && game.status === "running") {
      const playPromise = audio.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
    }

    return undefined;
  }, [game.status, soundEnabled]);

  const applySoundSetting = (nextSoundEnabled) => {
    const audio = welcomeAudioRef.current;

    setSoundEnabled(nextSoundEnabled);

    if (nextSoundEnabled) {
      void primeEffectSounds();
      void resumeEffectsAudio();
    }

    if (!audio) return;

    if (nextSoundEnabled && game.status === "idle") {
      audio.currentTime = 0;
      const playPromise = audio.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    }

    if (!nextSoundEnabled) {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  const toggleSound = () => {
    applySoundSetting(!soundEnabled);
  };

  const enableSoundFromPrompt = () => {
    applySoundSetting(true);
    setShowSoundPrompt(false);
  };

  const dismissSoundPrompt = () => {
    setShowSoundPrompt(false);
  };

  const bounceSpeed = Math.max(0.24, 0.46 - game.survivalTime * 0.004);
  const batoFrameIndex =
    game.status === "running" ? Math.floor(game.survivalTime * 7) % 2 : 0;
  const visibleSupporterCount = Math.max(0, game.ddsCount - 1);

  const playfieldClassName =
    `playfield ${game.status === "running" ? "playfield--running" : ""}`.trim();

  const playerClassName = [
    "player",
    game.status === "running" ? "player--running" : "",
    game.shieldTime > 0 ? "player--shielded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const soundToggle = (
    <button
      className={`sound-toggle ${soundEnabled ? "sound-toggle--on" : "sound-toggle--off"}`}
      type="button"
      onClick={toggleSound}
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? "Turn welcome music off" : "Turn welcome music on"}
    >
      <span className="sound-toggle-icon" aria-hidden="true">
        <span className="sound-toggle-speaker" />
        <span className="sound-toggle-wave sound-toggle-wave--one" />
        <span className="sound-toggle-wave sound-toggle-wave--two" />
      </span>

      <span className="sound-toggle-label">{soundEnabled ? "ON" : "OFF"}</span>
    </button>
  );

  const soundPrompt = showSoundPrompt ? (
    <div className="sound-prompt" role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title">
      <div className="sound-prompt-card">
        <p className="sound-prompt-kicker">Arcade Audio</p>
        <h2 id="sound-prompt-title">Turn On Sound?</h2>
        <p className="sound-prompt-copy">
         Make the most out of it!
        </p>

        <div className="sound-prompt-actions">
          <button className="action-button" type="button" onClick={enableSoundFromPrompt}>
            Turn On Sound
          </button>

          <button className="ghost-button" type="button" onClick={dismissSoundPrompt}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const powerSplashLayer = powerSplash ? (
    <div
      className={`power-splash power-splash--${powerSplash.tone}`}
      aria-hidden="true"
    >
      <div className="power-splash-card">
        <p className="power-splash-kicker">Power Up</p>
        <img
          className="power-splash-art"
          src={powerSplash.art}
          alt=""
          draggable="false"
        />
        <strong>{powerSplash.title}</strong>
        <span>{powerSplash.note}</span>
      </div>
    </div>
  ) : null;

  if (game.status === "idle") {
    return (
      <div className="app-shell app-shell--welcome">
        {soundToggle}
        <div className="welcome-page">
          <section className="welcome-hero-card">
            <div className="welcome-copy">
              <p className="welcome-kicker">Arcade Runner Prototype</p>
              <h1>BREAKING BALD</h1>
              <p className="welcome-summary">
                Grow the DDS crowd, prepare for the incoming NBI, and keep Bato
                unarrested as long as possible.
              </p>

              <div className="welcome-actions">
                <button
                  className="action-button"
                  type="button"
                  onClick={startGame}
                >
                  Start Run
                </button>
              </div>
            </div>

            <div className="welcome-panel">
              <h2>How It Works</h2>
              <ul className="welcome-list">
                <li>Drag, swipe, or use arrow keys to move across the road.</li>
                <li>
                  Recruit gates raise your DDS count before NBI reaches you.
                </li>
                <li>
                  When NBI appears, pick the lane with the survivable count.
                </li>
                <li>
                  Trusted Friend and Senate Immunity protect Bato for 5 seconds.
                </li>
              </ul>
            </div>
          </section>

          <section className="guide-grid">
            {WELCOME_GUIDE.map((item) => (
              <article key={item.title} className="guide-card">
                <div className="guide-art-wrap" aria-hidden="true">
                  <img
                    className="guide-art"
                    src={item.art}
                    alt=""
                    draggable="false"
                  />
                </div>
                <div className="guide-copy">
                  <span>{item.note}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </section>
        </div>
        {soundPrompt}
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--game">
      {soundToggle}
      <div className="game-shell">
        <div className="playfield-shell">
          <div
            ref={playfieldRef}
            className={playfieldClassName}
            style={{
              "--bounce-speed": `${bounceSpeed}s`,
              "--lane-offset": `${game.roadOffset}px`,
            }}
          >
            <div className="road-bed" aria-hidden="true">
              <div className="road-flow" />
            </div>

            {powerSplashLayer}

            <div className="playfield-topbar" aria-hidden="true">
              <div className="playfield-stat">
                <span>DDS Squad</span>
                <strong>{game.ddsCount}</strong>
              </div>

              <div className="playfield-stat">
                <span>Survival Time</span>
                <strong>{game.survivalTime.toFixed(1)}s</strong>
              </div>
            </div>

            <div className="lane lane-left" />
            <div className="lane lane-right" />

            {game.objects.map((object) => {
              if (object.type === "gatePair") {
                return (
                  <Fragment key={object.id}>
                    <div
                      className={`game-object gate gate--${object.leftGate.tone}`}
                      style={{
                        top: `${object.y}%`,
                        left: `${object.leftGate.x}%`,
                        width: `${object.width}%`,
                        height: `${object.height}%`,
                      }}
                    >
                      <RecruitGateVisual gate={object.leftGate} />
                    </div>

                    <div
                      className={`game-object gate gate--${object.rightGate.tone}`}
                      style={{
                        top: `${object.y}%`,
                        left: `${object.rightGate.x}%`,
                        width: `${object.width}%`,
                        height: `${object.height}%`,
                      }}
                    >
                      <RecruitGateVisual gate={object.rightGate} />
                    </div>
                  </Fragment>
                );
              }

              if (object.type === "nbiEncounter") {
                return (
                  <Fragment key={object.id}>
                    {object.panels.map((panel, index) => (
                      <div
                        key={`${object.id}-${panel.side}-${index}`}
                        className="game-object nbi"
                        style={{
                          top: `${object.y}%`,
                          left: `${panel.x}%`,
                          width: `${panel.width}%`,
                          height: `${object.height}%`,
                        }}
                      >
                        <NbiEncounterVisual count={panel.count} />
                      </div>
                    ))}
                  </Fragment>
                );
              }

              return (
                <div
                  key={object.id}
                  className={`game-object special special--${object.special.tone}`}
                  style={{
                    top: `${object.y}%`,
                    left: `${object.x}%`,
                    width: `${object.width}%`,
                    height: `${object.height}%`,
                  }}
                >
                  <SpecialGateVisual special={object.special} />
                </div>
              );
            })}

            <div
              className={playerClassName}
              style={{
                top: `${game.playerY}%`,
                left: `${game.playerX}%`,
                width: `${PLAYER_WIDTH}%`,
                height: `${PLAYER_HEIGHT}%`,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <PlayerSquad
                ddsCount={visibleSupporterCount}
                frameIndex={batoFrameIndex}
              />

              {game.shieldTime > 0 && (
                <div
                  className={`player-power player-power--${game.activePowerTone || "trustedfriend"}`}
                  aria-hidden="true"
                >
                  <div className="player-power-ring" />
                </div>
              )}

              <div className="player-hover">
                <BatoSprite
                  frameIndex={batoFrameIndex}
                  shielded={game.shieldTime > 0}
                  powerTone={game.activePowerTone}
                />
              </div>

              {game.shieldTime > 0 && (
                <div
                  className={`player-power-banner player-power-banner--${game.activePowerTone || "trustedfriend"}`}
                  aria-hidden="true"
                >
                  <strong>{game.activePowerLabel || "Shield Active"}</strong>
                  <span>{`${game.shieldTime.toFixed(1)}s power`}</span>
                </div>
              )}
            </div>

            {game.status === "gameover" && (
              <div className="overlay">
                <div className="overlay-card">
                  <img
                    className="overlay-art"
                    src="/aa.png"
                    alt="Bato being arrested by the NBI"
                  />

                  <h2>{game.message}</h2>

                  <p>{`Final survival time: ${game.survivalTime.toFixed(1)} seconds.`}</p>

                  <div className="overlay-actions">
                    <button className="action-button" type="button" onClick={restartGame}>
                      Restart Run
                    </button>

                    <button className="ghost-button" type="button" onClick={resetToWelcome}>
                      Back To Guide
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {soundPrompt}
    </div>
  );
}

export default App;
