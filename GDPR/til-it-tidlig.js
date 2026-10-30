(function () {
  var rot = document.documentElement;
  var os = location.hash.slice(1);
  rot.classList.add("js");
  if (os === "mac" || os === "windows") rot.setAttribute("data-vis", os);
})();
