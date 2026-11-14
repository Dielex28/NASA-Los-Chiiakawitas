import { getLang } from './strings';

/** 1 = 8–11 years · 2 = 12–14 · 3 = 15 and up. */
export type Level = 1 | 2 | 3;

type Text = [string, string];

export interface Question {
  id: string;
  world: 'moon' | 'mars' | 'any';
  level: Level;
  q: Text;
  /** The first option is the correct one; they are shuffled when shown. */
  options: Text[];
  why: Text;
}

/**
 * Comprehension questions for the debrief. Each one checks an idea the game makes the player
 * experience, and the explanation says where in the game it showed up.
 */
export const QUESTIONS: Question[] = [
  {
    id: 'galileo',
    world: 'any',
    level: 1,
    q: ['En la Luna sueltas a la vez un martillo y una pluma. ¿Qué pasa?', 'On the Moon you drop a hammer and a feather together. What happens?'],
    options: [
      ['Llegan al suelo a la vez', 'They land at the same time'],
      ['El martillo llega mucho antes', 'The hammer lands much sooner'],
      ['La pluma flota y no cae', 'The feather floats and does not fall'],
    ],
    why: [
      'Sin aire que frene la pluma, la única fuerza es la gravedad, que acelera igual a todas las masas. David Scott lo mostró en el Apolo 15; tú lo comprobaste con la tecla G.',
      'With no air to slow the feather, the only force is gravity, which accelerates every mass alike. David Scott showed it on Apollo 15; you checked it with the G key.',
    ],
  },
  {
    id: 'shelter',
    world: 'any',
    level: 1,
    q: ['Llega una tormenta solar. ¿Dónde está más segura la tripulación?', 'A solar storm is coming. Where is the crew safest?'],
    options: [
      ['Dentro del refugio, con paredes muy gruesas', 'Inside the shelter, with very thick walls'],
      ['Fuera, lejos de los módulos', 'Outside, away from the modules'],
      ['Junto a los paneles solares', 'Next to the solar arrays'],
    ],
    why: [
      'Los protones de una tormenta solar se frenan con masa. El refugio tiene unos 45 g/cm² de agua y plástico, y deja pasar solo una pequeña parte de la dosis.',
      'The protons of a solar storm are stopped by mass. The shelter has about 45 g/cm² of water and plastic and lets only a small part of the dose through.',
    ],
  },
  {
    id: 'suitRange',
    world: 'any',
    level: 1,
    q: ['¿Por qué no puedes ir a pie hasta la expedición, a un kilómetro, y volver?', 'Why can you not walk to the expedition, a kilometre away, and back?'],
    options: [
      ['La reserva del traje no alcanza para tanto camino', 'The suit reserve does not last that far'],
      ['La gravedad es demasiado fuerte', 'Gravity is too strong'],
      ['Las botas no aguantan', 'The boots would not hold up'],
    ],
    why: [
      'El traje lleva oxígeno y agua de refrigeración para un tiempo limitado, y se gastan más deprisa cuanto más te esfuerzas. Por eso las últimas misiones Apolo llevaron un róver.',
      'The suit carries oxygen and cooling water for a limited time, and they run out faster the harder you work. That is why the last Apollo missions took a rover.',
    ],
  },
  {
    id: 'polarShadows',
    world: 'moon',
    level: 1,
    q: ['En el polo sur de la Luna las sombras miden cientos de metros. ¿Por qué?', 'At the Moon’s south pole shadows are hundreds of metres long. Why?'],
    options: [
      ['El Sol está siempre muy bajo sobre el horizonte', 'The Sun is always very low over the horizon'],
      ['La Luna está más lejos del Sol que la Tierra', 'The Moon is farther from the Sun than the Earth'],
      ['Porque allí siempre es de noche', 'Because it is always night there'],
    ],
    why: [
      'En los polos el Sol da la vuelta al horizonte sin subir más que unos pocos grados. Con una luz tan rasante, cualquier relieve proyecta una sombra enorme.',
      'At the poles the Sun circles the horizon without rising more than a few degrees. With such grazing light, any relief casts a huge shadow.',
    ],
  },
  {
    id: 'stormSolar',
    world: 'mars',
    level: 1,
    q: ['¿Qué les pasa a los paneles solares durante una tormenta de polvo en Marte?', 'What happens to the solar arrays during a Martian dust storm?'],
    options: [
      ['Producen mucho menos: el polvo tapa el Sol', 'They produce much less: the dust blocks the Sun'],
      ['Producen más: el polvo refleja la luz', 'They produce more: the dust reflects the light'],
      ['Nada, siguen igual', 'Nothing, they stay the same'],
    ],
    why: [
      'El polvo en el aire absorbe y desvía la luz directa. En una tormenta grande llega al suelo una fracción pequeña, y además el polvo se posa sobre los paneles.',
      'Dust in the air absorbs and scatters the direct light. In a big storm only a small fraction reaches the ground, and the dust also settles on the panels.',
    ],
  },
  {
    id: 'ice',
    world: 'moon',
    level: 2,
    q: ['¿Dónde puede haber hielo en la Luna?', 'Where can there be ice on the Moon?'],
    options: [
      ['En el fondo de cráteres en sombra permanente', 'On the floor of permanently shadowed craters'],
      ['En la cima de las montañas más iluminadas', 'On top of the most sunlit mountains'],
      ['En el ecuador, donde hace más calor', 'At the equator, where it is warmest'],
    ],
    why: [
      'Sin luz solar directa, esos fondos se mantienen por debajo de −160 °C. El agua que llega allí se congela y puede quedarse miles de millones de años: son «trampas frías».',
      'Without direct sunlight, those floors stay below −160 °C. Water that reaches them freezes and can stay for billions of years: they are “cold traps”.',
    ],
  },
  {
    id: 'reactor',
    world: 'mars',
    level: 2,
    q: ['Durante una tormenta de polvo el reactor sigue dando energía y los paneles no. ¿Por qué?', 'During a dust storm the reactor keeps supplying power and the arrays do not. Why?'],
    options: [
      ['Su energía sale de la fisión, no de la luz del Sol', 'Its energy comes from fission, not from sunlight'],
      ['El polvo no llega hasta el reactor', 'The dust cannot reach the reactor'],
      ['El reactor se limpia solo', 'The reactor cleans itself'],
    ],
    why: [
      'Un reactor de fisión da la misma potencia de día, de noche y con polvo. A cambio pesa mucho y hay que alejarlo del hábitat por su radiación.',
      'A fission reactor gives the same power by day, by night and in dust. In return it is heavy and must be kept away from the habitat because of its radiation.',
    ],
  },
  {
    id: 'eclss',
    world: 'any',
    level: 2,
    q: ['Un sistema de soporte vital recicla el 95 % del agua. ¿Qué ventaja tiene?', 'A life-support system recycles 95 % of the water. What is the advantage?'],
    options: [
      ['Hay que llevar mucha menos agua desde la Tierra', 'Far less water has to be brought from Earth'],
      ['Produce la comida de la tripulación', 'It makes the crew’s food'],
      ['Protege de la radiación', 'It protects against radiation'],
    ],
    why: [
      'Cada persona usa unos 11 kg de agua al día. Sin reciclaje, una misión de 30 días con 4 personas necesitaría más de una tonelada; reciclando, una pequeña parte.',
      'Each person uses about 11 kg of water a day. Without recycling, a 30-day mission with 4 people would need more than a tonne; with recycling, a small part of it.',
    ],
  },
  {
    id: 'roverBrake',
    world: 'any',
    level: 2,
    q: ['¿Por qué el róver tarda más en frenar en la Luna que en Marte?', 'Why does the rover take longer to stop on the Moon than on Mars?'],
    options: [
      ['Pesa menos y sus ruedas agarran menos, pero su masa es la misma', 'It weighs less so its wheels grip less, but its mass is the same'],
      ['El suelo lunar está helado y resbala', 'The lunar ground is icy and slippery'],
      ['Los frenos funcionan peor en el vacío', 'Brakes work worse in a vacuum'],
    ],
    why: [
      'El agarre de una rueda depende de lo que pesa (la fuerza con que la gravedad la aprieta contra el suelo). Pero lo que hay que detener es la masa, que no cambia de un mundo a otro.',
      'A wheel’s grip depends on its weight (how hard gravity presses it into the ground). But what has to be stopped is the mass, which does not change from one world to another.',
    ],
  },
  {
    id: 'greenhouse',
    world: 'any',
    level: 2,
    q: ['Además de comida, ¿qué aporta un invernadero a la base?', 'Besides food, what does a greenhouse give the base?'],
    options: [
      ['Produce oxígeno y absorbe CO₂', 'It makes oxygen and absorbs CO₂'],
      ['Genera electricidad', 'It generates electricity'],
      ['Protege de las tormentas solares', 'It protects against solar storms'],
    ],
    why: [
      'Las plantas hacen la fotosíntesis: toman CO₂ y devuelven oxígeno. También suben el ánimo. Pero sus lámparas gastan mucha energía.',
      'Plants photosynthesise: they take in CO₂ and give back oxygen. They also lift morale. But their lamps use a lot of power.',
    ],
  },
  {
    id: 'regolith',
    world: 'any',
    level: 2,
    q: ['¿Por qué cubrir el hábitat con regolito protege a la tripulación?', 'Why does covering the habitat with regolith protect the crew?'],
    options: [
      ['Es masa que frena la radiación', 'It is mass that stops radiation'],
      ['Refleja la luz del Sol', 'It reflects sunlight'],
      ['Retiene el oxígeno dentro', 'It keeps the oxygen inside'],
    ],
    why: [
      'Contra la radiación lo que cuenta es cuánta masa hay que atravesar (gramos por cm²). El regolito está allí mismo y no hay que traerlo de la Tierra.',
      'Against radiation what counts is how much mass has to be crossed (grams per cm²). Regolith is right there and does not have to be brought from Earth.',
    ],
  },
  {
    id: 'brakeMath',
    world: 'any',
    level: 3,
    q: ['La distancia de frenado es v²/(2·μ·g). Si la gravedad es 6 veces menor, la distancia es…', 'Stopping distance is v²/(2·μ·g). If gravity is 6 times smaller, the distance is…'],
    options: [
      ['6 veces mayor', '6 times longer'],
      ['6 veces menor', '6 times shorter'],
      ['36 veces mayor', '36 times longer'],
      ['La misma', 'The same'],
    ],
    why: [
      'g está en el denominador: si se divide entre 6, la distancia se multiplica por 6. Desde 6 m/s el róver necesita unos 15 m en la Luna y unos 2,5 m en la Tierra.',
      'g is in the denominator: divide it by 6 and the distance is multiplied by 6. From 6 m/s the rover needs about 15 m on the Moon and about 2.5 m on Earth.',
    ],
  },
  {
    id: 'throwMath',
    world: 'any',
    level: 3,
    q: ['Lanzas una roca igual en la Luna (g = 1,62 m/s²) y en la Tierra (g = 9,81 m/s²). Sin aire, ¿cuánto más lejos llega en la Luna?', 'You throw a rock the same way on the Moon (g = 1.62 m/s²) and on Earth (g = 9.81 m/s²). Without air, how much farther does it go on the Moon?'],
    options: [
      ['Unas 6 veces más lejos', 'About 6 times farther'],
      ['Lo mismo', 'The same'],
      ['Unas 36 veces más lejos', 'About 36 times farther'],
      ['El doble', 'Twice as far'],
    ],
    why: [
      'El alcance de un proyectil es v²·sen(2θ)/g: inversamente proporcional a g. 9,81 / 1,62 ≈ 6.',
      'A projectile’s range is v²·sin(2θ)/g: inversely proportional to g. 9.81 / 1.62 ≈ 6.',
    ],
  },
  {
    id: 'sievert',
    world: 'any',
    level: 3,
    q: ['La dosis se mide en sieverts. ¿Qué tiene en cuenta el sievert además de la energía absorbida?', 'Dose is measured in sieverts. What does the sievert take into account besides the energy absorbed?'],
    options: [
      ['El daño biológico según el tipo de radiación', 'The biological harm of each type of radiation'],
      ['La temperatura del cuerpo', 'Body temperature'],
      ['Lo lejos que está el Sol', 'How far away the Sun is'],
    ],
    why: [
      'El gray mide energía absorbida por kilo; el sievert la multiplica por un factor que refleja lo dañino que es cada tipo de radiación para los tejidos.',
      'The gray measures energy absorbed per kilogram; the sievert multiplies it by a factor reflecting how harmful each type of radiation is to tissue.',
    ],
  },
  {
    id: 'thinAir',
    world: 'mars',
    level: 3,
    q: ['El aire de Marte es unas 60 veces menos denso que el de la Tierra. ¿Qué le pasa a una pluma que cae?', 'Martian air is about 60 times thinner than Earth’s. What happens to a falling feather?'],
    options: [
      ['Apenas la frena: cae casi tan rápido como un martillo', 'It barely slows it: it falls almost as fast as a hammer'],
      ['Flota sin llegar a caer', 'It floats without ever landing'],
      ['Cae más rápido que en el vacío', 'It falls faster than in a vacuum'],
    ],
    why: [
      'El arrastre del aire es proporcional a su densidad. En Marte la pluma llega al suelo apenas un milisegundo después que el martillo; en la Tierra, unas cincuenta veces más tarde.',
      'Air drag is proportional to its density. On Mars the feather lands barely a millisecond after the hammer; on Earth, about fifty times later than that.',
    ],
  },
  {
    id: 'eternalLight',
    world: 'moon',
    level: 3,
    q: ['Incluso en las crestas más iluminadas del polo lunar hay días sin Sol. ¿Por qué?', 'Even on the sunniest ridges of the lunar pole there are days without Sun. Why?'],
    options: [
      ['Montañas lejanas tapan el Sol, que está muy bajo', 'Distant mountains hide the Sun, which is very low'],
      ['La Tierra eclipsa al Sol cada día', 'The Earth eclipses the Sun every day'],
      ['El polvo lunar cubre el cielo', 'Lunar dust covers the sky'],
    ],
    why: [
      'Como el Sol nunca sube más de unos grados, cualquier macizo en la dirección en que está lo oculta. Por eso cada punto tiene su propio «horizonte» y su propio calendario de luz.',
      'Because the Sun never rises more than a few degrees, any massif in its direction hides it. That is why every spot has its own “horizon” and its own calendar of light.',
    ],
  },
];

export interface ShownQuestion {
  question: Question;
  /** Option indices in display order. */
  order: number[];
}

/** Pick `n` questions for this world and level, favouring the hardest ones the level allows. */
export function pickQuestions(world: 'moon' | 'mars', level: Level, n = 4, rand: () => number = Math.random): ShownQuestion[] {
  const pool = QUESTIONS.filter((q) => (q.world === 'any' || q.world === world) && q.level <= level);
  const scored = pool.map((q) => ({ q, k: rand() + (level - q.level === 0 ? 0.6 : level - q.level === 1 ? 0.3 : 0) }));
  scored.sort((a, b) => b.k - a.k);
  return scored.slice(0, n).map(({ q }) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { question: q, order };
  });
}

/** Text in the current language. */
export const tx = (t: Text): string => (getLang() === 'es' ? t[0] : t[1]);
