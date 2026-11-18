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
  ...DemoUtils.cssVars({
    background: ["--plot-bg", "#ffffff"],
    grid: ["--plot-grid", "#e4e4e4"],
    axis: ["--plot-axis-soft", "#bbbbbb"],
    text: ["--plot-text", "#111111"],
    muted: ["--plot-muted", "#666666"]
  })
};

const clamp =
  DemoUtils.clamp;


// -----------------------------------------------------------------------------
// General math helpers
// -----------------------------------------------------------------------------

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
  const size =
    DemoUtils.prepareCanvas(
      canvas,
      context
    );

  context.clearRect(
    0,
    0,
    size.width,
    size.height
  );

  context.fillStyle =
    plotColors.background;

  context.fillRect(
    0,
    0,
    size.width,
    size.height
  );

  return size;
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

function drawAxes(context, size, { xMin, xMax, yMin, yMax, title, xLabel, formatX, formatY }) {
  const left = 48, right = 14, top = 28, bottom = 34;
  const width = Math.max(1, size.width - left - right);
  const height = Math.max(1, size.height - top - bottom);
  const mapX = value => left + (value - xMin) / (xMax - xMin) * width;
  const mapY = value => top + (yMax - value) / (yMax - yMin) * height;
  context.font = "12px sans-serif";
  const ticks = size.width < 340 ? 2 : 4;
  for (let index = 0; index <= ticks; index++) {
    const xValue = xMin + index / ticks * (xMax - xMin);
    const x = mapX(xValue);
    context.strokeStyle = plotColors.grid;
    context.beginPath(); context.moveTo(x, top); context.lineTo(x, top + height); context.stroke();
    context.fillStyle = plotColors.text;
    context.textAlign = "center";
    context.fillText(formatX(xValue), x, top + height + 16);
  }
  for (let index = 0; index <= 4; index++) {
    const value = yMin + index / 4 * (yMax - yMin);
    const y = mapY(value);
    context.strokeStyle = plotColors.grid;
    context.beginPath(); context.moveTo(left, y); context.lineTo(left + width, y); context.stroke();
    context.fillStyle = plotColors.text;
    context.textAlign = "right";
    context.fillText(formatY(value), left - 6, y + 4);
  }
  context.strokeStyle = plotColors.axis;
  context.strokeRect(left, top, width, height);
  context.fillStyle = plotColors.text;
  context.textAlign = "left";
  context.font = "13px sans-serif";
  context.fillText(title, 10, 17);
  context.font = "12px sans-serif";
  context.textAlign = "right";
  context.fillText(xLabel, size.width - 6, size.height - 3);
  context.textAlign = "left";
  return { mapX, mapY };
}

function strokeSeries(context, values, axes, xValue, color) {
  context.strokeStyle = color;
  context.lineWidth = 1.6;
  context.beginPath();
  values.forEach((value, index) => {
    const x = axes.mapX(xValue(index));
    const y = axes.mapY(value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function drawMainPlot(input, output) {
  const size = clearCanvas(outputCtx, outputCanvas);
  const count = Math.max(Math.ceil(size.width), input.length);
  const smoothInput = sincInterpolate(input, count);
  const smoothOutput = sincInterpolate(output, count);
  const peak = Math.max(0.1, ...smoothInput.map(Math.abs), ...smoothOutput.map(Math.abs));
  const limit = Math.ceil(peak * 10) / 10;
  const axes = drawAxes(outputCtx, size, {
    xMin: 0, xMax: 1, yMin: -limit, yMax: limit,
    title: "Inngang og utgang · amplitude", xLabel: "Tid (s)",
    formatX: value => value.toFixed(2), formatY: value => value.toFixed(1)
  });
  const timeAt = index => index / (count - 1) * (input.length - 1) / SAMPLE_RATE;
  strokeSeries(outputCtx, smoothInput, axes, timeAt, plotColors.axis);
  strokeSeries(outputCtx, smoothOutput, axes, timeAt, plotColors.text);
}

function drawImpulse(kernel) {
  const size = clearCanvas(impulseCtx, impulseCanvas);
  const low = Math.min(0, ...kernel), high = Math.max(0.01, ...kernel);
  const padding = (high - low) * 0.1;
  const axes = drawAxes(impulseCtx, size, {
    xMin: 0, xMax: Math.max(1, kernel.length - 1), yMin: low - padding, yMax: high + padding,
    title: "Impulsrespons h[n]", xLabel: "Sampleindeks n",
    formatX: value => Math.round(value).toString(), formatY: value => value.toFixed(2)
  });
  impulseCtx.strokeStyle = plotColors.text;
  impulseCtx.lineWidth = 1;
  kernel.forEach((value, index) => {
    const x = axes.mapX(index);
    impulseCtx.beginPath(); impulseCtx.moveTo(x, axes.mapY(0)); impulseCtx.lineTo(x, axes.mapY(value)); impulseCtx.stroke();
  });
}

function drawResponse(kernel) {
  const size = clearCanvas(responseCtx, responseCanvas);
  const { magnitude, frequency } = magnitudeResponse(kernel, 260);
  const axes = drawAxes(responseCtx, size, {
    xMin: 0, xMax: NYQUIST_FREQUENCY, yMin: -60, yMax: 6,
    title: "Magnituderespons (dB)", xLabel: "Frekvens (Hz)",
    formatX: value => Math.round(value).toString(), formatY: value => Math.round(value).toString()
  });
  strokeSeries(responseCtx, magnitude.map(value => clamp(20 * Math.log10(Math.max(value, 1e-12)), -60, 6)),
    axes, index => frequency[index], plotColors.text);
  const settings = getFilterSettings();
  const markers = settings.type === "bandpass" ? [settings.bandLowHz, settings.bandHighHz] :
    ["lowpass", "highpass", "notch"].includes(settings.type) ? [settings.cutoffHz] : [];
  responseCtx.strokeStyle = plotColors.muted;
  responseCtx.setLineDash([4, 4]);
  for (const frequency of markers) {
    const x = axes.mapX(frequency);
    responseCtx.beginPath(); responseCtx.moveTo(x, axes.mapY(-60)); responseCtx.lineTo(x, axes.mapY(6)); responseCtx.stroke();
  }
  responseCtx.setLineDash([]);
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


  const delay = (filterState.total.length - 1) / 2;
  details.push(`fs: ${SAMPLE_RATE} Hz`, `Kompensert forsinkelse: ${delay} sampler (${(1000 * delay / SAMPLE_RATE).toFixed(1)} ms)`);
  summary.textContent = details.join(" | ");

  plotLegend.textContent =
    "Inngang x[n] (grå) og forsinkelseskompensert utgang (svart)";
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

  let resizeFrame = 0;
  DemoUtils.observeResize(document.getElementById("output"), () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      refresh();
    });
  });
  refresh();
}

init();
