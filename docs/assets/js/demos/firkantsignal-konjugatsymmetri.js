// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const PERIOD = 1;
const FUNDAMENTAL_FREQUENCY = 3;
const ANGULAR_FREQUENCY =
  2 * Math.PI * FUNDAMENTAL_FREQUENCY;

const TIME_SAMPLE_COUNT = 4000;



// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const plot = document.getElementById("plot");

const controls = {
  phi: document.getElementById("phiSlider"),
  harmonics: document.getElementById("nSlider")
};

const readouts = {
  phi: document.getElementById("phiVal"),
  harmonics: document.getElementById("nVal")
};


// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

const plotColors = {
  ...DemoUtils.cssVars({
    background: ["--plot-bg", "#ffffff"],
    axis: ["--plot-axis", "#b8b8b8"],
    text: ["--plot-text", "#111111"],
    primary: ["--plot-primary", "#3b4cc0"],
    secondary: ["--plot-secondary", "#d11141"]
  })
};


// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let plotWidth = 0;


// -----------------------------------------------------------------------------
// Time axis
// -----------------------------------------------------------------------------

const timeAxis = Array.from(
  { length: TIME_SAMPLE_COUNT },
  (_, index) =>
    (index * PERIOD) /
    TIME_SAMPLE_COUNT
);


// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

function getControlValues() {
  return {
    phi: Number(controls.phi.value),
    harmonics: Number(controls.harmonics.value)
  };
}

function updateReadouts(values) {
  readouts.phi.textContent =
    `${values.phi.toFixed(2)} rad`;

  readouts.harmonics.textContent =
    `${values.harmonics}`;
}


// -----------------------------------------------------------------------------
// Fourier calculation
// -----------------------------------------------------------------------------

function computeSeries(phi, harmonicCount) {
  const idealReal =
    new Array(timeAxis.length).fill(0);

  const brokenReal =
    new Array(timeAxis.length).fill(0);

  const brokenImaginary =
    new Array(timeAxis.length).fill(0);

  for (
    let harmonicIndex = 0;
    harmonicIndex < harmonicCount;
    harmonicIndex++
  ) {
    const k =
      2 * harmonicIndex + 1;

    const positiveImaginaryCoefficient =
      -2 / (Math.PI * k);

    const negativeImaginaryCoefficient =
      2 / (Math.PI * k);

    for (
      let sampleIndex = 0;
      sampleIndex < timeAxis.length;
      sampleIndex++
    ) {
      const time =
        timeAxis[sampleIndex];

      const angle =
        k *
        ANGULAR_FREQUENCY *
        time;

      const negativeAngle =
        -angle;

      // ---------------------------------------------------------------
      // Ideal conjugate-symmetric pair
      // ---------------------------------------------------------------

      const positiveSine =
        Math.sin(angle);

      const negativeSine =
        Math.sin(negativeAngle);

      idealReal[sampleIndex] +=
        -positiveImaginaryCoefficient *
          positiveSine +
        -negativeImaginaryCoefficient *
          negativeSine;


      // ---------------------------------------------------------------
      // Broken conjugate symmetry:
      // phase shift applied only to the positive-frequency term
      // ---------------------------------------------------------------

      const shiftedAngle =
        angle + k * phi;

      const shiftedSine =
        Math.sin(shiftedAngle);

      const shiftedCosine =
        Math.cos(shiftedAngle);

      const negativeCosine =
        Math.cos(negativeAngle);

      brokenReal[sampleIndex] +=
        -positiveImaginaryCoefficient *
          shiftedSine +
        -negativeImaginaryCoefficient *
          negativeSine;

      brokenImaginary[sampleIndex] +=
        positiveImaginaryCoefficient *
          shiftedCosine +
        negativeImaginaryCoefficient *
          negativeCosine;
    }
  }

  return {
    idealReal,
    brokenReal,
    brokenImaginary
  };
}


// -----------------------------------------------------------------------------
// Plot sizing
// -----------------------------------------------------------------------------

function measurePlotWidth() {
  const measuredWidth =
    DemoUtils.measureElementWidth(
      plot
    );

  if (measuredWidth > 0) {
    plotWidth = measuredWidth;
  }

  return plotWidth || measuredWidth;
}


// -----------------------------------------------------------------------------
// Plotly traces
// -----------------------------------------------------------------------------

function buildTraces(data) {
  return [
    {
      x: timeAxis,
      y: data.idealReal,

      name:
        "Re (symmetrisk)",

      line: {
        color: plotColors.text,
        dash: "dash"
      }
    },

    {
      x: timeAxis,
      y: data.brokenReal,

      name:
        "Re (brutt)",

      line: {
        color: plotColors.secondary
      }
    },

    {
      x: timeAxis,
      y: data.brokenImaginary,

      name:
        "Im (brutt)",

      line: {
        color: plotColors.primary
      },

      xaxis: "x2",
      yaxis: "y2"
    }
  ];
}


// -----------------------------------------------------------------------------
// Plotly layout
// -----------------------------------------------------------------------------

function buildLayout(width) {
  return {
    font: {
      family:
        "Times New Roman, Times, serif",
      size: 16
    },

    paper_bgcolor:
      plotColors.background,

    plot_bgcolor:
      plotColors.background,

    autosize: false,
    width,
    height: DemoUtils.plotHeight(320, 420, 0.5),

    margin: {
      l: width < 480 ? 48 : 62,
      r: 12,
      t: 50,
      b: 42
    },

    legend: {
      orientation: "h",

      x: 0,
      xanchor: "left",

      y: 1.08,
      yanchor: "bottom",

      font: {
        size: 14
      },

      entrywidthmode: "fraction",
      entrywidth: 0.32
    },

    yaxis: {
      title: {
        text: "Reell del",
        font: {
          size: 16
        }
      },

      tickfont: {
        size: 16
      },

      range: [-1.5, 1.5],
      domain: [0.55, 0.98],

      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,
      automargin: true
    },

    yaxis2: {
      title: {
        text: "Imaginær del",
        font: {
          size: 16
        }
      },

      tickfont: {
        size: 16
      },

      range: [-2, 2],
      domain: [0.02, 0.45],

      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,
      automargin: true
    },

    xaxis: {
      anchor: "y",
      domain: [0, 1],
      matches: "x2",
      showticklabels: false,

      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,

      tickfont: {
        size: 16
      }
    },

    xaxis2: {
      anchor: "y2",
      domain: [0, 1],
      title: {
        text: "Tid (s)",
        font: {
          size: 16
        }
      },

      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,

      tickfont: {
        size: 16
      },

      automargin: true
    }
  };
}


// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

function renderPlot({
  remeasureWidth = false
} = {}) {
  if (typeof Plotly === "undefined") {
    plot.textContent = "Kunne ikke laste diagramverktøyet. Last siden på nytt når du har nettilgang.";
    return;
  }
  const values =
    getControlValues();

  updateReadouts(values);

  const data =
    computeSeries(
      values.phi,
      values.harmonics
    );

  const peakImaginary = Math.max(...data.brokenImaginary.map(Math.abs));
  document.getElementById("seriesSummary").textContent =
    `Fase ${values.phi.toFixed(2)} rad. ${values.harmonics} odde harmoniske ledd. Største imaginære amplitude: ${peakImaginary.toFixed(3)}.`;

  const width =
    remeasureWidth ||
    !plotWidth
      ? measurePlotWidth()
      : plotWidth;

  const traces =
    buildTraces(data);

  const layout =
    buildLayout(width);

  Plotly.react(
    plot,
    traces,
    layout,
    {
      responsive: false,
      scrollZoom: false
    }
  );
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  document.getElementById("resetPhase").addEventListener("click", () => {
    controls.phi.value = "0";
    renderPlot();
  });
  controls.phi.addEventListener(
    "input",
    () => {
      renderPlot();
    }
  );

  controls.harmonics.addEventListener(
    "input",
    () => {
      renderPlot();
    }
  );

  window.addEventListener(
    "resize",
    () => {
      renderPlot({
        remeasureWidth: true
      });
    },
    {
      passive: true
    }
  );

  DemoUtils.runAfterLayoutSettles(() => {
    renderPlot({
      remeasureWidth: true
    });
  });
}

init();
