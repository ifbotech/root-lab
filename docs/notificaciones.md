# Notificaciones

Una app de plantas que notifica de más se silencia en una semana, y una
notificación silenciada es peor que ninguna: la importante no llega. Las
reglas de `server/avisos.mjs` son, antes que nada, de restricción.

## Qué se avisa

| Aviso | Cuándo | Se repite |
|---|---|---|
| **Ánimo** (sed, ahogo, frío, calor, sol de más, poca luz, aire seco) | el Rooti reporta ese ánimo con severidad `WATCH` o `URGENT` | a las 8 h; a las 3 h si es urgente |
| **El riego se escurrió** | el Rooti vio la tierra subir de golpe y bajar enseguida (el agua pasó por los costados) | cada 24 h; de día, aunque el ánimo esté bien |
| **Se viene calor** | con la ciudad en Ajustes: el pronóstico de 48 h empeora (factor ≥ 1,15) y, a la velocidad a la que se seca la tierra, la sed llega en menos de 36 h. Dice los tres números. Ver [clima.md](clima.md) | cada 24 h; de día; nunca si ya tiene sed |
| **El cuidador regó** | alguien tocó "ya regué" en el enlace del cuidador ([cuidador.md](cuidador.md)) | cada vez, con el nombre de quien regó |
| **Batería baja** | a batería y por debajo de 3,45 V | cada 24 h |
| **No reporta** | más de 6 h sin noticias | cada 24 h |

## Reglas

1. **Por estado, no por lectura.** Seis horas con sed son veinticuatro lecturas
   y un aviso. Cuando el ánimo vuelve a estar bien, se olvida: el próximo
   episodio avisa enseguida.
2. **De noche no se molesta.** De 23 a 8, en la zona horaria de la cuenta,
   sólo pasa lo urgente.
3. **Antes del cofre, nada.** El Rooti todavía no reveló quién es ni conoce la especie.
4. **Si no reporta, sólo eso.** Lo demás sería información vieja.
5. **Cada aviso dice qué hacer, con el número.** "La tierra está al 18 % y le
   gusta arriba de 25 %. Regala hoy."

El ícono de cada notificación es la cara del personaje en ese ánimo
(`public/caras/<modelo>-<ANIMO>.png`), y el `tag` hace que un aviso nuevo de
la misma planta reemplace al anterior en vez de apilarse.

## Cómo llega

Web Push estándar (`web-push`) con claves VAPID que se generan la primera vez
en `data/vapid.json`. **Respaldar ese archivo**: si cambia, todas las
suscripciones dejan de valer y cada teléfono tiene que volver a activar los
avisos.

- Android (Chrome), escritorio: funciona desde el navegador.
- iPhone: sólo con la app instalada en la pantalla de inicio, iOS 16.4 o
  posterior. Por eso el alta pide instalar primero.
- En todos los casos hace falta **HTTPS** (localhost cuenta como seguro).

Las suscripciones que el servicio de push da por vencidas (404/410) se borran
solas.

Un temporizador revisa cada 10 minutos las macetas que dejaron de reportar y,
para las cuentas con ciudad, el pronóstico (como mucho una consulta a
Open-Meteo cada 6 h por cuenta).
