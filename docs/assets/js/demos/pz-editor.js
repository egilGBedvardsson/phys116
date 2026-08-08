(() => {
  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const MAX_PLANE_VALUE = 1.4;
  const EPSILON = 1e-9;

  const RESPONSE_SAMPLES = 520;

  const MAGNITUDE_MIN_DB = -60;
  const MAGNITUDE_MAX_DB = 3;

  const PICK_RADIUS = 11;


  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const controls = {
    mode:
      document.getElementById("modeSelect"),

    conjugate:
      document.getElementById("conjToggle"),

    removeSelected:
      document.getElementById("removeSelectedBtn"),

    presetLowPass:
      document.getElementById("presetLowBtn"),

    clear:
      document.getElementById("clearBtn")
  };

  const status =
    document.getElementById("status");

  const pzCanvas =
    document.getElementById("pzCanvas");

  const magnitudeCanvas =
    document.getElementById("magCanvas");

  const phaseCanvas =
    document.getElementById("phaseCanvas");


  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  const plotColors = {
    grid: DemoUtils.cssVar(
      "--plot-grid",
      "#e4e4e4"
    ),

    axis: DemoUtils.cssVar(
      "--plot-axis",
      "#b8b8b8"
    ),

    axisMuted: DemoUtils.cssVar(
      "--plot-axis-soft",
      "#bbbbbb"
    ),

    text: DemoUtils.cssVar(
      "--plot-text",
      "#111111"
    ),

    muted: DemoUtils.cssVar(
      "--plot-muted",
      "#666666"
    ),

    highlight: DemoUtils.cssVar(
      "--plot-highlight",
      "#0a84ff"
    ),

    pole: DemoUtils.cssVar(
      "--plot-pole",
      "#8b0000"
    ),

    zero: DemoUtils.cssVar(
      "--plot-zero",
      "#111111"
    )
  };


  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // General helpers
  // ---------------------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.max(
      min,
      Math.min(max, value)
    );
  }


  // ---------------------------------------------------------------------------
  // Complex-number helpers
  // ---------------------------------------------------------------------------

  function complex(real, imaginary) {
    return {
      re: real,
      im: imaginary
    };
  }

  function complexSubtract(a, b) {
    return complex(
      a.re - b.re,
      a.im - b.im
    );
  }

  function complexMultiply(a, b) {
    return complex(
      a.re * b.re -
        a.im * b.im,

      a.re * b.im +
        a.im * b.re
    );
  }

  function complexDivide(a, b) {
    const denominator =
      b.re * b.re +
      b.im * b.im;

    if (denominator < EPSILON) {
      return complex(1e6, 0);
    }

    return complex(
      (
        a.re * b.re +
        a.im * b.im
      ) /
        denominator,

      (
        a.im * b.re -
        a.re * b.im
      ) /
        denominator
    );
  }

  function complexMagnitude(value) {
    return Math.hypot(
      value.re,
      value.im
    );
  }

  function complexPhase(value) {
    return Math.atan2(
      value.im,
      value.re
    );
  }


  // ---------------------------------------------------------------------------
  // Canvas helpers
  // ---------------------------------------------------------------------------

  function prepareCanvas(canvas) {
    const rect =
      canvas.getBoundingClientRect();

    const dpr =
      window.devicePixelRatio || 1;

    canvas.width =
      Math.max(
        1,
        Math.round(
          rect.width * dpr
        )
      );

    canvas.height =
      Math.max(
        1,
        Math.round(
          rect.height * dpr
        )
      );

    const context =
      canvas.getContext("2d");

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    return {
      ctx: context,
      width: rect.width,
      height: rect.height
    };
  }


  function formatComplexPoint(point) {
    const real =
        point.re.toFixed(3);

    const imaginary =
        Math.abs(
        point.im
        ).toFixed(3);

    const sign =
        point.im >= 0
        ? "+"
        : "−";

    return (
        `${real} ${sign} j${imaginary}`
    );
    }

  // ---------------------------------------------------------------------------
  // z-plane coordinate mapping
  // ---------------------------------------------------------------------------

  function complexToScreen(
    point,
    width,
    height
  ) {
    return {
      x:
        (
          (
            point.re +
            MAX_PLANE_VALUE
          ) /
          (
            2 *
            MAX_PLANE_VALUE
          )
        ) *
        width,

      y:
        (
          (
            MAX_PLANE_VALUE -
            point.im
          ) /
          (
            2 *
            MAX_PLANE_VALUE
          )
        ) *
        height
    };
  }

  function screenToComplex(
    x,
    y,
    width,
    height
  ) {
    const real =
      (
        x / width
      ) *
        (
          2 *
          MAX_PLANE_VALUE
        ) -
      MAX_PLANE_VALUE;

    const imaginary =
      MAX_PLANE_VALUE -
      (
        y / height
      ) *
        (
          2 *
          MAX_PLANE_VALUE
        );

    return complex(
      clamp(
        real,
        -MAX_PLANE_VALUE,
        MAX_PLANE_VALUE
      ),

      clamp(
        imaginary,
        -MAX_PLANE_VALUE,
        MAX_PLANE_VALUE
      )
    );
  }


  // ---------------------------------------------------------------------------
  // Zero / pole management
  // ---------------------------------------------------------------------------

  function getPoints(type) {
    return type === "zero"
      ? state.zeros
      : state.poles;
  }

  function findPoint(type, id) {
    return (
      getPoints(type)
        .find(
          point =>
            point.id === id
        ) || null
    );
  }

  function removePoint(type, id) {
    const points =
      getPoints(type);

    const index =
      points.findIndex(
        point =>
          point.id === id
      );

    if (index < 0) {
      return;
    }

    const point =
      points[index];

    if (point.pair !== null) {
      for (
        let i =
          points.length - 1;
        i >= 0;
        i--
      ) {
        if (
          points[i].pair ===
          point.pair
        ) {
          points.splice(i, 1);
        }
      }
    } else {
      points.splice(index, 1);
    }

    if (
      state.selected &&
      state.selected.type === type &&
      state.selected.id === id
    ) {
      state.selected = null;
    }
  }

  function addPoint(
    type,
    real,
    imaginary
  ) {
    const points =
      getPoints(type);

    const point = {
      id: state.nextId++,
      re: real,
      im: imaginary,
      pair: null
    };

    const shouldAddPair =
      state.addConjugate &&
      Math.abs(imaginary) > 0.01;

    if (shouldAddPair) {
      const pairId =
        state.nextPairId++;

      point.pair = pairId;

      points.push(point);

      points.push({
        id: state.nextId++,
        re: real,
        im: -imaginary,
        pair: pairId
      });
    } else {
      if (
        Math.abs(point.im) <
        0.01
      ) {
        point.im = 0;
      }

      points.push(point);
    }

    state.selected = {
      type,
      id: point.id
    };
  }

  function moveSelectedPoint(
    real,
    imaginary
  ) {
    if (!state.selected) {
      return;
    }

    const point =
      findPoint(
        state.selected.type,
        state.selected.id
      );

    if (!point) {
      return;
    }

    point.re =
      clamp(
        real,
        -MAX_PLANE_VALUE,
        MAX_PLANE_VALUE
      );

    point.im =
      clamp(
        Math.abs(imaginary) < 0.01
          ? 0
          : imaginary,

        -MAX_PLANE_VALUE,
        MAX_PLANE_VALUE
      );

    if (point.pair === null) {
      return;
    }

    const points =
      getPoints(
        state.selected.type
      );

    const mate =
      points.find(
        other =>
          other.pair === point.pair &&
          other.id !== point.id
      );

    if (!mate) {
      return;
    }

    if (Math.abs(point.im) < 0.01) {
      // A conjugate pair collapses to one
      // point when it reaches the real axis.

      point.pair = null;

      const mateIndex =
        points.findIndex(
          other =>
            other.id === mate.id
        );

      if (mateIndex >= 0) {
        points.splice(
          mateIndex,
          1
        );
      }

      return;
    }

    mate.re = point.re;
    mate.im = -point.im;
  }


  // ---------------------------------------------------------------------------
  // Pointer helpers
  // ---------------------------------------------------------------------------

  function getPointerPosition(
    event,
    canvas
  ) {
    const rect =
      canvas.getBoundingClientRect();

    return {
      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top,

      width:
        rect.width,

      height:
        rect.height
    };
  }

  function pickPoint(
    x,
    y,
    width,
    height
  ) {
    let best = null;

    function testPoints(
      points,
      type
    ) {
      for (const point of points) {
        const screen =
          complexToScreen(
            point,
            width,
            height
          );

        const distance =
          Math.hypot(
            screen.x - x,
            screen.y - y
          );

        if (
          distance <= PICK_RADIUS &&
          (
            !best ||
            distance < best.distance
          )
        ) {
          best = {
            type,
            id: point.id,
            distance
          };
        }
      }
    }

    testPoints(
      state.zeros,
      "zero"
    );

    testPoints(
      state.poles,
      "pole"
    );

    return best;
  }


  // ---------------------------------------------------------------------------
  // Pole-zero drawing
  // ---------------------------------------------------------------------------

  function drawZero(
    ctx,
    point,
    width,
    height,
    selected
  ) {
    const screen =
      complexToScreen(
        point,
        width,
        height
      );

    ctx.lineWidth =
      selected ? 3 : 2;

    ctx.strokeStyle =
      selected
        ? plotColors.highlight
        : plotColors.zero;

    ctx.beginPath();

    ctx.arc(
      screen.x,
      screen.y,
      7,
      0,
      Math.PI * 2
    );

    ctx.stroke();
  }

  function drawPole(
    ctx,
    point,
    width,
    height,
    selected
  ) {
    const screen =
      complexToScreen(
        point,
        width,
        height
      );

    const size = 7;

    ctx.lineWidth =
      selected ? 3 : 2.2;

    ctx.strokeStyle =
      selected
        ? plotColors.highlight
        : plotColors.pole;

    ctx.beginPath();

    ctx.moveTo(
      screen.x - size,
      screen.y - size
    );

    ctx.lineTo(
      screen.x + size,
      screen.y + size
    );

    ctx.moveTo(
      screen.x + size,
      screen.y - size
    );

    ctx.lineTo(
      screen.x - size,
      screen.y + size
    );

    ctx.stroke();
  }

  function drawPZPlane() {
    const {
      ctx,
      width,
      height
    } = prepareCanvas(
      pzCanvas
    );

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    const gridValues = [
      -1,
      -0.5,
      0,
      0.5,
      1
    ];

    // Grid
    ctx.strokeStyle =
      plotColors.grid;

    ctx.lineWidth = 1;

    for (
      const value of
        gridValues
    ) {
      const x =
        complexToScreen(
          complex(value, 0),
          width,
          height
        ).x;

      const y =
        complexToScreen(
          complex(0, value),
          width,
          height
        ).y;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const center =
      complexToScreen(
        complex(0, 0),
        width,
        height
      );

    // Unit circle
    ctx.strokeStyle =
      plotColors.axis;

    ctx.lineWidth = 1.6;

    const radius =
      (
        1 /
        (
          2 *
          MAX_PLANE_VALUE
        )
      ) *
      width;

    ctx.beginPath();

    ctx.arc(
      center.x,
      center.y,
      radius,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    // Axes
    ctx.strokeStyle =
      plotColors.axisMuted;

    ctx.lineWidth = 1.3;

    ctx.beginPath();

    ctx.moveTo(
      0,
      center.y
    );

    ctx.lineTo(
      width,
      center.y
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      center.x,
      0
    );

    ctx.lineTo(
      center.x,
      height
    );

    ctx.stroke();

    // Axis labels
    ctx.fillStyle =
      plotColors.text;

    ctx.font =
      '12px "Times New Roman", Times, serif';

    ctx.fillText(
      "Re{z}",
      width - 34,
      center.y - 6
    );

    ctx.fillText(
      "Im{z}",
      center.x + 6,
      14
    );

    // Zeros
    for (
      const zero of
        state.zeros
    ) {
      const selected =
        state.selected &&
        state.selected.type === "zero" &&
        state.selected.id === zero.id;

      drawZero(
        ctx,
        zero,
        width,
        height,
        selected
      );
    }

    // Poles
    for (
      const pole of
        state.poles
    ) {
      const selected =
        state.selected &&
        state.selected.type === "pole" &&
        state.selected.id === pole.id;

      drawPole(
        ctx,
        pole,
        width,
        height,
        selected
      );
    }

    ctx.fillStyle =
      plotColors.muted;

    ctx.font =
      '13px "Times New Roman", Times, serif';

    ctx.fillText(
      "Klikk for å legge til. Dra for flytting.",
      10,
      height - 12
    );
  }


  // ---------------------------------------------------------------------------
  // Frequency response
  // ---------------------------------------------------------------------------

  function evaluateResponse() {
    const omega =
        new Array(RESPONSE_SAMPLES + 1);

    const magnitude =
        new Array(RESPONSE_SAMPLES + 1);

    const magnitudeDb =
        new Array(RESPONSE_SAMPLES + 1);

    const phase =
        new Array(RESPONSE_SAMPLES + 1);

    for (
        let index = 0;
        index <= RESPONSE_SAMPLES;
        index++
    ) {
        const frequency =
        (Math.PI * index) /
        RESPONSE_SAMPLES;

        const z =
        complex(
            Math.cos(frequency),
            Math.sin(frequency)
        );

        let numerator =
        complex(1, 0);

        for (const zero of state.zeros) {
        numerator =
            complexMultiply(
            numerator,
            complexSubtract(z, zero)
            );
        }

        let denominator =
        complex(1, 0);

        for (const pole of state.poles) {
        denominator =
            complexMultiply(
            denominator,
            complexSubtract(z, pole)
            );
        }

        const response =
        complexDivide(
            numerator,
            denominator
        );

        omega[index] =
        frequency;

        magnitude[index] =
        complexMagnitude(response);

        phase[index] =
        complexPhase(response);
    }

    const peakMagnitude =
        Math.max(
        ...magnitude,
        EPSILON
        );

    for (
        let index = 0;
        index < magnitude.length;
        index++
    ) {
        magnitudeDb[index] =
        20 *
        Math.log10(
            Math.max(
            magnitude[index] /
                peakMagnitude,
            EPSILON
            )
        );
    }

    unwrapPhase(phase);

    return {
        omega,
        magnitudeDb,
        phase
    };
    }

  function unwrapPhase(phase) {
    for (
      let index = 1;
      index < phase.length;
      index++
    ) {
      let difference =
        phase[index] -
        phase[index - 1];

      while (
        difference >
        Math.PI
      ) {
        phase[index] -=
          2 * Math.PI;

        difference -=
          2 * Math.PI;
      }

      while (
        difference <
        -Math.PI
      ) {
        phase[index] +=
          2 * Math.PI;

        difference +=
          2 * Math.PI;
      }
    }
  }


  // ---------------------------------------------------------------------------
  // Response plot drawing
  // ---------------------------------------------------------------------------

  function drawCurvePlot(
    canvas,
    dataX,
    dataY,
    options
  ) {
    const {
      ctx,
      width,
      height
    } = prepareCanvas(canvas);

    const margins = {
      left: 50,
      right: 10,
      top: 14,
      bottom: 28
    };

    const plotWidth =
      width -
      margins.left -
      margins.right;

    const plotHeight =
      height -
      margins.top -
      margins.bottom;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    // Grid
    ctx.strokeStyle =
      plotColors.grid;

    ctx.lineWidth = 1;

    for (
      let index = 0;
      index <= 4;
      index++
    ) {
      const y =
        margins.top +
        (
          index / 4
        ) *
        plotHeight;

      ctx.beginPath();

      ctx.moveTo(
        margins.left,
        y
      );

      ctx.lineTo(
        margins.left +
          plotWidth,
        y
      );

      ctx.stroke();
    }

    for (
      let index = 0;
      index <= 4;
      index++
    ) {
      const x =
        margins.left +
        (
          index / 4
        ) *
        plotWidth;

      ctx.beginPath();

      ctx.moveTo(
        x,
        margins.top
      );

      ctx.lineTo(
        x,
        margins.top +
          plotHeight
      );

      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle =
      plotColors.muted;

    ctx.lineWidth = 1.2;

    ctx.beginPath();

    ctx.moveTo(
      margins.left,
      margins.top
    );

    ctx.lineTo(
      margins.left,
      margins.top +
        plotHeight
    );

    ctx.lineTo(
      margins.left +
        plotWidth,
      margins.top +
        plotHeight
    );

    ctx.stroke();

    const xMin = 0;
    const xMax = Math.PI;

    const yMin =
      options.yMin;

    const yMax =
      options.yMax;

    function mapX(value) {
      return (
        margins.left +
        (
          (
            value -
            xMin
          ) /
          (
            xMax -
            xMin
          )
        ) *
        plotWidth
      );
    }

    function mapY(value) {
      return (
        margins.top +
        (
          (
            yMax -
            value
          ) /
          (
            yMax -
            yMin
          )
        ) *
        plotHeight
      );
    }

    // Curve
    ctx.strokeStyle =
      options.color;

    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (
      let index = 0;
      index < dataX.length;
      index++
    ) {
      const x =
        mapX(
          dataX[index]
        );

      const y =
        mapY(
          dataY[index]
        );

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Labels
    ctx.fillStyle =
      plotColors.text;

    ctx.font =
      '12px "Times New Roman", Times, serif';

    const xLabels = [
      "0",
      "π/4",
      "π/2",
      "3π/4",
      "π"
    ];

    for (
      let index = 0;
      index <= 4;
      index++
    ) {
      const value =
        (
          Math.PI *
          index
        ) / 4;

      const x =
        mapX(value);

      ctx.fillText(
        xLabels[index],
        x - 10,
        margins.top +
          plotHeight +
          18
      );
    }

    for (
      let index = 0;
      index <= 4;
      index++
    ) {
      const value =
        yMin +
        (
          (
            4 -
            index
          ) /
          4
        ) *
        (
          yMax -
          yMin
        );

      const y =
        mapY(value);

      ctx.fillText(
        value.toFixed(1),
        4,
        y + 4
      );
    }
  }

  function drawResponses() {
    const response =
      evaluateResponse();

    const phaseMin =
      Math.min(
        ...response.phase
      );

    const phaseMax =
      Math.max(
        ...response.phase
      );

    const phasePadding =
      0.2;

    drawCurvePlot(
      magnitudeCanvas,
      response.omega,

      response.magnitudeDb.map(
        value =>
          clamp(
            value,
            MAGNITUDE_MIN_DB,
            MAGNITUDE_MAX_DB
          )
      ),

      {
        yMin:
          MAGNITUDE_MIN_DB,

        yMax:
          MAGNITUDE_MAX_DB,

        color:
          plotColors.text
      }
    );

    drawCurvePlot(
      phaseCanvas,
      response.omega,
      response.phase,

      {
        yMin:
          phaseMin -
          phasePadding,

        yMax:
          phaseMax +
          phasePadding,

        color:
          plotColors.pole
      }
    );
  }


  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------
function updateStatus() {
  const largestPoleRadius =
    state.poles.reduce(
      (largest, pole) =>
        Math.max(
          largest,
          complexMagnitude(pole)
        ),
      0
    );

  let stabilityText;

  if (largestPoleRadius < 0.999) {
    stabilityText =
      "Stabil (alle poler innenfor enhetsirkelen)";
  } else if (largestPoleRadius <= 1.001) {
    stabilityText =
      "Marginal (pol på enhetsirkelen)";
  } else {
    stabilityText =
      "Ustabil (pol utenfor enhetsirkelen)";
  }


  let selectedText =
    "Valgt: ingen";

  if (state.selected) {
    const selectedPoint =
      findPoint(
        state.selected.type,
        state.selected.id
      );

    if (selectedPoint) {
      const typeLabel =
        state.selected.type === "zero"
          ? "null"
          : "pol";

      const real =
        selectedPoint.re.toFixed(3);

      const imaginary =
        Math.abs(
          selectedPoint.im
        ).toFixed(3);

      const sign =
        selectedPoint.im >= 0
          ? "+"
          : "−";

      const radius =
        complexMagnitude(
          selectedPoint
        ).toFixed(3);

      selectedText =
        `Valgt: ${typeLabel} ` +
        `z = ${real} ${sign} j${imaginary}, ` +
        `|z| = ${radius}`;
    }
  }

handlePointerDown
  status.innerHTML =
    `Nuller: <b>${state.zeros.length}</b> &nbsp;|&nbsp; ` +
    `Poler: <b>${state.poles.length}</b> &nbsp;|&nbsp; ` +
    `Maks |pol|: <b>${largestPoleRadius.toFixed(3)}</b> &nbsp;|&nbsp; ` +
    `Stabilitet: <b>${stabilityText}</b> &nbsp;|&nbsp; ` +
    selectedText;
}


  // ---------------------------------------------------------------------------
  // Presets / reset
  // ---------------------------------------------------------------------------

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

    const firstPair =
      state.nextPairId++;

    const secondPair =
      state.nextPairId++;

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


  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function redrawAll() {
    drawPZPlane();
    drawResponses();
    updateStatus();
  }


  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  function handlePointerDown(event) {
    const position =
      getPointerPosition(
        event,
        pzCanvas
      );

    const hit =
      pickPoint(
        position.x,
        position.y,
        position.width,
        position.height
      );

    // Delete mode
    if (state.mode === "delete") {
      if (hit) {
        removePoint(
          hit.type,
          hit.id
        );

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

      pzCanvas.setPointerCapture(
        event.pointerId
      );

      redrawAll();

      return;
    }


    const point =
      screenToComplex(
        position.x,
        position.y,
        position.width,
        position.height
      );

    if (
      state.mode === "add-zero"
    ) {
      addPoint(
        "zero",
        point.re,
        point.im
      );
    }

    if (
      state.mode === "add-pole"
    ) {
      addPoint(
        "pole",
        point.re,
        point.im
      );
    }

    redrawAll();
  }

  function handlePointerMove(event) {
    if (
      !state.dragging ||
      !state.selected
    ) {
      return;
    }

    const position =
      getPointerPosition(
        event,
        pzCanvas
      );

    const point =
      screenToComplex(
        position.x,
        position.y,
        position.width,
        position.height
      );

    moveSelectedPoint(
      point.re,
      point.im
    );

    redrawAll();
  }

  function stopDragging(event) {
    if (!state.dragging) {
      return;
    }

    state.dragging = false;

    try {
      pzCanvas.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture may already have been released.
    }
  }


  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init() {
    controls.mode.addEventListener(
      "change",
      () => {
        state.mode =
          controls.mode.value;

        pzCanvas.style.cursor =
          state.mode === "delete"
            ? "not-allowed"
            : "crosshair";
      }
    );

    controls.conjugate.addEventListener(
      "change",
      () => {
        state.addConjugate =
          controls.conjugate.checked;
      }
    );

    controls.removeSelected.addEventListener(
      "click",
      () => {
        if (!state.selected) {
          return;
        }

        removePoint(
          state.selected.type,
          state.selected.id
        );

        state.selected = null;

        redrawAll();
      }
    );

    controls.presetLowPass.addEventListener(
      "click",
      loadLowPassPreset
    );

    controls.clear.addEventListener(
      "click",
      clearAll
    );

    pzCanvas.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    pzCanvas.addEventListener(
      "pointermove",
      handlePointerMove
    );

    pzCanvas.addEventListener(
      "pointerup",
      stopDragging
    );

    pzCanvas.addEventListener(
      "pointercancel",
      stopDragging
    );

    pzCanvas.addEventListener(
      "pointerleave",
      stopDragging
    );

    window.addEventListener(
      "resize",
      redrawAll,
      {
        passive: true
      }
    );

    redrawAll();
  }

  init();
})();