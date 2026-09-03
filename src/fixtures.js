/**
 * @typedef {object} Parallel
 * @property {string} title       The Wikipedia article title.
 * @property {string} url         Link to the article on English Wikipedia.
 * @property {import("./fields.js").Field} field  The Field the article sits in.
 * @property {string} leadSection The article's Lead Section, shown as evidence.
 * @property {number} closeness   Whole number 0–100, a rough ordering cue.
 */

const wiki = (/** @type {string} */ slug) => `https://en.wikipedia.org/wiki/${slug}`;

/**
 * A hard-coded set of Parallels for the stubbed search. Themed loosely around
 * "keeping a system standing under a sudden surge of load" so that grouping and
 * "Show 6 more" have something meaningful to show. The real search (ticket #6)
 * replaces this with a ranked slice of the embedded Corpus.
 *
 * Spans ten of the eleven Fields, with several Fields holding more than one
 * Parallel, and more than two pages' worth of entries.
 *
 * @type {readonly Parallel[]}
 */
export const FIXTURE_PARALLELS = Object.freeze([
  {
    title: "Triage",
    url: wiki("Triage"),
    field: "Health and medicine",
    leadSection:
      "Triage is the process of determining the priority of patients' treatments by the severity of their condition or likelihood of recovery with and without treatment. This rations patient treatment efficiently when resources are insufficient for all to be treated immediately.",
    closeness: 93,
  },
  {
    title: "Cytokine storm",
    url: wiki("Cytokine_storm"),
    field: "Health and medicine",
    leadSection:
      "A cytokine storm is a physiological reaction in which the innate immune system causes an uncontrolled and excessive release of pro-inflammatory signalling molecules called cytokines. The resulting positive feedback loop can inflict lasting damage on the body's own tissue.",
    closeness: 78,
  },
  {
    title: "Sepsis",
    url: wiki("Sepsis"),
    field: "Health and medicine",
    leadSection:
      "Sepsis is a potentially life-threatening condition that arises when the body's response to infection injures its own tissues and organs. A small local trigger can cascade into system-wide failure within hours.",
    closeness: 61,
  },
  {
    title: "Bank run",
    url: wiki("Bank_run"),
    field: "Society and social sciences",
    leadSection:
      "A bank run occurs when many clients withdraw their money from a bank at the same time over concerns of the bank's solvency. As more people withdraw, the probability of default increases, prompting still more withdrawals in a self-fulfilling spiral.",
    closeness: 90,
  },
  {
    title: "Tragedy of the commons",
    url: wiki("Tragedy_of_the_commons"),
    field: "Society and social sciences",
    leadSection:
      "The tragedy of the commons is the concept that, if many people enjoy unfettered access to a finite, valuable resource, they will tend to overuse it and may end up destroying its value altogether. Individually rational choices sum to a collectively ruinous outcome.",
    closeness: 67,
  },
  {
    title: "Moral panic",
    url: wiki("Moral_panic"),
    field: "Society and social sciences",
    leadSection:
      "A moral panic is a widespread feeling of fear, often an exaggerated one, that some evil person or thing threatens the values, interests, or well-being of a community. Media amplification can drive the reaction far past the size of the original threat.",
    closeness: 49,
  },
  {
    title: "Queueing theory",
    url: wiki("Queueing_theory"),
    field: "Mathematics",
    leadSection:
      "Queueing theory is the mathematical study of waiting lines, or queues. A queueing model is constructed so that queue lengths and waiting times can be predicted, and it shows how a system tips from stable to unbounded as arrival rate approaches service rate.",
    closeness: 88,
  },
  {
    title: "Control theory",
    url: wiki("Control_theory"),
    field: "Mathematics",
    leadSection:
      "Control theory deals with the control of dynamical systems in engineered processes and machines. The objective is to develop a model or algorithm governing the application of system inputs to drive the system to a desired state while keeping it stable.",
    closeness: 64,
  },
  {
    title: "Percolation theory",
    url: wiki("Percolation_theory"),
    field: "Mathematics",
    leadSection:
      "In statistical physics and mathematics, percolation theory describes the behaviour of a network when nodes or links are added. There is a sharp threshold above which a giant connected cluster — and with it, large-scale propagation — suddenly appears.",
    closeness: 52,
  },
  {
    title: "Locust",
    url: wiki("Locust"),
    field: "Science",
    leadSection:
      "Locusts are a group of certain species of short-horned grasshoppers that have a swarming phase. Crowding triggers a switch to gregarious behaviour, and a local population can rapidly build into a migrating swarm of billions.",
    closeness: 83,
  },
  {
    title: "Homeostasis",
    url: wiki("Homeostasis"),
    field: "Science",
    leadSection:
      "Homeostasis is the state of steady internal physical and chemical conditions maintained by living systems. It is achieved through many regulatory mechanisms that push a variable back toward a set point after a disturbance.",
    closeness: 70,
  },
  {
    title: "Trophic cascade",
    url: wiki("Trophic_cascade"),
    field: "Science",
    leadSection:
      "Trophic cascades are powerful indirect interactions that can control entire ecosystems, occurring when a change at the top of a food web propagates downward through successive levels. Removing one species can reshape the whole system.",
    closeness: 55,
  },
  {
    title: "Load balancing (computing)",
    url: wiki("Load_balancing_(computing)"),
    field: "Technology",
    leadSection:
      "In computing, load balancing is the process of distributing a set of tasks over a set of resources, with the aim of making their overall processing more efficient. It can improve response time and avoid unevenly overloading some nodes while others sit idle.",
    closeness: 96,
  },
  {
    title: "Circuit breaker design pattern",
    url: wiki("Circuit_breaker_design_pattern"),
    field: "Technology",
    leadSection:
      "Circuit breaker is a design pattern used in software development to detect failures and encapsulate the logic of preventing a failure from constantly recurring. When a downstream call keeps failing, the breaker trips and fails fast instead of piling on load.",
    closeness: 80,
  },
  {
    title: "Levee",
    url: wiki("Levee"),
    field: "Geography",
    leadSection:
      "A levee is an elevated ridge, natural or artificial, alongside a river channel that regulates water levels. It protects the land behind it from routine floods but can fail catastrophically when overtopped.",
    closeness: 74,
  },
  {
    title: "Flood control",
    url: wiki("Flood_control"),
    field: "Geography",
    leadSection:
      "Flood control methods are used to reduce or prevent the detrimental effects of flood waters. Retention basins, spillways, and floodplains buy time by absorbing a surge and releasing it slowly.",
    closeness: 58,
  },
  {
    title: "Wu wei",
    url: wiki("Wu_wei"),
    field: "Philosophy and religion",
    leadSection:
      "Wu wei is a concept literally meaning 'inexertion', 'inaction', or 'effortless action'. In Taoist thought it describes acting in accordance with the natural flow of events rather than forcing an outcome against resistance.",
    closeness: 47,
  },
  {
    title: "Kintsugi",
    url: wiki("Kintsugi"),
    field: "Philosophy and religion",
    leadSection:
      "Kintsugi is the Japanese art of repairing broken pottery by mending the areas of breakage with lacquer dusted with powdered gold. As a philosophy, it treats breakage and repair as part of the history of an object rather than something to disguise.",
    closeness: 41,
  },
  {
    title: "Mise en place",
    url: wiki("Mise_en_place"),
    field: "Everyday life",
    leadSection:
      "Mise en place is a French culinary phrase meaning 'putting in place' or 'gather'. It refers to the organisation and arrangement of ingredients and tools a cook prepares before service so that the rush can be handled without improvisation.",
    closeness: 62,
  },
  {
    title: "Fire drill",
    url: wiki("Fire_drill"),
    field: "Everyday life",
    leadSection:
      "A fire drill is a method of practising how a building would be evacuated in the event of a fire or other emergency. Rehearsing the response in calm conditions makes the real surge of people orderly rather than chaotic.",
    closeness: 44,
  },
  {
    title: "Berlin Blockade",
    url: wiki("Berlin_Blockade"),
    field: "History",
    leadSection:
      "The Berlin Blockade was one of the first major international crises of the Cold War. In response, the Western Allies organised the Berlin Airlift to carry supplies to the people of West Berlin, scaling deliveries far beyond what anyone thought possible.",
    closeness: 57,
  },
  {
    title: "Roman dictator",
    url: wiki("Roman_dictator"),
    field: "History",
    leadSection:
      "A Roman dictator was an extraordinary magistrate in the Roman Republic endowed with full authority to resolve a specific problem such as a military emergency. The office was strictly time-limited so that concentrated power drained away once the crisis passed.",
    closeness: 46,
  },
  {
    title: "Jazz improvisation",
    url: wiki("Jazz_improvisation"),
    field: "Arts",
    leadSection:
      "Jazz improvisation is the spontaneous invention of melodic solo lines or accompaniment parts in a performance of jazz music. Players respond in real time to what the rest of the ensemble does, absorbing surprises without stopping the music.",
    closeness: 53,
  },
  {
    title: "Call and response (music)",
    url: wiki("Call_and_response_(music)"),
    field: "Arts",
    leadSection:
      "In music, call and response is a succession of two distinct phrases usually played by different musicians, where the second phrase is heard as a direct commentary on or response to the first. It coordinates a large group without a conductor.",
    closeness: 40,
  },
  {
    title: "Chesley Sullenberger",
    url: wiki("Chesley_Sullenberger"),
    field: "People",
    leadSection:
      "Chesley Burnett 'Sully' Sullenberger III is an American retired fighter pilot and airline captain who, in 2009, glided a disabled airliner to a landing on the Hudson River after a bird strike, saving all 155 people on board.",
    closeness: 51,
  },
  {
    title: "Norman Borlaug",
    url: wiki("Norman_Borlaug"),
    field: "People",
    leadSection:
      "Norman Ernest Borlaug was an American agronomist who led initiatives that contributed to the extensive increases in agricultural production termed the Green Revolution, credited with saving over a billion people from starvation.",
    closeness: 43,
  },
]);
