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

      if (url.includes("/GifSearch?") || url.includes("/GifSearchQuery")) {
        const params = JSON.parse(parsed.searchParams.get("variables") || "{}");
        return { action: "search", query: params.query || "", cursor: params.cursor || "" };
      }
      if (url.includes("/GifEnumerateCategory?") || url.includes("/GifEnumerateCategoryQuery")) {
        return { action: "trending" };
      }
    } catch {}
    return null;
  }

  function mergeGifs(orig, tenor, match) {    
    let gifArray = 'gif_search_slice';
    if (match.action === 'trending') gifArray = 'gif_enumerate_category_slice';
    
    const origGifs = orig.data[gifArray]?.items;
    const tenorGifs = tenor.data[gifArray].items;
        
    if (origGifs.length) {
      tenor.data[gifArray].items = Array.from(
        { length: Math.max(tenorGifs.length, origGifs.length) },
        (_, i) => [tenorGifs[i], origGifs[i]].filter(Boolean)
      ).flat();
    }

    return tenor;
  }

  // Intercept fetch requests (for Chat)
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = input.url || input.href || String(input);
    const match = matchUrl(url);
    if (!match) return _fetch.apply(this, arguments);

    const origFetch = await _fetch.apply(this, arguments);
    const origResponse = await origFetch.json();
    
    return requestTenor(match).then((tenorResponse) => {
      const result = mergeGifs(origResponse, tenorResponse, match);

      const text = JSON.stringify(result);
      const response = new Response(text, {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
      return response;
    });
  };

  // Intercept XHR requests (for Post/Reply)
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const MATCH = Symbol();
  const HANDLED = Symbol();

  XMLHttpRequest.prototype.open = function (method, url) {
    this[MATCH] = matchUrl(String(url));
    this[HANDLED] = false;

    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const match = this[MATCH];

    if (!match || this[HANDLED]) {
      return _send.apply(this, arguments);
    }

    const xhr = this;
    this[HANDLED] = true;

    const originalOnreadystatechange = xhr.onreadystatechange;
    const originalOnload = xhr.onload;
    const originalOnloadend = xhr.onloadend;

    xhr.onreadystatechange = function (event) {
      if (xhr.readyState !== 4) {
        originalOnreadystatechange?.call(xhr, event);
        return;
      }

      let originalResponse = {};
      try {
        if (xhr.responseText) {
          originalResponse = JSON.parse(xhr.responseText);
        }
      } catch {}

      requestTenor(match).then(tenorResponse => {
        const merged = mergeGifs(originalResponse, tenorResponse, match);
        const text = JSON.stringify(merged);

        Object.defineProperties(xhr, {
          status: {
            value: 200,
            configurable: true
          },

          statusText: {
            value: "OK",
            configurable: true
          },

          responseText: {
            value: text,
            configurable: true
          },

          response: {
            value: xhr.responseType === "json" ? merged : text,
            configurable: true
          }
        });

        xhr.getResponseHeader = name =>
          name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
        xhr.getAllResponseHeaders = () => "content-type: application/json; charset=utf-8\r\n";

        originalOnreadystatechange?.call(xhr, event);
        originalOnload?.call(xhr, new ProgressEvent("load"));
        originalOnloadend?.call(xhr, new ProgressEvent("loadend"));
      }).catch(() => {
        originalOnreadystatechange?.call(xhr, event);
        originalOnload?.call(xhr, new ProgressEvent("load"));
        originalOnloadend?.call(xhr, new ProgressEvent("loadend"));
      });
    };

    return _send.apply(this, arguments);
  };
})();
