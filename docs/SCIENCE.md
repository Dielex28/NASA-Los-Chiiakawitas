# Base científica de Helios Outpost

Este documento separa tres cosas: **valores reales** que el simulador usa tal cual, **modelos simplificados** con su justificación, y **ajustes de jugabilidad** que se apartan de la realidad a propósito. Las constantes viven en `src/sim/catalog.ts`, `src/sim/worlds.ts`, `src/sim/environment.ts`, `src/sim/sites.ts` y `src/sim/route.ts`. *(English version: [SCIENCE.en.md](SCIENCE.en.md).)*

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
| Retardo el día del aterrizaje de Perseverance (18-2-2021) | 11 min 22 s | NASA/JPL, cobertura del aterrizaje de Mars 2020 |
| Pérdida de densidad ósea en microgravedad | 1–1,5 % al mes (cadera, columna) | NASA Human Research Program, *Risk of Early Onset Osteoporosis Due to Spaceflight* |
| Ejercicio diario en la ISS | ≈ 2 h (cinta, bicicleta, ARED) | NASA, *Exercising in Space* |
| Límite de regreso a pie (walkback) del LRV | El róver no se alejaba más de lo que la tripulación podría volver andando con el soporte vital restante | NASA, *Apollo Lunar Surface Journal* (Apolo 15–17) |
| Producción de MOXIE | 122 g de O₂ en 16 ensayos (2021–2023) | NASA/JPL, cierre de operaciones de MOXIE, septiembre de 2023 |
| Polvo sobre paneles en Marte | 0,28 % de potencia perdida por sol | Landis y Jenkins, experimento MAE de Mars Pathfinder, J. Geophys. Res. 105 (2000) |
| Potencia del reactor Kilopower | 1–10 kWe por unidad | NASA/DOE, ensayo KRUSTY (2018) |
| Iluminación en la cresta de Shackleton | > 80 % del tiempo en los mejores puntos | Mazarico et al., *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211 (2011) |
| Agua en cráteres en sombra permanente | Detectada por LCROSS en Cabeus (2009) | Colaprete et al., Science 330 (2010) |
| Rendimiento de cultivos en ambiente controlado | 20–35 g de materia seca comestible por m² y día (papa, trigo) | Wheeler et al., *Crop productivities and radiation use efficiencies for bioregenerative life support*, Adv. Space Res. 41 (2008) |
| Presión parcial de CO₂ | 1 kg en 300 m³ a 22 °C ≈ 1,39 mmHg | Ley de los gases ideales |
| Explosión del tanque de oxígeno n.º 2 del Apolo 13 | 55 h 54 min 53 s de misión (13-4-1970) | NASA, *Report of Apollo 13 Review Board* (1970) |
| Opacidad del cielo en Opportunity durante la tormenta global de 2018 | τ ≈ 10,8 (10-6-2018, la mayor medida por un róver) | NASA/JPL, *Opportunity Hunkers Down During Dust Storm*, junio de 2018 |
| Conjunción solar de Marte | Cada ≈ 26 meses; unas dos semanas sin enviar órdenes a las sondas | NASA/JPL, *Mars Solar Conjunction* (moratorias de 2019 y 2021) |
| Fuga de aire por un agujero | Flujo estrangulado: ṁ = Cd·A·p·√(γ/RT)·(2/(γ+1))^((γ+1)/(2(γ−1))), con Cd 0,61, γ 1,4; ≈ 7 kg de aire/h por 5 mm a 70 kPa | Ecuación de flujo crítico por un orificio (cualquier texto de dinámica de gases) |
| Atmósfera de la cabina | 70 kPa con 26,5 % de O₂ en volumen (29 % en masa), a 22 °C | NASA, atmósfera de exploración de la ISS para preparar EVA (10,2 psi) |
| Agujero de la Soyuz MS-09 | 2 mm, sellado en 2018 con cinta Kapton y masilla epoxi | NASA y Roscosmos, agosto de 2018 |
| Impacto lunar del 17-3-2013 | Meteoroide de unos 40 kg a ≈ 90 000 km/h; destello visible desde la Tierra; cráter de 18 m | NASA Meteoroid Environment Office; Robinson et al., *Icarus* 252 (2015) |
| Cráteres lunares nuevos | 222 en unos siete años (≥ 10 m), un tercio más de lo esperado, y muchas manchas de eyecta | Speyerer et al., *Nature* 538 (2016) |
| Sismos lunares someros | 28 entre 1972 y 1977, algunos de magnitud superior a 5 | Nakamura et al., *Proc. Lunar Planet. Sci. Conf.* 10 (1979) |
| Sismo del 13-3-1973 | El más fuerte de los someros registrados por el Apolo, con epicentro cerca del polo sur, ligado a fallas del borde de de Gerlache | Watters et al., *Planetary Science Journal* 5 (2024) |
| Martemoto mayor registrado | Magnitud 4,7, 4-5-2022 (S1222a); más de 1 300 en total | NASA/JPL, misión InSight |
| Incendio de la Mir | 23-2-1997: una vela de oxígeno ardió unos 14 minutos | NASA, relatos de la misión NASA-Mir (J. Linenger) |
| Impresión de repuestos | Impresoras 3D en la ISS desde 2014; el Refabricator recicla plástico (2019) | NASA, In-Space Manufacturing |
| Escudo electrodinámico de polvo | Funcionó en la superficie lunar en 2025, a bordo de Blue Ghost | NASA/Firefly, Blue Ghost Mission 1 |

### Relieve real

Cinco lugares usan modelos digitales de elevación públicos, recortados a 6,4 × 6,4 km y remuestreados a 384 × 384 puntos (unos 17 m por punto):

| Sitio | Fuente | Resolución original | Centro del recorte |
| --- | --- | --- | --- |
| Borde de Shackleton, polo sur lunar (89,776° S, 156,27° O) | LRO-LOLA, «Site04 Shackleton rim». Barker, M.K., et al. (2021), *Planetary & Space Science* 203, 105119, doi:10.1016/j.pss.2020.105119. https://pgda.gsfc.nasa.gov/products/78 | 5 m/px | El punto más llano y alto de la cresta con la pared del cráter a menos de 1 km (cota 1 734 m sobre el datum del modelo); el cráter cae casi 2 km |
| Cresta de conexión, polo sur lunar | LRO-LOLA, «Site01 Connecting ridge» (mismo producto) | 5 m/px | Píxel (2542, 1982): 89,373° S, 151,45° O |
| Macizo de Malapert | LRO-LOLA, «Site23 Malapert massif» | 5 m/px | Píxel (1922, 1170): 85,962° S, 2,41° O, cerca de la cima (≈ 5 km sobre el datum) |
| Borde del cráter Nobile | LRO-LOLA, «Site06 Nobile rim 1» | 5 m/px | Píxel (1238, 2410): 85,297° S, 37,09° E |
| Cráter Jezero, Marte | Mosaico DTM CTX de *Mars 2020 Terrain Relative Navigation*. USGS Astrogeology, Fergason et al. (2020), doi:10.5066/P906QQT8 | 20 m/px | Lugar de aterrizaje de Perseverance, 18,4447° N, 77,4508° E (cota −2 566 m) |

En los sitios lunares nuevos el punto de aterrizaje lo elige el script: la celda de 20 m más alta y llana del archivo (pendiente < 3° en 60 m, máxima prominencia sobre el entorno de 1 km) que deja dentro los 6,4 km del recorte. Con el mismo criterio, para Shackleton sale un punto a 40 m del que se eligió a mano. Por debajo de la resolución de los datos el juego añade rugosidad generada (≤ 1,7 m), que se anula en los 12 m alrededor de la zona de aterrizaje. En los sitios lunares el potencial de hielo crece con la profundidad bajo el punto de aterrizaje, como aproximación a las trampas frías; no es un mapa medido de hielo. El proceso completo está en `scripts/real-terrain.py`.

**El Sol en cada sitio.** Latitud y longitud salen de la georreferencia de cada archivo (proyección estereográfica polar sur, x = ρ·sen λ, y = ρ·cos λ, con ρ = 2R·tan(colatitud/2) y R = 1 737,4 km). Cerca del polo el Sol da una vuelta al horizonte cada mes sinódico, hacia el oeste, y su elevación es δ + (90° − |latitud|)·cos H: δ es la latitud del punto subsolar (oscila entre −1,54° y +1,54° en un «año de eclipses» de 346,6 días) y H el ángulo entre el meridiano del Sol y el del sitio. Las misiones usan δ = +1,2° (verano austral, cerca del máximo). Así, en Shackleton y en la cresta de conexión el Sol va de 1,0° a 1,4° y de 0,6° a 1,8° y no llega a ponerse sobre un horizonte plano; en Malapert y Nobile, a unos 4° del polo, oscila unos ±4–4,7° y se pone alrededor de un 40 % del mes (unos 12 días seguidos). El horizonte de cada panel se calcula sobre los 6,4 km del recorte: las montañas más lejanas, que en la realidad tapan el Sol algunos días, no están incluidas.

## 2. Modelos simplificados

**Red eléctrica.** Toda la base comparte una sola red. Cada módulo pide una carga de mantenimiento (calefacción) y otra de operación; se sirven por orden de prioridad y lo que no cabe se queda sin energía. El excedente carga primero el almacenamiento más eficiente. No se modelan tensiones ni pérdidas en cables.

**Sol y sombras.** Para cada panel se calcula una "máscara de horizonte" de 72 rumbos marchando sobre el terreno del juego. El panel produce cuando el Sol está por encima de esa línea. En Marte la transmisión atmosférica es `exp(−0,30·τ/μ)`, una aproximación de una sola fórmula al modelo de Appelbaum y Flood que combina luz directa y difusa; τ es la profundidad óptica del polvo.

**Blindaje.** La fracción de dosis que atraviesa `x` g/cm² se aproxima con dos curvas: `0,3 + 0,7·e^(−x/260)` para rayos cósmicos y `0,01 + 0,99·e^(−x/15)` para protones solares. Reproducen el comportamiento cualitativo conocido —los protones solares se frenan con poco material; los rayos cósmicos necesitan metros— pero **no** sustituyen un cálculo de transporte de partículas (HZETRN, OLTARIS, Geant4).

**Tormentas solares.** Tres clases con dosis total sin blindaje de 12, 60 y 340 mSv, subida rápida (1,5 h) y caída exponencial. Las cifras están en el orden de magnitud de eventos históricos (agosto de 1972, octubre de 1989), no reproducen ninguno en concreto. En Marte se aplica un factor 0,3 por la atmósfera.

**Escenarios históricos.** Dos misiones se inspiran en tormentas reales. *Agosto de 1972*: entre el Apolo 16 y el Apolo 17 el Sol produjo uno de los eventos de protones más intensos registrados; en el juego, 450 mSv sin blindaje repartidos en 40 h. *Septiembre de 2017*: una tormenta que llegó a Marte, registrada en la superficie por el detector RAD de Curiosity y acompañada de auroras observadas por MAVEN; en el juego, 120 mSv sin blindaje en 48 h antes del factor atmosférico. Fechas e historia son reales; las dosis y los perfiles son valores de juego del orden de magnitud adecuado, no reconstrucciones de las mediciones.

Otros dos reproducen accidentes y fenómenos reales. *Junio de 2018*: una tormenta de polvo que empezó a finales de mayo, rodeó todo el planeta en junio y dejó a Opportunity sin energía (su último contacto fue el 10 de junio de 2018). En el juego empieza entre los soles 4 y 6 y dura 34–38 soles con una profundidad óptica de 9,5 a 10,8; el retraso de radio es de 3,7 min porque Marte se acercaba a la oposición del 27 de julio. *Abril de 1970*: a las 55 h 55 min de misión estalla un tanque de oxígeno, como en el Apolo 13. En el juego el oxígeno almacenado cae al 35 %, las celdas de combustible quedan fuera de servicio (condición 5 %) y empieza una emergencia del soporte vital (los depuradores de CO₂) en el ECLSS o, si no hay, en el módulo de descenso. El accidente real fue en el espacio, camino de la Luna; aquí sucede en la superficie, con siete días de misión y los mismos recursos que salvaron a la tripulación: apagar lo que no es imprescindible, los cartuchos de reserva y tiempo.

**Soporte vital.** La electrólisis consume 1,125 kg de agua por kg de O₂; el reactor Sabatier devuelve la mitad, así que el coste neto es 0,56 kg de agua por kg de O₂. El CO₂ se acumula en el volumen de cabina y lo retiran los depuradores (que necesitan energía) y las plantas.

**Térmica.** La cabina sin energía tiende a la temperatura exterior con una constante de tiempo de 72 h (Luna) o 48 h (Marte). La demanda de calefacción crece con el frío y disminuye hasta un 70 % con cubierta de regolito.

**Tripulación.** Salud y ánimo son índices de 0 a 100. La salud responde a hipoxia, CO₂, sed, hambre, frío y dosis aguda; el ánimo, a comida fresca, comunicaciones, hacinamiento, carga de trabajo y sustos recientes. Ambos multiplican las horas útiles. Son reglas de juego inspiradas en estudios de factores humanos (p. ej. CHAPEA), no un modelo fisiológico.

**Objetos sueltos (física de EVA).** Las rocas lanzadas, el martillo y la pluma se integran a 240 pasos por segundo con gravedad, arrastre aerodinámico F = ½·ρ·C_d·A·v² respecto al aire (incluido el viento), rebote con coeficiente de restitución y fricción de Coulomb contra el terreno. Densidad del aire: 0 en la Luna, 0,020 kg/m³ en Marte (≈ 1,6 % de los 1,225 kg/m³ de la Tierra). El martillo (1,32 kg) y la pluma (0,03 kg) son los de la demostración de David Scott en el Apolo 15; el área (0,012 m²) y el coeficiente de arrastre (1,3) de la pluma son estimaciones nuestras. Con esos valores, desde 1,6 m: en la Luna ambos tardan 1,40 s; en Marte la pluma llega unos 0,001 s después; en la Tierra, unos 0,05 s después. Una pluma real revolotea y tarda más: el modelo no incluye sustentación ni rotación acoplada. El viento marciano se toma como 3 m/s en calma y hasta 25 m/s en tormenta.

**Róver.** Sólido rígido de 620 kg con tripulante (el LRV del Apolo pesaba unos 210 kg vacío y unos 700 kg cargado) sobre cuatro ruedas con muelle y amortiguador independientes, integrado a 240 pasos por segundo. La fuerza de cada neumático, longitudinal y lateral juntas, está limitada por un círculo de fricción de radio μ·N con μ = 0,72 (estimación para rueda de malla sobre regolito); la resistencia a la rodadura es el 6 % de la carga. Los muelles se dimensionan para un hundimiento de 7 cm bajo el peso local y un amortiguamiento del 55 % del crítico. La distancia de frenado resultante sigue v²/(2·μ·g): desde 6 m/s, unos 15 m en la Luna y unos 7 m en Marte (en la Tierra serían 2,5 m). La batería es de 9 kWh; consume la potencia mecánica dividida por un rendimiento de 0,8 más 120 W de electrónica, y se recarga con su panel (0,45 kW a pleno Sol) o junto a la base (2,5 kW). Capacidad, rendimiento y potencias son valores nuestros, no de un vehículo concreto.

**Propelente de regreso.** En la Luna la planta separa agua en hidrógeno y oxígeno y los licúa: toda la masa del propelente sale del agua, a unos 7 kWh por kg (la electrólisis sola necesita en teoría 4,4 kWh por kg de agua; el resto es rendimiento real y licuefacción). En Marte la reacción de Sabatier combina el hidrógeno con CO₂ del aire para hacer metano; el balance neto CO₂ + 2 H₂O → CH₄ + 2 O₂ da 80 kg de propelente por cada 36 kg de agua y 44 kg de aire (unos 2,2 kg por kg de agua) a unos 3,5 kWh por kg. Las proporciones se ajustan a la estequiometría; los motores reales queman con algo menos de oxígeno. Los objetivos del juego (300 kg en la Luna, 1,5 t y 6 t en Marte) son lotes de demostración: un vehículo de ascenso real necesitaría decenas de toneladas.

**Emergencias.** Una fuga pierde 3,5 kg de O₂ por hora y una perforación de micrometeorito 6 kg/h (estimación nuestra para un agujero de pocos cm² con la cabina a unos 70 kPa). Aislar el módulo detiene la pérdida al momento pero lo deja fuera de servicio hasta repararlo; parchear desde dentro tarda 2,5–4 h con el 40 % de la fuga. Un fallo del soporte vital detiene toda la depuración de CO₂; con cuatro personas el CO₂ sube unos 1,2 mmHg por hora, y por encima de 6 mmHg el juego empieza a dañar la salud. Los cartuchos de hidróxido de litio (el sistema de respaldo que usaron las cápsulas Apolo) lo controlan durante 18 h, una vez por misión. Si nadie decide en 1,5 h de misión, la tripulación aplica la opción conservadora (aislar, o reparar más despacio). Las tasas son valores de juego; la lógica —decidir con información incompleta y tiempo limitado— es la de los procedimientos reales.

**Expediciones.** El objetivo lejano de cada misión se coloca a 980–1 060 m de la base, en la dirección con la ruta recta más suave (la pendiente máxima del trayecto queda por debajo de 25°). Con la reserva del traje a paso normal (540 s a 3,1 m/s, unos 1 670 m) no se puede ir y volver a pie; en el róver el comandante gasta el traje al ritmo de reposo. Es la misma lógica que llevó a usar el LRV en las tres últimas misiones Apolo: alcance a cambio de consumibles.

**Retraso de radio y Control de misión.** Cada misión tiene un retraso de ida: 1,28 s desde la Luna; 11,4 min en *Jezero: Sol 0* (la fecha de Perseverance), 20 min en *Septiembre de 2017* (Marte acababa de pasar la conjunción solar del 27 de julio), 16 min en la misión larga y 12 min (el valor medio) en el modo libre; en los retos del día y en el editor, entre 3 y 22 min. Pedir ayuda en una emergencia exige antena; la respuesta llega tras la ida y vuelta más 15 min de análisis (un valor nuestro), y seguir su procedimiento acorta un 40 % el parche o la reparación: es la idea de los equipos de tierra que prueban un arreglo en una réplica del equipo, como el adaptador de filtros de CO₂ del Apolo 13. En Marte el ánimo objetivo baja 3 + 0,15 puntos por minuto de retraso: sin conversaciones en directo con casa, solo mensajes.

**Catástrofes y daños.** Cada catástrofe deja daños concretos con su efecto: una perforación pierde el aire que da la ecuación de flujo estrangulado de arriba (la base repone el oxígeno de ese aire desde sus tanques; el nitrógeno no se modela), un panel pierde la fracción de células rotas, una antena desviada 6° o más pierde el enlace, un mástil inclinado pierde el coseno del ángulo, un cable cortado o un ordenador bloqueado dejan el módulo fuera de servicio, una grieta triplica el desgaste y puede abrirse en una perforación (≈ 1 de cada 8 por sol), y una fuga pierde agua. La eyecta de un impacto alcanza 15 + 5·D metros (D, diámetro del cráter) y daña con una probabilidad que crece con la cercanía; los sismos dañan según la magnitud (de 2,5 a 5). En misiones normales hay catástrofes al azar con ritmos de juego (en la Luna, un impacto cada ≈ 28 días y un sismo cada ≈ 35; en Marte, que frena los meteoroides pequeños con su atmósfera, un impacto cada ≈ 250 soles), reproducibles con la semilla. Los repuestos son cajas de 5 piezas y 40 kg; sin ellos se improvisan, con 2,5 veces más trabajo, los parches de menos de 10 mm, los cables, las fugas y las grietas.

**Conjunción solar.** Cuando Marte queda casi detrás del Sol visto desde la Tierra, la corona solar corrompe las señales y las agencias dejan de enviar órdenes unas dos semanas. En el juego ocurre en *Marte · estancia larga* entre los soles 88 y 102 y, en el editor, desde el 45 % de la misión durante 14 soles (solo en Marte y en misiones de 20 soles o más). Mientras dura no se puede pedir ayuda a Control, el aviso de una tormenta solar llega con 0,4 h de antelación (lo que detectan los sensores de la base) en lugar de 2,5 h, y el término de comunicaciones del ánimo pasa de +8 a −8, como si no hubiera antena.

**Salud a largo plazo.** Hueso y músculo empiezan en el 100 % de su valor en la Tierra. Sin ejercicio se pierde un 1,5 % de densidad ósea y un 10 % de fuerza al mes en ingravidez, multiplicado por (1 − g/9,81): 0,835 en la Luna y 0,62 en Marte. Que la pérdida sea proporcional a la gravedad que falta es una suposición nuestra; nadie ha medido todavía el efecto de vivir meses con un sexto o un tercio de g. Una hora de ejercicio diario evita el 60 % de la pérdida ósea y el 70 % de la muscular; dos horas, el 85 % y el 95 %, y permiten recuperar fuerza poco a poco. Cada hora de ejercicio sale de la jornada de trabajo. Por debajo del 90 % de fuerza, el trabajo útil baja en proporción (hasta un mínimo del 60 %). La estimación de rehabilitación supone que el hueso tarda 2,5 veces más en recuperarse que en perderse. La monotonía resta hasta 8 puntos de ánimo objetivo a razón de 2 por mes, y hacer ejercicio suma 3.

**Planificador de rutas EVA.** El coste de una ruta usa el mismo modelo que la EVA del juego: 540 s de traje a 345 W, caminando a 3,1 m/s; 265 W en cada parada (15 s, es decir, 15 min de misión) y 160 W sentado en el róver. Subir cuesta, además, el trabajo de elevar 165 kg (persona y traje) con una eficiencia muscular del 25 %; el juego aplica ese mismo término al caminar cuesta arriba, para que la estimación y la realidad coincidan. Tramos de más de 15° se señalan como empinados y de más de 25° como peligrosos. La batería del róver se estima con la resistencia a la rodadura (6 %), la subida y 120 W de electrónica a 4 m/s. El límite de regreso a pie comprueba, para cada punto, que el traje gastado en llegar en róver más el necesario para volver andando en línea recta deja al menos un 15 % de reserva.

**Esfuerzo en EVA.** La potencia metabólica se estima con un ajuste sencillo (≈ 125 W en reposo, ≈ 190 W a paso lento, ≈ 345 W al paso largo del juego y ≈ 660 W corriendo), del orden de lo medido en las EVA del Apolo (medias de 230–300 W, picos por encima de 500 W). La reserva del traje se consume en proporción a ella: dura lo previsto caminando, más si te quedas quieto y casi la mitad si corres. Es una regla de juego, no un modelo fisiológico.

## 3. Ajustes de jugabilidad

| Ajuste | Realidad | Motivo |
| --- | --- | --- |
| Los cultivos completan su ciclo en la mitad de tiempo | Lechuga ≈ 30 días, papa ≈ 100 días | Que una cosecha quepa en una misión. El rendimiento **por día** se mantiene realista, de modo que la lección (hacen falta decenas de m² por persona) no cambia. |
| Elevación del Sol en las bases lunares diseñadas ≈ 3,5–5,7° | ≤ 1,5° más la ventaja de la altitud | Sombras legibles y un mapa de iluminación con zonas útiles. En los cuatro sitios con relieve real se usa la trayectoria real (ver arriba). |
| Montar un módulo lleva horas de tripulación | Días de trabajo y EVAs | Ritmo de juego. |
| Reabastecimiento a mitad de misión en Marte | Las ventanas de lanzamiento distan 26 meses | Se justifica como carga preposicionada en órbita. |
| Un solo valor de dosis por tripulante | Dosis por órgano, calidad de la radiación | Sencillez. |
| Paneles de 10 kW y reactor de 10 kW como unidades redondas | Diseños reales con otras potencias | Comparaciones mentales fáciles para estudiantes. |
| El tiempo corre 60× en EVA y hasta 4 320× en la consola | — | Que quepan 30–180 días en una sesión. |
| Los objetos lanzados y soltados se mueven en tiempo real | El reloj de la misión corre 60× en EVA | Una caída de 1,4 s tiene que verse durar 1,4 s. |
| El róver alcanza 34 km/h | El LRV del Apolo rodaba a 13–18 km/h | Que conducir compense claramente frente a caminar. |
| Si el róver vuelca, la tripulación lo endereza al momento | Sería una emergencia seria | Público joven: se paga con salud y reserva del traje, no con el fin de la misión. |
| Lanzamiento a 11 m/s con traje | Depende del traje y del astronauta | Valor único y moderado para poder comparar mundos. |
| Evacuación en lugar de fallecimiento | — | Público joven: la misión se aborta, nadie muere. |
| La tormenta de 2018 dura 34–38 soles | Más de tres meses, de finales de mayo a septiembre | Que quepa en una misión de 40 soles; la fase más oscura sí dura semanas. |
| El accidente del Apolo 13 sucede en la superficie lunar | Sucedió en el espacio, camino de la Luna | El juego transcurre en una base; se conservan la hora, la cadena de fallos y la solución. |
| El impacto de 2013 cae junto a la base y el incendio de la Mir sucede en Marte | Fueron en Mare Imbrium y en órbita terrestre | Se conservan la fecha, el tamaño y lo que ocurrió; cambia el lugar. |
| Ritmos de catástrofes, heridos y tiempos de reparación | — | Valores de juego para que una misión de 30 días tenga dos o tres sucesos que resolver. |
| Las heridas sanan en horas o días | Una fractura tarda semanas | Ritmo de juego; la lección (una tripulación herida trabaja menos) se mantiene. |
| Los minijuegos simplifican los procedimientos | Los reales son más largos y tienen más pasos | Se conserva la idea clave de cada uno (el orden en estrella, aislar antes de reparar, enfriar una quemadura…). |

## 4. Cómo comprobarlo

Las pruebas de `tests/sites.test.ts` comprueban las latitudes, la elevación del Sol en cada sitio y el sentido de su giro; `tests/comms.test.ts`, los retrasos y la respuesta de Control; `tests/health.test.ts`, la pérdida de hueso y músculo con y sin ejercicio; `tests/route.test.ts`, que el planificador da el mismo coste que el juego y aplica el límite de regreso a pie; `tests/historic.test.ts`, la opacidad de 2018 y que solo una base con reactores la supera, y la hora y los efectos del accidente del Apolo 13; `tests/csv.test.ts`, que los datos exportados tienen todas las columnas y se leen como números; `tests/faults.test.ts`, la ecuación de la fuga, los daños de impactos y sismos, las reparaciones con y sin repuestos y el incendio; `tests/tasks.test.ts`, las tareas, los encargos y las mejoras. Las pruebas de `tests/vehicle.test.ts` comprueban la suspensión, la tracción y la distancia de frenado del róver. Las pruebas de `tests/physics.test.ts` comparan el motor de física con las fórmulas (caída libre, velocidad terminal, alcance, deriva por viento). Las pruebas de `tests/sim.test.ts` verifican que el simulador cumple lo que este documento afirma: tasas de consumo, efecto del reciclaje, prioridades de carga, atenuación por polvo, diferencia entre blindaje para protones y para rayos cósmicos, dosis por cercanía del reactor y misiones completas.

```bash
npm test
npx tsx tests/balance.ts   # imprime la evolución de cada misión con la carga recomendada
```
