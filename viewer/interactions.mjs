// Camera controls for the embedded CostumeShop viewer. The model's rig stays still.
export function attachViewerInteractions(canvas, runtime, onChange = () => {}) {
  const abort = new AbortController();
  const pointers = new Map();
  let enabled = false;
  let view = { yaw: 0, zoom: 1, height: 0 };
  let gestureZoom = 1;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const listen = (target, type, callback, options = {}) => target?.addEventListener(type, callback, { ...options, signal: abort.signal });
  function apply() {
    runtime.setViewYawDegrees(view.yaw);
    runtime.setViewZoom(view.zoom);
    runtime.setViewHeightOffset(view.height);
    canvas.dataset.viewYaw = String(view.yaw);
    canvas.dataset.viewZoom = String(view.zoom);
    canvas.dataset.viewHeight = String(view.height);
    onChange({ ...view, enabled });
  }
  function update(next) {
    if (Number.isFinite(next.yaw)) view.yaw = ((next.yaw + 180) % 360 + 360) % 360 - 180;
    if (Number.isFinite(next.zoom)) view.zoom = clamp(next.zoom, 0.5, 3);
    if (Number.isFinite(next.height)) view.height = clamp(next.height, -0.5, 0.8);
    apply();
  }
  function release(id) {
    pointers.delete(id);
    try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { /* Canvas may have detached. */ }
  }
  function clearPointers() { for (const id of [...pointers.keys()]) release(id); }
  function zoomBy(factor) { if (enabled && Number.isFinite(factor) && factor > 0) update({ zoom: view.zoom * factor }); }
  function setZoom(value) { if (enabled && Number.isFinite(value)) update({ zoom: value }); }
  function reset() { clearPointers(); update({ yaw: 0, zoom: 1, height: 0 }); }
  function pair() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2 };
  }
  listen(canvas, 'pointerdown', event => {
    if (!enabled || (event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic events or detached canvas. */ }
    canvas.style.cursor = 'grabbing';
  }, { passive: false });
  listen(canvas, 'pointermove', event => {
    if (!enabled || !pointers.has(event.pointerId)) return;
    event.preventDefault();
    const previous = pointers.get(event.pointerId);
    const before = pointers.size === 2 ? pair() : null;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const height = Math.max(1, canvas.clientHeight);
    if (before) {
      const after = pair();
      update({ zoom: before.distance > 1 ? view.zoom * after.distance / before.distance : view.zoom,
        height: view.height + (after.y - before.y) * 2 / (height * view.zoom) });
    } else {
      update({ yaw: view.yaw - (event.clientX - previous.x) * 360 / Math.max(1, canvas.clientWidth),
        height: view.height + (event.clientY - previous.y) * 2 / (height * view.zoom) });
    }
  }, { passive: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, event => {
    release(event.pointerId);
    canvas.style.cursor = pointers.size ? 'grabbing' : 'grab';
  });
  listen(canvas.ownerDocument?.defaultView, 'blur', () => { clearPointers(); canvas.style.cursor = 'grab'; });
  listen(canvas, 'wheel', event => {
    if (!enabled) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    zoomBy(Math.exp(clamp(-event.deltaY * unit * 0.0015, -1, 1)));
  }, { passive: false });
  // Safari trackpad pinch uses gesture events instead of Ctrl+wheel.
  listen(canvas, 'gesturestart', event => { if (enabled) { event.preventDefault(); gestureZoom = view.zoom; } }, { passive: false });
  listen(canvas, 'gesturechange', event => {
    if (enabled) { event.preventDefault(); if (pointers.size < 2) update({ zoom: gestureZoom * event.scale }); }
  }, { passive: false });
  listen(canvas, 'dblclick', event => { event.preventDefault(); });
  listen(canvas, 'keydown', event => {
    if (!enabled || event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'ArrowLeft': update({ yaw: view.yaw + 15 }); break;
      case 'ArrowRight': update({ yaw: view.yaw - 15 }); break;
      case 'ArrowUp': update({ height: view.height + 0.1 }); break;
      case 'ArrowDown': update({ height: view.height - 0.1 }); break;
      case '+': case '=': zoomBy(1.2); break;
      case '-': case '_': zoomBy(1 / 1.2); break;
      case 'Home': case '0': reset(); break;
      default: return;
    }
    event.preventDefault();
  });
  canvas.style.cursor = 'grab';
  return { reset, zoomBy, setZoom, apply, getState: () => ({ ...view }),
    setEnabled(value) { enabled = value; if (!enabled) { clearPointers(); canvas.style.cursor = 'grab'; } onChange({ ...view, enabled }); },
    dispose() { clearPointers(); abort.abort(); }
  };
}
