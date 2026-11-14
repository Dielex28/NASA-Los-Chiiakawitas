# Helios Outpost · Teacher guide

Helios Outpost is a simulator in which students run an outpost on the Moon or Mars. There is no single right answer: every decision (what cargo to bring, where to put the modules, when to take cover, whether to go out on foot or by rover) has consequences the simulation works out with real figures. This guide suggests how to use it in class. *(Versión en español: [GUIA-DOCENTE.md](GUIA-DOCENTE.md).)*

## Which ages

**Settings → Level** offers three levels. They change how many breakdowns happen and which questions appear at the end of a mission.

| Level | Suggested age | Breakdowns | Questions |
| --- | --- | --- | --- |
| Junior | 8–11 | Half | Concepts: gravity without air, shelter, suit range, polar shadows |
| Cadet | 12–14 | Normal | Adds: ice in cold traps, water recycling, energy, mass and weight |
| Expert | 15 and over | 35 % more | Adds: working with v²/(2·μ·g), projectile range, the sievert |

## What students learn

| Idea | Where it appears in the game |
| --- | --- |
| Gravity accelerates all masses equally; air is what separates the feather from the hammer | Key **G** on EVA: the game times the fall and compares it with Earth |
| Mass versus weight | The rover stops six times worse on the Moon: it weighs less, but its mass is the same |
| Projectile range is inversely proportional to g | Key **R**: throw a rock and compare its range with Earth's |
| Power (kW) versus energy (kWh) | Power panel, batteries through the lunar night |
| Radiation is stopped by mass (g/cm²), not thickness | Shelter, regolith cover, solar storms |
| Limited resources and recycling | Water, oxygen and food; life support recycles 95 % of the water |
| Conditions depend on the exact place | The polar sunlight map; real terrain at Shackleton, the connecting ridge, Malapert, Nobile and Jezero |
| Consumables versus range | The expedition 1 km away cannot be done on foot; the rover makes it possible |
| The speed of light is finite | Radio delay to Earth; asking Mission Control for help in an emergency |
| Latitude decides the light | The four real lunar sites: the Sun hardly sets next to the pole and sets for two weeks 120 km away |
| The body adapts to gravity | Each crew member's bone and muscle; daily exercise against work hours |
| Planning with margins | The EVA route planner and Apollo's walkback limit |

## Four 45-minute sessions

**Session 1 · First steps (Junior and Cadet).** The *First steps* mission (lunar training). The game guides every step: deploying arrays and a battery, going out on EVA, scanning, collecting a sample, driving the rover, dropping the hammer and the feather, sheltering from the storm. At the end, each student answers the four questions and downloads their report.

**Session 2 · The 1972 storm.** The *August 1972* scenario. Before playing, tell the class that between Apollo 16 and Apollo 17 there was a very intense solar storm and that nobody was on the Moon. Question to discuss before starting: what would you pack to be safe? After the mission, compare the reports: who stayed under the dose limit? What did they do differently?

**Session 3 · Mars is not the Moon (Cadet and Expert).** The *Jezero: Sol 0* or *September 2017* mission. In pairs: one plays, the other notes every time the power drops. Afterwards: why does a reactor justify its weight on Mars and perhaps not at the lunar pole? For Expert: repeat the hammer-and-feather drop on Mars and explain with numbers why the air hardly shows.

**Session 4 · Planning an outing (Cadet and Expert).** The *Connecting ridge* or *Malapert massif* mission. Before going out, each group draws a route to the expedition with *EVA route* and writes down what the planner predicts: distance, climb, suit on foot and by rover, battery. Then they do the EVA and compare with the suit they have left when they get back. To discuss: why did the Apollo missions never drive the rover further than they could walk back? What reserve would you keep, and why?

## Discussion questions

1. If every kilo taken to Mars costs a fortune, which is better: carrying water or a machine that recycles it? After how many days does the answer change?
2. A solar array is light but depends on the Sun; a reactor is heavy but always works. Which would you choose for the lunar pole? And for Mars during a dust storm?
3. Why does the game not let you walk to the expedition? What really limits an astronaut on the surface?
4. The dose limit is not a wall: below it, receiving less is still worth it (ALARA). Why?
5. From Mars, a question to Earth takes half an hour to be answered. Which decisions should a Martian crew be ready to take alone?

## The campaign

In the menu, **Campaign** puts nine missions in order of difficulty: each chapter teaches one idea (deploying power, polar shadows, the 1972 storm, two-week nights away from the pole, a base on real terrain, the nuclear reactor, Mars, its atmosphere during a solar storm, living off what the base produces) and opens when the previous one is completed. Medals (bronze for completing, silver from 65 points, gold from 80) are saved on each computer. It is a good sequence for independent work or homework; every mission is still open in *New mission* if you prefer to choose.

## The mission editor

In *New mission → Mission editor* you can design your own mission: destination, length, crew, maximum cargo, science goal, dose limit, how many solar and dust storms (and how strong), emergencies, radio delay, return fuel, resupplies and whether it is played on one of the five real terrains. All of it becomes a **15-character code** you copy onto the board; each student types it into *Your teacher's code* and plays exactly the same mission, with the same events in the same order. *Variant* reshuffles when events happen without changing anything else: useful so that two groups cannot copy each other. Ideas:

- **Compare one variable**: two codes that differ in a single thing (for example a budget that does or does not allow recycling, or 3 versus 20 minutes of radio delay), each half of the class plays one.
- **A tailored challenge**: for Junior, a short mission with no emergencies; for Expert, severe storms and little cargo.
- **A practical test**: a code with an ambitious science goal and a strict dose limit; the downloaded report records the result.

## Team mode

On the cargo manifest, **Team play** lets 2 to 5 students share one computer. Each looks after one or two stations for the whole mission (power, life support, health and radiation, science, maintenance) and the controls rotate in shifts of 12 h, one day or three mission days. At the end of each shift the game stops and shows which goals each station met, who takes the controls and the goals for the next shift. Warnings carry the name of whoever should react. It works well with one-day shifts and a simple rule: whoever is at the controls decides, everyone else watches their station and advises out loud. The debrief includes a table with each student's shifts and goals, useful for assessing group work.

## The daily challenge

In the mission list, the **daily challenge** is a short mission generated from the date. The same code gives everyone the same mission: project the code on the board, have each student (or pair) play it and compare scores and reports. To replay a challenge on another day, type its code. Scores are only kept on each computer: there is no online ranking.

## The report

At the end of every mission, **Download report for the teacher** produces an HTML file with the outcome, the score by area, the mission's lessons and the answers to the questions (with the right one and the explanation). It opens in any browser and prints on one or two pages. The student's name is optional and never leaves the computer: the game sends no data anywhere.

## Rigour and limits

Human consumption, gravity, radiation, sunlight, day length and radio delays are real figures; the simplifications and their reasons are in [`SCIENCE.en.md`](SCIENCE.en.md). It is worth saying in class: a simulator helps to understand relationships (more shielding, less dose; less gravity, less grip), it does not replace the data of a real mission.
