// PHYS 116: Fourier series

(() => {
  // -----------------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------------

  const HISTORY_SAMPLE_STEP = 1 / 240;
  const MAX_WAVEFORM_POINTS = 960;
  const MAX_RADIUS_SUM = Array.from(
    { length: 25 },
    (_, index) => 4 / (Math.PI * (2 * index + 1))
  ).reduce((sum, value) => sum + value, 0);
  const BASE_ANGULAR_SPEED = 1;

  const LAYOUT = {
    plotHeight: { min: 250, preferredVw: 34, max: 340 },
    originX: 0.25,
    originY: 0.50,
    graphX: 0.47,
    graphRightPadding: 18,
    graphTop: 10,
    graphBottomPadding: 22,
    baseRadiusScale: 0.21
  };

  // -----------------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------------

  const plot = document.getElementById("plot");
  const plotHost = document.getElementById("plotHost");
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
    ...DemoUtils.cssVars({
      background: ["--plot-bg", "#ffffff"],
      axis: ["--plot-axis", "#b8b8b8"],
      axisSoft: ["--plot-axis-soft", "#bbbbbb"],
      axisMuted: [
        "--plot-axis-muted",
        "rgba(34, 34, 34, 0.35)"
      ],
      primary: ["--plot-primary", "#3b4cc0"],
      primaryFaded: [
        "--plot-primary-faded",
        "rgba(59, 76, 192, 0.55)"
      ],
      secondary: ["--plot-secondary", "#d11141"]
    })
  };

  // -----------------------------------------------------------------------------
  // State and data
  // -----------------------------------------------------------------------------

  const state = {
    width: 0,
    height: 0,
    dpr: window.devicePixelRatio || 1,
    time: 0,
    previousTimestamp: null,
    sampleAccumulator: 0,
    playback: null,
    waveform: []
  };

  function resetWaveform() {
    state.waveform.length = 0;
  }

  function addWaveformPoint(value) {
    state.waveform.unshift(value);
    if (state.waveform.length > MAX_WAVEFORM_POINTS) {
      state.waveform.pop();
    }
  }

  // -----------------------------------------------------------------------------
  // Calculations
  // -----------------------------------------------------------------------------

  function getSquareCoefficient(index, baseRadius) {
    const harmonic = 2 * index + 1;
    return {
      frequency: harmonic,
      amplitude: (4 / (Math.PI * harmonic)) * baseRadius,
      phase: 0
    };
  }

  function getSawtoothCoefficient(index, baseRadius) {
    const harmonic = index + 1;
    return {
      frequency: harmonic,
      amplitude: (2 / (Math.PI * harmonic)) * baseRadius,
      phase: harmonic % 2 === 0 ? Math.PI : 0
    };
  }

  function getTriangleCoefficient(index, baseRadius) {
    const harmonic = 2 * index + 1;
    return {
      frequency: harmonic,
      amplitude: (8 / (Math.PI * Math.PI * harmonic * harmonic)) * baseRadius,
      phase: index % 2 === 0 ? 0 : Math.PI
    };
  }

  function getCoefficients(shape, count, baseRadius = getBaseRadius()) {
    const coefficients = [];
    for (let index = 0; index < count; index++) {
      let coefficient;
      switch (shape) {
        case "square":
          coefficient = getSquareCoefficient(index, baseRadius);
          break;
        case "sawtooth":
          coefficient = getSawtoothCoefficient(index, baseRadius);
          break;
        case "triangle":
          coefficient = getTriangleCoefficient(index, baseRadius);
          break;
        default:
          coefficient = getSquareCoefficient(index, baseRadius);
      }
      coefficients.push(coefficient);
    }
    return coefficients;
  }

  // -----------------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------------

  function getControlValues() {
    return {
      shape: controls.shape.value,
      harmonics: Number(controls.terms.value),
      speed: Number(controls.speed.value)
    };
  }

  function updateReadouts() {
    readouts.terms.textContent = controls.terms.value;
    readouts.speed.textContent = Number(controls.speed.value).toFixed(1);
  }

  // -----------------------------------------------------------------------------
  // Layout
  // -----------------------------------------------------------------------------

  function resizeCanvas() {
    const size = DemoUtils.prepareCanvas(plot, ctx);
    state.dpr = size.dpr;
    state.width = size.width;
    state.height = size.height;
  }

  function getBaseRadius() {
    // Reserve room for every epicycle, including the 25-term extreme.
    return Math.min(Math.min(state.width, state.height) * LAYOUT.baseRadiusScale, state.width * 0.21 / MAX_RADIUS_SUM);
  }

  // -----------------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------------

  function clearCanvas() {
    ctx.fillStyle = plotColors.background;
    ctx.fillRect(0, 0, state.width, state.height);
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
    ctx.arc(x, y, Math.abs(radius), 0, Math.PI * 2);
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
    ctx.rect(graph.x, graph.y, graph.width, graph.height);
    ctx.stroke();
    ctx.strokeStyle = plotColors.axis;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graph.x, graph.centerY);
    ctx.lineTo(graph.x + graph.width, graph.centerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = plotColors.axis;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Nå", graph.x, state.height - 5);
    ctx.textAlign = "right";
    ctx.fillText("4 s siden", graph.x + graph.width, state.height - 5);
    ctx.textAlign = "left";
  }

  function drawWaveform(graph) {
    const baseRadius = getBaseRadius();
    if (state.waveform.length === 0) {
      return;
    }
    const sampleSpacing = graph.width / (MAX_WAVEFORM_POINTS - 1);
    ctx.strokeStyle = plotColors.secondary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.waveform.forEach((value, index) => {
      const x = graph.x + index * sampleSpacing;
      const y = graph.centerY + value * baseRadius;
      if (index === 0) {
        ctx.moveTo(x, y);
      }
      else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    drawPoint(graph.x, graph.centerY + state.waveform[0] * baseRadius, 5, plotColors.secondary);
  }

  function drawPoint(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function calculateEndpoint(coefficients, origin) {
    let x = origin.x;
    let y = origin.y;
    for (const coefficient of coefficients) {
      const angle = coefficient.frequency * state.time + coefficient.phase;
      const nextX = x + coefficient.amplitude * Math.cos(angle);
      const nextY = y + coefficient.amplitude * Math.sin(angle);
      drawEpicycle(x, y, coefficient.amplitude, nextX, nextY);
      x = nextX;
      y = nextY;
    }
    return { x, y };
  }

  // -----------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------

  function draw(values) {
    const origin = {
      x: state.width * LAYOUT.originX,
      y: state.height * LAYOUT.originY
    };
    const graph = {
      x: state.width * LAYOUT.graphX,
      y: LAYOUT.graphTop,
      width: state.width - state.width * LAYOUT.graphX - LAYOUT.graphRightPadding,
      height: state.height - LAYOUT.graphTop - LAYOUT.graphBottomPadding,
      centerY: origin.y
    };
    const coefficients = getCoefficients(values.shape, values.harmonics);
    drawVerticalAxis(origin);
    const endpoint = calculateEndpoint(coefficients, origin);
    drawGraphFrame(graph);
    drawConnectionLine(endpoint.x, endpoint.y, graph.x);
    drawWaveform(graph);
    drawPoint(endpoint.x, endpoint.y, 6, plotColors.secondary);
  }

  function refreshView() {
    updateReadouts();
    const values = getControlValues();
    const highest = values.shape === "sawtooth" ? values.harmonics : 2 * values.harmonics - 1;
    document.getElementById("signalReadout").textContent =
      `${values.harmonics} ledd · Høyeste harmoniske: ${highest} · Tidsspor: 0–4 s bakover fra nåtiden`;
    clearCanvas();
    draw(values);
  }

  // -----------------------------------------------------------------------------
  // Animation
  // -----------------------------------------------------------------------------

  function animate(timestamp) {
    if (state.previousTimestamp === null) {
      state.previousTimestamp = timestamp;
    }
    const deltaTime = Math.min((timestamp - state.previousTimestamp) / 1000, 0.05);
    state.previousTimestamp = timestamp;
    const values = getControlValues();
    if (!state.playback.paused) {
      const simulationDelta = deltaTime * BASE_ANGULAR_SPEED * values.speed;
      state.time += simulationDelta;
      state.sampleAccumulator += simulationDelta;
      const coefficients = getCoefficients(values.shape, values.harmonics, 1);
      while (state.sampleAccumulator >= HISTORY_SAMPLE_STEP) {
        state.sampleAccumulator -= HISTORY_SAMPLE_STEP;
        const sampleTime = state.time - state.sampleAccumulator;
        addWaveformPoint(coefficients.reduce(
          (sum, coefficient) => sum + coefficient.amplitude *
            Math.sin(coefficient.frequency * sampleTime + coefficient.phase),
          0
        ));
      }
      clearCanvas();
      draw(values);
    }
    requestAnimationFrame(animate);
  }

  // -----------------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------------

  function init() {
    DemoUtils.setLayoutSizes({ "--plot-height": DemoUtils.cssHeight(LAYOUT.plotHeight) });
    state.playback = DemoUtils.connectPlayback(() => {
      state.time = 0;
      state.previousTimestamp = null;
      state.sampleAccumulator = 0;
      resetWaveform();
    }, refreshView);
    resizeCanvas();
    for (const control of [controls.shape, controls.terms]) {
      control.addEventListener("input", () => {
        resetWaveform();
        state.sampleAccumulator = 0;
        refreshView();
      });
    }
    controls.speed.addEventListener("input", refreshView);
    DemoUtils.observeResize(plotHost, () => {
      resizeCanvas();
      refreshView();
    });
    refreshView();
    requestAnimationFrame(animate);
  }

  init();
})();
