# Base científica de Helios Outpost

Este documento separa tres cosas: **valores reales** que el simulador usa tal cual, **modelos simplificados** con su justificación, y **ajustes de jugabilidad** que se apartan de la realidad a propósito. Las constantes viven en `src/sim/catalog.ts`, `src/sim/worlds.ts` y `src/sim/environment.ts`.

## 1. Valores reales

| Magnitud | Valor en el juego | Fuente |
| --- | --- | --- |
| Gravedad de la Luna / Marte | 1,62 / 3,71 m/s² | NASA Planetary Fact Sheets |
| Constante solar a 1 UA | 1 361 W/m² | NASA Planetary Fact Sheets |
| Irradiancia media en Marte | 586 W/m² (varía 492–715) | Appelbaum y Flood, *Solar radiation on Mars*, Solar Energy 45 (1990) |
| Duración del sol marciano | 24 h 39 min 35 s | NASA Mars Fact Sheet |
| Mes sinódico lunar | 708,7 h | NASA Moon Fact Sheet |
| Consumo de O₂ por persona | 0,84 kg/día | NASA *Baseline Values and Assumptions Document* (BVAD), NASA/TP-2015-218570 |
| Producción de CO₂ por persona | 1,04 kg/día | BVAD |
| Agua por persona (bebida, comida e higiene) | 11 kg/día | BVAD (hábitat de exploración, sin lavandería) |
| Comida envasada por persona | 1,8 kg/día (~3 000 kcal) | BVAD |
| Recuperación de agua en la ISS | 98 % (el juego usa 95 %) | NASA, anuncio del hito del ECLSS, junio de 2023 |
| Dosis por rayos cósmicos en la superficie lunar | 1,37 mSv/día | Zhang et al., *First measurements of the radiation dose on the lunar surface*, Science Advances 6 (2020) |
| Dosis por rayos cósmicos en la superficie de Marte | 0,67 mSv/día | Hassler et al., *Mars' Surface Radiation Environment Measured with the MSL Curiosity Rover*, Science 343 (2014): 0,64 ± 0,12 |
| Límite de dosis para toda la carrera | 600 mSv | NASA-STD-3001, vol. 1 (límite adoptado en 2022) |
| Retardo de comunicaciones | Luna ≈ 1,3 s; Marte 3–22 min | NASA Deep Space Network |
| Producción de MOXIE | 122 g de O₂ en 16 ensayos (2021–2023) | NASA/JPL, cierre de operaciones de MOXIE, septiembre de 2023 |
| Polvo sobre paneles en Marte | 0,28 % de potencia perdida por sol | Landis y Jenkins, experimento MAE de Mars Pathfinder, J. Geophys. Res. 105 (2000) |
| Potencia del reactor Kilopower | 1–10 kWe por unidad | NASA/DOE, ensayo KRUSTY (2018) |
| Iluminación en la cresta de Shackleton | > 80 % del tiempo en los mejores puntos | Mazarico et al., *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211 (2011) |
| Agua en cráteres en sombra permanente | Detectada por LCROSS en Cabeus (2009) | Colaprete et al., Science 330 (2010) |
| Rendimiento de cultivos en ambiente controlado | 20–35 g de materia seca comestible por m² y día (papa, trigo) | Wheeler et al., *Crop productivities and radiation use efficiencies for bioregenerative life support*, Adv. Space Res. 41 (2008) |
| Presión parcial de CO₂ | 1 kg en 300 m³ a 22 °C ≈ 1,39 mmHg | Ley de los gases ideales |

## 2. Modelos simplificados

**Red eléctrica.** Toda la base comparte una sola red. Cada módulo pide una carga de mantenimiento (calefacción) y otra de operación; se sirven por orden de prioridad y lo que no cabe se queda sin energía. El excedente carga primero el almacenamiento más eficiente. No se modelan tensiones ni pérdidas en cables.

**Sol y sombras.** Para cada panel se calcula una "máscara de horizonte" de 72 rumbos marchando sobre el terreno del juego. El panel produce cuando el Sol está por encima de esa línea. En Marte la transmisión atmosférica es `exp(−0,30·τ/μ)`, una aproximación de una sola fórmula al modelo de Appelbaum y Flood que combina luz directa y difusa; τ es la profundidad óptica del polvo.

**Blindaje.** La fracción de dosis que atraviesa `x` g/cm² se aproxima con dos curvas: `0,3 + 0,7·e^(−x/260)` para rayos cósmicos y `0,01 + 0,99·e^(−x/15)` para protones solares. Reproducen el comportamiento cualitativo conocido —los protones solares se frenan con poco material; los rayos cósmicos necesitan metros— pero **no** sustituyen un cálculo de transporte de partículas (HZETRN, OLTARIS, Geant4).

**Tormentas solares.** Tres clases con dosis total sin blindaje de 12, 60 y 340 mSv, subida rápida (1,5 h) y caída exponencial. Las cifras están en el orden de magnitud de eventos históricos (agosto de 1972, octubre de 1989), no reproducen ninguno en concreto. En Marte se aplica un factor 0,3 por la atmósfera.

**Soporte vital.** La electrólisis consume 1,125 kg de agua por kg de O₂; el reactor Sabatier devuelve la mitad, así que el coste neto es 0,56 kg de agua por kg de O₂. El CO₂ se acumula en el volumen de cabina y lo retiran los depuradores (que necesitan energía) y las plantas.

**Térmica.** La cabina sin energía tiende a la temperatura exterior con una constante de tiempo de 72 h (Luna) o 48 h (Marte). La demanda de calefacción crece con el frío y disminuye hasta un 70 % con cubierta de regolito.

**Tripulación.** Salud y ánimo son índices de 0 a 100. La salud responde a hipoxia, CO₂, sed, hambre, frío y dosis aguda; el ánimo, a comida fresca, comunicaciones, hacinamiento, carga de trabajo y sustos recientes. Ambos multiplican las horas útiles. Son reglas de juego inspiradas en estudios de factores humanos (p. ej. CHAPEA), no un modelo fisiológico.

**Objetos sueltos (física de EVA).** Las rocas lanzadas, el martillo y la pluma se integran a 240 pasos por segundo con gravedad, arrastre aerodinámico F = ½·ρ·C_d·A·v² respecto al aire (incluido el viento), rebote con coeficiente de restitución y fricción de Coulomb contra el terreno. Densidad del aire: 0 en la Luna, 0,020 kg/m³ en Marte (≈ 1,6 % de los 1,225 kg/m³ de la Tierra). El martillo (1,32 kg) y la pluma (0,03 kg) son los de la demostración de David Scott en el Apolo 15; el área (0,012 m²) y el coeficiente de arrastre (1,3) de la pluma son estimaciones nuestras. Con esos valores, desde 1,6 m: en la Luna ambos tardan 1,40 s; en Marte la pluma llega unos 0,001 s después; en la Tierra, unos 0,05 s después. Una pluma real revolotea y tarda más: el modelo no incluye sustentación ni rotación acoplada. El viento marciano se toma como 3 m/s en calma y hasta 25 m/s en tormenta.

**Esfuerzo en EVA.** La potencia metabólica se estima con un ajuste sencillo (≈ 125 W en reposo, ≈ 190 W a paso lento, ≈ 345 W al paso largo del juego y ≈ 660 W corriendo), del orden de lo medido en las EVA del Apolo (medias de 230–300 W, picos por encima de 500 W). La reserva del traje se consume en proporción a ella: dura lo previsto caminando, más si te quedas quieto y casi la mitad si corres. Es una regla de juego, no un modelo fisiológico.

## 3. Ajustes de jugabilidad

| Ajuste | Realidad | Motivo |
| --- | --- | --- |
| Los cultivos completan su ciclo en la mitad de tiempo | Lechuga ≈ 30 días, papa ≈ 100 días | Que una cosecha quepa en una misión. El rendimiento **por día** se mantiene realista, de modo que la lección (hacen falta decenas de m² por persona) no cambia. |
| Elevación del Sol en el polo lunar ≈ 3,5–5,7° | ≤ 1,5° más la ventaja de la altitud | Sombras legibles y un mapa de iluminación con zonas útiles. |
| Montar un módulo lleva horas de tripulación | Días de trabajo y EVAs | Ritmo de juego. |
| Reabastecimiento a mitad de misión en Marte | Las ventanas de lanzamiento distan 26 meses | Se justifica como carga preposicionada en órbita. |
| Un solo valor de dosis por tripulante | Dosis por órgano, calidad de la radiación | Sencillez. |
| Paneles de 10 kW y reactor de 10 kW como unidades redondas | Diseños reales con otras potencias | Comparaciones mentales fáciles para estudiantes. |
| El tiempo corre 60× en EVA y hasta 4 320× en la consola | — | Que quepan 30–180 días en una sesión. |
| Los objetos lanzados y soltados se mueven en tiempo real | El reloj de la misión corre 60× en EVA | Una caída de 1,4 s tiene que verse durar 1,4 s. |
| Lanzamiento a 11 m/s con traje | Depende del traje y del astronauta | Valor único y moderado para poder comparar mundos. |
| Evacuación en lugar de fallecimiento | — | Público joven: la misión se aborta, nadie muere. |

## 4. Cómo comprobarlo

Las pruebas de `tests/physics.test.ts` comparan el motor de física con las fórmulas (caída libre, velocidad terminal, alcance, deriva por viento). Las pruebas de `tests/sim.test.ts` verifican que el simulador cumple lo que este documento afirma: tasas de consumo, efecto del reciclaje, prioridades de carga, atenuación por polvo, diferencia entre blindaje para protones y para rayos cósmicos, dosis por cercanía del reactor y misiones completas.

```bash
npm test
npx tsx tests/balance.ts   # imprime la evolución de cada misión con la carga recomendada
```
