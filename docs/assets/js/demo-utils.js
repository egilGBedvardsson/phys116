// =============================================================================
// Shared utilities for interactive course demos
// =============================================================================

const DemoUtils = {
  cssVar(name, fallback) {
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim() || fallback
    );
  }
};