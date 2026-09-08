import { initSettings } from "./settings.js";

/**
 * Browser entry point for the settings page: hand {@link initSettings} the real
 * `document` and let it default to the real `localStorage`. Everything testable
 * lives in `settings.js`.
 */
initSettings({ document });
