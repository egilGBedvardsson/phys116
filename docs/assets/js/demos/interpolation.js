// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SVG_NS =
  "http://www.w3.org/2000/svg";

const GRAPH = {
  width: 900,
  height: 520,

  x: 40,
  y: 40,

  plotWidth: 820,
  plotHeight: 430,

  xMax: 5,
  yMax: 1,

  interpolationSamples: 220
};


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

const samplePoints = [
  { x: 0,   y: 0.20 },
  { x: 0.5, y: 0.55 },
  { x: 1,   y: 0.80 },
  { x: 1.5, y: 0.35 },
  { x: 2,   y: 0.25 },
  { x: 2.5, y: 0.70 },
  { x: 3,   y: 0.95 },
  { x: 3.5, y: 0.45 },
  { x: 4,   y: 0.40 },
  { x: 4.5, y: 0.85 },
  { x: 5,   y: 1.00 }
];


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
  return (
    GRAPH.y +
    GRAPH.plotHeight -
    (value / GRAPH.yMax) *
      GRAPH.plotHeight
  );
}


// -----------------------------------------------------------------------------
// Interpolation
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

function findInterval(x) {
  const first =
    samplePoints[0];

  const last =
    samplePoints[
      samplePoints.length - 1
    ];

  if (x <= first.x) {
    return {
      left: first,
      right: first,
      t: 0
    };
  }

  if (x >= last.x) {
    return {
      left: last,
      right: last,
      t: 0
    };
  }

  let index = 0;

  while (
    index <
      samplePoints.length - 1 &&
    x >
      samplePoints[index + 1].x
  ) {
    index++;
  }

  const left =
    samplePoints[index];

  const right =
    samplePoints[index + 1];

  const span =
    right.x - left.x;

  const t =
    span === 0
      ? 0
      : (x - left.x) / span;

  return {
    left,
    right,
    t
  };
}

function linearInterpolation(
  left,
  right,
  t
) {
  return (
    left.y +
    (right.y - left.y) * t
  );
}

function nearestInterpolation(
  left,
  right,
  t
) {
  return (
    t < 0.5
      ? left.y
      : right.y
  );
}

function cosineInterpolation(
  left,
  right,
  t
) {
  const weight =
    (
      1 -
      Math.cos(t * Math.PI)
    ) / 2;

  return (
    left.y +
    (right.y - left.y) *
      weight
  );
}

function triangleInterpolation(x) {
  let numerator = 0;
  let denominator = 0;

  const spacing = 1;

  for (const point of samplePoints) {
    const distance =
      Math.abs(
        x - point.x
      );

    const weight =
      Math.max(
        0,
        1 -
          distance / spacing
      );

    if (weight > 0) {
      numerator +=
        point.y * weight;

      denominator += weight;
    }
  }

  return (
    denominator > 0
      ? numerator / denominator
      : samplePoints[0].y
  );
}

function sincInterpolation(x) {
  let numerator = 0;
  let denominator = 0;

  const spacing = 1;

  for (const point of samplePoints) {
    const offset =
      (x - point.x) /
      spacing;

    const weight =
      sinc(offset);

    numerator +=
      point.y * weight;

    denominator += weight;
  }

  return (
    denominator !== 0
      ? numerator / denominator
      : samplePoints[0].y
  );
}

function interpolate(method, x) {
  const {
    left,
    right,
    t
  } = findInterval(x);

  switch (method) {
    case "nearest":
      return nearestInterpolation(
        left,
        right,
        t
      );

    case "cosine":
      return cosineInterpolation(
        left,
        right,
        t
      );

    case "triangle":
      return triangleInterpolation(x);

    case "sinc":
      return sincInterpolation(x);

    case "linear":
    default:
      return linearInterpolation(
        left,
        right,
        t
      );
  }
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
    "Interpolert kurve",
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
    "Sample-punkter",
    {
      x: GRAPH.x + 170,
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
      x: GRAPH.x + 10,

      y:
        GRAPH.y +
        GRAPH.plotHeight +
        24,

      fill:
        plotColors.muted,

      "font-size": 13,
      "font-family":
        "sans-serif"
    }
  );
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
  drawInterpolatedCurve(method);
  drawSamplePoints();
  drawLabels(method);
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  methodSelect.addEventListener(
    "change",
    draw
  );

  draw();
}

init();