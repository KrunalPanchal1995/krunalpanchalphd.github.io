/* icon-video.js: Studio-made project icon loops (video[data-icon-video]).
   Muted, looped, preload none. A loop plays only while it is on screen, only with effects on (html[data-fx="on"])
   and not under prefers-reduced-motion; otherwise the still (the poster/img) is all that shows.
   At most MAX loops play at once. */
(function () {
  "use strict";
  var MAX = 6;
  var vids = Array.prototype.slice.call(document.querySelectorAll("video[data-icon-video]"));
  if (!vids.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var playing = [];
  function allowed() {
    var fx = document.documentElement.getAttribute("data-fx");
    return !reduce && fx !== "off" && fx !== "lite" && !document.hidden;
  }
  function stop(v) {
    v.pause();
    v.classList.remove("is-on");
    var i = playing.indexOf(v);
    if (i >= 0) playing.splice(i, 1);
  }
  function start(v) {
    if (!allowed() || playing.indexOf(v) >= 0) return;
    if (playing.length >= MAX) stop(playing[0]);
    playing.push(v);
    var p = v.play();
    if (p && p.then)
      p.then(function () {
        v.classList.add("is-on");
      }).catch(function () {
        stop(v);
      });
  }
  var visible = new Set();
  var io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (es) {
            es.forEach(function (e) {
              if (e.isIntersecting) {
                visible.add(e.target);
                start(e.target);
              } else {
                visible.delete(e.target);
                stop(e.target);
              }
            });
          },
          { threshold: 0.5 }
        )
      : null;
  function sync() {
    vids.forEach(function (v) {
      if (allowed() && visible.has(v)) start(v);
      else stop(v);
    });
  }
  if (io)
    vids.forEach(function (v) {
      io.observe(v);
    });
  document.addEventListener("fx:change", sync);
  document.addEventListener("visibilitychange", sync);
})();
