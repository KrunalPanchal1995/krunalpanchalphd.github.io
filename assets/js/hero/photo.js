/*
 * hero/photo.js -- full-bleed photographic hero: backdrop image + dim overlay, centred
 * letter-spaced title, boxed section menu.  Parallax-free and animation-free, so there is
 * little to do in JS: it marks the hero ready when the image has decoded, swaps in the
 * placeholder if the image fails to load, and marks in-page menu links that point at the
 * current page with aria-current.
 *
 * API:   const hero = mount(el, opts);   hero.destroy();
 *   el   -- the .hero element (contains img.hero__img and nav .hero__menu)
 *   opts -- { fallbackSrc }   image to use if the main one 404s
 */
export function mount(el, opts = {}) {
  const img = el.querySelector("img.hero__img");
  const onLoad = () => (el.dataset.heroState = "ready");
  const onError = () => {
    const fb = opts.fallbackSrc || el.dataset.fallbackSrc;
    if (fb && img && !img.src.endsWith(fb)) img.src = fb;
    else el.dataset.heroState = "error";
  };
  if (img) {
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    if (img.complete) (img.naturalWidth ? onLoad : onError)();
  }
  const here = location.pathname.replace(/\/index\.html$/, "/");
  el.querySelectorAll(".hero__menu a").forEach((a) => {
    try {
      const u = new URL(a.href, location.href);
      if (!u.hash && u.pathname === here && here !== "/") a.setAttribute("aria-current", "page");
    } catch (e) {}
  });
  return {
    destroy() {
      if (img) {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      }
      delete el.dataset.heroState;
    },
  };
}
