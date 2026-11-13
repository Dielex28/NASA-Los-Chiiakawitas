import { addStrings } from './strings';

export interface CodexEntry {
  id: string;
  /** Group heading key. */
  group: 'sun' | 'life' | 'power' | 'place' | 'crew';
  icon: string;
}

/** Order of the encyclopedia. Every statement is checked against the sources in docs/SCIENCE.md. */
export const CODEX: CodexEntry[] = [
  { id: 'sun', group: 'sun', icon: 'sun' },
  { id: 'spe', group: 'sun', icon: 'rad' },
  { id: 'gcr', group: 'sun', icon: 'rad' },
  { id: 'alara', group: 'sun', icon: 'shield' },
  { id: 'regolith', group: 'sun', icon: 'shield' },
  { id: 'eclss', group: 'life', icon: 'water' },
  { id: 'co2', group: 'life', icon: 'air' },
  { id: 'food', group: 'life', icon: 'food' },
  { id: 'isru', group: 'life', icon: 'drill' },
  { id: 'mass', group: 'life', icon: 'cargo' },
  { id: 'solar', group: 'power', icon: 'power' },
  { id: 'night', group: 'power', icon: 'moon' },
  { id: 'storage', group: 'power', icon: 'battery' },
  { id: 'nuclear', group: 'power', icon: 'atom' },
  { id: 'duststorm', group: 'power', icon: 'wind' },
  { id: 'psr', group: 'place', icon: 'ice' },
  { id: 'gravity', group: 'place', icon: 'jump' },
  { id: 'moondust', group: 'place', icon: 'dust' },
  { id: 'marssky', group: 'place', icon: 'sky' },
  { id: 'earth', group: 'place', icon: 'earth' },
  { id: 'comms', group: 'crew', icon: 'antenna' },
  { id: 'crew', group: 'crew', icon: 'crew' },
  { id: 'honesty', group: 'crew', icon: 'info' },
];

addStrings({
  'codex.title': ['Bitácora científica', 'Science codex'],
  'codex.lead': ['Todo lo que ocurre en Helios Outpost está basado en datos y misiones reales.', 'Everything that happens in Helios Outpost is based on real data and real missions.'],
  'codex.group.sun': ['El Sol y la radiación', 'The Sun and radiation'],
  'codex.group.life': ['Mantenerse con vida', 'Staying alive'],
  'codex.group.power': ['Energía', 'Power'],
  'codex.group.place': ['Los mundos', 'The worlds'],
  'codex.group.crew': ['La misión', 'The mission'],
  'codex.samples': ['Colección de muestras', 'Sample collection'],
  'codex.locked': ['Aún sin descubrir', 'Not yet discovered'],
  'codex.inGame': ['En el juego', 'In the game'],

  'codex.sun.t': ['El Sol: amigo y amenaza', 'The Sun: friend and threat'],
  'codex.sun.b': [
    'El Sol es la central eléctrica de casi todas las misiones espaciales. Junto a la Tierra y la Luna entrega unos 1 361 vatios por metro cuadrado; en Marte, más lejos, solo unos 586. Pero el mismo Sol lanza de vez en cuando ráfagas de partículas capaces de enfermar a un astronauta en horas. Diseñar un puesto avanzado es, en buena parte, aprender a aprovechar al Sol y a esconderse de él.',
    'The Sun is the power station of almost every space mission. Near Earth and the Moon it delivers about 1,361 watts per square metre; at Mars, farther out, only about 586. But the same Sun occasionally hurls bursts of particles that can make an astronaut sick within hours. Designing an outpost is largely about learning to use the Sun — and to hide from it.',
  ],
  'codex.sun.g': ['Tus paneles rinden menos en Marte, y las alertas de tormenta solar llegan por la antena.', 'Your arrays give less on Mars, and solar-storm alerts arrive through the antenna.'],

  'codex.spe.t': ['Tormentas de partículas solares', 'Solar particle events'],
  'codex.spe.b': [
    'Tras una gran erupción solar, protones a casi la velocidad de la luz pueden llegar en menos de una hora. En agosto de 1972, entre las misiones Apolo 16 y Apolo 17, hubo una tormenta tan intensa que un astronauta en la superficie lunar habría recibido una dosis peligrosa. La buena noticia: estos protones se frenan con relativa facilidad. Unas decenas de centímetros de agua, polietileno o regolito bastan, y hay satélites vigilando el Sol para dar aviso.',
    'After a big solar eruption, protons travelling near the speed of light can arrive in under an hour. In August 1972, between Apollo 16 and Apollo 17, a storm struck that would have given an astronaut on the lunar surface a dangerous dose. The good news: these protons are fairly easy to stop. A few tens of centimetres of water, polyethylene or regolith will do, and satellites watch the Sun to raise the alarm.',
  ],
  'codex.spe.g': ['Con antena recibes el aviso unas 2,5 h antes; sin ella, apenas minutos. En un refugio la dosis cae más del 90 %.', 'With an antenna the warning comes about 2.5 h ahead; without one, only minutes. In a shelter the dose drops by more than 90 %.'],

  'codex.gcr.t': ['Rayos cósmicos galácticos', 'Galactic cosmic rays'],
  'codex.gcr.b': [
    'Son núcleos atómicos acelerados por estrellas que explotaron lejos de aquí. Llegan todo el tiempo y desde todas direcciones. En la superficie lunar se midieron unos 1,4 milisieverts al día —unas 200 veces más que en el suelo terrestre—, y en Marte el rover Curiosity midió unos 0,67 mSv al día. Son tan energéticos que un blindaje fino casi no ayuda: hacen falta metros de material.',
    'These are atomic nuclei accelerated by stars that exploded far away. They arrive all the time, from every direction. About 1.4 millisieverts per day were measured on the lunar surface — roughly 200 times the dose on the ground on Earth — and on Mars the Curiosity rover measured about 0.67 mSv per day. They are so energetic that thin shielding barely helps: it takes metres of material.',
  ],
  'codex.gcr.g': ['La dosis diaria baja poco con el casco del hábitat y mucho con una cubierta gruesa de regolito.', 'The daily dose drops only a little behind the habitat hull and a lot under a thick regolith cover.'],

  'codex.alara.t': ['Tan baja como sea razonable', 'As low as reasonably achievable'],
  'codex.alara.b': [
    'No existe una dosis de radiación “gratis”, así que las agencias siguen el principio ALARA: mantenerla tan baja como sea razonablemente posible. NASA fija además un límite para toda la carrera de un astronauta: 600 milisieverts. Cada misión reparte ese presupuesto con cuidado, igual que el de masa o el de energía.',
    'There is no “free” radiation dose, so agencies follow the ALARA principle: keep it as low as reasonably achievable. NASA also sets a limit for an astronaut’s whole career: 600 millisieverts. Every mission spends that budget carefully, just like its mass or power budget.',
  ],
  'codex.alara.g': ['Cada misión tiene una guía de dosis. Mantenerte muy por debajo sube tu puntuación de Radiación.', 'Each mission has a dose guideline. Staying well below it raises your Radiation score.'],

  'codex.regolith.t': ['Regolito: el escudo que ya está allí', 'Regolith: the shield that is already there'],
  'codex.regolith.b': [
    'El regolito es la capa de polvo y roca triturada que cubre la Luna y Marte. Traer blindaje desde la Tierra es carísimo, pero apilar un par de metros de regolito sobre un hábitat lo protege de la radiación y, de paso, lo aísla del frío. NASA desarrolla para ello el robot RASSOR, cuyos tambores giran en sentidos opuestos para que la fuerza de excavar se cancele: así un robot ligero puede cavar en baja gravedad.',
    'Regolith is the layer of dust and crushed rock that covers the Moon and Mars. Shipping shielding from Earth is hugely expensive, but piling a couple of metres of regolith over a habitat protects it from radiation and insulates it from the cold as well. NASA is developing the RASSOR robot for the job: its drums spin in opposite directions so the digging forces cancel, letting a light robot dig in low gravity.',
  ],
  'codex.regolith.g': ['La excavadora añade unos 14 g/cm² por día. Además reduce hasta un 70 % el gasto de calefacción.', 'The excavator adds about 14 g/cm² per day. It also cuts heating needs by up to 70 %.'],

  'codex.eclss.t': ['Reciclar para vivir', 'Recycle to live'],
  'codex.eclss.b': [
    'Una persona necesita cada día unos 0,84 kg de oxígeno y varios kilos de agua. En la Estación Espacial Internacional el sistema de soporte vital (ECLSS) ya recupera el 98 % del agua, incluidos el sudor y la orina, y obtiene oxígeno separando el agua con electricidad. El hidrógeno sobrante se combina con el CO₂ en un reactor Sabatier para recuperar más agua.',
    'A person needs about 0.84 kg of oxygen and several kilograms of water every day. On the International Space Station the life-support system (ECLSS) now recovers 98 % of the water — including sweat and urine — and makes oxygen by splitting water with electricity. The leftover hydrogen is combined with CO₂ in a Sabatier reactor to win back more water.',
  ],
  'codex.eclss.g': ['Sin ECLSS cada tripulante gasta 11 kg de agua al día; con él, alrededor de 1 kg.', 'Without an ECLSS each crew member uses 11 kg of water a day; with one, about 1 kg.'],

  'codex.co2.t': ['El enemigo invisible', 'The invisible enemy'],
  'codex.co2.b': [
    'Al respirar producimos alrededor de 1 kg de dióxido de carbono al día. En una cabina cerrada se acumula y causa dolor de cabeza, torpeza y, si sigue subiendo, la muerte… mucho antes de que falte el oxígeno. En 1970 la tripulación del Apolo 13 sobrevivió adaptando filtros cuadrados a un hueco redondo con cinta, cartón y una bolsa. Los depuradores, además, necesitan energía.',
    'Breathing produces about 1 kg of carbon dioxide a day. In a sealed cabin it builds up and causes headaches, clumsiness and, if it keeps rising, death — long before oxygen runs short. In 1970 the Apollo 13 crew survived by fitting square filters into a round hole with tape, cardboard and a bag. Scrubbers also need power.',
  ],
  'codex.co2.g': ['Si un apagón deja el hábitat sin energía, el CO₂ empieza a subir enseguida.', 'If a blackout leaves the habitat unpowered, CO₂ starts climbing straight away.'],

  'codex.food.t': ['Granjas espaciales', 'Space farms'],
  'codex.food.b': [
    'En 2015 los astronautas de la Estación Espacial comieron por primera vez lechuga cultivada en órbita, y desde entonces han cosechado rábanos y chiles. Las luces son magenta porque las plantas aprovechan sobre todo el rojo y el azul. Pero alimentar por completo a una persona requiere decenas de metros cuadrados de cultivo y mucha electricidad: por ahora las plantas complementan la dieta, mejoran el ánimo y producen algo de oxígeno.',
    'In 2015 Space Station astronauts ate lettuce grown in orbit for the first time, and since then they have harvested radishes and chile peppers. The lamps are magenta because plants mostly use red and blue light. But feeding one person entirely takes tens of square metres of crops and a lot of electricity: for now plants supplement the diet, lift morale and make a little oxygen.',
  ],
  'codex.food.g': ['Un invernadero de 30 m² con papas alimenta a una sola persona, y sus luces gastan más de 10 kW.', 'A 30 m² greenhouse of potatoes feeds just one person, and its lamps draw more than 10 kW.'],

  'codex.isru.t': ['Vivir de la tierra', 'Living off the land'],
  'codex.isru.b': [
    'ISRU significa “utilización de recursos in situ”: fabricar lo que necesitas con lo que hay allí. El instrumento MOXIE, a bordo del rover Perseverance, produjo 122 gramos de oxígeno a partir del aire marciano en 16 pruebas entre 2021 y 2023. Y tanto la Luna como Marte guardan hielo bajo la superficie que puede convertirse en agua, oxígeno y combustible.',
    'ISRU stands for in-situ resource utilisation: making what you need from what is already there. The MOXIE instrument aboard the Perseverance rover produced 122 grams of oxygen from Martian air in 16 runs between 2021 and 2023. And both the Moon and Mars hold buried ice that can become water, oxygen and fuel.',
  ],
  'codex.isru.g': ['MOXIE no gasta agua, pero consume varias veces más energía por kilo de O₂ que la electrólisis.', 'MOXIE uses no water, but several times more energy per kilogram of O₂ than electrolysis.'],

  'codex.mass.t': ['Cada kilo cuenta', 'Every kilogram counts'],
  'codex.mass.b': [
    'Para posar un kilogramo en otro mundo hay que lanzar desde la Tierra muchos kilogramos de cohete y combustible. Por eso los ingenieros comparan soluciones por su masa: ¿llevar agua para toda la misión o una máquina que la recicle? ¿Comida envasada o un invernadero? En una misión corta suele ganar lo simple; en una larga, lo que recicla.',
    'To land one kilogram on another world you must launch many kilograms of rocket and propellant from Earth. That is why engineers compare solutions by mass: carry water for the whole mission, or a machine that recycles it? Packaged food, or a greenhouse? On a short mission the simple option usually wins; on a long one, the one that recycles.',
  ],
  'codex.mass.g': ['El manifiesto de carga es tu decisión más importante. Prueba combinaciones distintas.', 'The cargo manifest is your most important decision. Try different combinations.'],

  'codex.solar.t': ['Paneles solares', 'Solar arrays'],
  'codex.solar.b': [
    'Los paneles son ligeros y fiables, pero dependen de la luz. En Marte reciben menos de la mitad que en la Tierra y el polvo se deposita sobre ellos: así terminó la misión del módulo InSight en 2022. A veces ocurre lo contrario: remolinos de polvo limpiaron los paneles de los rovers Spirit y Opportunity y les regalaron años extra.',
    'Arrays are light and reliable, but they depend on light. On Mars they receive less than half of what they would on Earth, and dust settles on them: that is how the InSight lander’s mission ended in 2022. Sometimes the opposite happens: dust devils swept the arrays of the Spirit and Opportunity rovers clean and gave them years of extra life.',
  ],
  'codex.solar.g': ['En Marte los paneles pierden rendimiento cada sol por el polvo. Límpialos en EVA.', 'On Mars arrays lose output every sol to dust. Brush them off on EVA.'],

  'codex.night.t': ['Luz casi eterna, sombras eternas', 'Almost eternal light, eternal shadows'],
  'codex.night.b': [
    'En casi toda la Luna la noche dura 14 días terrestres. En el polo sur, en cambio, el Sol da vueltas rozando el horizonte, y algunas crestas del borde del cráter Shackleton están iluminadas más del 80 % del tiempo. Por eso se planea instalar allí paneles verticales sobre mástiles altos. Aun así, las montañas lejanas tapan el Sol durante horas o días: elegir bien el sitio lo es todo.',
    'Over most of the Moon, night lasts 14 Earth days. At the south pole, though, the Sun circles just above the horizon, and some ridges on the rim of Shackleton crater are lit more than 80 % of the time. That is why vertical arrays on tall masts are planned there. Even so, distant mountains block the Sun for hours or days: choosing the right site is everything.',
  ],
  'codex.night.g': ['Activa el mapa de luz solar: cada lugar tiene su propio horizonte, calculado sobre el terreno real del juego.', 'Turn on the sunlight map: every spot has its own horizon, computed from the game’s actual terrain.'],

  'codex.storage.t': ['Guardar energía', 'Storing energy'],
  'codex.storage.b': [
    'Las baterías de iones de litio devuelven casi toda la energía que reciben, pero pesan mucho por cada kilovatio-hora. Para noches largas se estudian celdas de combustible regenerativas: usan la electricidad sobrante para separar agua en hidrógeno y oxígeno, y luego los recombinan. Pierden cerca de la mitad de la energía, pero almacenan mucha más por kilogramo.',
    'Lithium-ion batteries give back nearly all the energy they take in, but weigh a lot per kilowatt-hour. For long nights engineers study regenerative fuel cells: they use spare electricity to split water into hydrogen and oxygen, then recombine them. They lose about half the energy, but store far more per kilogram.',
  ],
  'codex.storage.g': ['Batería: 80 kWh en 450 kg. Celda de combustible: 600 kWh en 900 kg, con peor rendimiento.', 'Battery: 80 kWh in 450 kg. Fuel cell: 600 kWh in 900 kg, at lower efficiency.'],

  'codex.nuclear.t': ['Fisión en la superficie', 'Fission on the surface'],
  'codex.nuclear.b': [
    'Un pequeño reactor de fisión produce electricidad de día y de noche, haya polvo o no. En 2018 NASA y el Departamento de Energía de EE. UU. probaron con éxito el reactor experimental KRUSTY del proyecto Kilopower, y hoy se trabaja en sistemas de unos 40 kW para la Luna. El reactor se coloca lejos o tras un terraplén: la radiación disminuye con el cuadrado de la distancia.',
    'A small fission reactor makes electricity day and night, dust or no dust. In 2018 NASA and the US Department of Energy successfully tested the KRUSTY experimental reactor of the Kilopower project, and work continues on systems of about 40 kW for the Moon. The reactor is placed far away or behind a berm: radiation falls with the square of the distance.',
  ],
  'codex.nuclear.g': ['A menos de 90 m del hábitat el reactor añade dosis a la tripulación.', 'Closer than 90 m to the habitat, the reactor adds dose to the crew.'],

  'codex.duststorm.t': ['Tormentas de polvo', 'Dust storms'],
  'codex.duststorm.b': [
    'Marte tiene tormentas de polvo regionales cada año y, de vez en cuando, una global que envuelve todo el planeta. La de 2018 oscureció el cielo durante semanas y acabó con el rover Opportunity tras casi 15 años de trabajo. El aire marciano es tan tenue —menos del 1 % de la presión terrestre— que el viento no derriba nada: el problema es la oscuridad.',
    'Mars has regional dust storms every year and, now and then, a global one that wraps the whole planet. The 2018 storm darkened the sky for weeks and ended the Opportunity rover’s mission after nearly 15 years. Martian air is so thin — under 1 % of Earth’s pressure — that the wind knocks nothing over: the problem is the darkness.',
  ],
  'codex.duststorm.g': ['Durante la tormenta los paneles pueden caer por debajo del 30 %. Un reactor ni se entera.', 'In a storm arrays can drop below 30 %. A reactor does not notice.'],

  'codex.psr.t': ['Cráteres en sombra permanente', 'Permanently shadowed craters'],
  'codex.psr.b': [
    'Como el Sol nunca sube mucho en los polos lunares, el fondo de algunos cráteres no ha visto la luz en miles de millones de años. Son de los lugares más fríos del sistema solar —por debajo de −200 °C— y actúan como trampas donde se acumula hielo. En 2009 la misión LCROSS estrelló una etapa de cohete en el cráter Cabeus y detectó agua en la nube de escombros.',
    'Because the Sun never climbs high at the lunar poles, the floors of some craters have not seen light for billions of years. They are among the coldest places in the solar system — below −200 °C — and act as traps where ice collects. In 2009 the LCROSS mission crashed a rocket stage into Cabeus crater and detected water in the debris plume.',
  ],
  'codex.psr.g': ['El gran cráter al sur de la base está siempre en sombra: allí hay hielo, pero también oscuridad y frío.', 'The big crater south of the base is always in shadow: there is ice down there, but also darkness and cold.'],

  'codex.gravity.t': ['Gravedad', 'Gravity'],
  'codex.gravity.b': [
    'En la Luna pesas la sexta parte que en la Tierra; en Marte, algo más de un tercio. Los astronautas del Apolo descubrieron que en la Luna es más cómodo avanzar a saltos que caminar. La baja gravedad ayuda a mover cargas pesadas, pero con el tiempo debilita huesos y músculos.',
    'On the Moon you weigh a sixth of what you do on Earth; on Mars, a little over a third. Apollo astronauts found that loping in bounds is more comfortable on the Moon than walking. Low gravity helps when moving heavy loads, but over time it weakens bones and muscles.',
  ],
  'codex.gravity.g': ['Salta en la Luna y luego en Marte: la misma fuerza, alturas muy distintas.', 'Jump on the Moon and then on Mars: same push, very different heights.'],

  'codex.moondust.t': ['El polvo lunar', 'Lunar dust'],
  'codex.moondust.b': [
    'Sin agua ni viento que lo desgasten, el polvo lunar es afilado como vidrio molido y se pega a todo por electricidad estática. Rayó visores, atascó cremalleras y dio a Harrison Schmitt, del Apolo 17, una especie de alergia. Y como no hay aire, al levantarlo no forma nubes: cada grano vuela en un arco perfecto y cae.',
    'With no water or wind to wear it down, lunar dust is as sharp as ground glass and clings to everything by static electricity. It scratched visors, jammed zips and gave Apollo 17’s Harrison Schmitt something like hay fever. And because there is no air, kicking it up makes no cloud: every grain flies in a perfect arc and falls.',
  ],
  'codex.moondust.g': ['Fíjate en el polvo que levantas al caminar: arcos en la Luna, nubes que flotan en Marte.', 'Watch the dust you kick up: arcs on the Moon, drifting clouds on Mars.'],

  'codex.marssky.t': ['El cielo de Marte', 'The Martian sky'],
  'codex.marssky.b': [
    'De día el cielo marciano es de color caramelo por el polvo fino en suspensión. Al atardecer ocurre lo contrario que en la Tierra: alrededor del Sol aparece un resplandor azul, porque ese polvo desvía la luz azul hacia delante. Un día marciano, llamado sol, dura 24 horas y 39 minutos. Y Fobos, la luna mayor, sale por el oeste y cruza el cielo en unas cuatro horas.',
    'By day the Martian sky is butterscotch-coloured from fine dust in the air. At sunset the opposite of Earth happens: a blue glow appears around the Sun, because that dust scatters blue light forward. A Martian day, called a sol, lasts 24 hours 39 minutes. And Phobos, the larger moon, rises in the west and crosses the sky in about four hours.',
  ],
  'codex.marssky.g': ['Espera a un atardecer marciano y mira hacia el Sol.', 'Wait for a Martian sunset and look toward the Sun.'],

  'codex.earth.t': ['La Tierra en el cielo lunar', 'Earth in the lunar sky'],
  'codex.earth.b': [
    'La Luna siempre muestra la misma cara a la Tierra, así que desde la superficie lunar nuestro planeta casi no se mueve en el cielo: solo se balancea un poco. Desde el polo sur cuelga bajo, cerca del horizonte. Tiene fases, como la Luna vista desde casa, pero al revés: cuando allí hay luna nueva, aquí hay “Tierra llena”.',
    'The Moon always keeps the same face toward Earth, so from the lunar surface our planet hardly moves in the sky: it only wobbles a little. From the south pole it hangs low, near the horizon. It has phases, like the Moon seen from home, but reversed: when it is new Moon there, it is “full Earth” here.',
  ],
  'codex.earth.g': ['Las antenas de tu base apuntan siempre hacia ese punto azul.', 'Your base’s dishes always point at that blue dot.'],

  'codex.comms.t': ['Hablar con casa', 'Talking to home'],
  'codex.comms.b': [
    'Una señal de radio tarda 1,3 segundos en llegar de la Luna a la Tierra, pero entre 3 y 22 minutos desde Marte, según la posición de los planetas. Con ese retraso no se puede pedir ayuda en una emergencia: la tripulación debe decidir sola. Las grandes antenas de la Red del Espacio Profundo, en California, España y Australia, mantienen el contacto.',
    'A radio signal takes 1.3 seconds to travel from the Moon to Earth, but between 3 and 22 minutes from Mars, depending on where the planets are. With that delay you cannot call for help in an emergency: the crew must decide alone. The giant dishes of the Deep Space Network in California, Spain and Australia keep the link alive.',
  ],
  'codex.comms.g': ['La antena mejora el ánimo y adelanta los avisos de clima espacial.', 'The antenna lifts morale and brings space-weather warnings earlier.'],

  'codex.crew.t': ['La tripulación es parte del sistema', 'The crew is part of the system'],
  'codex.crew.b': [
    'Una misión no falla solo por máquinas. En el experimento CHAPEA de NASA, cuatro personas vivieron 378 días en un hábitat impreso en 3D que simulaba Marte, para estudiar cómo afectan el aislamiento, la carga de trabajo y la comida. Un equipo agotado comete errores; uno descansado y motivado resuelve problemas.',
    'Missions do not fail because of machines alone. In NASA’s CHAPEA experiment, four people lived for 378 days in a 3D-printed habitat simulating Mars, to study how isolation, workload and food affect a crew. An exhausted team makes mistakes; a rested and motivated one solves problems.',
  ],
  'codex.crew.g': ['Salud y ánimo multiplican las horas útiles de trabajo. El ritmo “intenso” rinde más… durante un tiempo.', 'Health and morale multiply useful work hours. The “intense” pace gives more… for a while.'],

  'codex.honesty.t': ['¿Qué simplifica este simulador?', 'What does this simulator simplify?'],
  'codex.honesty.b': [
    'Las cifras de consumo humano, radiación, gravedad, luz solar y duración del día son reales. Para que se pueda jugar, hemos simplificado otras cosas: los cultivos crecen el doble de rápido (su rendimiento por día sí es realista), la elevación del Sol en el polo lunar está un poco exagerada, montar un módulo lleva horas en vez de días, y el blindaje se calcula con fórmulas sencillas en lugar de simulaciones de transporte de partículas.',
    'The figures for human consumption, radiation, gravity, sunlight and day length are real. To keep it playable we simplified other things: crops grow twice as fast (their yield per day is realistic), the Sun’s elevation at the lunar pole is slightly exaggerated, assembling a module takes hours rather than days, and shielding uses simple formulas instead of particle-transport simulations.',
  ],
  'codex.honesty.g': ['La lista completa de fuentes y supuestos está en docs/SCIENCE.md del repositorio.', 'The full list of sources and assumptions is in docs/SCIENCE.md in the repository.'],

  /* ------------------------------------------------------- minerals */
  'min.anorthosite': ['Anortosita', 'Anorthosite'],
  'min.anorthosite.b': ['Roca clara de las tierras altas: es la corteza original de la Luna, que flotó sobre un océano de magma. La “Roca del Génesis” del Apolo 15 es una anortosita de unos 4 000 millones de años.', 'Pale highland rock: the Moon’s original crust, which floated on a magma ocean. Apollo 15’s “Genesis Rock” is an anorthosite about 4 billion years old.'],
  'min.breccia': ['Brecha de impacto', 'Impact breccia'],
  'min.breccia.b': ['Fragmentos de rocas distintas soldados por el calor y la presión de un impacto. Cada trozo cuenta una historia diferente.', 'Fragments of different rocks welded together by the heat and pressure of an impact. Each piece tells a different story.'],
  'min.glass': ['Vidrio volcánico naranja', 'Orange volcanic glass'],
  'min.glass.b': ['Como el “suelo naranja” que el Apolo 17 halló en el cráter Shorty: gotitas de fuentes de lava de hace más de 3 500 millones de años.', 'Like the “orange soil” Apollo 17 found at Shorty crater: droplets from lava fountains more than 3.5 billion years old.'],
  'min.basalt': ['Basalto', 'Basalt'],
  'min.basalt.b': ['Lava solidificada, rica en hierro. De esto están hechos los “mares” oscuros que se ven desde la Tierra.', 'Solidified, iron-rich lava. This is what the dark “seas” visible from Earth are made of.'],
  'min.iceReg': ['Regolito helado', 'Icy regolith'],
  'min.iceReg.b': ['En sombra permanente el agua puede quedar atrapada miles de millones de años. Es un tesoro: agua, oxígeno y combustible.', 'In permanent shadow water can stay trapped for billions of years. It is treasure: water, oxygen and fuel.'],
  'min.impactMelt': ['Fundido de impacto', 'Impact melt'],
  'min.impactMelt.b': ['Roca que se derritió en un impacto y volvió a enfriarse. Permite fechar cuándo ocurrió la colisión.', 'Rock that melted in an impact and cooled again. It lets scientists date when the collision happened.'],
  'min.agglutinate': ['Aglutinados', 'Agglutinates'],
  'min.agglutinate.b': ['Granos de suelo soldados con vidrio por micrometeoritos. Cuantos más hay, más tiempo lleva ese suelo expuesto al espacio.', 'Soil grains welded with glass by micrometeoroids. The more there are, the longer that soil has been exposed to space.'],
  'min.boulder': ['Bloque eyectado', 'Ejecta block'],
  'min.boulder.b': ['Arrancado de las profundidades por un impacto: una muestra gratis del subsuelo sin tener que perforar.', 'Thrown up from deep below by an impact: a free sample of the subsurface with no drilling required.'],
  'min.hematite': ['Esférulas de hematita', 'Hematite spherules'],
  'min.hematite.b': ['Los “arándanos” que el rover Opportunity halló en 2004. Se forman con agua, así que fueron una de las primeras pruebas de un Marte húmedo.', 'The “blueberries” the Opportunity rover found in 2004. They form in water, so they were among the first proof of a wet Mars.'],
  'min.carbonate': ['Carbonatos', 'Carbonates'],
  'min.carbonate.b': ['Minerales que se forman en agua y pueden conservar rastros de vida. Perseverance los busca en el borde del cráter Jezero.', 'Minerals that form in water and can preserve traces of life. Perseverance hunts for them at the rim of Jezero crater.'],
  'min.sulfate': ['Sulfatos', 'Sulfates'],
  'min.sulfate.b': ['Sales que deja el agua al evaporarse. Curiosity explora capas ricas en sulfatos en el monte Sharp.', 'Salts left behind when water evaporates. Curiosity is exploring sulfate-rich layers on Mount Sharp.'],
  'min.mudstone': ['Lutita', 'Mudstone'],
  'min.mudstone.b': ['Barro de un antiguo lago convertido en roca. En el cráter Gale, Curiosity demostró que hubo un lago habitable.', 'Mud from an ancient lake turned to rock. In Gale crater, Curiosity showed that a habitable lake once existed.'],
  'min.olivine': ['Olivino', 'Olivine'],
  'min.olivine.b': ['Mineral volcánico verde que el agua altera con facilidad. Si está intacto, ese lugar lleva mucho tiempo seco.', 'A green volcanic mineral that water alters easily. If it is intact, that spot has been dry for a long time.'],
  'min.clay': ['Arcillas', 'Clays'],
  'min.clay.b': ['Solo se forman con agua abundante y conservan muy bien la materia orgánica. Son un objetivo prioritario para buscar vida antigua.', 'They only form with plenty of water and are excellent at preserving organic matter. A prime target in the search for ancient life.'],
  'min.meteorite': ['Meteorito de hierro', 'Iron meteorite'],
  'min.meteorite.b': ['En 2005 Opportunity encontró “Heat Shield Rock”, el primer meteorito identificado en otro planeta.', 'In 2005 Opportunity found “Heat Shield Rock”, the first meteorite identified on another planet.'],
  'min.perchlorate': ['Percloratos', 'Perchlorates'],
  'min.perchlorate.b': ['Sales halladas por la sonda Phoenix en 2008. Son tóxicas para las personas, pero podrían servir para obtener oxígeno.', 'Salts found by the Phoenix lander in 2008. Toxic to people, but they could be used to make oxygen.'],
});
