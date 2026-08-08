// =============================================================================
// FIR filter demo
// =============================================================================


// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SAMPLE_RATE = 256;
const SAMPLE_COUNT = 256;
const RESPONSE_BINS = 256;

const NYQUIST_FREQUENCY = SAMPLE_RATE / 2;

const MIN_BAND_WIDTH_HZ = 10;

// The notch control specifies its center frequency.
// A fixed 20 Hz stop band keeps the UI simple while still producing
// a visible notch with the default 31-tap Hamming-window FIR filter.
const NOTCH_BANDWIDTH_HZ = 20;


// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const controls = {
  signalType: document.getElementById("signalType"),

  f1: document.getElementById("f1"),
  f2: document.getElementById("f2"),
  noise: document.getElementById("noise"),

  filterType: document.getElementById("filterType"),

  cutoff: document.getElementById("cutoff"),

  bandLow: document.getElementById("bandLow"),
  bandHigh: document.getElementById("bandHigh"),

  movingAverageLength:
    document.getElementById("movingAverageLength"),

  kernelLength:
    document.getElementById("kernelLength"),

  passes:
    document.getElementById("passes")
};


const readouts = {
  f1: document.getElementById("f1Val"),
  f2: document.getElementById("f2Val"),
  noise: document.getElementById("noiseVal"),

  cutoff: document.getElementById("cutoffVal"),

  bandLow: document.getElementById("bandLowVal"),
  bandHigh: document.getElementById("bandHighVal"),

  movingAverageLength:
    document.getElementById("movingAverageLengthVal"),

  kernelLength:
    document.getElementById("kernelLengthVal"),

  passes:
    document.getElementById("passesVal")
};

const filterControls = {
  cutoff:
    document.getElementById("cutoffControl"),

  cutoffLabel:
    document.getElementById("cutoffLabel"),

  band:
    document.getElementById("bandControl"),

  movingAverage:
    document.getElementById("movingAverageControl")
};


const summary =
  document.getElementById("summary");

const plotLegend =
  document.getElementById("plotLegend");


const outputCanvas =
  document.getElementById("outputCanvas");

const impulseCanvas =
  document.getElementById("impulseCanvas");

const responseCanvas =
  document.getElementById("responseCanvas");


const outputCtx =
  outputCanvas.getContext("2d");

const impulseCtx =
  impulseCanvas.getContext("2d");

const responseCtx =
  responseCanvas.getContext("2d");


// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

const plotColors = {
  background:
    DemoUtils.cssVar(
      "--theme-surface-bg",
      "#ffffff"
    ),

  grid:
    DemoUtils.cssVar(
      "--plot-grid",
      "#e4e4e4"
    ),

  axis:
    DemoUtils.cssVar(
      "--plot-axis-soft",
      "#bbbbbb"
    ),

  text:
    DemoUtils.cssVar(
      "--plot-text",
      "#111111"
    ),

  muted:
    DemoUtils.cssVar(
      "--plot-muted",
      "#666666"
    )
};


// -----------------------------------------------------------------------------
// General math helpers
// -----------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}


function sinc(x) {
  if (Math.abs(x) < 1e-12) {
    return 1;
  }

  return (
    Math.sin(Math.PI * x) /
    (Math.PI * x)
  );
}


function seededNoise(index) {
  const x =
    Math.sin(
      index * 78.233 + 0.918
    ) *
    43758.5453;

  return (
    (x - Math.floor(x)) * 2 - 1
  );
}


function hamming(index, length) {
  if (length <= 1) {
    return 1;
  }

  return (
    0.54 -
    0.46 *
      Math.cos(
        (2 * Math.PI * index) /
        (length - 1)
      )
  );
}


function hzToCyclesPerSample(frequencyHz) {
  return clamp(
    frequencyHz / SAMPLE_RATE,
    1e-6,
    0.499
  );
}


// -----------------------------------------------------------------------------
// Convolution
// -----------------------------------------------------------------------------

function convolve(a, b) {
  const output =
    new Array(
      a.length + b.length - 1
    ).fill(0);

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    for (
      let j = 0;
      j < b.length;
      j++
    ) {
      output[i + j] +=
        a[i] * b[j];
    }
  }

  return output;
}


function convolveSame(signal, kernel) {
  const full =
    convolve(signal, kernel);

  const start =
    Math.floor(
      (kernel.length - 1) / 2
    );

  return full.slice(
    start,
    start + signal.length
  );
}


// -----------------------------------------------------------------------------
// FIR kernels
// -----------------------------------------------------------------------------

function lowpassKernel(
  length,
  cutoffCyclesPerSample
) {
  const order =
    length - 1;

  const center =
    order / 2;

  const kernel =
    new Array(length);

  for (
    let n = 0;
    n < length;
    n++
  ) {
    const m =
      n - center;

    const ideal =
      2 *
      cutoffCyclesPerSample *
      sinc(
        2 *
        cutoffCyclesPerSample *
        m
      );

    kernel[n] =
      ideal *
      hamming(n, length);
  }

  // Normalize DC gain to 1.
  const sum =
    kernel.reduce(
      (total, value) =>
        total + value,
      0
    );

  if (Math.abs(sum) > 1e-12) {
    for (
      let i = 0;
      i < kernel.length;
      i++
    ) {
      kernel[i] /= sum;
    }
  }

  return kernel;
}


function highpassKernel(
  length,
  cutoffCyclesPerSample
) {
  const lowpass =
    lowpassKernel(
      length,
      cutoffCyclesPerSample
    );

  const center =
    Math.floor(length / 2);

  const highpass =
    lowpass.map(
      value => -value
    );

  // Spectral inversion
  highpass[center] += 1;

  return highpass;
}


function bandpassKernel(
  length,
  lowCutoff,
  highCutoff
) {
  const upperLowpass =
    lowpassKernel(
      length,
      highCutoff
    );

  const lowerLowpass =
    lowpassKernel(
      length,
      lowCutoff
    );

  return upperLowpass.map(
    (value, index) =>
      value -
      lowerLowpass[index]
  );
}


function notchKernel(
  length,
  lowCutoff,
  highCutoff
) {
  const bandpass =
    bandpassKernel(
      length,
      lowCutoff,
      highCutoff
    );

  const center =
    Math.floor(length / 2);

  const notch =
    bandpass.map(
      value => -value
    );

  // Spectral inversion
  notch[center] += 1;

  return notch;
}


function movingAverageKernel(length) {
  return new Array(length).fill(
    1 / length
  );
}


// -----------------------------------------------------------------------------
// Frequency response
// -----------------------------------------------------------------------------

function magnitudeResponse(
  kernel,
  bins = RESPONSE_BINS
) {
  const magnitude = [];
  const frequency = [];

  for (
    let i = 0;
    i < bins;
    i++
  ) {
    const omega =
      (Math.PI * i) /
      (bins - 1);

    let real = 0;
    let imaginary = 0;

    for (
      let n = 0;
      n < kernel.length;
      n++
    ) {
      real +=
        kernel[n] *
        Math.cos(omega * n);

      imaginary -=
        kernel[n] *
        Math.sin(omega * n);
    }

    magnitude.push(
      Math.hypot(
        real,
        imaginary
      )
    );

    frequency.push(
      (i / (bins - 1)) *
      NYQUIST_FREQUENCY
    );
  }

  return {
    magnitude,
    frequency
  };
}


function normalizeByPeak(kernel) {
  const { magnitude } =
    magnitudeResponse(kernel);

  const peak =
    Math.max(
      ...magnitude,
      1e-9
    );

  return kernel.map(
    value =>
      value / peak
  );
}


// -----------------------------------------------------------------------------
// Signal generation
// -----------------------------------------------------------------------------

function generateSignal() {
  const f1 =
    Number(controls.f1.value);

  const f2 =
    Number(controls.f2.value);

  const noiseLevel =
    Number(controls.noise.value);

  const duration =
    SAMPLE_COUNT /
    SAMPLE_RATE;

  const signal =
    new Array(SAMPLE_COUNT);

  for (
    let n = 0;
    n < SAMPLE_COUNT;
    n++
  ) {
    const time =
      n / SAMPLE_RATE;

    let value = 0;

    switch (
      controls.signalType.value
    ) {
      case "tone":
        value =
          Math.sin(
            2 *
            Math.PI *
            f1 *
            time
          );
        break;


      case "twoTone":
        value =
          0.7 *
            Math.sin(
              2 *
              Math.PI *
              f1 *
              time
            ) +
          0.55 *
            Math.sin(
              2 *
              Math.PI *
              f2 *
              time
            );
        break;


      case "square":
        value =
          Math.sign(
            Math.sin(
              2 *
              Math.PI *
              f1 *
              time
            )
          );
        break;


      case "chirp":
        value =
          Math.sin(
            2 *
            Math.PI *
            (
              f1 * time +
              (
                (f2 - f1) *
                time *
                time
              ) /
              (2 * duration)
            )
          );
        break;


      case "impulse":
        value =
          n ===
          Math.floor(
            SAMPLE_COUNT / 4
          )
            ? 1
            : 0;
        break;


      case "noise":
        value =
          seededNoise(n);
        break;
    }

    signal[n] =
      value +
      noiseLevel *
      seededNoise(n + 900);
  }

  return signal;
}


// -----------------------------------------------------------------------------
// Filter settings
// -----------------------------------------------------------------------------

function getFilterSettings() {
  return {
    type:
      controls.filterType.value,

    kernelLength:
      Number(
        controls.kernelLength.value
      ),

    movingAverageLength:
      Number(
        controls.movingAverageLength.value
      ),

    passes:
      Number(
        controls.passes.value
      ),

    cutoffHz:
      Number(
        controls.cutoff.value
      ),

    bandLowHz:
      Number(
        controls.bandLow.value
      ),

    bandHighHz:
      Number(
        controls.bandHigh.value
      )
  };
}


// -----------------------------------------------------------------------------
// Filter construction
// -----------------------------------------------------------------------------

function buildSinglePassKernel(
  settings
) {
  switch (settings.type) {
    case "none":
      return {
        kernel: [1]
      };


    case "moving-average":
      return {
        kernel:
          movingAverageKernel(
            settings.movingAverageLength
          )
      };


    case "lowpass":
      return {
        kernel:
          lowpassKernel(
            settings.kernelLength,
            hzToCyclesPerSample(
              settings.cutoffHz
            )
          ),

        cutoffHz:
          settings.cutoffHz
      };


    case "highpass":
      return {
        kernel:
          highpassKernel(
            settings.kernelLength,
            hzToCyclesPerSample(
              settings.cutoffHz
            )
          ),

        cutoffHz:
          settings.cutoffHz
      };


    case "bandpass":
      return {
        kernel:
          bandpassKernel(
            settings.kernelLength,

            hzToCyclesPerSample(
              settings.bandLowHz
            ),

            hzToCyclesPerSample(
              settings.bandHighHz
            )
          ),

        bandLowHz:
          settings.bandLowHz,

        bandHighHz:
          settings.bandHighHz
      };


    case "notch": {
      const halfWidth =
        NOTCH_BANDWIDTH_HZ / 2;

      const lowHz =
        clamp(
          settings.cutoffHz -
            halfWidth,
          1,
          NYQUIST_FREQUENCY - 2
        );

      const highHz =
        clamp(
          settings.cutoffHz +
            halfWidth,
          lowHz + 1,
          NYQUIST_FREQUENCY - 1
        );

      return {
        kernel:
          notchKernel(
            settings.kernelLength,

            hzToCyclesPerSample(
              lowHz
            ),

            hzToCyclesPerSample(
              highHz
            )
          ),

        notchCenterHz:
          settings.cutoffHz,

        notchLowHz:
          lowHz,

        notchHighHz:
          highHz
      };
    }


    default:
      return {
        kernel: [1]
      };
  }
}


function buildFilter() {
  const settings =
    getFilterSettings();

  const filter =
    buildSinglePassKernel(
      settings
    );

  let singlePass =
    normalizeByPeak(
      filter.kernel
    );

  let total = [1];

  const passes =
    settings.type === "none"
      ? 1
      : settings.passes;

  for (
    let i = 0;
    i < passes;
    i++
  ) {
    total =
      convolve(
        total,
        singlePass
      );
  }

  total =
    normalizeByPeak(total);

  return {
    ...filter,
    total,
    passes
  };
}


// -----------------------------------------------------------------------------
// Canvas helpers
// -----------------------------------------------------------------------------

function clearCanvas(
  context,
  canvas
) {
  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.fillStyle =
    plotColors.background;

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );
}


function drawGrid(
  context,
  canvas
) {
  const width =
    canvas.width;

  const height =
    canvas.height;

  context.strokeStyle =
    plotColors.grid;

  context.lineWidth = 1;

  for (
    let i = 1;
    i < 4;
    i++
  ) {
    const y =
      (height * i) / 4;

    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  for (
    let i = 1;
    i < 5;
    i++
  ) {
    const x =
      (width * i) / 5;

    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}


// -----------------------------------------------------------------------------
// Plot interpolation
// -----------------------------------------------------------------------------

function sincInterpolate(
  samples,
  outputCount,
  radius = 14
) {
  const maxIndex =
    samples.length - 1;

  const output =
    new Array(outputCount);

  for (
    let i = 0;
    i < outputCount;
    i++
  ) {
    const x =
      (
        i /
        Math.max(
          1,
          outputCount - 1
        )
      ) *
      maxIndex;

    const center =
      Math.floor(x);

    const minIndex =
      Math.max(
        0,
        center - radius
      );

    const maxSampleIndex =
      Math.min(
        maxIndex,
        center + radius
      );

    let accumulator = 0;
    let weightSum = 0;

    for (
      let k = minIndex;
      k <= maxSampleIndex;
      k++
    ) {
      const distance =
        x - k;

      if (
        Math.abs(distance) >=
        radius
      ) {
        continue;
      }

      const weight =
        sinc(distance) *
        sinc(
          distance / radius
        );

      accumulator +=
        samples[k] *
        weight;

      weightSum +=
        weight;
    }

    output[i] =
      weightSum !== 0
        ? accumulator /
          weightSum
        : samples[center];
  }

  return output;
}


// -----------------------------------------------------------------------------
// Main signal plot
// -----------------------------------------------------------------------------

function drawMainPlot(
  input,
  output
) {
  clearCanvas(
    outputCtx,
    outputCanvas
  );

  drawGrid(
    outputCtx,
    outputCanvas
  );

  const width =
    outputCanvas.width;

  const height =
    outputCanvas.height;

  const denseCount =
    Math.max(
      width,
      input.length
    );

  const smoothInput =
    sincInterpolate(
      input,
      denseCount
    );

  const smoothOutput =
    sincInterpolate(
      output,
      denseCount
    );

  const maxAbs =
    Math.max(
      1e-6,
      ...smoothInput.map(Math.abs),
      ...smoothOutput.map(Math.abs)
    );

  function mapX(index, length) {
    return (
      index /
      Math.max(
        1,
        length - 1
      )
    ) *
    width;
  }

  function mapY(value) {
    return (
      height / 2 -
      (value / maxAbs) *
      (height * 0.42)
    );
  }


  // Input signal
  outputCtx.strokeStyle =
    plotColors.axis;

  outputCtx.lineWidth = 1.5;
  outputCtx.beginPath();

  smoothInput.forEach(
    (value, index) => {
      const x =
        mapX(
          index,
          smoothInput.length
        );

      const y =
        mapY(value);

      if (index === 0) {
        outputCtx.moveTo(x, y);
      } else {
        outputCtx.lineTo(x, y);
      }
    }
  );

  outputCtx.stroke();


  // Filtered signal
  outputCtx.strokeStyle =
    plotColors.text;

  outputCtx.lineWidth = 2;
  outputCtx.beginPath();

  smoothOutput.forEach(
    (value, index) => {
      const x =
        mapX(
          index,
          smoothOutput.length
        );

      const y =
        mapY(value);

      if (index === 0) {
        outputCtx.moveTo(x, y);
      } else {
        outputCtx.lineTo(x, y);
      }
    }
  );

  outputCtx.stroke();
}


// -----------------------------------------------------------------------------
// Impulse response plot
// -----------------------------------------------------------------------------

function drawImpulse(kernel) {
  clearCanvas(
    impulseCtx,
    impulseCanvas
  );

  drawGrid(
    impulseCtx,
    impulseCanvas
  );

  const width =
    impulseCanvas.width;

  const height =
    impulseCanvas.height;

  const maxAbs =
    Math.max(
      1e-6,
      ...kernel.map(Math.abs)
    );

  impulseCtx.strokeStyle =
    plotColors.text;

  impulseCtx.lineWidth = 1.4;
  impulseCtx.beginPath();

  kernel.forEach(
    (value, index) => {
      const x =
        (
          index /
          Math.max(
            1,
            kernel.length - 1
          )
        ) *
        width;

      const y =
        height / 2 -
        (value / maxAbs) *
        (height * 0.42);

      if (index === 0) {
        impulseCtx.moveTo(x, y);
      } else {
        impulseCtx.lineTo(x, y);
      }
    }
  );

  impulseCtx.stroke();

  impulseCtx.fillStyle =
    plotColors.text;

  impulseCtx.font =
    "15px Times New Roman";

  impulseCtx.fillText(
    "Impulsrespons h[n]",
    12,
    22
  );
}


// -----------------------------------------------------------------------------
// Frequency-response plot
// -----------------------------------------------------------------------------

function drawResponse(kernel) {
  clearCanvas(
    responseCtx,
    responseCanvas
  );

  drawGrid(
    responseCtx,
    responseCanvas
  );

  const {
    magnitude,
    frequency
  } =
    magnitudeResponse(
      kernel,
      260
    );

  const decibels =
    magnitude.map(
      value =>
        20 *
        Math.log10(
          value + 1e-8
        )
    );

  const minDb = -60;
  const maxDb = 6;

  const width =
    responseCanvas.width;

  const height =
    responseCanvas.height;

  responseCtx.strokeStyle =
    plotColors.text;

  responseCtx.lineWidth = 1.7;
  responseCtx.beginPath();

  decibels.forEach(
    (value, index) => {
      const x =
        (
          index /
          (decibels.length - 1)
        ) *
        width;

      const db =
        clamp(
          value,
          minDb,
          maxDb
        );

      const y =
        height -
        (
          (db - minDb) /
          (maxDb - minDb)
        ) *
        (height - 20) -
        10;

      if (index === 0) {
        responseCtx.moveTo(
          x,
          y
        );
      } else {
        responseCtx.lineTo(
          x,
          y
        );
      }
    }
  );

  responseCtx.stroke();


  responseCtx.fillStyle =
    plotColors.text;

  responseCtx.font =
    "15px Times New Roman";

  responseCtx.fillText(
    "|H(f)| i dB",
    12,
    22
  );


  responseCtx.fillStyle =
    plotColors.muted;

  responseCtx.font =
    "13px Times New Roman";

  responseCtx.fillText(
    "0 Hz",
    8,
    height - 8
  );

  responseCtx.fillText(
    `${Math.round(
      frequency[
        frequency.length - 1
      ]
    )} Hz`,
    width - 48,
    height - 8
  );
}


// -----------------------------------------------------------------------------
// Filter-control visibility
// -----------------------------------------------------------------------------

function updateFilterControls() {
  const type =
    controls.filterType.value;

  const usesCutoff =
    type === "lowpass" ||
    type === "highpass" ||
    type === "notch";

  filterControls.cutoff.hidden =
    !usesCutoff;

  filterControls.band.hidden =
    type !== "bandpass";

  filterControls.movingAverage.hidden =
    type !== "moving-average";

  filterControls.cutoffLabel.textContent =
    type === "notch"
      ? "Notch-senter"
      : "Grensefrekvens";
}


// -----------------------------------------------------------------------------
// Band-pass constraints
// -----------------------------------------------------------------------------

function enforceBandLimits(
  changedControl
) {
  let low =
    Number(
      controls.bandLow.value
    );

  let high =
    Number(
      controls.bandHigh.value
    );

  if (
    high - low >=
    MIN_BAND_WIDTH_HZ
  ) {
    return;
  }

  if (
    changedControl ===
    controls.bandLow
  ) {
    low =
      high -
      MIN_BAND_WIDTH_HZ;

    low =
      clamp(
        low,
        Number(
          controls.bandLow.min
        ),
        Number(
          controls.bandLow.max
        )
      );

    controls.bandLow.value =
      low;
  } else {
    high =
      low +
      MIN_BAND_WIDTH_HZ;

    high =
      clamp(
        high,
        Number(
          controls.bandHigh.min
        ),
        Number(
          controls.bandHigh.max
        )
      );

    controls.bandHigh.value =
      high;
  }
}


// -----------------------------------------------------------------------------
// UI readouts
// -----------------------------------------------------------------------------

function updateReadouts() {
  readouts.f1.textContent =
    `${controls.f1.value} Hz`;

  readouts.f2.textContent =
    `${controls.f2.value} Hz`;

  readouts.noise.textContent =
    Number(
      controls.noise.value
    ).toFixed(2);

  readouts.cutoff.textContent =
    `${controls.cutoff.value} Hz`;

  readouts.bandLow.textContent =
    `${controls.bandLow.value} Hz`;

  readouts.bandHigh.textContent =
    `${controls.bandHigh.value} Hz`;

  readouts.movingAverageLength.textContent =
    controls.movingAverageLength.value;

  readouts.kernelLength.textContent =
    controls.kernelLength.value;

  readouts.passes.textContent =
    controls.passes.value;
}


function formatHz(value) {
  return `${Math.round(value)} Hz`;
}


// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

function updateSummary(filterState) {
  const selectedSignal =
    controls.signalType.options[
      controls.signalType.selectedIndex
    ].text;

  const selectedFilter =
    controls.filterType.options[
      controls.filterType.selectedIndex
    ].text;

  const details = [
    `Signal: ${selectedSignal}`,
    `Filter: ${selectedFilter}`
  ];


  switch (
    controls.filterType.value
  ) {
    case "moving-average":
      details.push(
        `Vinduslengde: ${controls.movingAverageLength.value}`
      );
      break;


    case "lowpass":
      details.push(
        `Grense: ${formatHz(
          filterState.cutoffHz
        )}`
      );
      break;


    case "highpass":
      details.push(
        `Grense: ${formatHz(
          filterState.cutoffHz
        )}`
      );
      break;


    case "bandpass":
      details.push(
        `Bånd: ${formatHz(
          filterState.bandLowHz
        )}–${formatHz(
          filterState.bandHighHz
        )}`
      );
      break;


    case "notch":
      details.push(
        `Senter: ${formatHz(
          filterState.notchCenterHz
        )}`
      );

      details.push(
        `Stopbånd: ${formatHz(
          filterState.notchLowHz
        )}–${formatHz(
          filterState.notchHighHz
        )}`
      );
      break;
  }


  if (
    controls.filterType.value !==
    "none"
  ) {
    details.push(
      `Konvolusjoner: ${filterState.passes}`
    );

    details.push(
      `Effektiv lengde: ${filterState.total.length}`
    );
  }


  summary.textContent =
    details.join(" | ");

  plotLegend.textContent =
    "Inngang x[n] (grå) + utgang y[n] (svart)";
}


// -----------------------------------------------------------------------------
// Refresh
// -----------------------------------------------------------------------------

function refresh() {
  updateFilterControls();
  updateReadouts();

  const input =
    generateSignal();

  const filterState =
    buildFilter();

  const output =
    convolveSame(
      input,
      filterState.total
    );

  drawMainPlot(
    input,
    output
  );

  drawImpulse(
    filterState.total
  );

  drawResponse(
    filterState.total
  );

  updateSummary(
    filterState
  );
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  // Signal controls
  controls.signalType.addEventListener(
    "change",
    refresh
  );

  controls.f1.addEventListener(
    "input",
    refresh
  );

  controls.f2.addEventListener(
    "input",
    refresh
  );

  controls.noise.addEventListener(
    "input",
    refresh
  );


  // Filter selection
  controls.filterType.addEventListener(
    "change",
    refresh
  );


  // Filter parameters
  controls.cutoff.addEventListener(
    "input",
    refresh
  );

  controls.bandLow.addEventListener(
    "input",
    () => {
      enforceBandLimits(
        controls.bandLow
      );

      refresh();
    }
  );

  controls.bandHigh.addEventListener(
    "input",
    () => {
      enforceBandLimits(
        controls.bandHigh
      );

      refresh();
    }
  );

  controls.movingAverageLength.addEventListener(
    "input",
    refresh
  );

  controls.kernelLength.addEventListener(
    "input",
    refresh
  );

  controls.passes.addEventListener(
    "input",
    refresh
  );


  enforceBandLimits(
    controls.bandHigh
  );

  refresh();
}

init();