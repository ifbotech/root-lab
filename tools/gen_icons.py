#!/usr/bin/env python3
"""Iconos de la PWA: la cara del ROOTKIT.

El icono del telefono tiene que ser lo mismo que hay clavado en la maceta. Se
dibuja la cara —dos ojos y una boca sobre el verde de la casa— en vez de un
logo abstracto, porque es lo que el usuario ya vio en la caja y en la planta.

    python tools/gen_icons.py

Escribe public/iconos/*.png
"""
import os
import struct
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(RAIZ, "public", "iconos")

FONDO = (15, 21, 18)
PANEL = (24, 33, 28)
ACENTO = (72, 214, 190)
BLANCO = (232, 239, 230)
PUPILA = (10, 18, 15)


def png(path, w, h, pixeles):
    filas = []
    for y in range(h):
        fila = bytearray([0])
        for x in range(w):
            fila += bytes(pixeles(x, y))
        filas.append(bytes(fila))
    raw = b"".join(filas)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9))
                + chunk(b"IEND", b""))


def cara(lado, margen_pct):
    """Devuelve una funcion de pixel. `margen_pct` deja aire alrededor para
    los iconos maskable, que Android recorta en circulo."""
    m = lado * margen_pct // 100
    util = lado - 2 * m
    cx = lado // 2
    # Proporciones tomadas de art/face.c para que sea la misma cara.
    y_ojos = m + util * 44 // 100
    y_boca = m + util * 73 // 100
    r_ojo = util * 15 // 100
    dx_ojo = util * 22 // 100
    r_pup = r_ojo * 55 // 100
    w_boca = util * 20 // 100

    def dentro_elipse(x, y, ex, ey, rx, ry):
        if rx <= 0 or ry <= 0:
            return False
        dx = (x - ex) / rx
        dy = (y - ey) / ry
        return dx * dx + dy * dy <= 1.0

    def px(x, y):
        # fondo con un degrade vertical suave
        t = y / max(1, lado - 1)
        base = tuple(int(FONDO[i] + (PANEL[i] - FONDO[i]) * t) for i in range(3))

        for lado_ojo in (-1, 1):
            ex = cx + lado_ojo * dx_ojo
            if dentro_elipse(x, y, ex, y_ojos, r_ojo, r_ojo):
                # pupila con brillo arriba a la izquierda
                if dentro_elipse(x, y, ex - r_pup // 3, y_ojos - r_pup // 3,
                                 r_pup // 3 + 1, r_pup // 3 + 1):
                    return BLANCO
                if dentro_elipse(x, y, ex, y_ojos, r_pup, r_pup):
                    return PUPILA
                return BLANCO

        # Boca: arco hacia ABAJO en el medio, que es una sonrisa. Con el
        # signo invertido el centro sube y queda una cara triste, que es
        # exactamente lo que no queres en el icono de una app de plantas.
        if abs(x - cx) <= w_boca:
            t2 = (x - cx) / max(1, w_boca)
            arco = y_boca + int((1 - t2 * t2) * w_boca * 0.45)
            if 0 <= y - arco <= max(2, util // 34):
                return ACENTO
        return base

    return px


def main():
    if not os.path.isdir(DEST):
        os.makedirs(DEST)

    # maskable: Android recorta un circulo, asi que la cara va mas chica.
    salidas = [
        ("icono-192.png", 192, 12),
        ("icono-512.png", 512, 12),
        ("icono-maskable-512.png", 512, 22),
        ("apple-touch-icon.png", 180, 10),
    ]
    for nombre, lado, margen in salidas:
        png(os.path.join(DEST, nombre), lado, lado, cara(lado, margen))
        print("  %-26s %dx%d" % (nombre, lado, lado))
    print("iconos en public/iconos/")


if __name__ == "__main__":
    main()
