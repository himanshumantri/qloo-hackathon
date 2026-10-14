// Claude-powered agent that uses Qloo as its tools.
// Claude decides which Qloo calls to make; the loop runs them and feeds results back
// until Claude calls submit_result with its final answer.
const Anthropic = require('@anthropic-ai/sdk');
const qloo = require('./qloo');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const MAX_TURNS = 6;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const qlooTools = [
  {
    name: 'qloo_search_entities',
    description:
      'Find a brand, restaurant/place or music artist in Qloo by name. Returns entity ids you can use as signals in qloo_recommend.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name to look up, e.g. "Pizza Hut"' },
        type: { type: 'string', enum: ['brand', 'place', 'artist'] },
      },
      required: ['query'],
    },
  },
  {
    name: 'qloo_search_tags',
    description:
      'Search Qloo taste tags by keyword (e.g. "crunchy" for place specialty dishes, "party" or "rock" for music genres/themes). Returns tag ids for qloo_recommend.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        entity_type: { type: 'string', enum: ['place', 'artist', 'brand'], description: 'Restrict to tags used by this entity type' },
      },
      required: ['query'],
    },
  },
  {
    name: 'qloo_recommend',
    description:
      'Get Qloo recommendations of one entity type, steered by tag ids and/or entity ids. For music use entity_type "artist". Use popularity_min (0-1) to avoid obscure results.',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['artist', 'place', 'brand'] },
        interest_tag_ids: { type: 'array', items: { type: 'string' } },
        interest_entity_ids: { type: 'array', items: { type: 'string' } },
        popularity_min: { type: 'number' },
        limit: { type: 'integer' },
      },
      required: ['entity_type'],
    },
  },
];

const qlooHandlers = {
  qloo_search_entities: qloo.searchEntities,
  qloo_search_tags: qloo.searchTags,
  qloo_recommend: qloo.recommend,
};

const SCORE_PROMPT = `You are the crunchiness expert inside "Crunchy Comida".
Rate how crunchy each food is on a 0-5 scale: 5 = crackly, shattering crunch (kettle chips, tempura), 3 = pleasantly crisp outside but softer inside (fries, fried chicken), 1 = barely any crunch, 0 = no crunch at all.
Judge from ingredients, preparation (fried, baked, steamed, soggy-prone) and typical texture. Be honest: do not inflate scores.
If a brand or restaurant is given, look it up with qloo_search_entities and check Qloo tags (for example crunchy specialty dishes via qloo_search_tags with entity_type "place") to ground your judgment. Use at most 3 Qloo calls, then answer.
Finish by calling submit_result. Keep each "why" to one short sentence.`;

const MUSIC_PROMPT = `You are the music host inside "Crunchy Comida".
Given a crunchy food and an occasion, pick music to play. Use Qloo: find suitable music tags with qloo_search_tags (entity_type "artist"), then call qloo_recommend with entity_type "artist", a popularity_min of about 0.5, and those tags. Match the energy to the occasion (a kids' outing differs from a beer party) and to how crunchy the food is.
Use at most 3 Qloo calls, then call submit_result with 5 artists and a one-sentence reason each.`;

const scoreResultTool = {
  name: 'submit_result',
  description: 'Submit the final crunchiness scores.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            score: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
            why: { type: 'string' },
          },
          required: ['name', 'score', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['dishes'],
    additionalProperties: false,
  },
};

const musicResultTool = {
  name: 'submit_result',
  description: 'Submit the final music suggestions.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { artist: { type: 'string' }, why: { type: 'string' } },
          required: ['artist', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  },
};

async function runTool(block) {
  const handler = qlooHandlers[block.name];
  if (!handler) return { is_error: true, content: `Unknown tool ${block.name}` };
  try {
    return { content: JSON.stringify(await handler(block.input || {})) };
  } catch (err) {
    console.error(`${block.name} failed:`, err.message);
    return { is_error: true, content: 'Qloo lookup failed; continue with your own knowledge.' };
  }
}

async function runAgent({ system, userText, resultTool }) {
  const tools = [...qlooTools, resultTool];
  const messages = [{ role: 'user', content: userText }];
  let usage = { input: 0, output: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      tools,
      messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') throw new Error('The request was declined.');
    if (response.stop_reason === 'max_tokens') throw new Error('The model ran out of output space.');

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const submitted = toolUses.find((b) => b.name === 'submit_result');
    if (submitted) {
      console.log(`agent done in ${turn + 1} turn(s), tokens in/out: ${usage.input}/${usage.output}`);
      return submitted.input;
    }

    messages.push({ role: 'assistant', content: response.content });
    if (toolUses.length === 0) {
      // Model answered in prose without submitting; nudge it once per turn.
      messages.push({ role: 'user', content: 'Please finish by calling submit_result.' });
      continue;
    }
    const results = await Promise.all(
      toolUses.map(async (block) => ({ type: 'tool_result', tool_use_id: block.id, ...(await runTool(block)) })),
    );
    messages.push({ role: 'user', content: results });
  }
  throw new Error('The agent did not finish in time.');
}

async function scoreFoods({ dishes, brand }) {
  const lines = [`Foods: ${dishes.join('; ')}`];
  if (brand) lines.push(`Brand or restaurant: ${brand}`);
  const out = await runAgent({ system: SCORE_PROMPT, userText: lines.join('\n'), resultTool: scoreResultTool });
  return out.dishes;
}

async function suggestMusic({ dish, score, occasion }) {
  const userText = `Food: ${dish}${score != null ? ` (crunch score ${score}/5)` : ''}\nOccasion: ${occasion}`;
  const out = await runAgent({ system: MUSIC_PROMPT, userText, resultTool: musicResultTool });
  return out.suggestions;
}

module.exports = { scoreFoods, suggestMusic, MODEL };
