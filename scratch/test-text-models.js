const key = "csk-ehvr5k4w69853vkwrhwcw3jr2kkpexdwhp9fh22m6drpy9f6";
const model = "gpt-oss-120b";

const prompt = `A series RLC circuit has R=10 ohms, L=50 mH, C=100 uF at 50 Hz, 50 V. Find impedance, current and power factor.`;

const systemPrompt = `You are an expert BEEE tutor. Solve the problem and return a strict JSON object:
{
  "topic": "AC Circuits",
  "question": "question text",
  "steps": [{ "step": 1, "description": "Calculate impedance", "expression": "Z = sqrt(R^2 + (Xl - Xc)^2)" }],
  "formulas_used": ["Z = sqrt(R^2 + X^2)"],
  "final_answer": "Z = 10 ohms"
}`;

async function testModel() {
  console.log(`Testing text generation for model: ${model} with new key...`);
  const body = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature: 0.15,
    response_format: { type: "json_object" }
  };

  const start = Date.now();
  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

    const status = res.status;
    const resText = await res.text();
    const duration = Date.now() - start;
    console.log(`Model ${model} returned Status ${status} in ${duration}ms:`);
    try {
      const json = JSON.parse(resText);
      if (json.choices) {
        console.log(`-> SUCCESS JSON:\n`, json.choices[0]?.message?.content);
      } else {
        console.log(`-> ERROR CODE: ${json.error?.code || 'unknown'} - ${json.error?.message || resText}`);
      }
    } catch {
      console.log(`-> RAW RESPONSE: ${resText}`);
    }
  } catch (err) {
    console.error(`-> FETCH ERROR:`, err);
  }
}

testModel();
