// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const PERIOD = 1;
const FUNDAMENTAL_FREQUENCY = 3;
const ANGULAR_FREQUENCY =
  2 * Math.PI * FUNDAMENTAL_FREQUENCY;

const TIME_SAMPLE_COUNT = 4000;
const PLOT_HEIGHT = 590;


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
  background: DemoUtils.cssVar(
    "--plot-bg",
    "#ffffff"
  ),

  axis: DemoUtils.cssVar(
    "--plot-axis",
    "#b8b8b8"
  ),

  text: DemoUtils.cssVar(
    "--plot-text",
    "#111111"
  ),

  primary: DemoUtils.cssVar(
    "--plot-primary",
    "#3b4cc0"
  ),

  secondary: DemoUtils.cssVar(
    "--plot-secondary",
    "#d11141"
  )
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
    Math.max(
      320,
      Math.floor(plot.clientWidth)
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
        "Ideell (symmetrisk konjugering)",

      line: {
        color: plotColors.text,
        dash: "dash"
      }
    },

    {
      x: timeAxis,
      y: data.brokenReal,

      name:
        "Brutt par (Reell del)",

      line: {
        color: plotColors.secondary
      }
    },

    {
      x: timeAxis,
      y: data.brokenImaginary,

      name:
        "Imaginær lekkasje",

      line: {
        color: plotColors.primary
      },

      xaxis: "x",
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
    height: PLOT_HEIGHT,

    margin: {
      l: 75,
      r: 35,
      t: 58,
      b: 20
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
      title: {
        text: "Tid (s)",
        font: {
          size: 22
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
  const values =
    getControlValues();

  updateReadouts(values);

  const data =
    computeSeries(
      values.phi,
      values.harmonics
    );

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
      responsive: false
    }
  );
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
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

  /*
   * This demo is commonly embedded in another page.
   * A couple of delayed measurements ensure Plotly sees
   * the final available width after the surrounding layout
   * has settled.
   */

  renderPlot({
    remeasureWidth: true
  });

  requestAnimationFrame(() => {
    renderPlot({
      remeasureWidth: true
    });
  });

  window.addEventListener(
    "load",
    () => {
      renderPlot({
        remeasureWidth: true
      });
    },
    {
      once: true
    }
  );

  setTimeout(() => {
    renderPlot({
      remeasureWidth: true
    });
  }, 120);
}

init();