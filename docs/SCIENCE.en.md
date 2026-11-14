# The science behind Helios Outpost

This document separates three things: **real values** the simulator uses as they are, **simplified models** with their justification, and **gameplay adjustments** that depart from reality on purpose. The constants live in `src/sim/catalog.ts`, `src/sim/worlds.ts`, `src/sim/environment.ts`, `src/sim/sites.ts` and `src/sim/route.ts`. *(Versión en español: [SCIENCE.md](SCIENCE.md).)*

## 1. Real values

| Quantity | Value in the game | Source |
| --- | --- | --- |
| Gravity of the Moon / Mars | 1.62 / 3.71 m/s² | NASA Planetary Fact Sheets |
| Solar constant at 1 AU | 1,361 W/m² | NASA Planetary Fact Sheets |
| Mean irradiance at Mars | 586 W/m² (varies 492–715) | Appelbaum and Flood, *Solar radiation on Mars*, Solar Energy 45 (1990) |
| Length of the Martian sol | 24 h 39 min 35 s | NASA Mars Fact Sheet |
| Lunar synodic month | 708.7 h | NASA Moon Fact Sheet |
| O₂ use per person | 0.84 kg/day | NASA *Baseline Values and Assumptions Document* (BVAD), NASA/TP-2015-218570 |
| CO₂ output per person | 1.04 kg/day | BVAD |
| Water per person (drinking, food and hygiene) | 11 kg/day | BVAD (exploration habitat, no laundry) |
| Packaged food per person | 1.8 kg/day (~3,000 kcal) | BVAD |
| Water recovery on the ISS | 98 % (the game uses 95 %) | NASA, ECLSS milestone announcement, June 2023 |
| Cosmic-ray dose on the lunar surface | 1.37 mSv/day | Zhang et al., *First measurements of the radiation dose on the lunar surface*, Science Advances 6 (2020) |
| Cosmic-ray dose on the surface of Mars | 0.67 mSv/day | Hassler et al., *Mars' Surface Radiation Environment Measured with the MSL Curiosity Rover*, Science 343 (2014): 0.64 ± 0.12 |
| Career dose limit | 600 mSv | NASA-STD-3001, vol. 1 (limit adopted in 2022) |
| Communication delay | Moon ≈ 1.3 s; Mars 3–22 min | NASA Deep Space Network |
| Delay on the day Perseverance landed (18 Feb 2021) | 11 min 22 s | NASA/JPL, Mars 2020 landing coverage |
| Bone density loss in microgravity | 1–1.5 % a month (hips, spine) | NASA Human Research Program, *Risk of Early Onset Osteoporosis Due to Spaceflight* |
| Daily exercise on the ISS | ≈ 2 h (treadmill, bike, ARED) | NASA, *Exercising in Space* |
| LRV walkback limit | The rover never went further than the crew could walk back with the life support left | NASA, *Apollo Lunar Surface Journal* (Apollo 15–17) |
| MOXIE output | 122 g of O₂ in 16 runs (2021–2023) | NASA/JPL, MOXIE close-out, September 2023 |
| Dust on Martian arrays | 0.28 % of power lost per sol | Landis and Jenkins, Mars Pathfinder MAE experiment, J. Geophys. Res. 105 (2000) |
| Kilopower reactor output | 1–10 kWe per unit | NASA/DOE, KRUSTY test (2018) |
| Illumination on the Shackleton ridge | > 80 % of the time at the best spots | Mazarico et al., *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211 (2011) |
| Water in permanently shadowed craters | Detected by LCROSS in Cabeus (2009) | Colaprete et al., Science 330 (2010) |
| Crop yield in controlled environments | 20–35 g edible dry mass per m² per day (potato, wheat) | Wheeler et al., *Crop productivities and radiation use efficiencies for bioregenerative life support*, Adv. Space Res. 41 (2008) |
| CO₂ partial pressure | 1 kg in 300 m³ at 22 °C ≈ 1.39 mmHg | Ideal gas law |
| Apollo 13 oxygen tank no. 2 explosion | 55 h 54 min 53 s into the mission (13 April 1970) | NASA, *Report of Apollo 13 Review Board* (1970) |
| Sky opacity at Opportunity during the 2018 global dust storm | τ ≈ 10.8 (10 June 2018, the highest measured by a rover) | NASA/JPL, *Opportunity Hunkers Down During Dust Storm*, June 2018 |
| Mars solar conjunction | Every ≈ 26 months; about two weeks without commands to spacecraft | NASA/JPL, *Mars Solar Conjunction* (2019 and 2021 moratoriums) |

### Real terrain

Five places use public digital elevation models, cropped to 6.4 × 6.4 km and resampled to 384 × 384 points (about 17 m per point):

| Site | Source | Original resolution | Centre of the crop |
| --- | --- | --- | --- |
| Shackleton rim, lunar south pole (89.776° S, 156.27° W) | LRO-LOLA, "Site04 Shackleton rim". Barker, M.K., et al. (2021), *Planetary & Space Science* 203, 105119, doi:10.1016/j.pss.2020.105119. https://pgda.gsfc.nasa.gov/products/78 | 5 m/px | The flattest high spot of the crest with the crater wall less than 1 km away (1,734 m above the model's datum); the crater drops almost 2 km |
| Connecting ridge, lunar south pole | LRO-LOLA, "Site01 Connecting ridge" (same product) | 5 m/px | Pixel (2542, 1982): 89.373° S, 151.45° W |
| Malapert massif | LRO-LOLA, "Site23 Malapert massif" | 5 m/px | Pixel (1922, 1170): 85.962° S, 2.41° W, near the summit (≈ 5 km above the datum) |
| Rim of Nobile crater | LRO-LOLA, "Site06 Nobile rim 1" | 5 m/px | Pixel (1238, 2410): 85.297° S, 37.09° E |
| Jezero crater, Mars | Mars 2020 Terrain Relative Navigation CTX DTM mosaic. USGS Astrogeology, Fergason et al. (2020), doi:10.5066/P906QQT8 | 20 m/px | Perseverance's landing site, 18.4447° N, 77.4508° E (elevation −2,566 m) |

On the new lunar sites the script picks the landing spot: the highest, flattest 20 m cell of the file (slope < 3° over 60 m, greatest prominence over the surrounding kilometre) that keeps the whole 6.4 km crop inside it. With the same rule, Shackleton gets a spot 40 m from the one chosen by hand. Below the resolution of the data the game adds generated roughness (≤ 1.7 m), switched off within 12 m of the landing area. On the lunar sites the ice potential grows with depth below the landing spot, as an approximation to cold traps; it is not a measured ice map. The whole process is in `scripts/real-terrain.py`.

**The Sun at each site.** Latitude and longitude come from each file's georeference (south polar stereographic projection, x = ρ·sin λ, y = ρ·cos λ, with ρ = 2R·tan(colatitude/2) and R = 1,737.4 km). Near the pole the Sun goes once round the horizon every synodic month, westwards, and its elevation is δ + (90° − |latitude|)·cos H: δ is the latitude of the subsolar point (it swings between −1.54° and +1.54° over an "eclipse year" of 346.6 days) and H the angle between the Sun's meridian and the site's. The missions use δ = +1.2° (southern summer, close to the maximum). So at Shackleton and on the connecting ridge the Sun goes from 1.0° to 1.4° and from 0.6° to 1.8° and never sets over a flat horizon; at Malapert and Nobile, about 4° from the pole, it swings about ±4–4.7° and sets for around 40 % of the month (about 12 days in a row). Each array's horizon is computed over the 6.4 km of the crop: the more distant mountains, which in reality hide the Sun on some days, are not included.

## 2. Simplified models

**Power grid.** The whole base shares one grid. Each module asks for a keep-alive load (heating) and an operating load; they are served in priority order and whatever does not fit goes without. Surplus charges the most efficient storage first. Voltages and cable losses are not modelled.

**Sun and shadows.** For every array a "horizon mask" of 72 bearings is computed by marching over the game's terrain. The array produces when the Sun is above that line. On Mars the atmospheric transmission is `exp(−0.30·τ/μ)`, a one-formula approximation to the Appelbaum and Flood model combining direct and diffuse light; τ is the optical depth of the dust.

**Shielding.** The fraction of dose that gets through `x` g/cm² is approximated with two curves: `0.3 + 0.7·e^(−x/260)` for cosmic rays and `0.01 + 0.99·e^(−x/15)` for solar protons. They reproduce the known qualitative behaviour — solar protons are stopped by little material; cosmic rays need metres — but they do **not** replace a particle-transport calculation (HZETRN, OLTARIS, Geant4).

**Solar storms.** Three classes with an unshielded total dose of 12, 60 and 340 mSv, a fast rise (1.5 h) and an exponential decay. The figures are of the order of historical events (August 1972, October 1989); they do not reproduce any particular one. On Mars a factor of 0.3 is applied for the atmosphere.

**Historical scenarios.** Two missions are inspired by real storms. *August 1972*: between Apollo 16 and Apollo 17 the Sun produced one of the most intense proton events on record; in the game, 450 mSv unshielded spread over 40 h. *September 2017*: a storm that reached Mars, recorded on the surface by Curiosity's RAD detector and accompanied by aurorae seen by MAVEN; in the game, 120 mSv unshielded over 48 h before the atmospheric factor. Dates and history are real; doses and profiles are game values of the right order of magnitude, not reconstructions of the measurements.

Two more relive real accidents and phenomena. *June 2018*: a dust storm that began in late May, wrapped the whole planet in June and left Opportunity without power (its last contact was on 10 June 2018). In the game it starts between sols 4 and 6 and lasts 34–38 sols with an optical depth of 9.5 to 10.8; the radio delay is 3.7 min because Mars was approaching the 27 July opposition. *April 1970*: at 55 h 55 min into the mission an oxygen tank bursts, as on Apollo 13. In the game the stored oxygen drops to 35 %, the fuel cells go out of service (5 % condition) and a life-support emergency (the CO₂ scrubbers) starts on the ECLSS or, if there is none, on the lander. The real accident happened in space, on the way to the Moon; here it happens on the surface, with seven mission days and the same things that saved the crew: switching off whatever is not essential, the backup canisters, and time.

**Life support.** Electrolysis uses 1.125 kg of water per kg of O₂; the Sabatier reactor returns half of it, so the net cost is 0.56 kg of water per kg of O₂. CO₂ builds up in the cabin volume and is removed by the scrubbers (which need power) and by plants.

**Thermal.** An unpowered cabin drifts towards the outside temperature with a time constant of 72 h (Moon) or 48 h (Mars). Heating demand grows with the cold and falls by up to 70 % under a regolith cover.

**Crew.** Health and morale are indices from 0 to 100. Health responds to hypoxia, CO₂, thirst, hunger, cold and acute dose; morale to fresh food, communications, crowding, workload and recent scares. Both multiply useful work hours. They are game rules inspired by human-factors studies (for example CHAPEA), not a physiological model.

**Loose objects (EVA physics).** Thrown rocks, the hammer and the feather are integrated at 240 steps per second with gravity, aerodynamic drag F = ½·ρ·C_d·A·v² relative to the air (wind included), bounces with a coefficient of restitution, and Coulomb friction against the terrain. Air density: 0 on the Moon, 0.020 kg/m³ on Mars (≈ 1.6 % of Earth's 1.225 kg/m³). The hammer (1.32 kg) and the feather (0.03 kg) are those of David Scott's demonstration on Apollo 15; the feather's area (0.012 m²) and drag coefficient (1.3) are our estimates. With those values, from 1.6 m: on the Moon both take 1.40 s; on Mars the feather lands about 0.001 s later; on Earth, about 0.05 s later. A real feather flutters and takes longer: the model has no lift or coupled rotation. Martian wind is taken as 3 m/s in calm weather and up to 25 m/s in a storm.

**Rover.** A 620 kg rigid body with its driver (the Apollo LRV weighed about 210 kg empty and about 700 kg loaded) on four wheels with independent springs and dampers, integrated at 240 steps per second. Each tyre's force, longitudinal and lateral together, is limited by a friction circle of radius μ·N with μ = 0.72 (an estimate for a mesh wheel on regolith); rolling resistance is 6 % of the load. The springs are sized for 7 cm of sag under the local weight and 55 % of critical damping. The resulting stopping distance follows v²/(2·μ·g): from 6 m/s, about 15 m on the Moon and about 7 m on Mars (2.5 m on Earth). The battery holds 9 kWh; it supplies the mechanical power divided by an efficiency of 0.8 plus 120 W of electronics, and recharges from its panel (0.45 kW in full Sun) or next to the base (2.5 kW). Capacity, efficiency and powers are our values, not those of a specific vehicle.

**Return propellant.** On the Moon the plant splits water into hydrogen and oxygen and liquefies them: all the propellant's mass comes from water, at about 7 kWh per kg (electrolysis alone needs 4.4 kWh per kg of water in theory; the rest is real-world efficiency and liquefaction). On Mars the Sabatier reaction combines hydrogen with CO₂ from the air to make methane; the net balance CO₂ + 2 H₂O → CH₄ + 2 O₂ gives 80 kg of propellant for every 36 kg of water and 44 kg of air (about 2.2 kg per kg of water) at about 3.5 kWh per kg. Proportions follow the stoichiometry; real engines burn with somewhat less oxygen. The game's goals (300 kg on the Moon, 1.5 t and 6 t on Mars) are demonstration batches: a real ascent vehicle would need tens of tonnes.

**Emergencies.** A leak loses 3.5 kg of O₂ an hour and a micrometeoroid puncture 6 kg/h (our estimate for a hole of a few cm² with the cabin at about 70 kPa). Sealing off the module stops the loss at once but leaves it out of service until repaired; patching from inside takes 2.5–4 h with 40 % of the leak. A life-support failure stops all CO₂ scrubbing; with four people CO₂ rises about 1.2 mmHg an hour, and above 6 mmHg the game starts to harm health. Lithium hydroxide canisters (the backup the Apollo capsules used) control it for 18 h, once per mission. If nobody decides within 1.5 mission hours, the crew applies the conservative option (seal off, or repair more slowly). The rates are game values; the logic — deciding with incomplete information and limited time — is that of real procedures.

**Radio delay and Mission Control.** Each mission has a one-way delay: 1.28 s from the Moon; 11.4 min in *Jezero: Sol 0* (Perseverance's date), 20 min in *September 2017* (Mars had just passed solar conjunction on 27 July), 16 min on the long mission and 12 min (the average) in free play; in daily challenges and the editor, between 3 and 22 min. Asking for help in an emergency needs an antenna; the answer arrives after the round trip plus 15 min of analysis (our value), and following its procedure makes the patch or repair 40 % quicker: the idea of ground teams testing a fix on a replica of the hardware, like the CO₂ filter adapter of Apollo 13. On Mars target morale falls by 3 + 0.15 points per minute of delay: no live conversations with home, only messages.

**Solar conjunction.** When Mars is almost behind the Sun as seen from Earth, the solar corona corrupts the signals and the agencies stop sending commands for about two weeks. In the game it happens in *Mars · long stay* between sols 88 and 102 and, in the editor, from 45 % of the mission for 14 sols (Mars only, missions of 20 sols or more). While it lasts Mission Control cannot be asked for help, a solar-storm warning comes 0.4 h ahead (what the base's own sensors detect) instead of 2.5 h, and the communications term of morale goes from +8 to −8, as if there were no antenna.

**Long-term health.** Bone and muscle start at 100 % of their value on Earth. Without exercise, 1.5 % of bone density and 10 % of strength are lost per month in weightlessness, multiplied by (1 − g/9.81): 0.835 on the Moon and 0.62 on Mars. That the loss is proportional to the missing gravity is our assumption; nobody has yet measured the effect of living for months at a sixth or a third of g. One hour of daily exercise prevents 60 % of the bone loss and 70 % of the muscle loss; two hours, 85 % and 95 %, and allow strength to be slowly regained. Every hour of exercise comes out of the working day. Below 90 % strength, useful work falls in proportion (down to a minimum of 60 %). The rehabilitation estimate assumes bone takes 2.5 times longer to recover than to lose. Monotony takes up to 8 points off target morale at 2 a month, and exercising adds 3.

**EVA route planner.** A route's cost uses the same model as the game's EVA: 540 s of suit at 345 W, walking at 3.1 m/s; 265 W at each stop (15 s, that is, 15 mission minutes) and 160 W seated in the rover. Climbing also costs the work of lifting 165 kg (person and suit) at 25 % muscle efficiency; the game applies the same term when walking uphill, so the estimate and the reality agree. Stretches steeper than 15° are flagged as steep and steeper than 25° as dangerous. The rover's battery is estimated from rolling resistance (6 %), the climb and 120 W of electronics at 4 m/s. The walkback limit checks, for every waypoint, that the suit used to drive there plus what is needed to walk straight back leaves at least a 15 % reserve.

**EVA effort.** Metabolic power is estimated with a simple fit (≈ 125 W at rest, ≈ 190 W at a slow pace, ≈ 345 W at the game's long loping walk and ≈ 660 W running), of the order measured on the Apollo EVAs (averages of 230–300 W, peaks above 500 W). The suit reserve is used in proportion to it: it lasts as planned walking, longer if you stand still and almost half as long if you run. It is a game rule, not a physiological model.

**Expeditions.** Each mission's distant target is placed 980–1,060 m from the base, in the direction with the gentlest straight route (the steepest slope on the way stays under 25°). With the suit reserve at normal pace (540 s at 3.1 m/s, about 1,670 m) it cannot be reached on foot and back; in the rover the commander uses the suit at the resting rate. It is the same logic that led to the LRV on the last three Apollo missions: range in exchange for consumables.

## 3. Gameplay adjustments

| Adjustment | Reality | Reason |
| --- | --- | --- |
| Crops complete their cycle in half the time | Lettuce ≈ 30 days, potato ≈ 100 days | So that a harvest fits in a mission. The yield **per day** stays realistic, so the lesson (tens of m² per person are needed) does not change. |
| Sun elevation on the designed lunar bases ≈ 3.5–5.7° | ≤ 1.5° plus the advantage of altitude | Readable shadows and an illumination map with useful areas. The four real-terrain sites use the true path (see above). |
| Assembling a module takes crew hours | Days of work and EVAs | Pace of play. |
| Mid-mission resupply on Mars | Launch windows are 26 months apart | Justified as cargo pre-positioned in orbit. |
| A single dose value per crew member | Doses per organ, radiation quality | Simplicity. |
| 10 kW arrays and a 10 kW reactor as round units | Real designs with other outputs | Easy mental comparisons for students. |
| Time runs 60× on EVA and up to 4,320× at the console | — | So that 30–180 days fit in a session. |
| Thrown and dropped objects move in real time | The mission clock runs 60× on EVA | A 1.4 s fall has to be seen to last 1.4 s. |
| The rover reaches 34 km/h | The Apollo LRV drove at 13–18 km/h | So that driving clearly pays off over walking. |
| If the rover rolls over, the crew rights it at once | It would be a serious emergency | Young audience: it costs health and suit reserve, not the mission. |
| Throwing at 11 m/s in a suit | Depends on the suit and the astronaut | A single moderate value to compare worlds. |
| Evacuation instead of death | — | Young audience: the mission is aborted, nobody dies. |
| The 2018 storm lasts 34–38 sols | Over three months, from late May to September | To fit a 40-sol mission; the darkest phase does last weeks. |
| The Apollo 13 accident happens on the lunar surface | It happened in space, on the way to the Moon | The game takes place at a base; the timing, the chain of failures and the way out are kept. |

## 4. How to check it

`tests/sites.test.ts` checks the latitudes, the Sun's elevation at each site and the direction it turns; `tests/comms.test.ts` the delays and Control's answer; `tests/health.test.ts` the loss of bone and muscle with and without exercise; `tests/route.test.ts` that the planner gives the same cost as the game and applies the walkback limit; `tests/historic.test.ts` the 2018 opacity, that only a base with reactors rides it out, and the timing and effects of the Apollo 13 accident; `tests/csv.test.ts` that the exported data has every column and reads as numbers. `tests/vehicle.test.ts` checks the rover's suspension, traction and stopping distance. `tests/physics.test.ts` compares the physics engine with the formulas (free fall, terminal velocity, range, wind drift). `tests/sim.test.ts` verifies that the simulator does what this document claims: consumption rates, the effect of recycling, load priorities, dust attenuation, the difference between shielding for protons and for cosmic rays, dose near the reactor and whole missions.

```bash
npm test
npx tsx tests/balance.ts   # prints how each mission evolves with the recommended cargo
```
