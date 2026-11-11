/* Look picker: Amorph (default), Amorph exact, or Classic. Saved per browser when storage is available. */
(function () {
  var KEY = 'juncture.look', DEFAULT = 'theme-amorph-exact', sel = document.getElementById('look'), v = DEFAULT;
  try { var s = localStorage.getItem(KEY); if (s !== null) v = s; } catch (e) {}
  function apply(x) {
    document.body.classList.remove('theme-amorph', 'theme-amorph-exact');
    if (x) document.body.classList.add(x);
  }
  apply(v);
  if (sel) {
    sel.value = v;
    sel.addEventListener('change', function () {
      apply(sel.value);
      try { localStorage.setItem(KEY, sel.value); } catch (e) {}
    });
  }
})();
