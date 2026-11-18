// =============================================================================
// Shared utilities for interactive course demos
// =============================================================================

const DemoUtils = {
  clamp(value, min, max) {
    return Math.min(
      max,
      Math.max(min, value)
    );
  },

  cssVar(name, fallback) {
    const styles =
      getComputedStyle(document.documentElement);

    function resolve(variableName, seen = new Set()) {
      if (seen.has(variableName)) {
        return fallback;
      }

      seen.add(variableName);

      const value =
        styles
          .getPropertyValue(variableName)
          .trim();

      if (!value) {
        return fallback;
      }

      const match =
        value.match(
          /^var\(\s*(--[^,\s)]+)(?:\s*,\s*([^)]+))?\s*\)$/
        );

      if (!match) {
        return value;
      }

      const nestedName = match[1];
      const nestedFallback =
        match[2]?.trim() || fallback;

      return resolve(
        nestedName,
        seen
      ) || nestedFallback;
    }

    return resolve(name);
  },

  cssVars(definitions) {
    return Object.fromEntries(
      Object.entries(definitions).map(
        ([key, [name, fallback]]) => [
          key,
          DemoUtils.cssVar(name, fallback)
        ]
      )
    );
  },

  prepareCanvas(canvas, existingContext) {
    // The .canvas-host controls display size. Bitmap dimensions never size it.
    // clientWidth/clientHeight exclude borders; never fall back to the bitmap.
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const context = existingContext || canvas.getContext("2d");
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    context.setLineDash([]);
    context.lineWidth = 1;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    return { ctx: context, width, height, dpr };
  },

  observeResize(element, callback) {
    let frame = 0;
    let previousSize = "";
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const size = `${element.clientWidth}:${element.clientHeight}:${window.devicePixelRatio || 1}`;
        if (size === previousSize) return;
        previousSize = size;
        callback();
      });
    };
    const observer = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    // Also catch display scale changes that leave the CSS dimensions unchanged.
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  },

  setLayoutSizes(sizes) {
    for (const [name, value] of Object.entries(sizes)) {
      document.documentElement.style.setProperty(name,
        typeof value === "number" ? `${value}px` : value);
    }
  },

  cssHeight({ min, preferredVw, max }) {
    return `clamp(${min}px, ${preferredVw}vw, ${max}px)`;
  },

  measureElementWidth(element, minimum = 1) {
    return Math.max(
      minimum,
      Math.floor(element.clientWidth)
    );
  },

  // Embedded demos use the outer viewport, not their auto-sized iframe height.
  viewportHeight() {
    try {
      return window.parent.innerHeight;
    } catch {
      return window.innerHeight;
    }
  },

  plotHeight(minimum, maximum, fraction = 0.55) {
    return Math.round(DemoUtils.clamp(
      DemoUtils.viewportHeight() * fraction,
      minimum,
      maximum
    ));
  },

  connectPlayback(onReset, onChange) {
    const playback = {
      paused: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false
    };
    const button = document.getElementById("pauseBtn");
    function update() {
      button.textContent = playback.paused ? "Fortsett" : "Pause";
      button.setAttribute("aria-pressed", String(playback.paused));
      onChange();
    }
    button.addEventListener("click", () => {
      playback.paused = !playback.paused;
      update();
    });
    document.getElementById("resetBtn").addEventListener("click", () => {
      onReset();
      onChange();
    });
    // Initialization precedes the first animation frame.
    button.textContent = playback.paused ? "Fortsett" : "Pause";
    button.setAttribute("aria-pressed", String(playback.paused));
    return playback;
  },

  runAfterLayoutSettles(callback, delay = 120) {
    callback();

    requestAnimationFrame(callback);

    window.addEventListener(
      "load",
      callback,
      {
        once: true
      }
    );

    window.setTimeout(
      callback,
      delay
    );
  },

  isEmbedded() {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  },

  markEmbeddingMode() {
    const embedded =
      DemoUtils.isEmbedded();

    document.documentElement.classList.toggle(
      "demo-embedded",
      embedded
    );

    document.documentElement.classList.toggle(
      "demo-standalone",
      !embedded
    );

    document.body?.classList.toggle(
      "demo-embedded",
      embedded
    );

    document.body?.classList.toggle(
      "demo-standalone",
      !embedded
    );

    return embedded;
  },

  forwardEmbeddedWheelScroll() {
    if (!DemoUtils.isEmbedded()) {
      return;
    }

    window.addEventListener(
      "wheel",
      event => {
        if (
          event.defaultPrevented ||
          event.ctrlKey
        ) {
          return;
        }

        const scale =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? window.innerHeight
              : 1;

        event.preventDefault();

        window.parent.scrollBy({
          left: event.deltaX * scale,
          top: event.deltaY * scale,
          behavior: "auto"
        });
      },
      {
        passive: false
      }
    );
  }
};

DemoUtils.markEmbeddingMode();
DemoUtils.forwardEmbeddedWheelScroll();
