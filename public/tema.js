/* tema.js — pinta ROOTLAB con la paleta guardada ANTES de la primera pintada.
 *
 * Es un script clásico y chiquito, cargado en el <head>: los módulos se
 * ejecutan después de dibujar, y sin esto la app aparecería un instante con
 * la paleta por defecto y después "saltaría" a la de tu Rooti. Lee los tokens
 * que dejó lib/tema.mjs en el teléfono (los de día y los de noche) y aplica
 * los que tocan según el modo: la misma regla que lib/reloj.mjs, esModoNoche.
 */
(function () {
  try {
    var guardado = JSON.parse(localStorage.getItem('rootlab:tema') || 'null');
    var modo = localStorage.getItem('rootlab:modo') || 'auto';
    var prueba = localStorage.getItem('rootlab:demo-hora');
    var hora = prueba !== null && prueba !== '' && /^\d{1,2}$/.test(prueba) && Number(prueba) < 24 ? Number(prueba) : new Date().getHours();
    var oscuro = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var noche = modo === 'noche' ? true : modo === 'dia' ? false : modo === 'sistema' ? oscuro : (hora >= 22 || hora < 8);
    var html = document.documentElement;
    html.setAttribute('data-noche', noche ? '1' : '0');
    if (!guardado || !guardado.tokens) return;
    var tokens = noche && guardado.tokensNoche ? guardado.tokensNoche : guardado.tokens;
    for (var k in tokens) {
      if (Object.prototype.hasOwnProperty.call(tokens, k) && /^[a-z0-9-]+$/.test(k)) {
        html.style.setProperty('--' + k, String(tokens[k]));
      }
    }
    var estilo = String((noche ? guardado.estiloNoche : guardado.estilo) || '');
    if (/^[a-z]*$/.test(estilo)) html.setAttribute('data-estilo', estilo);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && tokens.fondo) meta.setAttribute('content', tokens.fondo);
  } catch (e) { /* sin almacenamiento: queda la paleta por defecto del CSS */ }
})();
