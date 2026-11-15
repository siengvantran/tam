// The Analogue Room in a frame on another TAM site (immersive.tam.tv): tell the
// page around it how tall the room is, so the frame grows with the locks and
// never scrolls on its own. Only TAM's own sites may frame it (src/views/room.js).

const tell = () => {
  try { parent.postMessage({ tamRoom: { height: Math.ceil(document.documentElement.scrollHeight) } }, '*'); } catch { /* not framed */ }
};
if (parent !== window) {
  new ResizeObserver(tell).observe(document.body);
  addEventListener('load', tell);
  tell();
}
