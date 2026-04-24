// Adaptive Learning Server — Ontario + CBSE dual-curriculum
// Works for Grade 2 and Grade 5 (controlled by GRADE env var)
// Proxies browser requests to Anthropic API (keeps API key server-side)

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT     = process.env.PORT || 3000;
const API_KEY  = process.env.ANTHROPIC_API_KEY;
const MODEL    = process.env.MODEL || 'claude-sonnet-4-5-20250929';
const GRADE    = String(process.env.GRADE || '2'); // '2' or '5'
const AGE      = GRADE === '5' ? 10 : 7;

if (!API_KEY) {
  console.error('\n❌  ERROR: ANTHROPIC_API_KEY environment variable not set.');
  console.error('   Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

// ─── Curriculum reference (used in prompts) ────────────────────────────────
// VERIFIED SOURCES:
//   - Ontario: Ontario Ministry of Education (dcp.edu.gov.on.ca) - Math 2020, Lang 2023, Sci 2022
//   - CBSE:    NCERT/CBSE 2024-25 (cbseacademic.nic.in, ncert.nic.in)
const CURRICULUM = {
  '2': {
    ontario: {
      math:    `Ontario Grade 2 Mathematics (2020 curriculum). Strands: Number (numbers to 200, place value tens/ones, skip counting by 2/5/10/25, compose/decompose, fair-share fractions in word form like "one-half"/"one-quarter" — NO standard fraction notation yet), Operations (addition and subtraction to 100, fact families, doubles), Algebra (repeating/growing/shrinking patterns, equality with balance), Data (tally charts, pictographs, bar graphs with one-to-one correspondence), Spatial Sense (2D shapes and attributes, 3D solids, symmetry, length in cm and m, capacity, mass, time to nearest quarter hour, days/weeks/months), Financial Literacy (Canadian coins, making amounts up to \$1).`,
      science: `Ontario Grade 2 Science & Technology (2022 curriculum). Strands: Life Systems — Growth and Changes in Animals (life cycles, adaptations, habitats); Matter and Energy — Properties of Liquids and Solids (states of matter, properties, water cycle basics); Structures and Mechanisms — Movement (simple machines: wheels, ramps, pulleys, levers); Earth and Space Systems — Air and Water in the Environment (weather, water sources, conservation).`,
      reading: `Ontario Grade 2 Language – Reading (June 2023 curriculum). Focus: phonics and decoding (blends, digraphs, long vowel patterns, multi-syllable words), sight words, reading fluency, comprehension (main idea, key details, sequence, cause/effect, predictions, character/setting), vocabulary, text features (title, headings, captions), comparing fiction and non-fiction.`,
      writing: `Ontario Grade 2 Language – Writing (June 2023 curriculum). Focus: complete sentences with correct punctuation (. ? !), expanding sentences with details, short paragraphs on one topic, narrative writing (beginning/middle/end), opinion writing with reasons, adjectives, subject-verb agreement, commonly confused words (their/there, to/too).`
    },
    cbse: {
      math:    `CBSE Class 2 Mathematics (NCERT "Math-Magic" textbook, 2024-25). Topics: Numbers 1-999 (reading, writing, place value tens/ones/hundreds), addition and subtraction up to 3-digit numbers (with and without regrouping), introduction to multiplication (as repeated addition, tables of 2, 3, 4, 5, 10), fractions as halves/quarters of shapes, Indian money (rupees ₹ and paise, coins and notes), measurement (length in cm/m, weight in kg, capacity in litres, time — hour/half-hour, calendar, days/months), 2D shapes and 3D solids, patterns, simple data handling with tally marks.`,
      evs:     `CBSE Class 2 Environmental Studies / General Awareness (NCERT aligned, 2024-25). Themes: My Family (family members, relationships, traditions, festivals of India like Diwali, Holi, Eid, Christmas), My Body (parts of body, sense organs, personal hygiene), Plants around us (parts of a plant, types, uses, seeds), Animals around us (domestic/wild, where they live, what they eat, baby animals), Food we eat (sources, healthy eating, balanced diet), Water (sources, uses, saving water), Our Homes (types of houses, rooms), Community Helpers (doctor, teacher, farmer, postman, police), Means of Transport (land/water/air), Weather and Seasons in India (summer, monsoon, winter), Safety rules, Our Country India (national flag, national symbols).`,
      english: `CBSE Class 2 English (NCERT "Marigold" and "Raindrops" textbooks, 2024-25). Focus: Reading simple stories and poems, comprehension of short passages, building vocabulary, sight words. Grammar: nouns (naming words), pronouns (he/she/it/they), verbs (action words), adjectives (describing words), articles (a/an/the), simple present and past tense, singular/plural, opposites, rhyming words. Writing: complete sentences with capital letters and full stops, picture descriptions, short answers, simple story writing.`,
      hindi:   `CBSE Class 2 Hindi (NCERT "Sarangi" / "रिमझिम" textbook, 2024-25). फोकस: वर्णमाला (स्वर अ-अः, व्यंजन क-ज्ञ), मात्राएँ (आ, इ, ई, उ, ऊ, ऋ, ए, ऐ, ओ, औ, अं, अः), दो अक्षर व तीन अक्षर वाले शब्द, सरल वाक्य पढ़ना व लिखना, गिनती हिंदी में (एक से सौ), संज्ञा (नाम वाले शब्द), सर्वनाम, क्रिया, विलोम शब्द (opposites), वचन (एकवचन/बहुवचन), लिंग (पुल्लिंग/स्त्रीलिंग), सरल कहानियाँ व कविताएँ। Keep questions bilingual-friendly: question text CAN be in Hindi (Devanagari) with simple English context if needed.`
    }
  },
  '5': {
    ontario: {
      math:    `Ontario Grade 5 Mathematics (2020 curriculum). Strands: Number (whole numbers to 100,000+, place value, decimals to hundredths, fractions with like/unlike denominators, equivalent fractions, improper/mixed, percents as fractions of 100, integers intro), Operations (multi-digit multiplication and division, order of operations), Algebra (patterns, variables, simple equations, coding concepts), Data (mean/median/mode, graphs, probability experiments), Spatial Sense (angles, triangles, quadrilaterals, area of rectangles, volume of rectangular prisms, coordinate grid), Financial Literacy (income/expenses, budgets, different payment methods, currency conversions).`,
      science: `Ontario Grade 5 Science & Technology (2022 curriculum). Strands: Life Systems — Human Organ Systems (digestive, circulatory, respiratory, nervous, musculoskeletal); Matter and Energy — Properties of Matter and Changes of State (physical vs chemical changes); Structures and Mechanisms — Forces Acting on Structures and Mechanisms; Earth and Space Systems — Conservation of Energy and Resources.`,
      reading: `Ontario Grade 5 Language – Reading (June 2023 curriculum). Focus: inferring meaning, main idea and supporting details, text structures (compare/contrast, problem/solution, cause/effect), author's purpose and point of view, literary devices (simile, metaphor, personification), analyzing characters' motivations, critical literacy, comparing multiple sources, non-fiction text features (graphs, maps, diagrams), vocabulary from context.`,
      writing: `Ontario Grade 5 Language – Writing (June 2023 curriculum). Focus: multi-paragraph narratives with developed plot and characters, opinion/persuasive writing with clear thesis and supporting reasons, informational writing with research, varied sentence structures (compound and complex sentences), figurative language, revising and editing, citing sources, correct grammar (subject-verb agreement, pronoun agreement, verb tense consistency, commas in lists and after introductory phrases).`
    },
    cbse: {
      math:    `CBSE Class 5 Mathematics (NEW NCERT "Math-Mela" textbook, 2024-25 – replaces older Math-Magic). Chapters: 1) We the Travellers — I (large numbers up to lakhs, place value in Indian system, comparing numbers), 2) Fractions (equivalent fractions, comparing, adding/subtracting like fractions, fraction of a whole), 3) Angles as Turns (types of angles — acute/right/obtuse/straight, measuring turns), 4) We the Travellers — II (addition with regrouping, estimation), 5) Far and Near (distance, maps, scale), 6) The Dairy Farm (multiplication and division, factors and multiples, HCF/LCM intro), 7) Shapes and Patterns (2D/3D, symmetry, tessellations), 8) Weight and Capacity (kg/g, L/mL, conversions), 9) Parts and Wholes (decimals intro, tenths and hundredths), 10+) Data handling, money, time, perimeter/area/volume. Uses Indian contexts (rupees ₹, Indian places, festivals).`,
      evs:     `CBSE Class 5 Environmental Studies (NCERT "Looking Around" textbook, 2024-25). Blends science and social studies. Themes: Super Senses (animal/human senses), A Snake Charmer's Story (biodiversity, livelihoods), From Tasting to Digesting (digestive system), Mangoes Round the Year (preservation, food chains), Seeds and Seeds (germination, agriculture), Every Drop Counts (water conservation, rainwater harvesting), Experiments with Water (states of matter, water cycle), A Treat for Mosquitoes (diseases, blood, circulation), Up You Go! (mountains, climbing, survival), Walls Tell Stories (forts, history, monuments), Sunita in Space (gravity, space, solar system), What If It Finishes? (fuels, conservation, pollution), A Shelter So High! (habitats, climate adaptation), When the Earth Shook! (earthquakes, disasters), Blow Hot, Blow Cold (lungs, respiration), Who Will Do This Work? (occupations, equality), Across the Wall (sports, teamwork), No Place for Us? (migration, displacement), A Seed Tells a Farmer's Story (farming, cooperatives), Whose Forests? (forest rights, tribal communities), Like Father, Like Daughter (heredity), On the Move Again (nomadic communities).`,
      english: `CBSE Class 5 English (NCERT "Marigold" textbook, 2024-25). Focus: Reading comprehension of prose and poetry, inferring meaning, summarising, literary appreciation. Grammar: parts of speech (all types), tenses (past/present/future — simple, continuous, perfect forms), active/passive voice intro, direct/indirect speech intro, conjunctions, prepositions, punctuation (comma, apostrophe, quotation marks), sentence types (declarative, interrogative, imperative, exclamatory). Writing: paragraph writing, story writing, informal letters (to friend/family), diary entries, picture composition, notice writing, essay on familiar topics.`,
      hindi:   `CBSE Class 5 Hindi (NCERT "रिमझिम" textbook, 2024-25). फोकस: गद्य व पद्य पाठों की समझ, नए शब्दों का अर्थ, मुहावरे व लोकोक्तियाँ। व्याकरण: संज्ञा (जातिवाचक, व्यक्तिवाचक, भाववाचक), सर्वनाम (पुरुषवाचक, निश्चयवाचक, प्रश्नवाचक), विशेषण, क्रिया (सकर्मक/अकर्मक), काल (भूत/वर्तमान/भविष्य), लिंग, वचन, कारक, विलोम शब्द, पर्यायवाची शब्द, अनेकार्थी शब्द, उपसर्ग व प्रत्यय। लेखन: अनुच्छेद, पत्र (औपचारिक व अनौपचारिक), कहानी लेखन, चित्र वर्णन। Questions can use Devanagari script with clear context.`
    }
  }
};

// ─── Prompt builders ───────────────────────────────────────────────────────
function buildQuestionPrompt({ subject, curriculum, level, recent }) {
  const curric = CURRICULUM[GRADE][curriculum][subject];
  if (!curric) throw new Error(`No curriculum data for ${curriculum}/${subject}/Grade ${GRADE}`);
  const recentList = (recent && recent.length)
    ? `\n\nDO NOT REPEAT or closely paraphrase any of these recent questions:\n${recent.map((q,i)=>`${i+1}. ${q}`).join('\n')}`
    : '';
  const board = curriculum === 'ontario' ? 'Ontario (Canada)' : 'CBSE / NCERT (India)';
  return `You are an expert Grade ${GRADE} teacher creating an adaptive practice question for a ${AGE}-year-old student following the ${board} curriculum.

SUBJECT: ${subject.toUpperCase()}
CURRICULUM DETAILS: ${curric}

DIFFICULTY LEVEL: ${level} out of 5
- Level 1: very simple, single-step, concrete (age ${AGE} entry)
- Level 2: single-step with light reasoning
- Level 3: two-step or requires a small inference
- Level 4: multi-step, applies concept in a new context
- Level 5: challenge problem that stretches thinking${recentList}

GENERATE A FRESH QUESTION. Return ONLY valid JSON (no markdown, no explanation):
{
  "question": "the question text",
  "choices": ["A","B","C","D"],
  "correctIndex": 0,
  "concept": "specific concept being tested",
  "hint": "one short encouraging hint without giving the answer"
}

Rules:
- Match the Grade ${GRADE} ${board} curriculum precisely.
- Use age-appropriate vocabulary and sentence length.
- Exactly 4 choices. Only one correct answer. Plausible distractors.
- Use authentic ${curriculum === 'cbse' ? 'Indian contexts (rupees ₹, Indian names/places, NCERT-style examples)' : 'Canadian contexts (dollars $, metric units, everyday Canadian examples)'}.
${subject === 'hindi' ? '- Write the question and choices in Hindi (Devanagari script). Keep language simple.' : ''}`;
}

function buildLessonPrompt({ subject, curriculum, question, choices, correctIndex, userIndex, concept }) {
  const wasCorrect = userIndex === correctIndex;
  const board = curriculum === 'ontario' ? 'Ontario' : 'CBSE';
  return `You are a warm, encouraging Grade ${GRADE} teacher (${board} curriculum). A ${AGE}-year-old student just answered a ${subject} question.

QUESTION: ${question}
CHOICES: ${choices.map((c,i)=>`${i}) ${c}`).join(' | ')}
CORRECT: ${correctIndex}) ${choices[correctIndex]}
STUDENT CHOSE: ${userIndex}) ${choices[userIndex]}
RESULT: ${wasCorrect ? 'CORRECT ✓' : 'INCORRECT ✗'}
CONCEPT: ${concept}

Return ONLY valid JSON (no markdown):
{
  "headline": "short celebratory or supportive headline (max 6 words)",
  "explanation": "2-3 short sentences explaining WHY the correct answer is right. Use a simple everyday example. Warm and kind.",
  "tip": "one short memorable tip or rule"
}

Keep every sentence under ${GRADE === '2' ? 15 : 20} words. Never shame. ${subject === 'hindi' ? 'Write explanation in Hindi (Devanagari).' : ''}`;
}

// ─── Anthropic API ─────────────────────────────────────────────────────────
function callAnthropic(prompt, maxTokens = 800) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'API error'));
          const text = json.content && json.content[0] && json.content[0].text;
          if (!text) return reject(new Error('No content'));
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseModelJSON(text) {
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found');
  return JSON.parse(cleaned.slice(s, e + 1));
}

async function withRetry(fn, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { err = e; } }
  throw err;
}

// ─── HTTP server ───────────────────────────────────────────────────────────
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/config') {
    return sendJSON(res, 200, { grade: GRADE, age: AGE });
  }
  if (req.method === 'POST' && req.url === '/api/question') {
    try {
      const body = await readBody(req);
      const out = await withRetry(async () => {
        const text = await callAnthropic(buildQuestionPrompt(body), 800);
        const q = parseModelJSON(text);
        if (!q.question || !Array.isArray(q.choices) || q.choices.length !== 4) throw new Error('Bad structure');
        return q;
      });
      return sendJSON(res, 200, out);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }
  if (req.method === 'POST' && req.url === '/api/lesson') {
    try {
      const body = await readBody(req);
      const out = await withRetry(async () => parseModelJSON(await callAnthropic(buildLessonPrompt(body), 500)));
      return sendJSON(res, 200, out);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(__dirname, 'public', urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
        res.end(d2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Grade ${GRADE} Adaptive Learning — Ontario + CBSE`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL}\n`);
});
