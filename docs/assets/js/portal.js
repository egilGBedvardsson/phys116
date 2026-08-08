// =============================================================================
// PHYS 116 demo portal
// =============================================================================


// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/*
 * Change this when demo assets change substantially.
 * The value is appended to iframe and document URLs to reduce stale caching.
 */
const ASSET_VERSION = "20260808-refactor";

const DEMOS = {
  home: {
    title: "Interaktive demoer i PHYS 116",
    path: "PHYS 116 / Hjem",
    demo: null,
    document: "./content/home.html"
  },

  nyquist: {
    title: "Sampling, Nyquist og folding",
    path: "PHYS 116 / Demoer / Nyquist Chirp",
    demo: "./demos/nyquist_chirp.html",
    document: "./content/nyquist.html"
  },

  firkantsignal: {
    title: "Firkantsignal og konjugatsymmetri",
    path:
      "PHYS 116 / Demoer / Firkantsignal og konjugatsymmetri",
    demo:
      "./demos/firkantsignal_konjugatsymmetri.html",
    document:
      "./content/firkantsignal_konjugatsymmetri.html"
  },

  fir: {
    title: "Finite Impulse Response Filter",
    path: "PHYS 116 / Demoer / FIR-filter",
    demo: "./demos/fir.html",
    document: "./content/fir.html"
  },

  pz: {
    title: "Poler, nuller og frekvensrespons",
    path: "PHYS 116 / Demoer / Pol-null-editor",
    demo: "./demos/pz_editor.html",
    document: "./content/pz.html"
  },

  fourier: {
    title: "Interaktiv Fourier-serie",
    path: "PHYS 116 / Demoer / Fourier-serie",
    demo: "./demos/fourier_series.html",
    document: "./content/fourier_series.html"
  },

  beats: {
    title: "Beats og interferens",
    path: "PHYS 116 / Demoer / Beats",
    demo: "./demos/beats.html",
    document: "./content/beats.html"
  },

  interpolation: {
    title: "Interpolasjon mellom punkter",
    path: "PHYS 116 / Demoer / Interpolasjon",
    demo: "./demos/interpolation.html",
    document: "./content/interpolation.html"
  }
};


// -----------------------------------------------------------------------------
// DOM
// -----------------------------------------------------------------------------

const elements = {
  navigationButtons:
    Array.from(
      document.querySelectorAll(".demo-btn")
    ),

  homeButton:
    document.querySelector(".sidebar-home-btn"),

  viewerTitle:
    document.getElementById("viewerTitle"),

  documentContent:
    document.getElementById("docContent"),

  emptyState:
    document.getElementById("emptyState"),

  frame:
    document.getElementById("demoFrame"),

  externalLink:
    document.getElementById("openExternal"),

  readerBreadcrumb:
    document.getElementById("readerBreadcrumb"),

  windowPath:
    document.getElementById("windowPath"),

  toTopButton:
    document.getElementById("toTopBtn")
};


// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const state = {
  frameResizeObserver: null,
  lastFrameHeight: 0,

  documentLoadToken: 0,
  documentCache: new Map()
};


// -----------------------------------------------------------------------------
// URL helpers
// -----------------------------------------------------------------------------

function withAssetVersion(path) {
  if (!path) {
    return path;
  }

  const separator =
    path.includes("?")
      ? "&"
      : "?";

  return (
    `${path}${separator}` +
    `v=${encodeURIComponent(ASSET_VERSION)}`
  );
}

function getDemoKeyFromHash() {
  const params =
    new URLSearchParams(
      window.location.hash.slice(1)
    );

  let key =
    params.get("demo");

  // Backward compatibility with an older URL.
  if (key === "square") {
    key = "firkantsignal";
  }

  return (
    key && DEMOS[key]
      ? key
      : "home"
  );
}

function updateHash(key) {
  const params =
    new URLSearchParams(
      window.location.hash.slice(1)
    );

  if (
    params.get("demo") === key
  ) {
    return;
  }

  params.set("demo", key);

  window.location.hash =
    params.toString();
}


// -----------------------------------------------------------------------------
// MathJax
// -----------------------------------------------------------------------------

async function typesetDocument() {
  const mathJax =
    window.MathJax;

  if (
    !mathJax ||
    typeof mathJax.typesetPromise !==
      "function"
  ) {
    return;
  }

  try {
    await mathJax.typesetPromise([
      elements.documentContent
    ]);
  } catch {
    // A MathJax failure should not prevent
    // the rest of the portal from functioning.
  }
}


// -----------------------------------------------------------------------------
// Document loading
// -----------------------------------------------------------------------------

async function renderDocument(key) {
  const demo =
    DEMOS[key] ||
    DEMOS.home;

  const documentPath =
    demo.document ||
    DEMOS.home.document;

  const token =
    ++state.documentLoadToken;

  elements.documentContent.innerHTML =
    '<p class="doc-muted">Laster dokument...</p>';

  let markup =
    state.documentCache.get(
      documentPath
    );

  if (markup === undefined) {
    try {
      const response =
        await fetch(
          withAssetVersion(
            documentPath
          )
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      markup =
        await response.text();

      state.documentCache.set(
        documentPath,
        markup
      );
    } catch {
      markup =
        '<p class="doc-muted">' +
        "Kunne ikke laste dokumentteksten." +
        "</p>";
    }
  }

  /*
   * Ignore a stale request if the user switched
   * pages while this document was loading.
   */
  if (
    token !==
    state.documentLoadToken
  ) {
    return;
  }

  elements.documentContent.innerHTML =
    markup;

  await typesetDocument();
}


// -----------------------------------------------------------------------------
// iframe sizing
// -----------------------------------------------------------------------------

function disconnectFrameObserver() {
  if (
    !state.frameResizeObserver
  ) {
    return;
  }

  state.frameResizeObserver.disconnect();
  state.frameResizeObserver = null;
}

function measureFrameHeight() {
  try {
    const frameDocument =
      elements.frame.contentDocument;

    if (!frameDocument) {
      return;
    }

    const demoShell =
      frameDocument.querySelector(
        ".demo-shell"
      );

    const body =
      frameDocument.body;

    const html =
      frameDocument.documentElement;

    const nextHeight =
      Math.ceil(
        demoShell
          ? demoShell
              .getBoundingClientRect()
              .height

          : Math.max(
              body?.scrollHeight || 0,
              html?.scrollHeight || 0
            )
      );

    if (
      nextHeight <= 0 ||
      Math.abs(
        nextHeight -
        state.lastFrameHeight
      ) <= 2
    ) {
      return;
    }

    elements.frame.style.height =
      `${nextHeight}px`;

    state.lastFrameHeight =
      nextHeight;

  } catch {
    /*
     * All project demos are expected to be same-origin.
     * Ignore sizing if that ever stops being true.
     */
  }
}

function connectFrameAutoHeight() {
  disconnectFrameObserver();

  const frameDocument =
    elements.frame.contentDocument;

  if (!frameDocument) {
    return;
  }

  measureFrameHeight();

  requestAnimationFrame(
    measureFrameHeight
  );

  setTimeout(
    measureFrameHeight,
    120
  );

  setTimeout(
    measureFrameHeight,
    420
  );

  if (
    !("ResizeObserver" in window)
  ) {
    return;
  }

  const target =
    frameDocument.querySelector(
      ".demo-shell"
    ) ||
    frameDocument.body ||
    frameDocument.documentElement;

  if (!target) {
    return;
  }

  state.frameResizeObserver =
    new ResizeObserver(
      measureFrameHeight
    );

  state.frameResizeObserver.observe(
    target
  );
}


// -----------------------------------------------------------------------------
// Navigation state
// -----------------------------------------------------------------------------

function setActiveNavigation(key) {
  for (
    const button of
      elements.navigationButtons
  ) {
    const active =
      button.dataset.demo === key;

    button.classList.toggle(
      "active",
      active
    );

    if (active) {
      button.setAttribute(
        "aria-current",
        "page"
      );
    } else {
      button.removeAttribute(
        "aria-current"
      );
    }
  }
}


// -----------------------------------------------------------------------------
// Demo frame
// -----------------------------------------------------------------------------

function showDemo(demo) {
  const source =
    withAssetVersion(
      demo.demo
    );

  elements.frame.style.display =
    "block";

  elements.emptyState.hidden =
    true;

  elements.frame.title =
    demo.title;

  elements.externalLink.hidden =
    false;

  elements.externalLink.href =
    source;

  if (
    elements.frame.getAttribute(
      "src"
    ) === source
  ) {
    measureFrameHeight();
    return;
  }

  disconnectFrameObserver();

  state.lastFrameHeight = 0;

  elements.frame.style.height =
    "0";

  elements.frame.setAttribute(
    "src",
    source
  );
}

function hideDemo() {
  disconnectFrameObserver();

  state.lastFrameHeight = 0;

  elements.frame.style.display =
    "none";

  elements.frame.style.height =
    "0";

  elements.frame.removeAttribute(
    "src"
  );

  elements.emptyState.hidden =
    false;

  elements.emptyState.textContent =
    "Velg et dokument fra sidepanelet for å starte.";

  elements.externalLink.hidden =
    true;

  elements.externalLink.removeAttribute(
    "href"
  );
}


// -----------------------------------------------------------------------------
// Page loading
// -----------------------------------------------------------------------------

function loadDemo(
  key,
  {
    updateUrl = true
  } = {}
) {
  const demo =
    DEMOS[key];

  if (!demo) {
    return;
  }

  elements.viewerTitle.textContent =
    demo.title;

  elements.readerBreadcrumb.textContent =
    demo.path;

  elements.windowPath.textContent =
    demo.path;

  renderDocument(key);

  if (demo.demo) {
    showDemo(demo);
  } else {
    hideDemo();
  }

  setActiveNavigation(key);

  if (updateUrl) {
    updateHash(key);
  }
}

function loadFromHash() {
  loadDemo(
    getDemoKeyFromHash(),
    {
      updateUrl: false
    }
  );
}


// -----------------------------------------------------------------------------
// Back-to-top button
// -----------------------------------------------------------------------------

function updateToTopButton() {
  elements.toTopButton.classList.toggle(
    "visible",
    window.scrollY > 280
  );
}


// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

function connectEvents() {
  for (
    const button of
      elements.navigationButtons
  ) {
    button.addEventListener(
      "click",
      () => {
        loadDemo(
          button.dataset.demo
        );
      }
    );
  }

  elements.homeButton?.addEventListener(
    "click",
    () => {
      loadDemo("home");
    }
  );

  elements.frame.addEventListener(
    "load",
    connectFrameAutoHeight
  );

  window.addEventListener(
    "resize",
    measureFrameHeight,
    {
      passive: true
    }
  );

  window.addEventListener(
    "hashchange",
    loadFromHash
  );

  elements.toTopButton.addEventListener(
    "click",
    () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  );

  window.addEventListener(
    "scroll",
    updateToTopButton,
    {
      passive: true
    }
  );
}


// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
  connectEvents();
  loadFromHash();
  updateToTopButton();
}

init();