(function () {
  const pending = new Map();

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (e.source !== window || !msg || msg.__tenor !== "res") return;
    const resolve = pending.get(msg.id);
    if (!resolve) return;
    pending.delete(msg.id);
    resolve(msg.payload);
  });

  function requestTenor(req) {
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      pending.set(id, resolve);
      window.postMessage({ __tenor: "req", id, req }, location.origin);
    });
  }

  function matchUrl(url) {
    try {
      const parsed = new URL(url, location.origin);
      const cursor = parsed.searchParams.get("cursor") || "";

      if (url.includes("/foundmedia/search.json")) {
        return { action: "search", query: parsed.searchParams.get("q") || "", cursor };
      }
      if (url.includes("/foundmedia/categories.json")) {
        return { action: "categories" };
      }
      const catMatch = parsed.pathname.match(/\/foundmedia\/categories\/([^/.]+)\.json/);
      if (catMatch) {
        return { action: "categoryView", query: catMatch[1].replace(/_/g, " "), cursor };
      }
    } catch {}
    return null;
  }

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _abort = XMLHttpRequest.prototype.abort;
  const MATCH = Symbol();

  XMLHttpRequest.prototype.open = function (method, url) {
    this[MATCH] = matchUrl(String(url));
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const match = this[MATCH];
    if (!match) return _send.apply(this, arguments);

    const xhr = this;
    const asJson = xhr.responseType === "json";
    _abort.call(xhr);

    requestTenor(match).then((payload) => {
      const text = JSON.stringify(payload);
      const fake = {
        readyState: 4,
        status: 200,
        statusText: "OK",
        responseText: text,
        response: asJson ? payload : text,
        responseURL: "",
      };
      for (const key in fake) {
        const value = fake[key];
        Object.defineProperty(xhr, key, { get: () => value, configurable: true });
      }

      xhr.getResponseHeader = (name) =>
        name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
      xhr.getAllResponseHeaders = () => "content-type: application/json; charset=utf-8\r\n";

      xhr.onreadystatechange?.(new Event("readystatechange"));
      xhr.dispatchEvent(new Event("readystatechange"));
      xhr.onload?.(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.onloadend?.(new ProgressEvent("loadend"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    });
  };
})();
