/**
 * Runs in <head> before the page paints and chooses between the live,
 * scroll-scrubbed film of the flight and the static experience (the same
 * story over still frames).
 *
 * Live needs a browser that plays H.264 video. It is skipped for visitors
 * who ask for reduced motion, are in data-saver mode or are on a 2G-class
 * connection, where several megabytes of film would cost more than it gives.
 * `?flight=static` and `?flight=live` override the choice for testing.
 */
export const FLIGHT_MODE_SCRIPT = `(function(){var d=document.documentElement;try{var c=navigator.connection;var ok=!matchMedia("(prefers-reduced-motion: reduce)").matches&&!(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||"")))&&!!document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028"');var q=new URLSearchParams(location.search).get("flight");if(q==="static")ok=false;if(q==="live")ok=true;d.dataset.flight=ok?"live":"static"}catch(e){d.dataset.flight="static"}})();`;
