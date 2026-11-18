// PHYS 116: Poles and zeros

(() => {
  // -----------------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------------

  const MAX_PLANE_VALUE = 1.4;
  const EPSILON = 1e-9;
  const RESPONSE_SAMPLES = 520;
  const MAGNITUDE_MIN_DB = -60;
  const PICK_RADIUS = 11;

  // Display dimensions in CSS pixels. CSS handles the responsive arrangement.
  const LAYOUT = {
    demoHeight: 720,
    layoutMinHeight: 390,
    planeMaxSize: 340,
    responsePlotHeight: 170,
    responseMargins: { left: 50, right: 10, top: 14, bottom: 28 }
  };

  // -----------------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------------

  const controls = {
    mode: document.getElementById("modeSelect"),
    conjugate: document.getElementById("conjToggle"),
    removeSelected: document.getElementById("removeSelectedBtn"),
    presetLowPass: document.getElementById("presetLowBtn"),
    clear: document.getElementById("clearBtn")
  };

  const status = document.getElementById("status");
  const pzCanvas = document.getElementById("pzCanvas");
  const magnitudeCanvas = document.getElementById("magCanvas");
  const phaseCanvas = document.getElementById("phaseCanvas");

  // -----------------------------------------------------------------------------
  // Theme
  // -----------------------------------------------------------------------------

  const plotColors = {
    grid: DemoUtils.cssVar("--plot-grid", "#e4e4e4"),
    axis: DemoUtils.cssVar("--plot-axis", "#b8b8b8"),
    axisMuted: DemoUtils.cssVar("--plot-axis-soft", "#bbbbbb"),
    text: DemoUtils.cssVar("--plot-text", "#111111"),
    muted: DemoUtils.cssVar("--plot-muted", "#666666"),
    highlight: DemoUtils.cssVar("--plot-highlight", "#0a84ff"),
    pole: DemoUtils.cssVar("--plot-pole", "#8b0000"),
    zero: DemoUtils.cssVar("--plot-zero", "#111111")
  };

  // -----------------------------------------------------------------------------
  // State and data
  // -----------------------------------------------------------------------------

  const state = {
    zeros: [],
    poles: [],
    mode: "add-zero",
    addConjugate: true,
    selected: null,
    dragging: false,
    nextId: 1,
    nextPairId: 1
  };

  // -----------------------------------------------------------------------------
  // Calculations
  // -----------------------------------------------------------------------------

  const clamp = DemoUtils.clamp;

  function complex(real, imaginary) {
    return {
      re: real,
      im: imaginary
    };
  }

  function complexSubtract(a, b) {
    return complex(a.re - b.re, a.im - b.im);
  }

  function complexMagnitude(value) {
    return Math.hypot(value.re, value.im);
  }

  function complexPhase(value) {
    return Math.atan2(value.im, value.re);
  }

  function reducedRoots() {
    const poles = [...state.poles];
    const zeros = [];
    let cancelled = 0;
    for (const zero of state.zeros) {
      const match = poles.findIndex(pole => Math.hypot(zero.re - pole.re, zero.im - pole.im) <= EPSILON);
      if (match >= 0) {
        poles.splice(match, 1);
        cancelled++;
      }
      else {
        zeros.push(zero);
      }
    }
    return { zeros, poles, cancelled };
  }

  function evaluateResponse() {
    const roots = reducedRoots();
    const omega = [];
    const magnitudeDb = [];
    const phase = [];
    let singular = false;
    for (let index = 0; index <= RESPONSE_SAMPLES; index++) {
      const frequency = Math.PI * index / RESPONSE_SAMPLES;
      const z = complex(Math.cos(frequency), Math.sin(frequency));
      let logMagnitude = 0;
      let angle = 0;
      let atZero = false;
      let atPole = false;
      // Sum log magnitudes instead of dividing potentially tiny products.
      for (const [points, sign] of [[roots.zeros, 1], [roots.poles, -1]]) {
        for (const point of points) {
          const difference = complexSubtract(z, point);
          const distance = complexMagnitude(difference);
          if (distance <= EPSILON) {
            if (sign > 0)
              atZero = true;
            else
              atPole = true;
          }
          else {
            logMagnitude += sign * Math.log10(distance);
            angle += sign * complexPhase(difference);
          }
        }
      }
      omega.push(frequency);
      magnitudeDb.push(atPole ? Infinity : atZero ? -Infinity : 20 * logMagnitude);
      phase.push(atPole || atZero ? NaN : Math.atan2(Math.sin(angle), Math.cos(angle)));
      singular ||= atPole;
    }
    unwrapPhase(phase);
    return { omega, magnitudeDb, phase, singular };
  }

  function unwrapPhase(phase) {
    for (let index = 1; index < phase.length; index++) {
      if (!Number.isFinite(phase[index]) || !Number.isFinite(phase[index - 1]))
        continue;
      const difference = phase[index] - phase[index - 1];
      phase[index] -= 2 * Math.PI * Math.round(difference / (2 * Math.PI));
    }
  }

  // -----------------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------------

  function formatComplexPoint(point) {
    const real = point.re.toFixed(3);
    const imaginary = Math.abs(point.im).toFixed(3);
    const sign = point.im >= 0 ? "+" : "-";
    return (`${real} ${sign} j${imaginary}`);
  }

  function getPoints(type) {
    return type === "zero" ? state.zeros : state.poles;
  }

  function findPoint(type, id) {
    return (getPoints(type)
      .find(point => point.id === id) || null);
  }

  function removePoint(type, id) {
    const points = getPoints(type);
    const index = points.findIndex(point => point.id === id);
    if (index < 0) {
      return;
    }
    const point = points[index];
    if (point.pair !== null) {
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].pair === point.pair) {
          points.splice(i, 1);
        }
      }
    }
    else {
      points.splice(index, 1);
    }
    if (state.selected && state.selected.type === type && state.selected.id === id) {
      state.selected = null;
    }
  }

  function addPoint(type, real, imaginary) {
    const points = getPoints(type);
    const point = {
      id: state.nextId++,
      re: real,
      im: imaginary,
      pair: null
    };
    const shouldAddPair = state.addConjugate && Math.abs(imaginary) > EPSILON;
    if (shouldAddPair) {
      const pairId = state.nextPairId++;
      point.pair = pairId;
      points.push(point);
      points.push({
        id: state.nextId++,
        re: real,
        im: -imaginary,
        pair: pairId
      });
    }
    else {
      if (Math.abs(point.im) < EPSILON) {
        point.im = 0;
      }
      points.push(point);
    }
    state.selected = {
      type,
      id: point.id
    };
  }

  function moveSelectedPoint(real, imaginary) {
    if (!state.selected) {
      return;
    }
    const point = findPoint(state.selected.type, state.selected.id);
    if (!point) {
      return;
    }
    point.re = clamp(real, -MAX_PLANE_VALUE, MAX_PLANE_VALUE);
    point.im = clamp(Math.abs(imaginary) < EPSILON ? 0 : imaginary, -MAX_PLANE_VALUE, MAX_PLANE_VALUE);
    if (point.pair === null) {
      return;
    }
    const points = getPoints(state.selected.type);
    const mate = points.find(other => other.pair === point.pair && other.id !== point.id);
    if (!mate) {
      return;
    }
    // Keep multiplicity when the pair meets on the real axis.
    mate.re = point.re;
    mate.im = -point.im;
  }

  function updateStatus() {
    const roots = reducedRoots();
    const largestPoleRadius = Math.max(0, ...roots.poles.map(complexMagnitude));
    const stable = largestPoleRadius < 1 - EPSILON;
    const boundary = roots.poles.some(pole => Math.abs(complexMagnitude(pole) - 1) <= EPSILON);
    const stability = stable ? "BIBO-stabil" : boundary && largestPoleRadius <= 1 + EPSILON
      ? "Ikke BIBO-stabil (pol på enhetsirkelen)"
      : "Ikke BIBO-stabil (pol utenfor enhetsirkelen)";
    let selection = "Valgt: ingen";
    if (state.selected) {
      const point = findPoint(state.selected.type, state.selected.id);
      if (point)
        selection = `Valgt: ${state.selected.type === "zero" ? "null" : "pol"} ${formatComplexPoint(point)}, |z| = ${complexMagnitude(point).toFixed(3)}`;
    }
    status.textContent =
      `Nuller: ${state.zeros.length} · Poler: ${state.poles.length} · ` +
      `Kansellerte pol–null-par: ${roots.cancelled} · ${stability} (kausal realisering) · ${selection}`;
    syncPointEditor();
  }

  function syncPointEditor() {
    const select = document.getElementById("pointSelect");
    const value = state.selected ? `${state.selected.type}:${state.selected.id}` : "";
    const options = [new Option("Ingen", "")];
    for (const [type, points] of [["zero", state.zeros], ["pole", state.poles]]) {
      for (const point of points) {
        options.push(new Option(
          `${type === "zero" ? "Null" : "Pol"} ${point.id}: ${formatComplexPoint(point)}`,
          `${type}:${point.id}`
        ));
      }
    }
    select.replaceChildren(...options);
    select.value = value;
    if (state.selected) {
      const point = findPoint(state.selected.type, state.selected.id);
      if (point) {
        document.getElementById("pointType").value = state.selected.type;
        document.getElementById("pointReal").value = point.re;
        document.getElementById("pointImaginary").value = point.im;
      }
    }
    document.getElementById("moveNumericPoint").disabled = !state.selected;
    controls.removeSelected.disabled = !state.selected;
  }

  function readNumericPoint() {
    const real = document.getElementById("pointReal");
    const imaginary = document.getElementById("pointImaginary");
    if (!real.reportValidity() || !imaginary.reportValidity())
      return null;
    if (real.value === "" || imaginary.value === "")
      return null;
    return { re: Number(real.value), im: Number(imaginary.value) };
  }

  function loadLowPassPreset() {
    state.zeros = [
      {
        id: state.nextId++,
        re: -1,
        im: 0,
        pair: null
      },
      {
        id: state.nextId++,
        re: -1,
        im: 0,
        pair: null
      }
    ];
    const firstPair = state.nextPairId++;
    const secondPair = state.nextPairId++;
    state.poles = [
      {
        id: state.nextId++,
        re: 0.74,
        im: 0.28,
        pair: firstPair
      },
      {
        id: state.nextId++,
        re: 0.74,
        im: -0.28,
        pair: firstPair
      },
      {
        id: state.nextId++,
        re: 0.58,
        im: 0.12,
        pair: secondPair
      },
      {
        id: state.nextId++,
        re: 0.58,
        im: -0.12,
        pair: secondPair
      }
    ];
    state.selected = null;
    redrawAll();
  }

  function clearAll() {
    state.zeros = [];
    state.poles = [];
    state.selected = null;
    redrawAll();
  }

  // -----------------------------------------------------------------------------
  // Layout
  // -----------------------------------------------------------------------------

  function complexToScreen(point, width, height) {
    return {
      x: ((point.re + MAX_PLANE_VALUE) / (2 * MAX_PLANE_VALUE)) * width,
      y: ((MAX_PLANE_VALUE - point.im) / (2 * MAX_PLANE_VALUE)) * height
    };
  }

  function screenToComplex(x, y, width, height) {
    const real = (x / width) * (2 * MAX_PLANE_VALUE) - MAX_PLANE_VALUE;
    const imaginary = MAX_PLANE_VALUE - (y / height) * (2 * MAX_PLANE_VALUE);
    return complex(clamp(real, -MAX_PLANE_VALUE, MAX_PLANE_VALUE), clamp(imaginary, -MAX_PLANE_VALUE, MAX_PLANE_VALUE));
  }

  // -----------------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------------

  function drawZero(ctx, point, width, height, selected) {
    const screen = complexToScreen(point, width, height);
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? plotColors.highlight : plotColors.zero;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPole(ctx, point, width, height, selected) {
    const screen = complexToScreen(point, width, height);
    const size = 7;
    ctx.lineWidth = selected ? 3 : 2.2;
    ctx.strokeStyle = selected ? plotColors.highlight : plotColors.pole;
    ctx.beginPath();
    ctx.moveTo(screen.x - size, screen.y - size);
    ctx.lineTo(screen.x + size, screen.y + size);
    ctx.moveTo(screen.x + size, screen.y - size);
    ctx.lineTo(screen.x - size, screen.y + size);
    ctx.stroke();
  }

  function drawPZPlane() {
    const { ctx, width, height } = DemoUtils.prepareCanvas(pzCanvas);
    ctx.clearRect(0, 0, width, height);
    const gridValues = [
      -1,
      -0.5,
      0,
      0.5,
      1
    ];
    // Grid
    ctx.strokeStyle = plotColors.grid;
    ctx.lineWidth = 1;
    for (const value of gridValues) {
      const x = complexToScreen(complex(value, 0), width, height).x;
      const y = complexToScreen(complex(0, value), width, height).y;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const center = complexToScreen(complex(0, 0), width, height);
    // Unit circle
    ctx.strokeStyle = plotColors.axis;
    ctx.lineWidth = 1.6;
    const radius = (1 / (2 * MAX_PLANE_VALUE)) * width;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Axes
    ctx.strokeStyle = plotColors.axisMuted;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, center.y);
    ctx.lineTo(width, center.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(center.x, 0);
    ctx.lineTo(center.x, height);
    ctx.stroke();
    // Axis labels
    ctx.fillStyle = plotColors.text;
    ctx.font = '12px "Times New Roman", Times, serif';
    ctx.fillText("Re{z}", width - 34, center.y - 6);
    ctx.fillText("Im{z}", center.x + 6, 14);
    // Zeros
    for (const zero of state.zeros) {
      const selected = state.selected && state.selected.type === "zero" && state.selected.id === zero.id;
      drawZero(ctx, zero, width, height, selected);
    }
    // Poles
    for (const pole of state.poles) {
      const selected = state.selected && state.selected.type === "pole" && state.selected.id === pole.id;
      drawPole(ctx, pole, width, height, selected);
    }
    ctx.fillStyle = plotColors.muted;
    ctx.font = '13px "Times New Roman", Times, serif';
    for (const points of [state.zeros, state.poles]) {
      const groups = new Map();
      for (const point of points) {
        const key = `${point.re.toFixed(9)}:${point.im.toFixed(9)}`;
        const group = groups.get(key) || { point, count: 0 };
        group.count++;
        groups.set(key, group);
      }
      for (const { point, count } of groups.values()) {
        if (count < 2)
          continue;
        const screen = complexToScreen(point, width, height);
        ctx.fillText(`×${count}`, Math.min(screen.x + 12, width - 25), Math.max(14, screen.y - 10));
      }
    }
    ctx.fillText("Klikk for å legge til. Dra for flytting.", 10, height - 12);
  }

  function drawCurvePlot(canvas, dataX, dataY, options) {
    const { ctx, width, height } = DemoUtils.prepareCanvas(canvas);
    const margins = LAYOUT.responseMargins;
    const plotWidth = width - margins.left - margins.right;
    const plotHeight = height - margins.top - margins.bottom;
    ctx.clearRect(0, 0, width, height);
    // Grid
    ctx.strokeStyle = plotColors.grid;
    ctx.lineWidth = 1;
    for (let index = 0; index <= 4; index++) {
      const y = margins.top + (index / 4) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(margins.left, y);
      ctx.lineTo(margins.left + plotWidth, y);
      ctx.stroke();
    }
    for (let index = 0; index <= 4; index++) {
      const x = margins.left + (index / 4) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, margins.top);
      ctx.lineTo(x, margins.top + plotHeight);
      ctx.stroke();
    }
    // Axes
    ctx.strokeStyle = plotColors.muted;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top);
    ctx.lineTo(margins.left, margins.top + plotHeight);
    ctx.lineTo(margins.left + plotWidth, margins.top + plotHeight);
    ctx.stroke();
    const xMin = 0;
    const xMax = Math.PI;
    const yMin = options.yMin;
    const yMax = options.yMax;
    function mapX(value) {
      return (margins.left + ((value - xMin) / (xMax - xMin)) * plotWidth);
    }
    function mapY(value) {
      return (margins.top + ((yMax - value) / (yMax - yMin)) * plotHeight);
    }
    // Curve
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let drawing = false;
    for (let index = 0; index < dataX.length; index++) {
      if (!Number.isFinite(dataY[index])) {
        drawing = false;
        continue;
      }
      const x = mapX(dataX[index]);
      const y = mapY(dataY[index]);
      if (!drawing)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
      drawing = true;
    }
    ctx.stroke();
    // Labels
    ctx.fillStyle = plotColors.text;
    ctx.font = '12px "Times New Roman", Times, serif';
    const xLabels = [
      "0",
      "π/4",
      "π/2",
      "3π/4",
      "π"
    ];
    for (let index = 0; index <= 4; index++) {
      const value = (Math.PI * index) / 4;
      const x = mapX(value);
      ctx.fillText(xLabels[index], x - 10, margins.top + plotHeight + 18);
    }
    for (let index = 0; index <= 4; index++) {
      const value = yMin + ((4 - index) / 4) * (yMax - yMin);
      const y = mapY(value);
      ctx.fillText(value.toFixed(1), 4, y + 4);
    }
  }

  function drawResponses() {
    const response = evaluateResponse();
    const finitePhase = response.phase.filter(Number.isFinite);
    const finiteMagnitude = response.magnitudeDb.filter(Number.isFinite);
    const maxDb = Math.max(6, Math.ceil(Math.max(0, ...finiteMagnitude) / 10) * 10);
    drawCurvePlot(
      magnitudeCanvas,
      response.omega,
      response.magnitudeDb.map(value => clamp(value, MAGNITUDE_MIN_DB, maxDb)),
      { yMin: MAGNITUDE_MIN_DB, yMax: maxDb, color: plotColors.text }
    );
    drawCurvePlot(phaseCanvas, response.omega, response.phase, {
      yMin: Math.min(0, ...finitePhase) - 0.2,
      yMax: Math.max(0, ...finitePhase) + 0.2,
      color: plotColors.pole
    });
    const unitPoles = reducedRoots().poles.some(pole => Math.abs(complexMagnitude(pole) - 1) <= EPSILON);
    document.getElementById("responseNote").textContent =
      `Absolutt gain med K = 1. Visning fra ${MAGNITUDE_MIN_DB} til ${maxDb} dB. ` +
      (unitPoles ? "Pol på enhetsirkelen: responsen er singulær ved polens vinkel; fase er udefinert der." :
        "Fase er udefinert ved nullpunkter i responsen.");
  }

  // -----------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------

  function redrawAll() {
    drawPZPlane();
    drawResponses();
    updateStatus();
  }

  // -----------------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------------

  function getPointerPosition(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function pickPoint(x, y, width, height) {
    let best = null;
    function testPoints(points, type) {
      for (const point of points) {
        const screen = complexToScreen(point, width, height);
        const distance = Math.hypot(screen.x - x, screen.y - y);
        if (distance <= PICK_RADIUS && (!best || distance < best.distance)) {
          best = {
            type,
            id: point.id,
            distance
          };
        }
      }
    }
    testPoints(state.zeros, "zero");
    testPoints(state.poles, "pole");
    return best;
  }

  function handlePointerDown(event) {
    const position = getPointerPosition(event, pzCanvas);
    const hit = pickPoint(position.x, position.y, position.width, position.height);
    // Delete mode
    if (state.mode === "delete") {
      if (hit) {
        removePoint(hit.type, hit.id);
        state.selected = null;
        redrawAll();
      }
      return;
    }
    // Existing point
    if (hit) {
      state.selected = {
        type: hit.type,
        id: hit.id
      };
      state.dragging = true;
      pzCanvas.setPointerCapture(event.pointerId);
      redrawAll();
      return;
    }
    const point = screenToComplex(position.x, position.y, position.width, position.height);
    if (state.mode === "add-zero") {
      addPoint("zero", point.re, point.im);
    }
    if (state.mode === "add-pole") {
      addPoint("pole", point.re, point.im);
    }
    redrawAll();
  }

  function handlePointerMove(event) {
    if (!state.dragging || !state.selected) {
      return;
    }
    const position = getPointerPosition(event, pzCanvas);
    const point = screenToComplex(position.x, position.y, position.width, position.height);
    moveSelectedPoint(point.re, point.im);
    redrawAll();
  }

  function stopDragging(event) {
    if (!state.dragging) {
      return;
    }
    state.dragging = false;
    try {
      pzCanvas.releasePointerCapture(event.pointerId);
    }
    catch {
      // Pointer capture may already have been released.
    }
  }

  // -----------------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------------

  function init() {
    DemoUtils.setLayoutSizes({
      "--demo-min-height": LAYOUT.demoHeight,
      "--layout-min-height": LAYOUT.layoutMinHeight,
      "--plane-max-size": LAYOUT.planeMaxSize,
      "--response-plot-height": LAYOUT.responsePlotHeight
    });
    document.getElementById("pointSelect").addEventListener("change", event => {
      const [type, id] = event.target.value.split(":");
      state.selected = id ? { type, id: Number(id) } : null;
      redrawAll();
    });
    document.getElementById("addNumericPoint").addEventListener("click", () => {
      const point = readNumericPoint();
      if (!point)
        return;
      addPoint(document.getElementById("pointType").value, point.re, point.im);
      redrawAll();
    });
    document.getElementById("moveNumericPoint").addEventListener("click", () => {
      const point = readNumericPoint();
      if (!point)
        return;
      moveSelectedPoint(point.re, point.im);
      redrawAll();
    });
    controls.mode.addEventListener("change", () => {
      state.mode = controls.mode.value;
      pzCanvas.style.cursor = state.mode === "delete" ? "not-allowed" : "crosshair";
    });
    controls.conjugate.addEventListener("change", () => {
      state.addConjugate = controls.conjugate.checked;
    });
    controls.removeSelected.addEventListener("click", () => {
      if (!state.selected) {
        return;
      }
      removePoint(state.selected.type, state.selected.id);
      state.selected = null;
      redrawAll();
    });
    controls.presetLowPass.addEventListener("click", loadLowPassPreset);
    controls.clear.addEventListener("click", clearAll);
    pzCanvas.addEventListener("pointerdown", handlePointerDown);
    pzCanvas.addEventListener("pointermove", handlePointerMove);
    pzCanvas.addEventListener("pointerup", stopDragging);
    pzCanvas.addEventListener("pointercancel", stopDragging);
    pzCanvas.addEventListener("pointerleave", stopDragging);
    DemoUtils.observeResize(document.getElementById("layout"), redrawAll);
    redrawAll();
  }

  init();
})();
