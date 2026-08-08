const plot = document.getElementById("plot");
const ctx = plot.getContext("2d");

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const MAX_POINTS = 720;
const BASE_TIME_STEP = 0.015;

const GRAPH = {
  paddingX: 20,
  paddingTop: 60,
  paddingBottom: 50,
  signalScale: 0.35
};

// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

const controls = {
  freq1: {
    input: document.getElementById("freq1Range"),
    output: document.getElementById("freq1Val"),
    format: value => `${value} Hz`
  },

  freq2: {
    input: document.getElementById("freq2Range"),
    output: document.getElementById("freq2Val"),
    format: value => `${value} Hz`
  },

  amplitude: {
    input: document.getElementById("amplitudeRange"),
    output: document.getElementById("amplitudeVal"),
    format: value => Number(value).toFixed(2)
  },

  speed: {
    input: document.getElementById("speedRange"),
    output: document.getElementById("speedVal"),
    format: value => `${Number(value).toFixed(1)}x`
  }
};

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------


const plotColors = {
  background: DemoUtils.cssVar("--theme-surface-bg", "#ffffff"),
  axis: DemoUtils.cssVar("--plot-axis-soft", "#bbbbbb"),
  text: DemoUtils.cssVar("--plot-text", "#111111"),
  primary: DemoUtils.cssVar("--plot-primary", "#3b4cc0"),
  secondary: DemoUtils.cssVar("--plot-secondary", "#d11141"),
  signal: DemoUtils.cssVar("--plot-signal-muted", "#9b9b9e")
};

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const state = {
  width: 0,
  height: 0,
  dpr: window.devicePixelRatio || 1,
  time: 0,
  buffer: []
};

let resizeObserver = null;

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------

function updateReadouts() {
  for (const control of Object.values(controls)) {
    control.output.textContent = control.format(control.input.value);
  }
}

function getControlValues() {
  return {
    freq1: Number(controls.freq1.input.value),
    freq2: Number(controls.freq2.input.value),
    amplitude: Number(controls.amplitude.input.value),
    speed: Number(controls.speed.input.value)
  };
}

// -----------------------------------------------------------------------------
// Canvas sizing
// -----------------------------------------------------------------------------

function resizeCanvas() {
  state.dpr = window.devicePixelRatio || 1;
  state.width = plot.clientWidth;
  state.height = Math.max(520, plot.clientHeight);

  plot.width = Math.max(
    1,
    Math.floor(state.width * state.dpr)
  );

  plot.height = Math.max(
    1,
    Math.floor(state.height * state.dpr)
  );

  plot.style.height = `${state.height}px`;

  ctx.setTransform(
    state.dpr,
    0,
    0,
    state.dpr,
    0,
    0
  );
}

function getGraphDimensions() {
  return {
    x: GRAPH.paddingX,
    y: GRAPH.paddingTop,
    width: state.width - 2 * GRAPH.paddingX,
    height:
      state.height -
      GRAPH.paddingTop -
      GRAPH.paddingBottom
  };
}

// -----------------------------------------------------------------------------
// Physics
// -----------------------------------------------------------------------------

function calculateSignal(freq1, freq2, amplitude, time) {
  const omega1 = 2 * Math.PI * freq1;
  const omega2 = 2 * Math.PI * freq2;

  const y1 = amplitude * Math.sin(omega1 * time);
  const y2 = amplitude * Math.sin(omega2 * time);

  return {
    combined: y1 + y2,

    envelope:
      2 *
      amplitude *
      Math.cos(
        Math.PI *
        (freq2 - freq1) *
        time
      )
  };
}

function addSignalPoint(point) {
  state.buffer.unshift(point);

  if (state.buffer.length > MAX_POINTS) {
    state.buffer.pop();
  }
}

// -----------------------------------------------------------------------------
// Drawing
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

function drawAxes(graph) {
  ctx.strokeStyle = plotColors.axis;
  ctx.lineWidth = 1;

  // Graph border
  ctx.beginPath();
  ctx.rect(
    graph.x,
    graph.y,
    graph.width,
    graph.height
  );
  ctx.stroke();

  // Horizontal centre line
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(
    graph.x,
    graph.y + graph.height / 2
  );
  ctx.lineTo(
    graph.x + graph.width,
    graph.y + graph.height / 2
  );
  ctx.stroke();

  ctx.setLineDash([]);
}

function signalToY(value, graph) {
  return (
    graph.y +
    graph.height / 2 -
    value *
      graph.height *
      GRAPH.signalScale
  );
}

function drawCurve(graph, property, color, lineWidth) {
  if (state.buffer.length === 0) {
    return;
  }

  const stepX =
    graph.width /
    (MAX_POINTS - 1);

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  state.buffer.forEach((point, index) => {
    const x =
      graph.x +
      index * stepX;

    const y = signalToY(
      point[property],
      graph
    );

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function drawLabels(graph, values) {
  ctx.font = "13px sans-serif";
  ctx.fillStyle = plotColors.text;

  ctx.fillText(
    `f1 = ${values.freq1.toFixed(1)} Hz`,
    graph.x + 10,
    graph.y + graph.height + 24
  );

  ctx.fillText(
    `f2 = ${values.freq2.toFixed(1)} Hz`,
    graph.x + 140,
    graph.y + graph.height + 24
  );

  ctx.fillText(
    `Delta f = ${Math.abs(
      values.freq2 - values.freq1
    ).toFixed(1)} Hz`,
    graph.x + 280,
    graph.y + graph.height + 24
  );

  ctx.fillStyle = plotColors.text;

  ctx.fillText(
    "Kombinert signal",
    graph.x + 10,
    graph.y + 18
  );

  ctx.fillStyle = plotColors.secondary;

  ctx.fillText(
    "Envelope",
    graph.x + 170,
    graph.y + 18
  );
}

function drawMarker(x, y, color) {
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(
    x,
    y,
    5,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawCurrentMarkers(graph) {
  const current = state.buffer[0];

  if (!current) {
    return;
  }

  const markerX = graph.x;

  const signalY = signalToY(
    current.combined,
    graph
  );

  const envelopeY = signalToY(
    current.envelope,
    graph
  );

  drawMarker(
    markerX,
    signalY,
    plotColors.primary
  );

  drawMarker(
    markerX,
    envelopeY,
    plotColors.secondary
  );
}

function draw(values) {
  const graph = getGraphDimensions();

  clearCanvas();
  drawAxes(graph);

  drawCurve(
    graph,
    "combined",
    plotColors.signal,
    1.7
  );

  drawCurve(
    graph,
    "envelope",
    plotColors.secondary,
    2
  );

  drawLabels(graph, values);
  drawCurrentMarkers(graph);
}

// -----------------------------------------------------------------------------
// Animation
// -----------------------------------------------------------------------------

function animate() {
  const values = getControlValues();

  const signal = calculateSignal(
    values.freq1,
    values.freq2,
    values.amplitude,
    state.time
  );

  addSignalPoint(signal);

  draw(values);

  state.time +=
    BASE_TIME_STEP *
    values.speed;

  requestAnimationFrame(animate);
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  updateReadouts();
  resizeCanvas();

  for (const control of Object.values(controls)) {
    control.input.addEventListener(
      "input",
      updateReadouts
    );
  }

  if ("ResizeObserver" in window) {
    resizeObserver =
      new ResizeObserver(resizeCanvas);

    resizeObserver.observe(plot);
  } else {
    window.addEventListener(
      "resize",
      resizeCanvas
    );
  }

  animate();
}

init();