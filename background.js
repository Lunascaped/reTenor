const TENOR_API_KEY = "3Z0688EVWYKH";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "search" || msg.action === "categoryView") {
    fetchTenorSearch(msg.query, msg.cursor).then(sendResponse);
    return true;
  }
  if (msg.action === "categories") {
    fetchTenorCategories().then(sendResponse);
    return true;
  }
});

async function fetchTenorSearch(query, cursor) {
  try {
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      q: query,
      limit: "50",
      media_filter: "basic",
    });
    if (cursor) params.set("pos", cursor);
    const res = await fetch(`https://api.tenor.com/v1/search?${params}`);
    const data = await res.json();
    return transformSearch(data);
  } catch {
    return { data: { items: [] }, cursor: { next: "" } };
  }
}

async function fetchTenorCategories() {
  try {
    const params = new URLSearchParams({ key: TENOR_API_KEY, type: "trending" });
    const res = await fetch(`https://api.tenor.com/v1/categories?${params}`);
    const data = await res.json();
    return transformCategories(data);
  } catch {
    return { data: { groups: [] }, cursor: {} };
  }
}

function transformSearch(tenor) {
  const items = (tenor.results || []).map((r) => {
    const m = r.media?.[0] || {};
    const gif = m.gif;
    const tinygif = m.tinygif;
    const nanogif = m.nanogif;
    const medgif = m.mediumgif;

    return {
      provider: { name: "tenor", display_name: "Tenor", icon_images: [] },
      item_type: "gif",
      id: `tenor_${r.id}`,
      found_media_origin: { provider: "tenor", id: String(r.id) },
      url: r.itemurl || r.url || "",
      thumbnail_images: [
        mediaObj(medgif || tinygif),
        mediaObj(tinygif || nanogif),
      ],
      original_image: mediaObj(gif),
      preview_image: mediaObj(gif),
      alt_text: r.title || "",
      object_type: "item",
    };
  });

  return {
    data: { items },
    cursor: { next: tenor.next || "" },
  };
}

function transformCategories(tenor) {
  const groups = (tenor.tags || []).map((category) => ({
    display_name: category.name,
    id: category.searchterm.toLowerCase().replace(/\s+/g, "_"),
    thumbnail_images: [
      { url: category.image, width: 200, height: 200, byte_count: 0, still_image_url: category.image },
      { url: category.image, width: 200, height: 200, byte_count: 0, still_image_url: category.image },
    ],
    original_image: { url: category.image, width: 200, height: 200, byte_count: 0, still_image_url: category.image },
    object_type: "group",
  }));

  return { data: { groups }, cursor: {} };
}

function mediaObj(m) {
  if (!m?.url) return { url: "", width: 0, height: 0, byte_count: 0, still_image_url: "" };
  return {
    url: m.url,
    width: m.dims?.[0] || 0,
    height: m.dims?.[1] || 0,
    byte_count: m.size || 0,
    still_image_url: m.preview || m.url,
  };
}
