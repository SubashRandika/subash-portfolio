/**
 * Runs in <head> before the page paints. Chooses the live 3D flight only when
 * the browser has WebGL 2, the visitor has not asked for reduced motion and
 * is not in data-saver mode. `?flight=static` and `?flight=live` override the
 * choice for testing.
 */
export const FLIGHT_MODE_SCRIPT = `(function(){var d=document.documentElement;try{var ok=!!window.WebGL2RenderingContext&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!(navigator.connection&&navigator.connection.saveData);var q=new URLSearchParams(location.search).get("flight");if(q==="static")ok=false;if(q==="live")ok=true;d.dataset.flight=ok?"live":"static"}catch(e){d.dataset.flight="static"}})();`;
