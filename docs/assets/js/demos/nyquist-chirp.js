// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const DURATION = 5;

const START_FREQUENCY = 1;
const END_FREQUENCY = 20;

const CONTINUOUS_SAMPLE_COUNT = 4000;
const PLOT_HEIGHT = 730;

const SINC_RADIUS = 20;


// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const plot =
  document.getElementById("plot");

const controls = {
  sampleRate:
    document.getElementById("fsSlider")
};

const readouts = {
  sampleRate:
    document.getElementById("fsVal")
};


// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

const plotColors = {
  ...DemoUtils.cssVars({
    background: ["--plot-bg", "#ffffff"],
    axis: ["--plot-axis", "#b8b8b8"],
    text: ["--plot-text", "#111111"],
    secondary: ["--plot-secondary", "#d11141"]
  })
};


// -----------------------------------------------------------------------------
// Spectrogram color scale
// -----------------------------------------------------------------------------

const COOLWARM_SCALE = [
  [0.0, "#3b4cc0"],
  [0.1, "#5673e0"],
  [0.2, "#7396f5"],
  [0.3, "#92b4fe"],
  [0.4, "#b2ccfb"],
  [0.5, "#dddcdc"],
  [0.6, "#f2cbb7"],
  [0.7, "#f7ac8e"],
  [0.8, "#ee8468"],
  [0.9, "#d65244"],
  [1.0, "#b40426"]
];


// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let plotWidth = 0;


// -----------------------------------------------------------------------------
// Continuous time axis
// -----------------------------------------------------------------------------

const continuousTime =
  Array.from(
    {
      length:
        CONTINUOUS_SAMPLE_COUNT
    },
    (_, index) =>
      (
        index *
        DURATION
      ) /
      CONTINUOUS_SAMPLE_COUNT
  );


// -----------------------------------------------------------------------------
// Signal
// -----------------------------------------------------------------------------

function chirp(time) {
  const sweepRate =
    (
      END_FREQUENCY -
      START_FREQUENCY
    ) /
    DURATION;

  const phase =
    START_FREQUENCY * time +
    0.5 *
      sweepRate *
      time *
      time;

  return Math.sin(
    2 * Math.PI * phase
  );
}

function instantaneousFrequency(time) {
  return (
    START_FREQUENCY +
    (
      END_FREQUENCY -
      START_FREQUENCY
    ) *
      time /
      DURATION
  );
}


// -----------------------------------------------------------------------------
// Sampling
// -----------------------------------------------------------------------------

function generateSampleTimes(sampleRate) {
  const sampleCount =
    Math.floor(
      DURATION * sampleRate
    );

  return Array.from(
    {
      length: sampleCount
    },
    (_, index) =>
      index / sampleRate
  );
}

function sampleSignal(sampleTimes) {
  return sampleTimes.map(chirp);
}


// -----------------------------------------------------------------------------
// Sinc reconstruction
// -----------------------------------------------------------------------------

function sinc(value) {
  if (Math.abs(value) < 1e-6) {
    return 1;
  }

  return (
    Math.sin(Math.PI * value) /
    (Math.PI * value)
  );
}

function sincReconstruct(
  evaluationTimes,
  sampleTimes,
  samples,
  sampleRate
) {
  const samplePeriod =
    1 / sampleRate;

  const reconstructed =
    new Array(
      evaluationTimes.length
    ).fill(0);

  for (
    let sampleIndex = 0;
    sampleIndex < sampleTimes.length;
    sampleIndex++
  ) {
    const sampleTime =
      sampleTimes[sampleIndex];

    const sampleValue =
      samples[sampleIndex];

    for (
      let evaluationIndex = 0;
      evaluationIndex < evaluationTimes.length;
      evaluationIndex++
    ) {
      const tau =
        (
          evaluationTimes[evaluationIndex] -
          sampleTime
        ) /
        samplePeriod;

      if (
        Math.abs(tau) <
        SINC_RADIUS
      ) {
        reconstructed[
          evaluationIndex
        ] +=
          sampleValue *
          sinc(tau);
      }
    }
  }

  return reconstructed;
}


// -----------------------------------------------------------------------------
// Spectrogram
// -----------------------------------------------------------------------------

function computeSpectrogram(
  signal,
  sampleRate
) {
  const rawWindowSize =
    Math.floor(
      0.8 * sampleRate
    );

  let windowSize =
    Math.max(
      8,
      rawWindowSize
    );

  windowSize =
    Math.min(
      windowSize,
      signal.length
    );

  if (windowSize % 2 === 1) {
    windowSize--;
  }

  if (windowSize < 4) {
    return {
      magnitude: [],
      time: [],
      frequency: []
    };
  }

  const hopSize =
    Math.max(
      1,
      Math.floor(
        windowSize / 8
      )
    );

  const padding =
    Math.floor(
      windowSize / 2
    );

  const fftSize =
    windowSize * 4;

  const paddedSignal = [
    ...new Array(
      padding
    ).fill(0),

    ...signal,

    ...new Array(
      padding
    ).fill(0)
  ];

  const frequencyAxis = [];

  for (
    let bin = 0;
    bin <= fftSize / 2;
    bin++
  ) {
    frequencyAxis.push(
      (
        bin *
        sampleRate
      ) /
      fftSize
    );
  }

  const spectra = [];
  const spectrogramTime = [];

  for (
    let start = 0;
    start + windowSize <=
      paddedSignal.length;
    start += hopSize
  ) {
    const segment =
      paddedSignal.slice(
        start,
        start + windowSize
      );

    // Hann window
    for (
      let index = 0;
      index < windowSize;
      index++
    ) {
      segment[index] *=
        0.5 *
        (
          1 -
          Math.cos(
            (
              2 *
              Math.PI *
              index
            ) /
            (windowSize - 1)
          )
        );
    }

    const magnitude = [];

    for (
      let bin = 0;
      bin <= fftSize / 2;
      bin++
    ) {
      let real = 0;
      let imaginary = 0;

      for (
        let index = 0;
        index < windowSize;
        index++
      ) {
        const angle =
          (
            -2 *
            Math.PI *
            bin *
            index
          ) /
          fftSize;

        real +=
          segment[index] *
          Math.cos(angle);

        imaginary +=
          segment[index] *
          Math.sin(angle);
      }

      const value =
        Math.sqrt(
          real * real +
          imaginary * imaginary
        ) /
        windowSize;

      magnitude.push(
        20 *
        Math.log10(
          value + 1e-12
        )
      );
    }

    spectrogramTime.push(
      (
        start -
        padding +
        windowSize / 2
      ) /
      sampleRate
    );

    spectra.push(magnitude);
  }

  // Plotly heatmaps expect rows to correspond
  // to the y-axis, so transpose the matrix.
  const transposed =
    frequencyAxis.map(
      (_, frequencyIndex) =>
        spectra.map(
          row =>
            row[frequencyIndex]
        )
    );

  return {
    magnitude: transposed,
    time: spectrogramTime,
    frequency: frequencyAxis
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
    plotWidth =
      measuredWidth;
  }

  return (
    plotWidth ||
    measuredWidth
  );
}


// -----------------------------------------------------------------------------
// Plotly traces
// -----------------------------------------------------------------------------

function buildTraces({
  continuousSignal,
  reconstructedSignal,
  sampleTimes,
  samples,
  spectrogram
}) {
  return [
    {
      x: continuousTime,
      y: continuousSignal,

      name: "Signal",

      line: {
        color: plotColors.text
      },

      opacity: 0.5,

      xaxis: "x",
      yaxis: "y"
    },

    {
      x: continuousTime,
      y: reconstructedSignal,

      name: "Rekonstruert",

      line: {
        color:
          plotColors.secondary
      },

      xaxis: "x",
      yaxis: "y"
    },

    {
      x: sampleTimes,
      y: samples,

      mode: "markers",
      name: "Målepunkter",

      marker: {
        color: plotColors.text,
        size: 4
      },

      xaxis: "x",
      yaxis: "y"
    },

    {
      z:
        spectrogram.magnitude,

      x:
        spectrogram.time,

      y:
        spectrogram.frequency,

      type: "heatmap",

      colorscale:
        COOLWARM_SCALE,

      zmin: -100,
      zmax: -20,

      zsmooth: false,
      showscale: false,

      xaxis: "x2",
      yaxis: "y2"
    }
  ];
}


// -----------------------------------------------------------------------------
// Plotly layout
// -----------------------------------------------------------------------------

function buildLayout(
  width,
  nyquistFrequency
) {
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
      b: 35
    },

    yaxis: {
      title: {
        text: "Amplitude",

        font: {
          size: 16
        }
      },

      tickfont: {
        size: 16
      },

      domain: [0.56, 0.98],
      range: [-1.2, 1.2],

      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,
      automargin: true
    },

    yaxis2: {
      title: {
        text: "Frekvens (Hz)",

        font: {
          size: 16
        }
      },

      tickfont: {
        size: 16
      },

      domain: [0.03, 0.44],

      range: [
        0,
        nyquistFrequency
      ],

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

      showticklabels: false,
      ticks: "",

      matches: "x2",

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
      side: "bottom",

      title: {
        text: "Tid (s)",

        font: {
          size: 18
        }
      },

      range: [
        0,
        DURATION
      ],

      showticklabels: true,
      showline: true,
      mirror: true,

      linecolor:
        plotColors.axis,

      linewidth: 1,

      tickfont: {
        size: 16
      },

      automargin: true
    },

    legend: {
      orientation: "h",

      x: 0,
      xanchor: "left",

      y: 1,
      yanchor: "bottom",

      font: {
        size: 14
      }
    }
  };
}


// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------

function renderPlot({
  remeasureWidth = false
} = {}) {
  const sampleRate =
    Number(
      controls.sampleRate.value
    );

  readouts.sampleRate.textContent =
    `${sampleRate} Hz`;

  const sampleTimes =
    generateSampleTimes(
      sampleRate
    );

  const samples =
    sampleSignal(
      sampleTimes
    );

  const continuousSignal =
    continuousTime.map(
      chirp
    );

  const reconstructedSignal =
    sincReconstruct(
      continuousTime,
      sampleTimes,
      samples,
      sampleRate
    );

  const spectrogram =
    computeSpectrogram(
      samples,
      sampleRate
    );

  const nyquistFrequency =
    sampleRate / 2;

  const width =
    remeasureWidth ||
    !plotWidth
      ? measurePlotWidth()
      : plotWidth;

  const traces =
    buildTraces({
      continuousSignal,
      reconstructedSignal,
      sampleTimes,
      samples,
      spectrogram
    });

  const layout =
    buildLayout(
      width,
      nyquistFrequency
    );

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
  controls.sampleRate.addEventListener(
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
