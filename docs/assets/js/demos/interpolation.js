// PHYS 116: Interpolation

(() => {
  // -----------------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";

  const LAYOUT = {
    minHeight: 230,
    maxHeight: 320,
    viewportFraction: 0.42,
    margins: { left: 42, right: 20, top: 16, bottom: 42 }
  };

  // -----------------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------------

  const plot = document.getElementById("plot");
  const methodSelect = document.getElementById("methodSelect");

  // -----------------------------------------------------------------------------
  // Theme
  // -----------------------------------------------------------------------------

  const plotColors = {
    ...DemoUtils.cssVars({
      background: ["--plot-bg", "#ffffff"],
      grid: ["--plot-grid", "#e4e4e4"],
      axis: ["--plot-axis", "#b8b8b8"],
      text: ["--plot-text", "#111111"],
      muted: ["--plot-muted", "#666666"],
      primary: ["--plot-primary", "#3b4cc0"],
      secondary: ["--plot-secondary", "#d11141"],
      tertiary: ["--plot-tertiary", "#488fa3"]
    })
  };

  // -----------------------------------------------------------------------------
  // State and data
  // -----------------------------------------------------------------------------

  const GRAPH = {
    width: 0,
    height: 0,
    x: LAYOUT.margins.left,
    y: LAYOUT.margins.top,
    plotWidth: 0,
    plotHeight: 0,
    xMax: 5,
    yMin: -0.25,
    yMax: 1.25,
    interpolationSamples: 600
  };

  let probeX = 2.25;

  const samplePoints = Array.from({ length: 11 }, (_, index) => {
    const x = index * 0.5;
    return {
      x,
      y: sourceSignal(x)
    };
  });

  const SAMPLE_SPACING = samplePoints.length > 1 ? samplePoints[1].x - samplePoints[0].x : 1;

  // -----------------------------------------------------------------------------
  // Calculations
  // -----------------------------------------------------------------------------

  const clamp = DemoUtils.clamp;

  function sourceSignal(x) {
    return (0.55 + 0.22 * Math.sin(2 * Math.PI * 0.35 * x) + 0.14 * Math.cos(2 * Math.PI * 0.70 * x));
  }

  function sinc(value) {
    if (Math.abs(value) < 1e-8) {
      return 1;
    }
    return (Math.sin(Math.PI * value) / (Math.PI * value));
  }

  function sincContribution(point, x) {
    const normalizedDistance = (x - point.x) / SAMPLE_SPACING;
    return (point.y * sinc(normalizedDistance));
  }

  function nearestSampleIndex(x) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < samplePoints.length; index++) {
      const distance = Math.abs(x - samplePoints[index].x);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function getWeight(method, point, index, x) {
    const normalizedDistance = (x - point.x) / SAMPLE_SPACING;
    const distance = Math.abs(normalizedDistance);
    switch (method) {
      // Nearest-neighbour:
      // exactly one sample has weight 1.
      case "nearest":
        return (index === nearestSampleIndex(x) ? 1 : 0);
      // Triangular basis.
      // For uniformly spaced samples this
      // gives ordinary linear interpolation.
      case "linear":
      case "triangle":
        return Math.max(0, 1 - distance);
      // Raised-cosine basis.
      case "cosine":
        if (distance > 1) {
          return 0;
        }
        return (0.5 * (1 + Math.cos(Math.PI * distance)));
      // Ideal sinc basis.
      case "sinc":
        return sinc(normalizedDistance);
      default:
        return Math.max(0, 1 - distance);
    }
  }

  function getContributions(method, x) {
    return samplePoints.map((point, index) => {
      const weight = getWeight(method, point, index, x);
      return {
        point,
        index,
        weight,
        value: point.y * weight
      };
    });
  }

  function interpolate(method, x) {
    const contributions = getContributions(method, x);
    return contributions.reduce((sum, contribution) => sum + contribution.value, 0);
  }

  function generateInterpolatedPoints(method) {
    const firstX = samplePoints[0].x;
    const lastX = samplePoints[samplePoints.length - 1].x;
    const interpolated = [];
    for (let index = 0; index <= GRAPH.interpolationSamples; index++) {
      const x = firstX + ((lastX - firstX) * index) / GRAPH.interpolationSamples;
      interpolated.push({
        x,
        y: interpolate(method, x)
      });
    }
    return interpolated;
  }

  function clampProbeX(value) {
    return clamp(value, samplePoints[0].x, samplePoints[samplePoints.length - 1].x);
  }

  // -----------------------------------------------------------------------------
  // Layout
  // -----------------------------------------------------------------------------

  function mapX(value) {
    return (GRAPH.x + (value / GRAPH.xMax) * GRAPH.plotWidth);
  }

  function mapY(value) {
    const normalized = (value - GRAPH.yMin) / (GRAPH.yMax - GRAPH.yMin);
    return (GRAPH.y + GRAPH.plotHeight - normalized * GRAPH.plotHeight);
  }

  // -----------------------------------------------------------------------------
  // Drawing
  // -----------------------------------------------------------------------------

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  }

  function appendSvgElement(tag, attributes = {}) {
    const element = createSvgElement(tag, attributes);
    plot.appendChild(element);
    return element;
  }

  function appendText(text, attributes) {
    const element = appendSvgElement("text", attributes);
    element.textContent = text;
    return element;
  }

  function drawBackground() {
    appendSvgElement("rect", {
      x: 0,
      y: 0,
      width: GRAPH.width,
      height: GRAPH.height,
      fill: plotColors.background
    });
  }

  function drawGrid() {
    for (let index = 0; index <= 5; index++) {
      const x = GRAPH.x + (GRAPH.plotWidth * index) / 5;
      appendSvgElement("line", {
        x1: x,
        y1: GRAPH.y,
        x2: x,
        y2: GRAPH.y + GRAPH.plotHeight,
        stroke: plotColors.grid,
        "stroke-width": 1
      });
    }
    for (let index = 0; index <= 4; index++) {
      const y = GRAPH.y + (GRAPH.plotHeight * index) / 4;
      appendSvgElement("line", {
        x1: GRAPH.x,
        y1: y,
        x2: GRAPH.x + GRAPH.plotWidth,
        y2: y,
        stroke: plotColors.grid,
        "stroke-width": 1
      });
    }
  }

  function drawFrame() {
    appendSvgElement("rect", {
      x: GRAPH.x,
      y: GRAPH.y,
      width: GRAPH.plotWidth,
      height: GRAPH.plotHeight,
      fill: "none",
      stroke: plotColors.axis,
      "stroke-width": 1.2
    });
  }

  function drawInterpolatedCurve(method) {
    const points = generateInterpolatedPoints(method);
    const path = points
      .map(point => {
        const x = mapX(point.x);
        const y = mapY(point.y);
        return (`${x.toFixed(2)},` + `${y.toFixed(2)}`);
      })
      .join(" ");
    appendSvgElement("polyline", {
      points: path,
      fill: "none",
      stroke: plotColors.primary,
      "stroke-width": 2.2
    });
  }

  function drawSamplePoints() {
    for (const point of samplePoints) {
      const x = mapX(point.x);
      const y = mapY(point.y);
      appendSvgElement("circle", {
        cx: x,
        cy: y,
        r: 5,
        fill: plotColors.tertiary
      });
      if (GRAPH.width >= 800)
        appendText(`(${formatX(point.x)}, ${point.y.toFixed(2)})`, {
          x: Math.min(x + 8, GRAPH.width - 110),
          y: y - 6,
          fill: plotColors.text,
          "font-size": 12,
          "font-family": "sans-serif"
        });
    }
  }

  function formatX(value) {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }

  function drawLabels() {
    for (let index = 0; index <= 5; index++) {
      appendText(String(index), {
        x: mapX(index), y: GRAPH.y + GRAPH.plotHeight + 20,
        fill: plotColors.text, "font-size": 12, "text-anchor": "middle"
      });
    }
    for (const value of [0, 0.5, 1]) {
      appendText(value.toFixed(1), {
        x: GRAPH.x - 8, y: mapY(value) + 4,
        fill: plotColors.text, "font-size": 12, "text-anchor": "end"
      });
    }
    appendText("t", {
      x: GRAPH.width - 12, y: GRAPH.height - 7,
      fill: plotColors.text, "font-size": 13
    });
  }

  function drawContributionCurves(method) {
    const firstX = samplePoints[0].x;
    const lastX = samplePoints[samplePoints.length - 1].x;
    for (let sampleIndex = 0; sampleIndex < samplePoints.length; sampleIndex++) {
      const sample = samplePoints[sampleIndex];
      const points = [];
      for (let index = 0; index <= GRAPH.interpolationSamples; index++) {
        const x = firstX + ((lastX - firstX) * index) / GRAPH.interpolationSamples;
        const weight = getWeight(method, sample, sampleIndex, x);
        points.push({
          x,
          y: sample.y * weight
        });
      }
      const path = points
        .map(point => {
          return (`${mapX(point.x).toFixed(2)},` + `${mapY(point.y).toFixed(2)}`);
        })
        .join(" ");
      appendSvgElement("polyline", {
        points: path,
        fill: "none",
        stroke: plotColors.primary,
        "stroke-width": 1,
        "stroke-opacity": 0.20
      });
    }
  }

  function drawProbe(method) {
    const x = clampProbeX(probeX);
    const y = interpolate(method, x);
    const screenX = mapX(x);
    const screenY = mapY(y);
    // Vertical probe line
    appendSvgElement("line", {
      x1: screenX,
      y1: GRAPH.y,
      x2: screenX,
      y2: GRAPH.y + GRAPH.plotHeight,
      stroke: plotColors.secondary,
      "stroke-width": 1.2,
      "stroke-dasharray": "5 5"
    });
    // Final interpolated value
    appendSvgElement("circle", {
      cx: screenX,
      cy: screenY,
      r: 5,
      fill: plotColors.secondary
    });
    const selectedMethod = methodSelect.options[methodSelect.selectedIndex].text;
    document.getElementById("probeReadout").textContent =
      `${selectedMethod} · t* = ${x.toFixed(2)} · x̂(t*) = Σ x[n] wₙ(t*) = ${y.toFixed(3)}. Blått: sum og enkeltbidrag. Turkis: samplepunkter.`;
  }

  function drawProbeContributions(method) {
    const x = clampProbeX(probeX);
    const screenX = mapX(x);
    const contributions = getContributions(method, x);
    for (const contribution of contributions) {
      /*
        Don't draw markers for contributions
        that are effectively zero.
      */
      if (Math.abs(contribution.weight) < 1e-5) {
        continue;
      }
      appendSvgElement("circle", {
        cx: screenX,
        cy: mapY(contribution.value),
        r: 3,
        fill: plotColors.primary,
        "fill-opacity": 0.55
      });
    }
  }

  // -----------------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------------

  function draw() {
    GRAPH.width = Math.max(1, Math.round(plot.clientWidth));
    GRAPH.height = DemoUtils.plotHeight(LAYOUT.minHeight, LAYOUT.maxHeight, LAYOUT.viewportFraction);
    GRAPH.plotWidth = Math.max(1, GRAPH.width - LAYOUT.margins.left - LAYOUT.margins.right);
    GRAPH.plotHeight = GRAPH.height - LAYOUT.margins.top - LAYOUT.margins.bottom;
    plot.setAttribute("viewBox", `0 0 ${GRAPH.width} ${GRAPH.height}`);
    plot.style.height = `${GRAPH.height}px`;
    const method = methodSelect.value;
    plot.replaceChildren();
    drawBackground();
    drawGrid();
    drawFrame();
    // Individual terms y[n] w[n](x)
    drawContributionCurves(method);
    // Sum of all terms
    drawInterpolatedCurve(method);
    drawSamplePoints();
    // Calculation at x*
    drawProbeContributions(method);
    drawProbe(method);
    drawLabels(method);
  }

  // -----------------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------------

  function handlePlotPointer(event) {
    const rect = plot.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * GRAPH.width;
    const normalized = (svgX - GRAPH.x) / GRAPH.plotWidth;
    probeX = clampProbeX(normalized * GRAPH.xMax);
    draw();
  }

  // -----------------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------------

  function init() {
    plot.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const step = event.shiftKey ? 0.1 : 0.01;
      if (event.key === "Home")
        probeX = 0;
      else if (event.key === "End")
        probeX = GRAPH.xMax;
      else
        probeX = clampProbeX(probeX + (event.key === "ArrowLeft" ? -step : step));
      draw();
    });
    let lastWidth = 0;
    DemoUtils.observeResize(plot, () => {
      if (plot.clientWidth === lastWidth)
        return;
      lastWidth = plot.clientWidth;
      draw();
    });
    window.addEventListener("resize", draw, { passive: true });
    methodSelect.addEventListener("change", draw);
    plot.addEventListener("pointerdown", event => {
      plot.setPointerCapture(event.pointerId);
      handlePlotPointer(event);
    });
    plot.addEventListener("pointermove", event => {
      if (event.buttons === 1) {
        handlePlotPointer(event);
      }
    });
    draw();
  }

  init();
})();
