const TENOR_API_URL = "https://api.tenor.com/v1";
const TENOR_API_KEY = "3Z0688EVWYKH";
const EMPTY_GIF = {
  url: "",
  width: 0,
  height: 0,
  byte_count: 0,
  size_limit_exceeded: false,
  still_image_url: "",
};
const FILE_SIZE_LIMIT = 15728640; // 15 MB

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Post/reply
  if (msg.action === "search" || msg.action === "categoryView") {
    fetchTenorSearchPost(msg.query, msg.cursor).then(sendResponse);
    return true;
  }
  if (msg.action === "categories") {
    fetchTenorCategories().then(sendResponse);
    return true;
  }

  // Chat
  if (msg.action === "chatSearch") {
    fetchTenorChatSearch(msg.query).then(sendResponse);
    return true;
  }
  if (msg.action === "trending") {
    fetchTenorTrending().then(sendResponse);
    return true;
  }
});

async function fetchTenorSearch(query, cursor) {
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    q: query,
    limit: "50",
    media_filter: "default",
  });
  if (cursor) params.set("pos", cursor);
  const res = await fetch(`${TENOR_API_URL}/search?${params}`);
  return res.json();
}

async function fetchTenorSearchPost(query, cursor) {
  try {
    const data = await fetchTenorSearch(query, cursor);
    return transformSearch(data);
  } catch {
    return { data: { items: [] }, cursor: { next: "" } };
  }
}

async function fetchTenorChatSearch(query) {
  try {
    const data = await fetchTenorSearch(query, null);
    const items = transformChatSearch(data);
    return { data: { gif_search_slice: { items } } };
  } catch {
    return { data: { gif_search_slice: { items: [] } } };
  }
}

async function fetchTenorCategories() {
  try {
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      type: "trending",
    });
    const res = await fetch(`${TENOR_API_URL}/categories?${params}`);
    const data = await res.json();
    return transformCategories(data);
  } catch {
    return { data: { groups: [] }, cursor: {} };
  }
}

async function fetchTenorTrending() {
  try {
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      limit: "50",
      media_filter: "basic",
    });
    const res = await fetch(`${TENOR_API_URL}/trending?${params}`);
    const data = await res.json();
    const items = transformChatSearch(data);
    return { data: { gif_enumerate_category_slice: { items } } };
  } catch {
    return { data: { gif_enumerate_category_slice: { items: [] } } };
  }
}

function transformCategories(tenor) {
  const groups = (tenor.tags || []).map((category) => ({
    display_name: category.name,
    id: category.searchterm.toLowerCase().replace(/\s+/g, "_"),
    thumbnail_images: [
      {
        url: category.image,
        width: 200,
        height: 200,
        byte_count: 0,
        still_image_url: category.image,
      },
      {
        url: category.image,
        width: 200,
        height: 200,
        byte_count: 0,
        still_image_url: category.image,
      },
    ],
    original_image: {
      url: category.image,
      width: 200,
      height: 200,
      byte_count: 0,
      still_image_url: category.image,
    },
    object_type: "group",
  }));

  return { data: { groups }, cursor: {} };
}

function transformSearch(tenor) {
  const items = (tenor.results || []).map((r) => {
    const { gif, thumbnail_images } = selectBestMediaForResult(r);

    return {
      provider: { name: "tenor", display_name: "Tenor", icon_images: [] },
      item_type: "gif",
      id: `tenor_${r.id}`,
      found_media_origin: { provider: "tenor", id: String(r.id) },
      url: r.itemurl || r.url || "",
      thumbnail_images,
      original_image: gif,
      preview_image: gif,
      alt_text: r.title || "",
      object_type: "item",
    };
  });

  return {
    data: { items },
    cursor: { next: tenor.next || "" },
  };
}

function transformChatSearch(tenor) {
  return (tenor.results || []).map((r) => {
    const { gif, thumbnail_images } = selectBestMediaForResult(r);

    return {
      full_image: {
        height: gif.height,
        width: gif.width,
        url: gif.url,
      },
      id: `tenor_${r.id}`,
      thumbnail_images: thumbnail_images.map((img) => ({ url: img.url })),
    };
  });
}

function selectBestMediaForResult(r) {
  const m = r.media?.[0] || {};

  // see https://tenor.com/gifapi/documentation#responseobjects-gifformat for reference
  const mediaCandidates = ["gif", "mediumgif", "tinygif", "nanogif"].map((key) => mediaObj(m[key]));

  const gif =
    mediaCandidates.find(
      (candidate) => candidate.byte_count > 0 && !candidate.size_limit_exceeded
    ) || EMPTY_GIF;

  const thumbnail_images = mediaCandidates.filter((candidate) => candidate.byte_count > 0);

  return { gif, thumbnail_images };
}

function mediaObj(m) {
  if (!m?.url) return EMPTY_GIF;

  return {
    url: m.url,
    width: m.dims?.[0] || 0,
    height: m.dims?.[1] || 0,
    byte_count: m.size || 0,
    size_limit_exceeded: m.size > FILE_SIZE_LIMIT,
    still_image_url: m.preview || m.url,
  };
}
