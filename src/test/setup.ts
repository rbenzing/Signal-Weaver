import "@testing-library/jest-dom";

// Provide a stub navigator.usb so WebUSB availability checks pass in tests.
// Individual tests that need to simulate absence of WebUSB delete it themselves.
if (!('usb' in navigator)) {
  Object.defineProperty(navigator, 'usb', {
    value: {},
    writable: true,
    configurable: true,
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
