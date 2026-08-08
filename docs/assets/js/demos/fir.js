// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const SAMPLE_RATE = 256;
const SAMPLE_COUNT = 256;
const RESPONSE_BINS = 256;

// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const controls = {
  signalType: document.getElementById("signalType"),
  f1: document.getElementById("f1"),
  f2: document.getElementById("f2"),
  noise: document.getElementById("noise"),
  kernelLength: document.getElementById("kernelLength"),
  passes: document.getElementById("passes"),
  smooth: document.getElementById("smooth"),
  low: document.getElementById("low"),
  high: document.getElementById("high"),
  band: document.getElementById("band"),
  notch: document.getElementById("notch")
};

const readouts = {
  f1: document.getElementById("f1Val"),
  f2: document.getElementById("f2Val"),
  noise: document.getElementById("noiseVal"),
  kernelLength: document.getElementById("kernelLengthVal"),
  passes: document.getElementById("passesVal"),
  smooth: document.getElementById("smoothVal"),
  low: document.getElementById("lowVal"),
  high: document.getElementById("highVal"),
  band: document.getElementById("bandVal"),
  notch: document.getElementById("notchVal")
};

const summary = document.getElementById("summary");
const plotLegend = document.getElementById("plotLegend");

const outputCanvas = document.getElementById("outputCanvas");
const impulseCanvas = document.getElementById("impulseCanvas");
const responseCanvas = document.getElementById("responseCanvas");

const outputCtx = outputCanvas.getContext("2d");
const impulseCtx = impulseCanvas.getContext("2d");
const responseCtx = responseCanvas.getContext("2d");

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------


const plotColors = {
  background: DemoUtils.cssVar("--theme-surface-bg", "#ffffff"),
  grid: DemoUtils.cssVar("--plot-grid", "#e4e4e4"),
  axis: DemoUtils.cssVar("--plot-axis-soft", "#bbbbbb"),
  text: DemoUtils.cssVar("--plot-text", "#111111"),
  muted: DemoUtils.cssVar("--plot-muted", "#666666")
};

// -----------------------------------------------------------------------------
// General math helpers
// -----------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sinc(x) {
  if (Math.abs(x) < 1e-12) {
    return 1;
  }

  return Math.sin(Math.PI * x) / (Math.PI * x);
}

function seededNoise(index) {
  const x =
    Math.sin(index * 78.233 + 0.918) *
    43758.5453;

  return (x - Math.floor(x)) * 2 - 1;
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

// -----------------------------------------------------------------------------
// Convolution
// -----------------------------------------------------------------------------

function convolve(a, b) {
  const output =
    new Array(
      a.length + b.length - 1
    ).fill(0);

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
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
  const order = length - 1;
  const center = order / 2;

  const kernel =
    new Array(length);

  for (let n = 0; n < length; n++) {
    const m = n - center;

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

  const sum =
    kernel.reduce(
      (accumulator, value) =>
        accumulator + value,
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
    lowpass.map(value => -value);

  highpass[center] += 1;

  return highpass;
}

function bandpassKernel(
  length,
  lowCut,
  highCut
) {
  const high =
    lowpassKernel(
      length,
      highCut
    );

  const low =
    lowpassKernel(
      length,
      lowCut
    );

  return high.map(
    (value, index) =>
      value - low[index]
  );
}

function notchKernel(
  length,
  lowCut,
  highCut
) {
  const bandpass =
    bandpassKernel(
      length,
      lowCut,
      highCut
    );

  const center =
    Math.floor(length / 2);

  const notch =
    bandpass.map(value => -value);

  notch[center] += 1;

  return notch;
}

function movingAverageKernel(length) {
  return new Array(length).fill(
    1 / length
  );
}

function identityKernel(length) {
  const kernel =
    new Array(length).fill(0);

  kernel[
    Math.floor(length / 2)
  ] = 1;

  return kernel;
}

function blendKernel(
  kernel,
  strength
) {
  const identity =
    identityKernel(kernel.length);

  return kernel.map(
    (value, index) =>
      (1 - strength) *
        identity[index] +
      strength * value
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

  for (let i = 0; i < bins; i++) {
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
      Math.sqrt(
        real * real +
          imaginary * imaginary
      )
    );

    frequency.push(
      (i / (bins - 1)) *
        (SAMPLE_RATE / 2)
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
    value => value / peak
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
                ((f2 - f1) *
                  time *
                  time) /
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
// Filter construction
// -----------------------------------------------------------------------------

function getFilterSettings() {
  return {
    length:
      Number(
        controls.kernelLength.value
      ),

    passes:
      Number(
        controls.passes.value
      ),

    smooth:
      Number(
        controls.smooth.value
      ) / 100,

    low:
      Number(
        controls.low.value
      ) / 100,

    high:
      Number(
        controls.high.value
      ) / 100,

    band:
      Number(
        controls.band.value
      ) / 100,

    notch:
      Number(
        controls.notch.value
      ) / 100
  };
}

function buildCombinedKernel() {
  const settings =
    getFilterSettings();

  const f1 =
    Number(controls.f1.value);

  const f2 =
    Number(controls.f2.value);

  const minFrequency =
    Math.min(f1, f2);

  const maxFrequency =
    Math.max(f1, f2);

  const lowCut =
    clamp(
      0.02 +
        0.45 *
          settings.low,
      0.02,
      0.48
    );

  const highCut =
    clamp(
      0.02 +
        0.45 *
          settings.high,
      0.02,
      0.48
    );

  const bandLow =
    clamp(
      (minFrequency - 8) /
        SAMPLE_RATE,
      0.02,
      0.35
    );

  const bandHigh =
    clamp(
      (maxFrequency + 8) /
        SAMPLE_RATE,
      bandLow + 0.03,
      0.48
    );

  const notchCenter =
    clamp(
      f2 / SAMPLE_RATE,
      0.04,
      0.46
    );

  const notchHalfWidth =
    0.018;

  const notchLow =
    clamp(
      notchCenter -
        notchHalfWidth,
      0.01,
      0.46
    );

  const notchHigh =
    clamp(
      notchCenter +
        notchHalfWidth,
      notchLow + 0.01,
      0.49
    );

  const kernels = [];

  if (settings.smooth > 0) {
    kernels.push(
      blendKernel(
        movingAverageKernel(
          settings.length
        ),
        settings.smooth
      )
    );
  }

  if (settings.low > 0) {
    kernels.push(
      blendKernel(
        lowpassKernel(
          settings.length,
          lowCut
        ),
        settings.low
      )
    );
  }

  if (settings.high > 0) {
    kernels.push(
      blendKernel(
        highpassKernel(
          settings.length,
          highCut
        ),
        settings.high
      )
    );
  }

  if (settings.band > 0) {
    kernels.push(
      blendKernel(
        bandpassKernel(
          settings.length,
          bandLow,
          bandHigh
        ),
        settings.band
      )
    );
  }

  if (settings.notch > 0) {
    kernels.push(
      blendKernel(
        notchKernel(
          settings.length,
          notchLow,
          notchHigh
        ),
        settings.notch
      )
    );
  }

  let singlePass = [1];

  for (const kernel of kernels) {
    singlePass =
      convolve(
        singlePass,
        kernel
      );
  }

  singlePass =
    normalizeByPeak(
      singlePass
    );

  let total = [1];

  for (
    let i = 0;
    i < settings.passes;
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
    total,
    activeFilters:
      kernels.length,

    lowCutHz:
      lowCut *
      SAMPLE_RATE,

    highCutHz:
      highCut *
      SAMPLE_RATE,

    bandLowHz:
      bandLow *
      SAMPLE_RATE,

    bandHighHz:
      bandHigh *
      SAMPLE_RATE,

    notchCenterHz:
      notchCenter *
      SAMPLE_RATE
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

  for (let i = 1; i < 4; i++) {
    const y =
      (height * i) / 4;

    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  for (let i = 1; i < 5; i++) {
    const x =
      (width * i) / 5;

    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

// -----------------------------------------------------------------------------
// Interpolation
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
      (i /
        Math.max(
          1,
          outputCount - 1
        )) *
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
// Plot drawing
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
      ...smoothInput.map(
        Math.abs
      ),
      ...smoothOutput.map(
        Math.abs
      )
    );

  function mapX(index, length) {
    return (
      index /
      Math.max(
        1,
        length - 1
      )
    ) * width;
  }

  function mapY(value) {
    return (
      height / 2 -
      (value / maxAbs) *
        (height * 0.42)
    );
  }

  // Input
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

  // Output
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
    "Kombinert impulsrespons h[n]",
    12,
    22
  );
}

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
  } = magnitudeResponse(
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
// UI
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

  readouts.kernelLength.textContent =
    controls.kernelLength.value;

  readouts.passes.textContent =
    controls.passes.value;

  readouts.smooth.textContent =
    `${controls.smooth.value}%`;

  readouts.low.textContent =
    `${controls.low.value}%`;

  readouts.high.textContent =
    `${controls.high.value}%`;

  readouts.band.textContent =
    `${controls.band.value}%`;

  readouts.notch.textContent =
    `${controls.notch.value}%`;
}

function formatHz(value) {
  return `${Math.round(value)} Hz`;
}

function getActiveFilters() {
  const active = [];

  if (
    Number(
      controls.smooth.value
    ) > 0
  ) {
    active.push("Smoothing");
  }

  if (
    Number(
      controls.low.value
    ) > 0
  ) {
    active.push("Lavpass");
  }

  if (
    Number(
      controls.high.value
    ) > 0
  ) {
    active.push("Høypass");
  }

  if (
    Number(
      controls.band.value
    ) > 0
  ) {
    active.push("Båndpass");
  }

  if (
    Number(
      controls.notch.value
    ) > 0
  ) {
    active.push("Notch");
  }

  return active;
}

function updateSummary(
  filterState
) {
  const active =
    getActiveFilters();

  const selectedSignal =
    controls.signalType
      .options[
        controls.signalType
          .selectedIndex
      ]
      .text;

  const details = [
    `Signal: ${selectedSignal}`,
    `Filtre: ${
      active.length
        ? active.join(" + ")
        : "Ingen"
    }`,
    `Koeffisientlengde: ${filterState.total.length}`
  ];

  if (
    Number(
      controls.low.value
    ) > 0
  ) {
    details.push(
      `LP cutoff: ${formatHz(
        filterState.lowCutHz
      )}`
    );
  }

  if (
    Number(
      controls.high.value
    ) > 0
  ) {
    details.push(
      `HP cutoff: ${formatHz(
        filterState.highCutHz
      )}`
    );
  }

  if (
    Number(
      controls.band.value
    ) > 0
  ) {
    details.push(
      `Båndpass: ${formatHz(
        filterState.bandLowHz
      )}–${formatHz(
        filterState.bandHighHz
      )}`
    );
  }

  if (
    Number(
      controls.notch.value
    ) > 0
  ) {
    details.push(
      `Notch senter: ${formatHz(
        filterState.notchCenterHz
      )}`
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
  updateReadouts();

  const input =
    generateSignal();

  const filterState =
    buildCombinedKernel();

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
  for (
    const control of
      Object.values(controls)
  ) {
    control.addEventListener(
      "input",
      refresh
    );

    control.addEventListener(
      "change",
      refresh
    );
  }

  refresh();
}

init();