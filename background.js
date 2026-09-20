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
  if (msg.action === "search") {
    fetchGifSearch(msg.query, msg.cursor).then(sendResponse);
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

async function fetchGifSearch(query, cursor) {
  try {
    const data = await fetchTenorSearch(query, cursor);
    const items = transformGifItems(data);
    return { data: { gif_search_slice: { __typename: "GifSearchSlice", items, slice_info: { next_cursor: data.next || "" } } } };
  } catch {
    return { data: { gif_search_slice: { __typename: "GifSearchSlice", items: [], slice_info: { next_cursor: "" } } } };
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
    const items = transformGifItems(data);
    return { data: { gif_enumerate_category_slice: {__typename: "GifEnumerateCategorySlice", items, slice_info: { next_cursor: data.next || "" } } } };
  } catch {
    return { data: { gif_enumerate_category_slice: { __typename: "GifEnumerateCategorySlice", items: [], slice_info: { next_cursor: "" } } } };
  }
}

function transformGifItems(tenor) {
  return (tenor.results || []).map((r) => {
    const { gif, thumbnail_images } = selectBestMediaForResult(r);
    const item = {
      __typename: "GifItem",
      alt_text: r.title || "",
      full_image: {
        __typename: "GifImage",
        height: gif.height,
        still_image_url: gif.still_image_url,
        url: gif.url,
        width: gif.width,
      },
      id: `tenor_${r.id}`,
      preview_image: {
        height: gif.height,
        still_image_url: gif.still_image_url,
        url: gif.url,
        width: gif.width,
      },
      provider: { display_name: "Tenor", id: "tenor" },
      thumbnail_images: thumbnail_images.map((img) => ({
        __typename: "GifImage",
        height: img.height,
        still_image_url: img.still_image_url,
        url: img.url,
        width: img.width,
      })),
    };
    console.log("gif item:", JSON.stringify(item, null, 2));
    return item;
  });
}

function selectBestMediaForResult(r) {
  const m = r.media?.[0] || {};

  // see https://tenor.com/gifapi/documentation#responseobjects-gifformat for reference
  const mediaCandidates = ["gif", "mediumgif", "tinygif", "nanogif"].map(
    (key) => mediaObj(m[key]),
  );

  const gif =
    mediaCandidates.find(
      (candidate) => candidate.byte_count > 0 && !candidate.size_limit_exceeded,
    ) || EMPTY_GIF;

  const thumbnail_images = mediaCandidates.filter(
    (candidate) => candidate.byte_count > 0,
  );

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
