/* tema.js — pinta ROOTLAB con la paleta guardada ANTES de la primera pintada.
 *
 * Es un script clásico y chiquito, cargado en el <head>: los módulos se
 * ejecutan después de dibujar, y sin esto la app aparecería un instante con
 * la paleta por defecto y después "saltaría" a la de tu Rooti. Lee los tokens
 * que dejó lib/tema.mjs en el teléfono y los aplica tal cual.
 */
(function () {
  try {
    var guardado = JSON.parse(localStorage.getItem('rootlab:tema') || 'null');
    if (!guardado || !guardado.tokens) return;
    var raiz = document.documentElement.style;
    for (var k in guardado.tokens) {
      if (Object.prototype.hasOwnProperty.call(guardado.tokens, k) && /^[a-z0-9-]+$/.test(k)) {
        raiz.setProperty('--' + k, String(guardado.tokens[k]));
      }
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && guardado.tokens.fondo) meta.setAttribute('content', guardado.tokens.fondo);
  } catch (e) { /* sin almacenamiento: queda la paleta por defecto del CSS */ }
})();
