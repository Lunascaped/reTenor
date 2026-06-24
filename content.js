const s = document.createElement("script");
s.src = chrome.runtime.getURL("inject.js");
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

window.addEventListener("message", async (e) => {
  const msg = e.data;
  if (e.source !== window || !msg || msg.__tenor !== "req") return;

  let payload;
  try {
    payload = await chrome.runtime.sendMessage(msg.req);
  } catch {
    payload = { data: { items: [], groups: [] }, cursor: {} };
  }

  window.postMessage({ __tenor: "res", id: msg.id, payload }, location.origin);
});
