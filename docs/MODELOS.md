# Modelos 3D

Helios Outpost usa dos modelos 3D aportados por el equipo. El resto del mundo (módulos, róver tripulado, rocas y terreno) se genera por código.

| Archivo | Qué es | Origen y créditos | Dónde aparece |
|---|---|---|---|
| `src/assets/models/astronaut.glb` | Astronauta con traje de superficie, una sola malla con texturas | Modelo del equipo Los Chiiakawitas (`Modelo_14_11_2026_13_41`) | Es el jugador y los tripulantes en EVA |
| `src/assets/models/curiosity.glb` | Róver Curiosity | NASA/JPL-Caltech, modelo de NASA 3D Resources | Explorador robótico en las misiones de Marte |

**Créditos de Curiosity:** el material de la NASA no tiene copyright en EE. UU. Aun así, hay que citarlo («NASA/JPL-Caltech»). Tampoco puede usarse para dar a entender que la NASA respalda el juego.

## Cómo se prepararon

Los originales pesaban 13 MB (Curiosity) y 6,4 MB (astronauta). El juego se distribuye como un único HTML, así que se comprimieron con [glTF-Transform](https://gltf-transform.dev) 4.5.1. La geometría usa meshopt y las texturas pasaron a WebP de 1024 px como máximo.

```bash
# Curiosity venía con materiales specular-glossiness, que three.js ya no admite
npx gltf-transform metalrough Curiosity_Rover_de_Marte.glb curiosity-mr.glb
# (se quitaron también las tangentes, que no usa: three.js las calcula si hace falta)
npx gltf-transform optimize curiosity-mr.glb curiosity.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify-ratio 0.6 --simplify-error 0.0004 --join false --flatten false

# Astronauta: de 190 000 a 38 000 triángulos
npx gltf-transform optimize Modelo_14_11_2026_13_41.glb astronaut.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify-ratio 0.2 --simplify-error 0.0015
```

Resultado:

| Modelo | Tamaño | Triángulos |
|---|---|---|
| Curiosity | 0,97 MB | 44 000 |
| Astronauta | 0,60 MB | 38 000 |

## Cómo se cargan

`src/render/models.ts` carga los dos archivos con `GLTFLoader` y el decodificador meshopt. En el build de un solo archivo, Vite los incrusta como direcciones `data:`, así que el juego sigue abriéndose con doble clic, sin servidor. Si un navegador no puede cargarlos (por ejemplo, uno antiguo sin WebP), el juego sigue con el astronauta procedural y sin explorador.

## El astronauta se mueve con el esqueleto del juego

El modelo es una malla rígida, sin huesos. En `src/entities/astronautSkin.ts` se le ajusta un esqueleto con 11 articulaciones: caderas, rodillas, cintura, hombros, codos y cuello. Sus posiciones se midieron en la propia malla, cortándola en rodajas horizontales.

Cada vértice se reparte entre los tres huesos más cercanos. La distancia se mide en «radios de hueso», con algunas reglas:
- una bota izquierda nunca sigue a la pierna derecha;
- la mochila va siempre con el torso;
- el casco va con el cuello.

El astronauta procedural de `src/entities/astronaut.ts` sigue calculando el paso:
- caminar en Marte o dar saltos en la Luna;
- volar con el propulsor;
- trabajar con una herramienta;
- ir sentado en el róver.

Sus ángulos se copian a los huesos del modelo en cada fotograma. Las bandas de color de cada especialidad se mantienen en brazos y muslos.

## Curiosity, el explorador de Marte

`src/game/scout.ts` mueve el róver:
- recorre puntos a 20–80 m de la base;
- esquiva los módulos;
- se detiene si un astronauta se le pone delante;
- se inclina con el terreno;
- en cada parada dispara ChemCam (la chispa en la roca; el láser es infrarrojo e invisible).

En EVA, pulsa E a su lado para descargar sus datos: +1 de ciencia, una vez por sol (`src/sim/scout.ts`).

Su velocidad real es de unos 4 cm/s. En el juego va a 0,33 m/s para que se le vea moverse, y la bitácora científica lo explica.
