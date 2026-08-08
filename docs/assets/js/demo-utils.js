// =============================================================================
// Shared utilities for interactive course demos
// =============================================================================

const DemoUtils = {
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
  }
};