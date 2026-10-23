import { UI } from './core/UI.js';

// Handy for userscripts / the browser console. With "@grant none" this lands on the page's own window.
window.UI = UI;
window.OdiumUI = UI;

export { UI, UI as OdiumUI };
export default UI;
