// AllSet image generation: the one adapter point. Off by default.
//
// generateImages() is only ever called from processLead() in allset.js, which only runs for a lead that
// exists because a visitor clicked "Activate preview" (from the queue consumer, or the admin's
// process-jobs endpoint for D1 fallback jobs). Nothing here runs on a page view or before that click.
//
// Contract:
//   generateImages(env, { leadId, siteUrl, site, slots }) → Promise<Array<{ slot, alt?, url? | bytes?, contentType? }>>
//     slots: the template slots the client's own site could not fill, e.g. ["hero", "section-2"].
//     Return one entry per slot you filled. Either `url` (an https URL the browser can load) or `bytes`
//     (ArrayBuffer/Uint8Array) plus `contentType` ("image/webp", "image/png", "image/jpeg"); bytes are stored
//     in R2 next to the preview and served from /allset/preview/<id>/<slot>.<ext>.
//     Unfilled slots are simply left out of the page. Throwing fails the whole preview, so catch what you can.
//
// To add a provider: write `async function myProvider(env, req) { ... }` using a provider with an official,
// documented API (fetch only, no npm SDK), register it in PROVIDERS, put its key in a secret
// (`npx wrangler secret put MY_PROVIDER_KEY`) and set the var IMAGE_PROVIDER to its name.
//
// Midjourney has no official API. Do not add Discord bots, browser automation or any unofficial
// Midjourney wrapper here; the photos in /new/media/ were made by hand in Midjourney, and that stays manual.

const PROVIDERS = {
  // example: async (env, { slots, site }) => {
  //   const out = [];
  //   for (const slot of slots) {
  //     const r = await fetch("https://api.example.com/v1/images", {
  //       method: "POST",
  //       headers: { Authorization: `Bearer ${env.EXAMPLE_IMAGE_KEY}`, "Content-Type": "application/json" },
  //       body: JSON.stringify({ prompt: `Photo for the ${slot} of a website for ${site.brand}: ${site.tagline}` }),
  //     });
  //     if (r.ok) out.push({ slot, bytes: await r.arrayBuffer(), contentType: r.headers.get("Content-Type") || "image/png", alt: "" });
  //   }
  //   return out;
  // },
};

export async function generateImages(env, req) {
  const name = env.IMAGE_PROVIDER;
  if (!name || !req.slots?.length) return [];
  const provider = PROVIDERS[name];
  if (!provider) {
    console.warn(`allset: IMAGE_PROVIDER "${name}" is not registered in allset-images.js`);
    return [];
  }
  return provider(env, req);
}
