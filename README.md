# iotek-web / landingiotek

Sitio de Iotek Soluciones SA. Landing estatica de tres paginas.

- `index.html` — hub de entrada
- `edificios.html` — control y monitoreo de instalaciones
- `moviles.html` — control y monitoreo de flotas

HTML estatico. Three.js y Motion se cargan por CDN, las tipografias desde Google
Fonts. No hay build: lo que esta en el repo es lo que se sirve.

## Este repo es un artefacto generado

No editar los archivos aca. Se generan desde el repo de trabajo con
`publicar.py`, que copia solo los archivos que las tres paginas referencian de
verdad y pushea a los dos remotos.

| Remoto | Destino |
| --- | --- |
| `origin` | github.com/cecco29/iotek-web — sirve https://cecco29.github.io/iotek-web/ |
| `01lab` | git.01lab.org/iotek/landingiotek |

Los dos comparten la misma historia. Si clonaste de uno solo, agregar el otro:

```
git remote add 01lab https://git.01lab.org/iotek/landingiotek.git
```

El deploy en GitHub Pages es de revision interna, todavia no es `iotek.com.ar`.
