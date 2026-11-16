/**
 * Runs in <head> before the page paints. Chooses the live 3D flight only when
 * the browser has hardware-accelerated WebGL 2, the visitor has not asked for
 * reduced motion and is not in data-saver mode. `?flight=static` and
 * `?flight=live` override the choice for testing.
 *
 * Hardware acceleration is probed with `failIfMajorPerformanceCaveat`: the
 * browser refuses such a context when it would render on the CPU (no GPU, a
 * blocklisted driver, many virtual machines). There the 3D flight would run
 * at a few frames a second, so those visitors get the static experience.
 * The probe context is released at once.
 */
export const FLIGHT_MODE_SCRIPT = `(function(){var d=document.documentElement;try{var ok=!!window.WebGL2RenderingContext&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!(navigator.connection&&navigator.connection.saveData);var q=new URLSearchParams(location.search).get("flight");if(ok&&q!=="live"){var g=document.createElement("canvas").getContext("webgl2",{failIfMajorPerformanceCaveat:true});if(!g)ok=false;else{var x=g.getExtension("WEBGL_lose_context");if(x)x.loseContext()}}if(q==="static")ok=false;if(q==="live")ok=true;d.dataset.flight=ok?"live":"static"}catch(e){d.dataset.flight="static"}})();`;
