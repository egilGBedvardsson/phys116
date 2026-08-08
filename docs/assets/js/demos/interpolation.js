// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SVG_NS =
  "http://www.w3.org/2000/svg";

const GRAPH = {
  width: 900,
  height: 500,

  x: 50,
  y: 30,

  plotWidth: 800,
  plotHeight: 400,

  xMax: 5,

  yMin: -0.25,
  yMax: 1.25,

  interpolationSamples: 600
};

let probeX = 2.25;

// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const plot =
  document.getElementById("plot");

const methodSelect =
  document.getElementById(
    "methodSelect"
  );


// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

const plotColors = {
  background: DemoUtils.cssVar(
    "--plot-bg",
    "#ffffff"
  ),

  grid: DemoUtils.cssVar(
    "--plot-grid",
    "#e4e4e4"
  ),

  axis: DemoUtils.cssVar(
    "--plot-axis",
    "#b8b8b8"
  ),

  text: DemoUtils.cssVar(
    "--plot-text",
    "#111111"
  ),

  muted: DemoUtils.cssVar(
    "--plot-muted",
    "#666666"
  ),

  primary: DemoUtils.cssVar(
    "--plot-primary",
    "#3b4cc0"
  ),

  secondary: DemoUtils.cssVar(
    "--plot-secondary",
    "#d11141"
  ),

  tertiary: DemoUtils.cssVar(
    "--plot-tertiary",
    "#488fa3"
  )
};


// -----------------------------------------------------------------------------
// Sample data
// -----------------------------------------------------------------------------

function sourceSignal(x) {
  return (
    0.55 +
    0.22 *
      Math.sin(
        2 * Math.PI * 0.35 * x
      ) +
    0.14 *
      Math.cos(
        2 * Math.PI * 0.70 * x
      )
  );
}

const samplePoints =
  Array.from(
    { length: 11 },
    (_, index) => {
      const x =
        index * 0.5;

      return {
        x,
        y: sourceSignal(x)
      };
    }
  );

const SAMPLE_SPACING =
  samplePoints.length > 1
    ? samplePoints[1].x - samplePoints[0].x
    : 1;


// -----------------------------------------------------------------------------
// SVG helpers
// -----------------------------------------------------------------------------

function createSvgElement(
  tag,
  attributes = {}
) {
  const element =
    document.createElementNS(
      SVG_NS,
      tag
    );

  for (
    const [name, value] of
      Object.entries(attributes)
  ) {
    element.setAttribute(
      name,
      value
    );
  }

  return element;
}

function appendSvgElement(
  tag,
  attributes = {}
) {
  const element =
    createSvgElement(
      tag,
      attributes
    );

  plot.appendChild(element);

  return element;
}

function appendText(
  text,
  attributes
) {
  const element =
    appendSvgElement(
      "text",
      attributes
    );

  element.textContent = text;

  return element;
}

function sincContribution(
  point,
  x
) {
  const normalizedDistance =
    (x - point.x) /
    SAMPLE_SPACING;

  return (
    point.y *
    sinc(normalizedDistance)
  );
}

// -----------------------------------------------------------------------------
// Coordinate mapping
// -----------------------------------------------------------------------------

function mapX(value) {
  return (
    GRAPH.x +
    (value / GRAPH.xMax) *
      GRAPH.plotWidth
  );
}

function mapY(value) {
  const normalized =
    (
      value -
      GRAPH.yMin
    ) /
    (
      GRAPH.yMax -
      GRAPH.yMin
    );

  return (
    GRAPH.y +
    GRAPH.plotHeight -
    normalized *
      GRAPH.plotHeight
  );
}


// -----------------------------------------------------------------------------
// Interpolation kernels / weights
// -----------------------------------------------------------------------------

function sinc(value) {
  if (Math.abs(value) < 1e-8) {
    return 1;
  }

  return (
    Math.sin(Math.PI * value) /
    (Math.PI * value)
  );
}


function nearestSampleIndex(x) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (
    let index = 0;
    index < samplePoints.length;
    index++
  ) {
    const distance =
      Math.abs(
        x - samplePoints[index].x
      );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}


function getWeight(
  method,
  point,
  index,
  x
) {
  const normalizedDistance =
    (x - point.x) /
    SAMPLE_SPACING;

  const distance =
    Math.abs(
      normalizedDistance
    );

  switch (method) {

    // Nearest-neighbour:
    // exactly one sample has weight 1.
    case "nearest":
      return (
        index ===
        nearestSampleIndex(x)
          ? 1
          : 0
      );


    // Triangular basis.
    // For uniformly spaced samples this
    // gives ordinary linear interpolation.
    case "linear":
    case "triangle":
      return Math.max(
        0,
        1 - distance
      );


    // Raised-cosine basis.
    case "cosine":
      if (distance > 1) {
        return 0;
      }

      return (
        0.5 *
        (
          1 +
          Math.cos(
            Math.PI * distance
          )
        )
      );


    // Ideal sinc basis.
    case "sinc":
      return sinc(
        normalizedDistance
      );


    default:
      return Math.max(
        0,
        1 - distance
      );
  }
}


function getContributions(
  method,
  x
) {
  return samplePoints.map(
    (point, index) => {
      const weight =
        getWeight(
          method,
          point,
          index,
          x
        );

      return {
        point,
        index,
        weight,

        value:
          point.y *
          weight
      };
    }
  );
}


function interpolate(
  method,
  x
) {
  const contributions =
    getContributions(
      method,
      x
    );

  return contributions.reduce(
    (sum, contribution) =>
      sum +
      contribution.value,
    0
  );
}

// -----------------------------------------------------------------------------
// Plot construction
// -----------------------------------------------------------------------------

function drawBackground() {
  appendSvgElement(
    "rect",
    {
      x: 0,
      y: 0,
      width: GRAPH.width,
      height: GRAPH.height,
      fill: plotColors.background
    }
  );
}

function drawGrid() {
  for (
    let index = 0;
    index <= 5;
    index++
  ) {
    const x =
      GRAPH.x +
      (
        GRAPH.plotWidth *
        index
      ) / 5;

    appendSvgElement(
      "line",
      {
        x1: x,
        y1: GRAPH.y,
        x2: x,
        y2:
          GRAPH.y +
          GRAPH.plotHeight,

        stroke:
          plotColors.grid,

        "stroke-width": 1
      }
    );
  }

  for (
    let index = 0;
    index <= 4;
    index++
  ) {
    const y =
      GRAPH.y +
      (
        GRAPH.plotHeight *
        index
      ) / 4;

    appendSvgElement(
      "line",
      {
        x1: GRAPH.x,
        y1: y,

        x2:
          GRAPH.x +
          GRAPH.plotWidth,

        y2: y,

        stroke:
          plotColors.grid,

        "stroke-width": 1
      }
    );
  }
}

function drawFrame() {
  appendSvgElement(
    "rect",
    {
      x: GRAPH.x,
      y: GRAPH.y,

      width:
        GRAPH.plotWidth,

      height:
        GRAPH.plotHeight,

      fill: "none",

      stroke:
        plotColors.axis,

      "stroke-width": 1.2
    }
  );
}

function generateInterpolatedPoints(
  method
) {
  const firstX =
    samplePoints[0].x;

  const lastX =
    samplePoints[
      samplePoints.length - 1
    ].x;

  const interpolated = [];

  for (
    let index = 0;
    index <=
      GRAPH.interpolationSamples;
    index++
  ) {
    const x =
      firstX +
      (
        (lastX - firstX) *
        index
      ) /
        GRAPH.interpolationSamples;

    interpolated.push({
      x,
      y:
        interpolate(
          method,
          x
        )
    });
  }

  return interpolated;
}

function drawInterpolatedCurve(
  method
) {
  const points =
    generateInterpolatedPoints(
      method
    );

  const path =
    points
      .map(point => {
        const x =
          mapX(point.x);

        const y =
          mapY(point.y);

        return (
          `${x.toFixed(2)},` +
          `${y.toFixed(2)}`
        );
      })
      .join(" ");

  appendSvgElement(
    "polyline",
    {
      points: path,
      fill: "none",

      stroke:
        plotColors.primary,

      "stroke-width": 2.2
    }
  );
}

function drawSamplePoints() {
  for (
    const point of
      samplePoints
  ) {
    const x =
      mapX(point.x);

    const y =
      mapY(point.y);

    appendSvgElement(
      "circle",
      {
        cx: x,
        cy: y,
        r: 5,

        fill:
          plotColors.tertiary
      }
    );

    appendText(
      `(${formatX(point.x)}, ${point.y.toFixed(2)})`,
      {
        x: x + 8,
        y: y - 6,

        fill:
          plotColors.text,

        "font-size": 12,
        "font-family":
          "sans-serif"
      }
    );
  }
}

function formatX(value) {
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(1);
}

function drawLabels(method) {
  appendText(
    "Interpolert kurve = sum",
    {
      x: GRAPH.x + 10,
      y: GRAPH.y + 20,

      fill:
        plotColors.primary,

      "font-size": 13,

      "font-family":
        "sans-serif"
    }
  );


  appendText(
    "Enkeltbidrag",
    {
      x: GRAPH.x + 190,
      y: GRAPH.y + 20,

      fill:
        plotColors.primary,

      "fill-opacity": 0.55,

      "font-size": 13,

      "font-family":
        "sans-serif"
    }
  );


  appendText(
    "Sample-punkter",
    {
      x: GRAPH.x + 310,
      y: GRAPH.y + 20,

      fill:
        plotColors.tertiary,

      "font-size": 13,

      "font-family":
        "sans-serif"
    }
  );


  const selectedMethod =
    methodSelect.options[
      methodSelect.selectedIndex
    ].text;

  appendText(
    `Metode: ${selectedMethod}`,
    {
      x:
        GRAPH.x + 10,

      y:
        GRAPH.y +
        GRAPH.plotHeight +
        46,

      fill:
        plotColors.muted,

      "font-size": 13,

      "font-family":
        "sans-serif"
    }
  );
}

function drawContributionCurves(
  method
) {
  const firstX =
    samplePoints[0].x;

  const lastX =
    samplePoints[
      samplePoints.length - 1
    ].x;

  for (
    let sampleIndex = 0;
    sampleIndex <
      samplePoints.length;
    sampleIndex++
  ) {
    const sample =
      samplePoints[
        sampleIndex
      ];

    const points = [];

    for (
      let index = 0;
      index <=
        GRAPH.interpolationSamples;
      index++
    ) {
      const x =
        firstX +
        (
          (lastX - firstX) *
          index
        ) /
          GRAPH.interpolationSamples;

      const weight =
        getWeight(
          method,
          sample,
          sampleIndex,
          x
        );

      points.push({
        x,
        y:
          sample.y *
          weight
      });
    }

    const path =
      points
        .map(point => {
          return (
            `${mapX(point.x).toFixed(2)},` +
            `${mapY(point.y).toFixed(2)}`
          );
        })
        .join(" ");

    appendSvgElement(
      "polyline",
      {
        points: path,
        fill: "none",

        stroke:
          plotColors.primary,

        "stroke-width": 1,

        "stroke-opacity": 0.20
      }
    );
  }
}

function drawProbe(method) {
  const x =
    clampProbeX(
      probeX
    );

  const y =
    interpolate(
      method,
      x
    );

  const screenX =
    mapX(x);

  const screenY =
    mapY(y);


  // Vertical probe line
  appendSvgElement(
    "line",
    {
      x1: screenX,
      y1: GRAPH.y,

      x2: screenX,
      y2:
        GRAPH.y +
        GRAPH.plotHeight,

      stroke:
        plotColors.secondary,

      "stroke-width": 1.2,

      "stroke-dasharray":
        "5 5"
    }
  );


  // Final interpolated value
  appendSvgElement(
    "circle",
    {
      cx: screenX,
      cy: screenY,

      r: 5,

      fill:
        plotColors.secondary
    }
  );


  appendText(
    `t* = ${x.toFixed(2)}`,
    {
      x:
        screenX + 7,

      y:
        GRAPH.y + 18,

      fill:
        plotColors.secondary,

      "font-size": 12,

      "font-family":
        "sans-serif"
    }
  );


  appendText(
    `Ved t* = ${x.toFixed(2)}:  x̂(t*) = Σ x[n] · wₙ(t*) = ${y.toFixed(3)}`,
    {
      x:
        GRAPH.x + 10,

      y:
        GRAPH.y +
        GRAPH.plotHeight +
        24,

      fill:
        plotColors.text,

      "font-size": 13,

      "font-family":
        "sans-serif"
    }
  );
}

function clampProbeX(value) {
  return Math.max(
    samplePoints[0].x,
    Math.min(
      samplePoints[
        samplePoints.length - 1
      ].x,
      value
    )
  );
}

function drawProbeContributions(
  method
) {
  const x =
    clampProbeX(
      probeX
    );

  const screenX =
    mapX(x);

  const contributions =
    getContributions(
      method,
      x
    );

  for (
    const contribution of
      contributions
  ) {
    /*
      Don't draw markers for contributions
      that are effectively zero.
    */
    if (
      Math.abs(
        contribution.weight
      ) < 1e-5
    ) {
      continue;
    }

    appendSvgElement(
      "circle",
      {
        cx: screenX,

        cy:
          mapY(
            contribution.value
          ),

        r: 3,

        fill:
          plotColors.primary,

        "fill-opacity":
          0.55
      }
    );
  }
}

function handlePlotPointer(
  event
) {
  const rect =
    plot.getBoundingClientRect();

  const svgX =
    (
      (event.clientX -
        rect.left) /
      rect.width
    ) *
    GRAPH.width;

  const normalized =
    (
      svgX -
      GRAPH.x
    ) /
    GRAPH.plotWidth;

  probeX =
    clampProbeX(
      normalized *
      GRAPH.xMax
    );

  draw();
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

function draw() {
  const method =
    methodSelect.value;

  plot.replaceChildren();

  drawBackground();
  drawGrid();
  drawFrame();

  // Individual terms y[n] w[n](x)
  drawContributionCurves(
    method
  );

  // Sum of all terms
  drawInterpolatedCurve(
    method
  );

  drawSamplePoints();

  // Calculation at x*
  drawProbeContributions(
    method
  );

  drawProbe(
    method
  );

  drawLabels(
    method
  );
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  methodSelect.addEventListener(
    "change",
    draw
  );

  plot.addEventListener(
    "pointerdown",
    event => {
      plot.setPointerCapture(
        event.pointerId
      );

      handlePlotPointer(
        event
      );
    }
  );

  plot.addEventListener(
    "pointermove",
    event => {
      if (
        event.buttons === 1
      ) {
        handlePlotPointer(
          event
        );
      }
    }
  );

  draw();
}

init();