// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const MAX_WAVEFORM_POINTS = 760;
const BASE_ANGULAR_SPEED = 1;

const LAYOUT = {
  originX: 0.28,
  originY: 0.47,
  graphX: 0.52,
  graphRightPadding: 24,
  graphTop: 14,
  graphBottomPadding: 30,
  baseRadiusScale: 0.18
};

// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const plot = document.getElementById("plot");
const ctx = plot.getContext("2d");

const controls = {
  shape: document.getElementById("shapeSelect"),
  terms: document.getElementById("termsRange"),
  speed: document.getElementById("speedRange")
};

const readouts = {
  terms: document.getElementById("termsVal"),
  speed: document.getElementById("speedVal")
};

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------


const plotColors = {
  background: DemoUtils.cssVar("--theme-surface-bg", "#ffffff"),
  axis: DemoUtils.cssVar("--plot-axis", "#b8b8b8"),
  axisSoft: DemoUtils.cssVar("--plot-axis-soft", "#bbbbbb"),
  axisMuted: DemoUtils.cssVar(
    "--plot-axis-muted",
    "rgba(34, 34, 34, 0.35)"
  ),
  primary: DemoUtils.cssVar("--plot-primary", "#3b4cc0"),
  primaryFaded: DemoUtils.cssVar(
    "--plot-primary-faded",
    "rgba(59, 76, 192, 0.55)"
  ),
  secondary: DemoUtils.cssVar("--plot-secondary", "#d11141")
};

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const state = {
  width: 0,
  height: 0,
  dpr: window.devicePixelRatio || 1,

  time: 0,
  previousTimestamp: null,

  waveform: []
};

let resizeObserver = null;

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------

function updateReadouts() {
  readouts.terms.textContent = controls.terms.value;

  readouts.speed.textContent =
    Number(controls.speed.value).toFixed(1);
}

function getControlValues() {
  return {
    shape: controls.shape.value,
    harmonics: Number(controls.terms.value),
    speed: Number(controls.speed.value)
  };
}

// -----------------------------------------------------------------------------
// Canvas sizing
// -----------------------------------------------------------------------------

function resizeCanvas() {
  state.dpr =
    window.devicePixelRatio || 1;

  state.width =
    plot.clientWidth;

  state.height =
    plot.clientHeight;

  plot.width =
    Math.max(
      1,
      Math.round(
        state.width * state.dpr
      )
    );

  plot.height =
    Math.max(
      1,
      Math.round(
        state.height * state.dpr
      )
    );

  ctx.setTransform(
    state.dpr,
    0,
    0,
    state.dpr,
    0,
    0
  );
}

function resetWaveform() {
  state.waveform.length = 0;
}

// -----------------------------------------------------------------------------
// Fourier coefficients
// -----------------------------------------------------------------------------

function getSquareCoefficient(index, baseRadius) {
  const harmonic = 2 * index + 1;

  return {
    frequency: harmonic,
    amplitude:
      (4 / (Math.PI * harmonic)) *
      baseRadius,
    phase: 0
  };
}

function getSawtoothCoefficient(index, baseRadius) {
  const harmonic = index + 1;

  return {
    frequency: harmonic,
    amplitude:
      (2 / (Math.PI * harmonic)) *
      baseRadius,
    phase:
      harmonic % 2 === 0
        ? Math.PI
        : 0
  };
}

function getTriangleCoefficient(index, baseRadius) {
  const harmonic = 2 * index + 1;

  return {
    frequency: harmonic,
    amplitude:
      (
        8 /
        (
          Math.PI *
          Math.PI *
          harmonic *
          harmonic
        )
      ) *
      baseRadius,
    phase:
      index % 2 === 0
        ? 0
        : Math.PI
  };
}

function getCoefficients(shape, count) {
  const baseRadius =
    Math.min(
      state.width,
      state.height
    ) *
    LAYOUT.baseRadiusScale;

  const coefficients = [];

  for (let index = 0; index < count; index++) {
    let coefficient;

    switch (shape) {
      case "square":
        coefficient =
          getSquareCoefficient(
            index,
            baseRadius
          );
        break;

      case "sawtooth":
        coefficient =
          getSawtoothCoefficient(
            index,
            baseRadius
          );
        break;

      case "triangle":
        coefficient =
          getTriangleCoefficient(
            index,
            baseRadius
          );
        break;

      default:
        coefficient =
          getSquareCoefficient(
            index,
            baseRadius
          );
    }

    coefficients.push(coefficient);
  }

  return coefficients;
}

// -----------------------------------------------------------------------------
// Drawing helpers
// -----------------------------------------------------------------------------

function clearCanvas() {
  ctx.fillStyle = plotColors.background;

  ctx.fillRect(
    0,
    0,
    state.width,
    state.height
  );
}

function drawVerticalAxis(origin) {
  ctx.strokeStyle = plotColors.axisSoft;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, state.height);
  ctx.stroke();
}

function drawEpicycle(x, y, radius, nextX, nextY) {
  // Circle
  ctx.strokeStyle = plotColors.primaryFaded;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(
    x,
    y,
    Math.abs(radius),
    0,
    Math.PI * 2
  );
  ctx.stroke();

  // Radius/vector
  ctx.strokeStyle = plotColors.primary;
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(nextX, nextY);
  ctx.stroke();
}

function drawConnectionLine(x, y, graphX) {
  ctx.strokeStyle = plotColors.axisMuted;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(graphX, y);
  ctx.stroke();

  ctx.setLineDash([]);
}

function drawGraphFrame(graph) {
  ctx.strokeStyle = plotColors.axisSoft;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.rect(
    graph.x,
    graph.y,
    graph.width,
    graph.height
  );
  ctx.stroke();

  ctx.strokeStyle = plotColors.axis;
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(
    graph.x,
    graph.centerY
  );
  ctx.lineTo(
    graph.x + graph.width,
    graph.centerY
  );
  ctx.stroke();

  ctx.setLineDash([]);
}

function drawWaveform(graph) {
  if (state.waveform.length === 0) {
    return;
  }

  const sampleSpacing =
    graph.width /
    (MAX_WAVEFORM_POINTS - 1);

  ctx.strokeStyle =
    plotColors.secondary;

  ctx.lineWidth = 2;
  ctx.beginPath();

  state.waveform.forEach(
    (value, index) => {
      const x =
        graph.x +
        index * sampleSpacing;

      const y =
        graph.centerY +
        value;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
  );

  ctx.stroke();

  drawPoint(
    graph.x,
    graph.centerY +
      state.waveform[0],
    5,
    plotColors.secondary
  );
}

function drawPoint(x, y, radius, color) {
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

// -----------------------------------------------------------------------------
// Fourier construction
// -----------------------------------------------------------------------------

function calculateEndpoint(coefficients, origin, speed) {
  let x = origin.x;
  let y = origin.y;

  for (const coefficient of coefficients) {
    const angle =
    coefficient.frequency *
        state.time *
        speed +
    coefficient.phase;

    const nextX =
      x +
      coefficient.amplitude *
        Math.cos(angle);

    const nextY =
      y +
      coefficient.amplitude *
        Math.sin(angle);

    drawEpicycle(
      x,
      y,
      coefficient.amplitude,
      nextX,
      nextY
    );

    x = nextX;
    y = nextY;
  }

  return { x, y };
}

function addWaveformPoint(value) {
  state.waveform.unshift(value);

  if (
    state.waveform.length >
    MAX_WAVEFORM_POINTS
  ) {
    state.waveform.pop();
  }
}

// -----------------------------------------------------------------------------
// Main drawing
// -----------------------------------------------------------------------------

function draw(values) {
  const origin = {
    x:
      state.width *
      LAYOUT.originX,

    y:
      state.height *
      LAYOUT.originY
  };

  const graph = {
    x:
      state.width *
      LAYOUT.graphX,

    y:
      LAYOUT.graphTop,

    width:
      state.width -
      state.width *
        LAYOUT.graphX -
      LAYOUT.graphRightPadding,

    height:
      state.height -
      LAYOUT.graphTop -
      LAYOUT.graphBottomPadding,

    centerY:
      origin.y
  };

  const coefficients =
    getCoefficients(
      values.shape,
      values.harmonics
    );

  drawVerticalAxis(origin);

  const endpoint =
    calculateEndpoint(
      coefficients,
      origin,
      values.speed
    );

  const waveformValue =
    endpoint.y - origin.y;

    addWaveformPoint(
    waveformValue
    );

  drawGraphFrame(graph);

  drawConnectionLine(
    endpoint.x,
    endpoint.y,
    graph.x
  );

  drawWaveform(graph);

  drawPoint(
    endpoint.x,
    endpoint.y,
    6,
    plotColors.secondary
  );
}


// -----------------------------------------------------------------------------
// Animation
// -----------------------------------------------------------------------------

function animate(timestamp) {
  if (state.previousTimestamp === null) {
    state.previousTimestamp =
      timestamp;
  }

  const deltaTime =
    Math.min(
      (timestamp -
        state.previousTimestamp) /
        1000,
      0.05
    );

  state.previousTimestamp =
    timestamp;

  const values =
    getControlValues();

  state.time +=
    deltaTime *
    BASE_ANGULAR_SPEED;

  clearCanvas();
  draw(values);

  requestAnimationFrame(animate);
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  updateReadouts();
  resizeCanvas();

    controls.shape.addEventListener(
    "change",
    () => {
        resetWaveform();
        updateReadouts();
    }
    );

    controls.terms.addEventListener(
    "input",
    () => {
        resetWaveform();
        updateReadouts();
    }
    );

    controls.speed.addEventListener(
    "input",
    updateReadouts
    );

  if ("ResizeObserver" in window) {
    resizeObserver =
      new ResizeObserver(
        resizeCanvas
      );

    resizeObserver.observe(plot);
  } else {
    window.addEventListener(
      "resize",
      resizeCanvas
    );
  }

  requestAnimationFrame(animate);
}

init();