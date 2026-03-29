import nextVitals from "eslint-config-next/core-web-vitals.js";

export default Array.isArray(nextVitals) ? nextVitals : [nextVitals];
