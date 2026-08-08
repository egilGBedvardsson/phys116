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
    const rect =
      canvas.getBoundingClientRect();

    const width =
      rect.width || canvas.clientWidth || canvas.width;

    const height =
      rect.height || canvas.clientHeight || canvas.height;

    const dpr =
      window.devicePixelRatio || 1;

    canvas.width =
      Math.max(
        1,
        Math.round(width * dpr)
      );

    canvas.height =
      Math.max(
        1,
        Math.round(height * dpr)
      );

    const context =
      existingContext ||
      canvas.getContext("2d");

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    return {
      ctx: context,
      width,
      height,
      dpr
    };
  },

  observeResize(element, callback) {
    if ("ResizeObserver" in window) {
      const observer =
        new ResizeObserver(callback);

      observer.observe(element);

      return () => observer.disconnect();
    }

    window.addEventListener(
      "resize",
      callback,
      {
        passive: true
      }
    );

    return () => {
      window.removeEventListener(
        "resize",
        callback
      );
    };
  },

  measureElementWidth(element, minimum = 320) {
    return Math.max(
      minimum,
      Math.floor(element.clientWidth)
    );
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
