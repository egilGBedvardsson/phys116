// PHYS 116: Beats

(() => {
  // -----------------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------------

  const CENTER_FREQUENCY = 8;
  const AMPLITUDE = 0.7;
  const HISTORY_SAMPLE_STEP = 1 / 240;
  const MAX_POINTS = 960;

  const LAYOUT = {
    plotHeight: { min: 240, preferredVw: 32, max: 320 },
    paddingX: 20,
    paddingTop: 12,
    paddingBottom: 30,
    signalScale: 0.35
  };

  // -----------------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------------

  const plot = document.getElementById("plot");
  const plotHost = document.getElementById("plotHost");
  const ctx = plot.getContext("2d");

  const controls = {
    delta: {
      input: document.getElementById("deltaRange"),
      output: document.getElementById("deltaVal"),
      format: value => `${Number(value).toFixed(1)} Hz`
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
    ...DemoUtils.cssVars({
      background: ["--plot-bg", "#ffffff"],
      axis: ["--plot-axis-soft", "#bbbbbb"],
      text: ["--plot-text", "#111111"],
      primary: ["--plot-primary", "#3b4cc0"],
      secondary: ["--plot-secondary", "#d11141"],
      signal: ["--plot-signal-muted", "#9b9b9e"]
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
    buffer: []
  };

  function addSignalPoint(point) {
    state.buffer.unshift(point);
    if (state.buffer.length > MAX_POINTS) {
      state.buffer.pop();
    }
  }

  // -----------------------------------------------------------------------------
  // Calculations
  // -----------------------------------------------------------------------------

  function calculateSignal(freq1, freq2, amplitude, time) {
    const omega1 = 2 * Math.PI * freq1;
    const omega2 = 2 * Math.PI * freq2;
    const y1 = amplitude * Math.sin(omega1 * time);
    const y2 = amplitude * Math.sin(omega2 * time);
    const beatAmplitude = 2 * amplitude * Math.abs(Math.cos(Math.PI * (freq2 - freq1) * time));
    return {
      combined: y1 + y2,
      upperEnvelope: beatAmplitude,
      lowerEnvelope: -beatAmplitude
    };
  }

  // -----------------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------------

  function getControlValues() {
    const delta = Number(controls.delta.input.value);
    return {
      delta,
      freq1: CENTER_FREQUENCY - delta / 2,
      freq2: CENTER_FREQUENCY + delta / 2,
      amplitude: AMPLITUDE,
      speed: Number(controls.speed.input.value)
    };
  }

  function updateReadouts() {
    for (const control of Object.values(controls)) {
      control.output.textContent = control.format(control.input.value);
    }
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

  function getGraphDimensions() {
    return {
      x: LAYOUT.paddingX,
      y: LAYOUT.paddingTop,
      width: state.width - 2 * LAYOUT.paddingX,
      height: state.height - LAYOUT.paddingTop - LAYOUT.paddingBottom
    };
  }

  function signalToY(value, graph) {
    return (graph.y + graph.height / 2 - value * graph.height * LAYOUT.signalScale);
  }

  // -----------------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------------

  function clearCanvas() {
    ctx.fillStyle = plotColors.background;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawAxes(graph) {
    ctx.strokeStyle = plotColors.axis;
    ctx.lineWidth = 1;
    // Graph border
    ctx.beginPath();
    ctx.rect(graph.x, graph.y, graph.width, graph.height);
    ctx.stroke();
    // Horizontal centre line
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(graph.x, graph.y + graph.height / 2);
    ctx.lineTo(graph.x + graph.width, graph.y + graph.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCurve(graph, property, color, lineWidth) {
    if (state.buffer.length === 0) {
      return;
    }
    const stepX = graph.width / (MAX_POINTS - 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    state.buffer.forEach((point, index) => {
      const x = graph.x + index * stepX;
      const y = signalToY(point[property], graph);
      if (index === 0) {
        ctx.moveTo(x, y);
      }
      else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function drawLabels(graph) {
    ctx.font = "12px sans-serif";
    ctx.fillStyle = plotColors.text;
    ctx.textAlign = "left";
    ctx.fillText("Nå", graph.x, state.height - 8);
    ctx.textAlign = "right";
    ctx.fillText("4 s siden", graph.x + graph.width, state.height - 8);
    ctx.textAlign = "left";
  }

  function drawMarker(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCurrentMarkers(graph) {
    const current = state.buffer[0];
    if (!current) {
      return;
    }
    const markerX = graph.x;
    drawMarker(markerX, signalToY(current.combined, graph), plotColors.primary);
    drawMarker(markerX, signalToY(current.upperEnvelope, graph), plotColors.secondary);
    drawMarker(markerX, signalToY(current.lowerEnvelope, graph), plotColors.secondary);
  }

  // -----------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------

  function draw(values) {
    const graph = getGraphDimensions();
    clearCanvas();
    drawAxes(graph);
    drawCurve(graph, "combined", plotColors.signal, 1.7);
    drawCurve(graph, "upperEnvelope", plotColors.secondary, 1.8);
    drawCurve(graph, "lowerEnvelope", plotColors.secondary, 1.8);
    drawLabels(graph, values);
    drawCurrentMarkers(graph);
  }

  function refreshView() {
    updateReadouts();
    const values = getControlValues();
    const period = values.delta > 0 ? `${(1 / values.delta).toFixed(2)} s` : "ingen beats";
    document.getElementById("signalReadout").textContent =
      `f₁ = ${values.freq1.toFixed(1)} Hz · f₂ = ${values.freq2.toFixed(1)} Hz · ` +
      `Beat-frekvens: ${values.delta.toFixed(1)} Hz · Periode: ${period} · Rødt: amplitudeomslag`;
    draw(values);
  }

  // -----------------------------------------------------------------------------
  // Animation
  // -----------------------------------------------------------------------------

  function animate(timestamp) {
    if (state.previousTimestamp === null) {
      state.previousTimestamp = timestamp;
    }
    const realDeltaTime = Math.min((timestamp - state.previousTimestamp) / 1000, 0.05);
    state.previousTimestamp = timestamp;
    const values = getControlValues();
    const simulationDelta = realDeltaTime * values.speed;
    if (!state.playback.paused) {
      state.time += simulationDelta;
      state.sampleAccumulator += simulationDelta;
      while (state.sampleAccumulator >= HISTORY_SAMPLE_STEP) {
        state.sampleAccumulator -= HISTORY_SAMPLE_STEP;
        const sampleTime = state.time - state.sampleAccumulator;
        addSignalPoint(calculateSignal(values.freq1, values.freq2, values.amplitude, sampleTime));
      }
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
      state.buffer.length = 0;
    }, refreshView);
    resizeCanvas();
    controls.delta.input.addEventListener("input", () => {
      state.buffer.length = 0;
      state.sampleAccumulator = 0;
      refreshView();
    });
    controls.speed.input.addEventListener("input", refreshView);
    DemoUtils.observeResize(plotHost, () => {
      resizeCanvas();
      refreshView();
    });
    refreshView();
    requestAnimationFrame(animate);
  }

  init();
})();
